// Normalização, validação e matching (deduplicação) da migração de sistema
// anterior. Reutiliza os validadores/normalizadores já existentes no projeto
// (masks.ts, phoneUtils.ts) em vez de reimplementá-los — o importador simples
// atual (patientImportService.ts) tinha sua própria validação de CPF
// duplicada; aqui não repetimos esse débito.

import type { LegacyPatientMetadata, Patient } from '../types';
import { isValidCpf } from './masks';
import { normalizeBrazilianNumber } from './phoneUtils';
import { LegacyCellValue, cellToString } from './legacyImportParsers';

// ----------------------------------------------------------------------
// Normalização de texto/telefone/CPF/data
// ----------------------------------------------------------------------

export function normalizeName(raw: string | null | undefined): string {
  return (raw || '').trim().replace(/\s+/g, ' ');
}

export function normalizeNameForCompare(raw: string | null | undefined): string {
  return normalizeName(raw).toUpperCase();
}

/**
 * Normaliza telefone para o padrão de armazenamento de Patient.phone neste
 * projeto: dígitos locais (DDD + número), SEM o prefixo de país "55" — esse
 * é o formato usado por PatientModal.tsx (cleanPhone = phone.replace(/\D/g,'')).
 * Reaproveita normalizeBrazilianNumber (phoneUtils.ts) só para a heurística de
 * reparo do 9º dígito de celular, e então remove o "55" que essa função
 * adiciona (ela é pensada para JIDs do WhatsApp, que usam DDI).
 */
export function normalizePatientPhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = normalizeBrazilianNumber(digits);
  if (withCountry.startsWith('55') && (withCountry.length === 12 || withCountry.length === 13)) {
    return withCountry.slice(2);
  }
  return digits;
}

export type CpfClassification = 'VALID' | 'BLANK' | 'PLACEHOLDER' | 'INVALID';

export interface CpfClassificationResult {
  classification: CpfClassification;
  cleaned: string;
}

/**
 * Classifica um CPF bruto do arquivo legado em 4 categorias, em vez de um
 * simples válido/inválido:
 * - BLANK: nada informado — nenhum sinal, tratado como paciente sem CPF.
 * - PLACEHOLDER: 11 dígitos repetidos (ex. "99999999999") — nunca é um CPF
 *   real (a checagem de dígito verificador do algoritmo da Receita já rejeita
 *   qualquer sequência repetida), e no arquivo real da Odonto Minas esse
 *   valor específico aparece 161 vezes — é um valor "sem CPF" do sistema
 *   anterior, não um erro de digitação isolado. Tratado como BLANK para fins
 *   de matching (não força revisão humana em massa), mas o valor original é
 *   sempre preservado em metadata.
 * - INVALID: preenchido, não é o padrão de placeholder, mas falha no dígito
 *   verificador — provável erro de digitação real, tratado como sinal fraco
 *   que força revisão humana quando não há outra correspondência forte.
 * - VALID: passa no algoritmo oficial (isValidCpf, masks.ts).
 */
export function classifyCpf(raw: string | null | undefined): CpfClassificationResult {
  const cleaned = (raw || '').replace(/\D/g, '');
  if (!cleaned) return { classification: 'BLANK', cleaned: '' };
  if (/^(\d)\1{10}$/.test(cleaned)) return { classification: 'PLACEHOLDER', cleaned };
  if (cleaned.length === 11 && isValidCpf(cleaned)) return { classification: 'VALID', cleaned };
  return { classification: 'INVALID', cleaned };
}

export interface ParsedLegacyDate {
  value: string | null; // YYYY-MM-DD, ou null quando ausente/implausível
  raw: string;
  reviewRequired: boolean;
}

const DATE_TIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isPlausibleCivilDate(iso: string): boolean {
  const parts = iso.split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (year < 1900 || year > new Date().getFullYear() + 1) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

/**
 * Converte uma célula de data do arquivo legado (texto "DD/MM/AAAA HH:mm:ss",
 * célula de data nativa do Excel, ou serial numérico defensivo) para o
 * formato canônico YYYY-MM-DD. Datas implausíveis (ex.: ano 4021, ano fora de
 * uma faixa razoável) NÃO são corrigidas silenciosamente — value volta null e
 * reviewRequired=true, cabendo à camada de matching marcar a linha como
 * REVIEW_REQUIRED.
 */
export function parseLegacyDateTime(cell: LegacyCellValue): ParsedLegacyDate {
  if (cell === null || cell === undefined || cell === '') {
    return { value: null, raw: '', reviewRequired: false };
  }

  if (cell instanceof Date) {
    if (isNaN(cell.getTime())) return { value: null, raw: String(cell), reviewRequired: true };
    const iso = formatDateParts(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
    const plausible = isPlausibleCivilDate(iso);
    return { value: plausible ? iso : null, raw: cell.toISOString(), reviewRequired: !plausible };
  }

  const raw = cellToString(cell);
  if (!raw) return { value: null, raw: '', reviewRequired: false };

  const match = raw.match(DATE_TIME_RE);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const iso = formatDateParts(year, month, day);
    const plausible = isPlausibleCivilDate(iso);
    return { value: plausible ? iso : null, raw, reviewRequired: !plausible };
  }

  // Defensivo: serial numérico do Excel (não observado nos arquivos reais
  // analisados, que trazem datas como texto, mas suportado por robustez).
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    const epochUtc = Date.UTC(1899, 11, 30);
    const asDate = new Date(epochUtc + serial * 86400000);
    const iso = formatDateParts(asDate.getUTCFullYear(), asDate.getUTCMonth() + 1, asDate.getUTCDate());
    const plausible = isPlausibleCivilDate(iso);
    return { value: plausible ? iso : null, raw, reviewRequired: !plausible };
  }

  return { value: null, raw, reviewRequired: true };
}

// ----------------------------------------------------------------------
// Clientes.xls — normalização de linha
// ----------------------------------------------------------------------

export type LegacyRowStatus = 'NOVO' | 'VINCULAR' | 'CONFLITO' | 'INVALIDO' | 'REVISAR' | 'IGNORAR';

export interface NormalizedLegacyClient {
  legacyId: string; // Clientes.identificador (UUID) — chave de df_legacy_import_map
  legacyClientId: string; // Clientes.id_cliente
  name: string;
  cpf: CpfClassificationResult;
  email: string;
  phone: string; // telefone1 normalizado
  phone2: string;
  phone3: string;
  birthDate: ParsedLegacyDate;
  city: string;
  state: string;
  clinicalNotes: string; // observacao_prontuario -> Patient.clinicalNotes (campo já existente)
  notes: string; // observacao -> Patient.notes (campo já existente)
  legacyMetadata: LegacyPatientMetadata;
}

function buildAddress(row: Record<string, LegacyCellValue>, prefix: string) {
  const suffix = prefix ? `_${prefix}` : '';
  const get = (base: string) => cellToString(row[`${base}${suffix}`]);
  const address = {
    logradouro: get('endereco'),
    numero: get('numero'),
    complemento: get('complemento'),
    bairro: get(prefix ? 'nome_bairro' : 'nome_bairro'),
    cidade: get('nome_cidade'),
    uf: get('uf'),
    cep: get('cep'),
  };
  const hasAny = Object.values(address).some((v) => v);
  return hasAny ? address : undefined;
}

export function buildNormalizedClient(
  row: Record<string, LegacyCellValue>,
  sourceSystem: string
): NormalizedLegacyClient {
  const legacyId = cellToString(row.identificador);
  const legacyClientId = cellToString(row.id_cliente);
  const name = normalizeName(cellToString(row.nome_completo));
  const cpf = classifyCpf(cellToString(row.cpf));
  const birthDate = parseLegacyDateTime(row.data_nascimento);
  // Nascimento também precisa ser plausível como DATA DE VIDA (não pode ser
  // futura) — regra adicional específica de nascimento, além da checagem
  // genérica de ano plausível já feita em parseLegacyDateTime.
  const birthDateFinal: ParsedLegacyDate =
    birthDate.value && birthDate.value > new Date().toISOString().slice(0, 10)
      ? { ...birthDate, value: null, reviewRequired: true }
      : birthDate;

  const responsavelNome = cellToString(row.nome_responsavel);
  const hasResponsavel = Boolean(responsavelNome);

  const extra: Record<string, string> = {};
  const maybeExtra = (key: string, cell: LegacyCellValue) => {
    const v = cellToString(cell);
    if (v) extra[key] = v;
  };
  maybeExtra('estadoCivil', row.estado_civil);
  maybeExtra('tipoSanguineo', row.tipo_sanguineo);
  maybeExtra('nacionalidade', row.nacionalidade);
  maybeExtra('naturalidade', row.naturalidade);
  maybeExtra('orgaoExpedidorRg', row.orgao_expedidor);
  maybeExtra('localTrabalho', row.local_trabalho);
  maybeExtra('telefoneComercial', row.telefone_comercial);
  maybeExtra('dataCadastroSistemaAnterior', row.data_cadastro);

  const legacyMetadata: LegacyPatientMetadata = {
    sourceSystem,
    legacyClientUuid: legacyId,
    legacyClientId,
    rg: cellToString(row.rg) || undefined,
    sexo: cellToString(row.sexo) || undefined,
    profissao: cellToString(row.profissao) || undefined,
    phone2: cellToString(row.telefone2) ? normalizePatientPhone(cellToString(row.telefone2)) : undefined,
    phone3: cellToString(row.telefone3) ? normalizePatientPhone(cellToString(row.telefone3)) : undefined,
    rawCpfOriginal: cpf.classification !== 'VALID' ? cellToString(row.cpf) || undefined : undefined,
    cpfClassification: cpf.classification,
    address: buildAddress(row, ''),
    responsavel: hasResponsavel
      ? {
          nome: normalizeName(responsavelNome),
          nascimento: parseLegacyDateTime(row.nascimento_responsavel).value || undefined,
          grauParentesco: cellToString(row.grau_parentesco) || undefined,
          profissao: cellToString(row.profissao_responsavel) || undefined,
          sexo: cellToString(row.sexo_responsavel) || undefined,
          rg: cellToString(row.rg_responsavel) || undefined,
          cpf: cellToString(row.cpf_responsavel) || undefined,
          telefone: cellToString(row.telefone1_responsavel)
            ? normalizePatientPhone(cellToString(row.telefone1_responsavel))
            : undefined,
          email: cellToString(row.email_responsavel) || undefined,
          endereco: buildAddress(row, 'responsavel'),
        }
      : undefined,
    reviewFlags: birthDateFinal.reviewRequired ? ['DATA_NASCIMENTO_IMPLAUSIVEL'] : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };

  return {
    legacyId,
    legacyClientId,
    name,
    cpf,
    email: cellToString(row.email),
    phone: normalizePatientPhone(cellToString(row.telefone1)),
    phone2: cellToString(row.telefone2),
    phone3: cellToString(row.telefone3),
    birthDate: birthDateFinal,
    city: normalizeName(cellToString(row.nome_cidade)),
    state: cellToString(row.uf).toUpperCase(),
    clinicalNotes: cellToString(row.observacao_prontuario),
    notes: cellToString(row.observacao),
    legacyMetadata,
  };
}

// ----------------------------------------------------------------------
// Prontuarios.xls — normalização de linha
// ----------------------------------------------------------------------

export interface NormalizedLegacyRecord {
  legacyId: string; // identificador_prontuario (UUID) — verificado 100% único em 9.004/9.004 linhas
  patientLegacyId: string; // identificador_cliente -> casa com Clientes.identificador
  patientLegacyClientId: string; // id_cliente -> casa com Clientes.id_cliente (segunda chave, cross-check)
  dataAbertura: ParsedLegacyDate;
  dataRealizacao: ParsedLegacyDate;
  dentistaLegado: string;
  codigoTuss: string;
  descricao: string;
  procedimentos: string;
  denteRegiao: string;
  face: string;
  statusLegado: string; // "Finalizado" | "Em Execução" (cru, preservado tal qual)
  identificadorGuia: string;
  idGuia: string;
  idItemGuia: string;
  clienteRaw: string; // Prontuarios.cliente — só para auditoria/validação visual, nunca usado no matching
}

export function buildNormalizedRecord(row: Record<string, LegacyCellValue>): NormalizedLegacyRecord {
  return {
    legacyId: cellToString(row.identificador_prontuario),
    patientLegacyId: cellToString(row.identificador_cliente),
    patientLegacyClientId: cellToString(row.id_cliente),
    dataAbertura: parseLegacyDateTime(row.data_abertura),
    dataRealizacao: parseLegacyDateTime(row.data_realizacao),
    dentistaLegado: normalizeName(cellToString(row.dentista)),
    codigoTuss: cellToString(row.codigo_tuss),
    descricao: normalizeName(cellToString(row.descricao)),
    procedimentos: cellToString(row.procedimentos),
    denteRegiao: cellToString(row.dente_regiao),
    face: cellToString(row.face),
    statusLegado: cellToString(row.status),
    identificadorGuia: cellToString(row.identificador_guia),
    idGuia: cellToString(row.id_guia),
    idItemGuia: cellToString(row.id_item_guia),
    clienteRaw: cellToString(row.cliente),
  };
}

// ----------------------------------------------------------------------
// Matching de pacientes — ordem definida na Fase 6 do pedido:
// 1. vínculo de importação legado já existente (df_legacy_import_map)
// 2. CPF válido + único (dentro do tenant alvo)
// 3. nome normalizado + nascimento + telefone (combinação forte)
// 4. outros candidatos -> revisão humana
// Nunca mescla automaticamente por nome sozinho, telefone sozinho ou email
// sozinho.
// ----------------------------------------------------------------------

export interface ClientMatchResult {
  row: NormalizedLegacyClient;
  status: LegacyRowStatus;
  reason: string;
  matchedPatientId?: string;
  conflictCandidateIds?: string[];
}

export function classifyPatientRows(
  rows: NormalizedLegacyClient[],
  existingPatients: Patient[],
  existingLegacyMap: Map<string, string> // legacyId (Clientes.identificador) -> patientId já importado
): ClientMatchResult[] {
  // Conta ocorrências de cada CPF válido DENTRO do próprio arquivo de origem,
  // para detectar "CPF duplicado válido" (2 pares confirmados no arquivo real)
  // como CONFLITO em vez de mesclar automaticamente.
  const validCpfCountsInSource = new Map<string, number>();
  for (const r of rows) {
    if (r.cpf.classification === 'VALID') {
      validCpfCountsInSource.set(r.cpf.cleaned, (validCpfCountsInSource.get(r.cpf.cleaned) || 0) + 1);
    }
  }

  const existingByCpf = new Map<string, Patient[]>();
  for (const p of existingPatients) {
    const clean = (p.cpf || '').replace(/\D/g, '');
    if (!clean) continue;
    const arr = existingByCpf.get(clean) || [];
    arr.push(p);
    existingByCpf.set(clean, arr);
  }

  return rows.map((row): ClientMatchResult => {
    // 1. legacy map
    const mapped = existingLegacyMap.get(row.legacyId);
    if (mapped) {
      return { row, status: 'VINCULAR', reason: 'Vínculo de importação legado já existente para este tenant.', matchedPatientId: mapped };
    }

    if (!row.legacyId) {
      return { row, status: 'INVALIDO', reason: 'identificador (legacy_id) ausente — linha não pode ser rastreada com idempotência.' };
    }

    if (!row.name || row.name.length < 2) {
      return { row, status: 'INVALIDO', reason: 'Nome ausente ou inválido.' };
    }

    // 2. CPF válido + único
    if (row.cpf.classification === 'VALID') {
      if ((validCpfCountsInSource.get(row.cpf.cleaned) || 0) > 1) {
        return { row, status: 'CONFLITO', reason: 'CPF válido duplicado em outro registro do próprio arquivo de origem — decisão humana necessária.' };
      }
      const candidates = existingByCpf.get(row.cpf.cleaned) || [];
      if (candidates.length === 1) {
        return { row, status: 'VINCULAR', reason: 'CPF válido corresponde a paciente já cadastrado neste tenant.', matchedPatientId: candidates[0].id };
      }
      if (candidates.length > 1) {
        return {
          row,
          status: 'CONFLITO',
          reason: 'CPF válido corresponde a mais de um paciente já cadastrado neste tenant.',
          conflictCandidateIds: candidates.map((p) => p.id),
        };
      }
      return { row, status: 'NOVO', reason: 'CPF válido e único — será criado como novo paciente.' };
    }

    // 3. nome + nascimento + telefone (combinação forte, só quando os 3 estão presentes)
    if (row.birthDate.value && row.phone) {
      const strong = existingPatients.filter(
        (p) =>
          normalizeNameForCompare(p.name) === normalizeNameForCompare(row.name) &&
          p.birthDate === row.birthDate.value &&
          p.phone &&
          normalizePatientPhone(p.phone) === row.phone
      );
      if (strong.length === 1) {
        return { row, status: 'VINCULAR', reason: 'Nome + nascimento + telefone correspondem a paciente já cadastrado.', matchedPatientId: strong[0].id };
      }
      if (strong.length > 1) {
        return {
          row,
          status: 'CONFLITO',
          reason: 'Mais de um paciente cadastrado corresponde à combinação nome + nascimento + telefone.',
          conflictCandidateIds: strong.map((p) => p.id),
        };
      }
    }

    // 4. sem CPF confiável e sem combinação forte
    if (row.cpf.classification === 'INVALID') {
      return { row, status: 'REVISAR', reason: 'CPF preenchido é inválido (não é placeholder reconhecido) e nenhuma combinação forte foi encontrada — requer revisão humana.' };
    }

    return { row, status: 'NOVO', reason: 'Sem CPF confiável e sem correspondência forte — será criado como novo paciente.' };
  });
}

// ----------------------------------------------------------------------
// Matching de histórico de procedimentos (Prontuarios.xls)
// ----------------------------------------------------------------------

export interface RecordMatchResult {
  row: NormalizedLegacyRecord;
  status: LegacyRowStatus;
  reason: string;
  recordDate?: string; // data_realizacao || data_abertura, já resolvida
}

export function classifyRecordRows(
  records: NormalizedLegacyRecord[],
  clientMatchByLegacyId: Map<string, ClientMatchResult>, // Clientes.identificador -> resultado
  existingRecordLegacyMap: Set<string> // identificador_prontuario já importados neste tenant
): RecordMatchResult[] {
  return records.map((row): RecordMatchResult => {
    if (existingRecordLegacyMap.has(row.legacyId)) {
      return { row, status: 'VINCULAR', reason: 'Já importado anteriormente (mapeamento legado existente).' };
    }

    if (!row.legacyId) {
      return { row, status: 'INVALIDO', reason: 'identificador_prontuario ausente — linha não pode ser rastreada com idempotência.' };
    }

    const clientMatch = clientMatchByLegacyId.get(row.patientLegacyId);
    if (!clientMatch) {
      return { row, status: 'INVALIDO', reason: 'Prontuário órfão: nenhum cliente correspondente em Clientes.xls para identificador_cliente.' };
    }
    if (clientMatch.status === 'INVALIDO') {
      return { row, status: 'IGNORAR', reason: 'Paciente correspondente é inválido no arquivo de Clientes — prontuário não pode ser vinculado nesta rodada.' };
    }
    if (clientMatch.status === 'CONFLITO' || clientMatch.status === 'REVISAR') {
      return { row, status: 'REVISAR', reason: 'Paciente correspondente está pendente de decisão humana (conflito/revisão) em Clientes.xls.' };
    }

    if (row.dataAbertura.reviewRequired || row.dataRealizacao.reviewRequired) {
      return { row, status: 'REVISAR', reason: 'Data implausível em data_abertura ou data_realizacao (ex.: ano fora de faixa plausível) — requer correção humana antes de importar.' };
    }

    if (row.statusLegado === 'Finalizado') {
      if (!row.dataRealizacao.value && !row.dataAbertura.value) {
        return { row, status: 'REVISAR', reason: 'Status "Finalizado" sem nenhuma data utilizável (nem data_realizacao nem data_abertura).' };
      }
      return { row, status: 'NOVO', reason: 'Procedimento finalizado, pronto para importação.', recordDate: row.dataRealizacao.value || row.dataAbertura.value || undefined };
    }

    if (row.statusLegado === 'Em Execução') {
      if (!row.dataAbertura.value) {
        return { row, status: 'REVISAR', reason: 'Status "Em Execução" sem data_abertura utilizável como referência.' };
      }
      return { row, status: 'NOVO', reason: 'Procedimento em andamento no sistema anterior — importado como histórico legado (nunca como rascunho operacional atual).', recordDate: row.dataAbertura.value };
    }

    return { row, status: 'REVISAR', reason: `Status legado desconhecido: "${row.statusLegado}".` };
  });
}
