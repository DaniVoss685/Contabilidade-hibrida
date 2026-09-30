// Normalização, validação e matching (deduplicação) da migração de sistema
// anterior. Reutiliza os validadores/normalizadores canônicos do projeto
// (masks.isValidCpf, phoneUtils.classifyBrazilianPhone, guardianMatching) em
// vez de reimplementá-los.

import type { LegacyPatientMetadata, Patient } from '../types';
import { isValidCpf } from './masks';
import { normalizeBrazilianNumber, classifyBrazilianPhone, PhoneClassificationResult } from './phoneUtils';
import { normalizeGuardianName } from './guardianMatching';
import { ReviewIssueDraft, deriveFieldIssues, makeIdentityIssue, dedupeDrafts } from './patientReviewIssues';
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
 * Chave estrita de comparação de nome de pessoa: sem acento, maiúscula,
 * sem pontuação e sem sufixo entre parênteses — o sistema anterior anexava
 * o convênio ao nome ("FULANO (UNIMED)"), o que não pode impedir reconhecer o
 * mesmo paciente já cadastrado sem o sufixo. Só para comparar; o nome
 * gravado continua o original (apenas trim/espaços).
 */
export function nameCompareKey(raw: string | null | undefined): string {
  return normalizeName(raw)
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokenOverlap(a: string, b: string): number {
  const ta = new Set(nameCompareKey(a).split(' ').filter((w) => w.length > 1));
  const tb = new Set(nameCompareKey(b).split(' ').filter((w) => w.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  const [smaller, larger] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hits = 0;
  smaller.forEach((w) => {
    if (larger.has(w)) hits++;
  });
  return hits / smaller.size;
}

/**
 * Normalizador leniente (mantido para o cadastro/relatório): dígitos locais
 * sem DDI. Para decidir se um telefone pode ser usado, use sempre
 * classifyBrazilianPhone (só VALID vira telefone real).
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
 * - BLANK: nada informado.
 * - PLACEHOLDER: 11 dígitos repetidos (ex. "99999999999") — valor "sem CPF" do
 *   sistema anterior. Nunca gravado, nunca usado em matching.
 * - INVALID: preenchido mas falha no dígito verificador — não gravado; força
 *   revisão humana quando não há outra correspondência forte.
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
 * Converte uma célula de data do arquivo legado para YYYY-MM-DD. Datas
 * implausíveis NÃO são corrigidas silenciosamente — value volta null e
 * reviewRequired=true.
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

// PROVISORIO = cliente que a classificação mandaria para revisão (identidade ambígua, CPF conflitante,
// dado inválido...) e que, pela regra da clínica, ENTRA no sistema como cadastro provisório de revisão
// com identidade legada própria (mapa) e pendências estruturadas — nunca mesclado/vinculado sozinho.
export type LegacyRowStatus = 'NOVO' | 'VINCULAR' | 'CONFLITO' | 'INVALIDO' | 'REVISAR' | 'IGNORAR' | 'PROVISORIO';

export interface LegacyGuardianInfo {
  name: string;
  nameKey: string; // normalizeGuardianName — mesma chave de guardianMatching.ts
  cpf: CpfClassificationResult;
  phone: PhoneClassificationResult;
  email: string;
  relationshipType: string; // grau_parentesco cru
  isSelf: boolean; // o "responsável" é o próprio paciente (mesmo nome ou mesmo CPF)
}

export interface NormalizedLegacyClient {
  legacyId: string; // Clientes.identificador (UUID) — chave principal de df_legacy_import_map
  legacyClientId: string; // Clientes.id_cliente — chave secundária (legacy_secondary_id)
  name: string;
  cpf: CpfClassificationResult;
  email: string;
  phoneInfo: PhoneClassificationResult; // telefone1 classificado
  phone: string; // telefone1 normalizado SOMENTE quando VALID, senão ''
  phone2: string;
  phone3: string;
  birthDate: ParsedLegacyDate;
  city: string;
  state: string;
  clinicalNotes: string; // observacao_prontuario -> Patient.clinicalNotes
  notes: string; // observacao -> Patient.notes
  guardian?: LegacyGuardianInfo;
  legacyMetadata: LegacyPatientMetadata;
}

function buildAddress(row: Record<string, LegacyCellValue>, prefix: string) {
  const suffix = prefix ? `_${prefix}` : '';
  const get = (base: string) => cellToString(row[`${base}${suffix}`]);
  const address = {
    logradouro: get('endereco'),
    numero: get('numero'),
    complemento: get('complemento'),
    bairro: get('nome_bairro'),
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
  const rawPhone1 = cellToString(row.telefone1);
  const phoneInfo = classifyBrazilianPhone(rawPhone1);
  const birthDate = parseLegacyDateTime(row.data_nascimento);
  // Nascimento também precisa ser plausível como data de vida (não futura).
  const birthDateFinal: ParsedLegacyDate =
    birthDate.value && birthDate.value > new Date().toISOString().slice(0, 10)
      ? { ...birthDate, value: null, reviewRequired: true }
      : birthDate;

  const responsavelNome = normalizeName(cellToString(row.nome_responsavel));
  const guardianCpf = classifyCpf(cellToString(row.cpf_responsavel));
  const guardianPhoneRaw = cellToString(row.telefone1_responsavel);
  const guardianPhone = classifyBrazilianPhone(guardianPhoneRaw);
  const hasGuardianData =
    Boolean(responsavelNome) || guardianCpf.classification === 'VALID' || guardianPhone.classification === 'VALID';

  const guardian: LegacyGuardianInfo | undefined = hasGuardianData
    ? {
        name: responsavelNome,
        nameKey: normalizeGuardianName(responsavelNome),
        cpf: guardianCpf,
        phone: guardianPhone,
        email: cellToString(row.email_responsavel),
        relationshipType: normalizeName(cellToString(row.grau_parentesco)),
        isSelf:
          (Boolean(responsavelNome) && nameCompareKey(responsavelNome) === nameCompareKey(name)) ||
          (guardianCpf.classification === 'VALID' && cpf.classification === 'VALID' && guardianCpf.cleaned === cpf.cleaned),
      }
    : undefined;

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

  const phone2Info = classifyBrazilianPhone(cellToString(row.telefone2));
  const phone3Info = classifyBrazilianPhone(cellToString(row.telefone3));
  if (phone2Info.classification !== 'VALID' && cellToString(row.telefone2)) extra.telefone2Original = cellToString(row.telefone2);
  if (phone3Info.classification !== 'VALID' && cellToString(row.telefone3)) extra.telefone3Original = cellToString(row.telefone3);

  const reviewFlags: string[] = [];
  if (birthDateFinal.reviewRequired) reviewFlags.push('DATA_NASCIMENTO_IMPLAUSIVEL');
  if (phoneInfo.classification === 'PLACEHOLDER') reviewFlags.push('TELEFONE_PLACEHOLDER');
  if (phoneInfo.classification === 'INVALID') reviewFlags.push('TELEFONE_INVALIDO');

  const legacyMetadata: LegacyPatientMetadata = {
    sourceSystem,
    legacyClientUuid: legacyId,
    legacyClientId,
    rg: cellToString(row.rg) || undefined,
    sexo: cellToString(row.sexo) || undefined,
    profissao: cellToString(row.profissao) || undefined,
    phone2: phone2Info.classification === 'VALID' ? phone2Info.normalized : undefined,
    phone3: phone3Info.classification === 'VALID' ? phone3Info.normalized : undefined,
    rawCpfOriginal: cpf.classification !== 'VALID' ? cellToString(row.cpf) || undefined : undefined,
    legacyBirthDateRaw: birthDateFinal.reviewRequired ? birthDate.raw || String(cellToString(row.data_nascimento) || '') || undefined : undefined,
    cpfClassification: cpf.classification,
    rawPhoneOriginal: phoneInfo.classification !== 'VALID' && rawPhone1 ? rawPhone1 : undefined,
    phoneClassification: phoneInfo.classification,
    address: buildAddress(row, ''),
    // Cópia de auditoria completa do responsável como veio do arquivo — o
    // operacional (nome/CPF/telefone/e-mail/parentesco) vai para
    // df_patient_guardians/df_patient_guardian_links; aqui ficam também os
    // campos sem lugar na UI (nascimento, sexo, RG, profissão, endereço).
    responsavel: responsavelNome || hasGuardianData
      ? {
          nome: responsavelNome || undefined,
          nascimento: parseLegacyDateTime(row.nascimento_responsavel).value || undefined,
          grauParentesco: cellToString(row.grau_parentesco) || undefined,
          profissao: cellToString(row.profissao_responsavel) || undefined,
          sexo: cellToString(row.sexo_responsavel) || undefined,
          rg: cellToString(row.rg_responsavel) || undefined,
          cpf: cellToString(row.cpf_responsavel) || undefined,
          telefone:
            guardianPhone.classification === 'VALID' ? guardianPhone.normalized : guardianPhoneRaw || undefined,
          email: cellToString(row.email_responsavel) || undefined,
          endereco: buildAddress(row, 'responsavel'),
        }
      : undefined,
    reviewFlags: reviewFlags.length > 0 ? reviewFlags : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };

  return {
    legacyId,
    legacyClientId,
    name,
    cpf,
    email: cellToString(row.email),
    phoneInfo,
    phone: phoneInfo.classification === 'VALID' ? phoneInfo.normalized : '',
    phone2: cellToString(row.telefone2),
    phone3: cellToString(row.telefone3),
    birthDate: birthDateFinal,
    city: normalizeName(cellToString(row.nome_cidade)),
    state: cellToString(row.uf).toUpperCase(),
    clinicalNotes: cellToString(row.observacao_prontuario),
    notes: cellToString(row.observacao),
    guardian,
    legacyMetadata,
  };
}

// ----------------------------------------------------------------------
// Prontuarios.xls — normalização de linha
// ----------------------------------------------------------------------

export interface NormalizedLegacyRecord {
  legacyId: string; // identificador_prontuario (UUID) — verificado 100% único em 9.004/9.004 linhas
  patientLegacyId: string; // identificador_cliente -> Clientes.identificador
  patientLegacyClientId: string; // id_cliente -> Clientes.id_cliente
  dataAbertura: ParsedLegacyDate;
  dataRealizacao: ParsedLegacyDate;
  dentistaLegado: string;
  codigoTuss: string;
  descricao: string;
  procedimentos: string;
  denteRegiao: string;
  face: string;
  statusLegado: string;
  identificadorGuia: string;
  idGuia: string;
  idItemGuia: string;
  clienteRaw: string; // só auditoria visual, nunca usado no matching
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
// Matching de pacientes
// Ordem: 1. mapa legado do tenant; 2. CPF válido e único; 3. combinação forte
// nome + nascimento + telefone VÁLIDO; 4. qualquer candidato parcial
// (mesmo nome de paciente já existente, duplicata provável no próprio
// arquivo, CPF inválido) -> revisão humana. Nunca mescla por nome, telefone
// ou e-mail sozinhos. Paciente já existente nunca é alterado: o vínculo só
// grava o mapa legado.
// ----------------------------------------------------------------------

export type MatchKind = 'LEGACY_MAP' | 'CPF' | 'STRONG';
export type ExistingMatchQuality = 'CONFIRMED' | 'MINOR_DIVERGENCE' | 'REVIEW_REQUIRED';
export type ReviewCategory =
  | 'IDENTIFICACAO_INVALIDA'
  | 'CPF_DUPLICADO'
  | 'CPF_MULTIPLOS_EXISTENTES'
  | 'DATA_INVALIDA'
  | 'MATCH_EXISTENTE_REVIEW'
  | 'MATCH_MULTIPLO_EXISTENTE'
  | 'MULTIPLOS_LEGADOS_MESMO_PACIENTE'
  | 'POSSIVEL_DUPLICATA_EXISTENTE'
  | 'POSSIVEL_DUPLICATA_ARQUIVO'
  | 'CPF_INVALIDO';

export type FieldComparisonResult = 'IGUAL' | 'PREENCHER_CAMPO_VAZIO' | 'DIVERGENTE' | 'AMBOS_VAZIOS';

export interface FieldComparison {
  field: 'nome' | 'cpf' | 'nascimento' | 'telefone' | 'email';
  legacy: string;
  current: string;
  result: FieldComparisonResult;
}

export interface ClientMatchResult {
  row: NormalizedLegacyClient;
  status: LegacyRowStatus;
  reason: string;
  matchedPatientId?: string;
  conflictCandidateIds?: string[];
  matchKind?: MatchKind;
  existingQuality?: ExistingMatchQuality;
  fieldComparison?: FieldComparison[];
  reviewCategory?: ReviewCategory;
  requiredDecision?: string;
  /** Presente quando status === 'PROVISORIO' (ver applyReviewImportPolicy). */
  provisional?: ProvisionalInfo;
  /** Pendências cadastrais a criar junto com o paciente (NOVO e PROVISORIO). */
  reviewIssues?: ReviewIssueDraft[];
}

export interface ProvisionalInfo {
  originalStatus: LegacyRowStatus;
  /** O CPF válido do arquivo vira CPF canônico? false quando conflita com outro cadastro. */
  persistCpf: boolean;
  cpfConflict: boolean;
  relatedLegacyIds: string[];
  relatedPatientIds: string[];
}

/** Clientes que entram como paciente NOVO (criado): NOVO e PROVISORIO. */
export function isCreatableResult(r: ClientMatchResult): boolean {
  return r.status === 'NOVO' || r.status === 'PROVISORIO';
}

function compareField(field: FieldComparison['field'], legacy: string, current: string, equal: boolean): FieldComparison {
  if (!legacy && !current) return { field, legacy, current, result: 'AMBOS_VAZIOS' };
  if (!current && legacy) return { field, legacy, current, result: 'PREENCHER_CAMPO_VAZIO' };
  if (!legacy) return { field, legacy, current, result: 'IGUAL' }; // legado vazio nunca apaga o atual
  return { field, legacy, current, result: equal ? 'IGUAL' : 'DIVERGENTE' };
}

export function compareWithExistingPatient(
  row: NormalizedLegacyClient,
  patient: Patient
): { fields: FieldComparison[]; quality: ExistingMatchQuality } {
  const legacyCpf = row.cpf.classification === 'VALID' ? row.cpf.cleaned : '';
  const currentCpf = (patient.cpf || '').replace(/\D/g, '');
  const currentPhone = classifyBrazilianPhone(patient.phone).normalized || (patient.phone || '').replace(/\D/g, '');
  const nameEqual = nameCompareKey(row.name) === nameCompareKey(patient.name);
  const fields: FieldComparison[] = [
    compareField('nome', row.name, patient.name || '', nameEqual),
    compareField('cpf', legacyCpf, currentCpf, legacyCpf === currentCpf),
    compareField('nascimento', row.birthDate.value || '', patient.birthDate || '', (row.birthDate.value || '') === (patient.birthDate || '')),
    compareField('telefone', row.phone, currentPhone, row.phone === currentPhone),
    compareField('email', row.email, patient.email || '', row.email.trim().toLowerCase() === (patient.email || '').trim().toLowerCase()),
  ];

  const dobConflict = fields.find((f) => f.field === 'nascimento')!.result === 'DIVERGENTE';
  let quality: ExistingMatchQuality;
  if (nameEqual && !dobConflict) quality = 'CONFIRMED';
  else if (!dobConflict && nameTokenOverlap(row.name, patient.name) >= 0.75) quality = 'MINOR_DIVERGENCE';
  else quality = 'REVIEW_REQUIRED';
  return { fields, quality };
}

const DECISION_CPF_DUPLICADO =
  'A) mesma pessoa → consolidar; B) pessoas diferentes → remover o CPF de um; C) corrigir o CPF na origem; D) não importar ainda';

export function classifyPatientRows(
  rows: NormalizedLegacyClient[],
  existingPatients: Patient[],
  existingLegacyMap: Map<string, string>, // Clientes.identificador -> patientId já mapeado neste tenant
  // Clientes.identificador -> status ('DELETED' | 'IGNORED' | 'REJECTED') de mapa legado que a clínica
  // já revisou/excluiu: nunca é recriado por uma nova importação.
  ignoredLegacyIds: Map<string, string> = new Map()
): ClientMatchResult[] {
  const validCpfCountsInSource = new Map<string, number>();
  const nameDobCountsInSource = new Map<string, number>();
  for (const r of rows) {
    if (r.cpf.classification === 'VALID') {
      validCpfCountsInSource.set(r.cpf.cleaned, (validCpfCountsInSource.get(r.cpf.cleaned) || 0) + 1);
    }
    if (r.birthDate.value && r.name) {
      const key = `${nameCompareKey(r.name)}|${r.birthDate.value}`;
      nameDobCountsInSource.set(key, (nameDobCountsInSource.get(key) || 0) + 1);
    }
  }

  const existingByCpf = new Map<string, Patient[]>();
  const existingByName = new Map<string, Patient[]>();
  for (const p of existingPatients) {
    const clean = (p.cpf || '').replace(/\D/g, '');
    if (clean) existingByCpf.set(clean, [...(existingByCpf.get(clean) || []), p]);
    const nk = nameCompareKey(p.name);
    if (nk) existingByName.set(nk, [...(existingByName.get(nk) || []), p]);
  }

  const results = rows.map((row): ClientMatchResult => {
    const ignoredStatus = ignoredLegacyIds.get(row.legacyId);
    if (ignoredStatus) {
      return {
        row,
        status: 'IGNORAR',
        reason: `Cadastro legado já revisado pela clínica (${ignoredStatus}) — não é recriado por nova importação.`,
      };
    }
    const mapped = existingLegacyMap.get(row.legacyId);
    if (mapped) {
      return {
        row,
        status: 'VINCULAR',
        matchKind: 'LEGACY_MAP',
        reason: 'Já importado/vinculado anteriormente (mapa legado deste tenant).',
        matchedPatientId: mapped,
      };
    }

    if (!row.legacyId || !row.name || row.name.length < 2) {
      return {
        row,
        status: 'INVALIDO',
        reviewCategory: 'IDENTIFICACAO_INVALIDA',
        reason: !row.legacyId ? 'identificador (legacy_id) ausente — sem rastreabilidade.' : 'Nome ausente ou inválido.',
        requiredDecision: 'Corrigir o cadastro na origem',
      };
    }

    if (row.cpf.classification === 'VALID' && (validCpfCountsInSource.get(row.cpf.cleaned) || 0) > 1) {
      return {
        row,
        status: 'CONFLITO',
        reviewCategory: 'CPF_DUPLICADO',
        reason: 'CPF válido repetido em outro cliente do próprio arquivo de origem.',
        requiredDecision: DECISION_CPF_DUPLICADO,
      };
    }

    if (row.birthDate.reviewRequired) {
      return {
        row,
        status: 'REVISAR',
        reviewCategory: 'DATA_INVALIDA',
        reason: `Data de nascimento implausível ("${row.birthDate.raw}") — não corrigida automaticamente.`,
        requiredDecision: 'Informar a data correta ou autorizar importação sem data de nascimento',
      };
    }

    const nameKey = nameCompareKey(row.name);

    if (row.cpf.classification === 'VALID') {
      const candidates = existingByCpf.get(row.cpf.cleaned) || [];
      if (candidates.length > 1) {
        return {
          row,
          status: 'CONFLITO',
          reviewCategory: 'CPF_MULTIPLOS_EXISTENTES',
          reason: 'CPF válido corresponde a mais de um paciente já cadastrado neste tenant.',
          conflictCandidateIds: candidates.map((p) => p.id),
          requiredDecision: 'Escolher qual paciente existente corresponde ao cliente legado',
        };
      }
      if (candidates.length === 1) {
        const { fields, quality } = compareWithExistingPatient(row, candidates[0]);
        if (quality === 'CONFIRMED') {
          return {
            row,
            status: 'VINCULAR',
            matchKind: 'CPF',
            existingQuality: quality,
            fieldComparison: fields,
            matchedPatientId: candidates[0].id,
            reason: 'CPF válido + nome + nascimento compatíveis com paciente já cadastrado (dados atuais preservados).',
          };
        }
        return {
          row,
          status: 'REVISAR',
          matchKind: 'CPF',
          existingQuality: quality,
          fieldComparison: fields,
          reviewCategory: 'MATCH_EXISTENTE_REVIEW',
          matchedPatientId: candidates[0].id,
          reason:
            quality === 'MINOR_DIVERGENCE'
              ? 'CPF igual a paciente existente, mas o nome diverge levemente.'
              : 'CPF igual a paciente existente, mas nome e/ou nascimento divergem.',
          requiredDecision: 'Confirmar se é a mesma pessoa antes de vincular',
        };
      }
    }

    if (row.birthDate.value && row.phone) {
      const strong = existingPatients.filter(
        (p) =>
          nameCompareKey(p.name) === nameKey &&
          p.birthDate === row.birthDate.value &&
          classifyBrazilianPhone(p.phone).normalized === row.phone
      );
      if (strong.length > 1) {
        return {
          row,
          status: 'CONFLITO',
          reviewCategory: 'MATCH_MULTIPLO_EXISTENTE',
          reason: 'Mais de um paciente cadastrado corresponde a nome + nascimento + telefone.',
          conflictCandidateIds: strong.map((p) => p.id),
          requiredDecision: 'Escolher qual paciente existente corresponde ao cliente legado',
        };
      }
      if (strong.length === 1) {
        const existingCpf = (strong[0].cpf || '').replace(/\D/g, '');
        const cpfContradiction = row.cpf.classification === 'VALID' && existingCpf && existingCpf !== row.cpf.cleaned;
        const { fields } = compareWithExistingPatient(row, strong[0]);
        if (cpfContradiction) {
          return {
            row,
            status: 'REVISAR',
            matchKind: 'STRONG',
            existingQuality: 'REVIEW_REQUIRED',
            fieldComparison: fields,
            reviewCategory: 'MATCH_EXISTENTE_REVIEW',
            matchedPatientId: strong[0].id,
            reason: 'Nome + nascimento + telefone batem com paciente existente, mas os CPFs são diferentes.',
            requiredDecision: 'Confirmar se é a mesma pessoa e qual CPF está correto',
          };
        }
        return {
          row,
          status: 'VINCULAR',
          matchKind: 'STRONG',
          existingQuality: 'CONFIRMED',
          fieldComparison: fields,
          matchedPatientId: strong[0].id,
          reason: 'Nome + nascimento + telefone válido correspondem a paciente já cadastrado (dados atuais preservados).',
        };
      }
    }

    const sameName = existingByName.get(nameKey) || [];
    if (sameName.length > 0) {
      return {
        row,
        status: 'REVISAR',
        reviewCategory: 'POSSIVEL_DUPLICATA_EXISTENTE',
        conflictCandidateIds: sameName.map((p) => p.id),
        reason: 'Já existe paciente com o mesmo nome neste tenant, sem CPF/nascimento/telefone que confirmem.',
        requiredDecision: 'Vincular ao paciente existente ou confirmar que é outra pessoa',
      };
    }

    if (row.cpf.classification === 'INVALID') {
      return {
        row,
        status: 'REVISAR',
        reviewCategory: 'CPF_INVALIDO',
        reason: `CPF preenchido é inválido ("${row.legacyMetadata.rawCpfOriginal || row.cpf.cleaned}") e não é placeholder.`,
        requiredDecision: 'Corrigir o CPF ou autorizar importação sem CPF',
      };
    }

    if (row.birthDate.value && (nameDobCountsInSource.get(`${nameKey}|${row.birthDate.value}`) || 0) > 1) {
      return {
        row,
        status: 'REVISAR',
        reviewCategory: 'POSSIVEL_DUPLICATA_ARQUIVO',
        reason: 'Mesmo nome e mesma data de nascimento de outro cliente do próprio arquivo — provável cadastro duplicado no sistema anterior.',
        requiredDecision: 'Confirmar se são a mesma pessoa (consolidar) ou pessoas diferentes',
      };
    }

    return {
      row,
      status: 'NOVO',
      reason:
        row.cpf.classification === 'VALID'
          ? 'CPF válido e único, sem paciente correspondente — será criado.'
          : 'Sem CPF confiável e sem nenhum candidato existente — será criado.',
    };
  });

  // Dois ou mais clientes legados caindo no MESMO paciente existente seriam
  // uma consolidação automática — nunca feita sem decisão humana.
  const linksPerPatient = new Map<string, number>();
  results.forEach((r) => {
    if (r.status === 'VINCULAR' && r.matchKind !== 'LEGACY_MAP' && r.matchedPatientId) {
      linksPerPatient.set(r.matchedPatientId, (linksPerPatient.get(r.matchedPatientId) || 0) + 1);
    }
  });
  return results.map((r) =>
    r.status === 'VINCULAR' && r.matchKind !== 'LEGACY_MAP' && r.matchedPatientId && (linksPerPatient.get(r.matchedPatientId) || 0) > 1
      ? {
          ...r,
          status: 'REVISAR',
          reviewCategory: 'MULTIPLOS_LEGADOS_MESMO_PACIENTE',
          reason: 'Mais de um cliente legado corresponde ao mesmo paciente existente.',
          requiredDecision: 'Decidir qual cliente legado corresponde ao paciente (ou consolidar)',
        }
      : r
  );
}


// ----------------------------------------------------------------------
// Política "dado incompleto/ambíguo NÃO bloqueia a importação"
//
// Todo cliente com identidade legada própria (identificador + nome) entra no sistema:
//  - NOVO      -> paciente criado (como antes), com pendências de dado faltante/inválido;
//  - REVISAR / CONFLITO -> PROVISORIO: paciente criado com o próprio legacy id/id_cliente e
//    mapa legado, NUNCA mesclado nem vinculado a paciente existente, com alerta forte de
//    "possível duplicidade" quando a pendência é de identidade;
//  - VINCULAR / IGNORAR / INVALIDO (sem identificador ou nome) não mudam.
// CPF: só é gravado como canônico quando é válido E não pertence a outro cadastro nem se
// repete no arquivo. Conflitante -> vai para legacy_metadata.legacyCpfRaw + DUPLICATE_CPF
// (a recepção decide). Data de nascimento implausível e CPF/telefone inválidos nunca viram
// dado operacional: o valor original fica só em legacy_metadata.
// ----------------------------------------------------------------------

const MAX_RELATED_PER_ISSUE = 3;

export function applyReviewImportPolicy(results: ClientMatchResult[], existingPatients: Patient[]): ClientMatchResult[] {
  const legacyIdsByCpf = new Map<string, string[]>();
  const legacyIdsByNameDob = new Map<string, string[]>();
  const legacyIdsByMatchedPatient = new Map<string, string[]>();
  for (const r of results) {
    if (r.row.cpf.classification === 'VALID') {
      legacyIdsByCpf.set(r.row.cpf.cleaned, [...(legacyIdsByCpf.get(r.row.cpf.cleaned) || []), r.row.legacyId]);
    }
    if (r.row.birthDate.value && r.row.name) {
      const k = `${nameCompareKey(r.row.name)}|${r.row.birthDate.value}`;
      legacyIdsByNameDob.set(k, [...(legacyIdsByNameDob.get(k) || []), r.row.legacyId]);
    }
    if (r.reviewCategory === 'MULTIPLOS_LEGADOS_MESMO_PACIENTE' && r.matchedPatientId) {
      legacyIdsByMatchedPatient.set(r.matchedPatientId, [...(legacyIdsByMatchedPatient.get(r.matchedPatientId) || []), r.row.legacyId]);
    }
  }
  const existingByCpf = new Map<string, string[]>();
  for (const p of existingPatients) {
    const clean = (p.cpf || '').replace(/\D/g, '');
    if (clean) existingByCpf.set(clean, [...(existingByCpf.get(clean) || []), p.id]);
  }

  return results.map((r): ClientMatchResult => {
    const creatableStatus = r.status === 'NOVO' || r.status === 'REVISAR' || r.status === 'CONFLITO';
    if (!creatableStatus || !r.row.legacyId || !r.row.name || r.row.name.length < 2) return r;

    const row = r.row;
    const cpfValid = row.cpf.classification === 'VALID';
    const heldByExisting = cpfValid ? existingByCpf.get(row.cpf.cleaned) || [] : [];
    const sharedInFile = cpfValid ? (legacyIdsByCpf.get(row.cpf.cleaned) || []).filter((id) => id !== row.legacyId) : [];
    const persistCpf = cpfValid && heldByExisting.length === 0 && sharedInFile.length === 0;
    const cpfConflict = cpfValid && !persistCpf;

    const relatedLegacyIds = new Set<string>(sharedInFile);
    const relatedPatientIds = new Set<string>(heldByExisting);
    const cat = r.reviewCategory;
    if (cat === 'POSSIVEL_DUPLICATA_ARQUIVO' && row.birthDate.value) {
      (legacyIdsByNameDob.get(`${nameCompareKey(row.name)}|${row.birthDate.value}`) || [])
        .filter((id) => id !== row.legacyId)
        .forEach((id) => relatedLegacyIds.add(id));
    }
    if (cat === 'MULTIPLOS_LEGADOS_MESMO_PACIENTE' && r.matchedPatientId) {
      (legacyIdsByMatchedPatient.get(r.matchedPatientId) || []).filter((id) => id !== row.legacyId).forEach((id) => relatedLegacyIds.add(id));
    }
    if (r.matchedPatientId) relatedPatientIds.add(r.matchedPatientId);
    (r.conflictCandidateIds || []).forEach((id) => relatedPatientIds.add(id));

    const issues: ReviewIssueDraft[] = deriveFieldIssues({
      cpfClassification: row.cpf.classification,
      cpfRaw: cpfValid ? row.cpf.cleaned : row.legacyMetadata.rawCpfOriginal || row.cpf.cleaned,
      cpfPersisted: persistCpf,
      cpfConflict,
      birthValue: row.birthDate.value,
      birthRaw: row.birthDate.raw,
      birthInvalid: row.birthDate.reviewRequired,
      phoneClassification: row.phoneInfo.classification,
      phoneRaw: row.legacyMetadata.rawPhoneOriginal,
      // Telefone herdado do responsável só é conhecido após planGuardians; o servidor
      // reavalia a pendência de telefone contra o paciente REAL antes de gravá-la.
      hasEffectivePhone: Boolean(row.phone),
    });

    const relL = [...relatedLegacyIds].slice(0, MAX_RELATED_PER_ISSUE);
    const relP = [...relatedPatientIds].slice(0, MAX_RELATED_PER_ISSUE);
    const dup = (code: 'POSSIBLE_DUPLICATE' | 'EXISTING_PATIENT_DIVERGENCE' | 'MULTIPLE_LEGACY_SAME_PATIENT', message?: string) => {
      relL.forEach((id) => issues.push(makeIdentityIssue(code, { relatedLegacyId: id, message })));
      relP.forEach((id) => issues.push(makeIdentityIssue(code, { relatedPatientId: id, message })));
      if (relL.length === 0 && relP.length === 0) issues.push(makeIdentityIssue(code, { message }));
    };

    switch (cat) {
      case 'CPF_DUPLICADO':
      case 'CPF_MULTIPLOS_EXISTENTES':
      case 'MATCH_MULTIPLO_EXISTENTE':
      case 'POSSIVEL_DUPLICATA_EXISTENTE':
      case 'POSSIVEL_DUPLICATA_ARQUIVO':
        dup('POSSIBLE_DUPLICATE', r.reason);
        break;
      case 'MATCH_EXISTENTE_REVIEW':
        dup('EXISTING_PATIENT_DIVERGENCE', r.reason);
        break;
      case 'MULTIPLOS_LEGADOS_MESMO_PACIENTE':
        dup('MULTIPLE_LEGACY_SAME_PATIENT', r.reason);
        dup('POSSIBLE_DUPLICATE', r.reason);
        break;
      default:
        break;
    }

    const reviewIssues = dedupeDrafts(issues);

    if (r.status === 'NOVO') {
      return { ...r, reviewIssues };
    }

    const legacyMetadata: LegacyPatientMetadata = {
      ...row.legacyMetadata,
      legacyCpfRaw: cpfConflict ? row.cpf.cleaned : row.legacyMetadata.legacyCpfRaw,
      reviewFlags: [
        ...(row.legacyMetadata.reviewFlags || []),
        'CADASTRO_PROVISORIO_REVISAO',
        ...(cat ? [`REVIEW_${cat}`] : []),
      ],
    };
    return {
      ...r,
      status: 'PROVISORIO',
      row: { ...row, legacyMetadata },
      reviewIssues,
      provisional: {
        originalStatus: r.status,
        persistCpf,
        cpfConflict,
        relatedLegacyIds: relL,
        relatedPatientIds: relP,
      },
    };
  });
}

// ----------------------------------------------------------------------
// Responsáveis (guardians) — plano de criação/reaproveitamento
// Mesma prioridade de resolveGuardianMatch (guardianMatching.ts): 1. CPF
// válido; 2. nome normalizado + telefone válido. Nunca por nome sozinho nem
// por telefone sozinho. Só é aplicado a pacientes que serão CRIADOS —
// paciente já existente nunca tem responsável/phone_owner alterado.
// ----------------------------------------------------------------------

export interface ExistingGuardian {
  id: string;
  name: string;
  cpf?: string | null;
  phone?: string | null;
}

export interface GuardianCluster {
  clusterKey: string; // cpf:<cpf> | np:<nome>|<telefone> | solo:<legacyId>
  name: string;
  cpf: string; // '' quando não há CPF válido
  phone: string; // telefone VALID normalizado, '' quando ausente/divergente
  email: string;
  memberLegacyIds: string[];
  relationshipByLegacyId: Record<string, string>;
  existingGuardianId?: string;
  existingGuardianPhone?: string;
  phoneConflict: boolean;
  nameVariants: string[];
}

/**
 * Telefone que o responsável terá DE FATO após o commit — é ele que a trigger
 * fn_sync_patient_link_phone copia para df_patients.phone de todo paciente
 * RESPONSIBLE vinculado como primário. Ao reaproveitar um responsável já
 * cadastrado, vale o telefone dele (fonte canônica), não o do arquivo.
 */
export function effectiveGuardianPhone(cluster: GuardianCluster): string {
  if (cluster.existingGuardianId) {
    return (cluster.existingGuardianPhone || '') === cluster.phone ? cluster.phone : '';
  }
  return cluster.phone;
}

export interface GuardianAssignment {
  clusterKey: string;
  relationshipType: string;
}

export interface GuardianReviewItem {
  legacyId: string;
  legacyClientId: string;
  patientName: string;
  guardianName: string;
  reason: string;
  requiredDecision: string;
}

export interface PhoneOwnerDecision {
  phoneOwner: 'PATIENT' | 'RESPONSIBLE';
  effectivePhone: string; // valor que vai para df_patients.phone ('' quando não há telefone válido)
  basis:
    | 'PROPRIO'
    | 'IGUAL_AO_RESPONSAVEL'
    | 'SEM_TELEFONE_PROPRIO_USA_RESPONSAVEL'
    | 'PROPRIO_DIFERENTE_DO_RESPONSAVEL'
    | 'SEM_TELEFONE';
}

export interface GuardianPlan {
  clusters: GuardianCluster[];
  assignmentByLegacyId: Map<string, GuardianAssignment>;
  phoneOwnerByLegacyId: Map<string, PhoneOwnerDecision>;
  review: GuardianReviewItem[];
  selfReferenceCount: number;
}

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  let best = values[0] || '';
  let bestCount = 0;
  counts.forEach((c, v) => {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  });
  return best;
}

export function planGuardians(results: ClientMatchResult[], existingGuardians: ExistingGuardian[]): GuardianPlan {
  const review: GuardianReviewItem[] = [];
  const clusters = new Map<string, { members: NormalizedLegacyClient[] }>();
  const assignment = new Map<string, GuardianAssignment>();
  let selfReferenceCount = 0;

  const toCreate = results.filter((r) => isCreatableResult(r) && r.row.guardian);
  const addReview = (row: NormalizedLegacyClient, reason: string, requiredDecision: string) =>
    review.push({
      legacyId: row.legacyId,
      legacyClientId: row.legacyClientId,
      patientName: row.name,
      guardianName: row.guardian?.name || '',
      reason,
      requiredDecision,
    });
  const joinCluster = (key: string, row: NormalizedLegacyClient) => {
    const c = clusters.get(key) || { members: [] };
    c.members.push(row);
    clusters.set(key, c);
  };

  const eligible: NormalizedLegacyClient[] = [];
  for (const r of toCreate) {
    const g = r.row.guardian!;
    if (g.isSelf) {
      selfReferenceCount++;
      continue;
    }
    if (!g.name) {
      addReview(r.row, 'Responsável com CPF/telefone mas sem nome.', 'Informar o nome do responsável');
      continue;
    }
    eligible.push(r.row);
  }

  // 1. Clusters por CPF válido.
  const namePhoneToCpfKeys = new Map<string, Set<string>>();
  for (const row of eligible) {
    const g = row.guardian!;
    if (g.cpf.classification !== 'VALID') continue;
    const key = `cpf:${g.cpf.cleaned}`;
    joinCluster(key, row);
    if (g.phone.classification === 'VALID') {
      const np = `${g.nameKey}|${g.phone.normalized}`;
      namePhoneToCpfKeys.set(np, new Set([...(namePhoneToCpfKeys.get(np) || []), key]));
    }
  }

  // 2. Sem CPF: nome + telefone válido (junta a um cluster de CPF quando o par
  // nome+telefone bate com exatamente um).
  const nameOnly: NormalizedLegacyClient[] = [];
  for (const row of eligible) {
    const g = row.guardian!;
    if (g.cpf.classification === 'VALID') continue;
    if (g.phone.classification !== 'VALID') {
      nameOnly.push(row);
      continue;
    }
    const np = `${g.nameKey}|${g.phone.normalized}`;
    const cpfKeys = namePhoneToCpfKeys.get(np);
    if (cpfKeys && cpfKeys.size > 1) {
      addReview(
        row,
        'Nome + telefone do responsável batem com mais de um responsável identificado por CPF.',
        'Escolher qual responsável corresponde'
      );
      continue;
    }
    joinCluster(cpfKeys && cpfKeys.size === 1 ? [...cpfKeys][0] : `np:${np}`, row);
  }

  // 3. Só nome: nunca mescla. Se o mesmo nome aparece em outro responsável
  // (de qualquer tipo) é ambíguo -> revisão; senão, responsável próprio.
  const knownNameKeys = new Map<string, number>();
  clusters.forEach((c) => {
    new Set(c.members.map((m) => m.guardian!.nameKey)).forEach((nk) => knownNameKeys.set(nk, (knownNameKeys.get(nk) || 0) + 1));
  });
  const nameOnlyCounts = new Map<string, number>();
  nameOnly.forEach((row) => nameOnlyCounts.set(row.guardian!.nameKey, (nameOnlyCounts.get(row.guardian!.nameKey) || 0) + 1));
  for (const row of nameOnly) {
    const nk = row.guardian!.nameKey;
    if ((nameOnlyCounts.get(nk) || 0) > 1 || knownNameKeys.has(nk)) {
      addReview(
        row,
        'Responsável identificado só pelo nome (sem CPF/telefone válidos) e o mesmo nome aparece em outro vínculo — pode ser a mesma pessoa.',
        'Confirmar se é o mesmo responsável (informar CPF ou telefone)'
      );
      continue;
    }
    joinCluster(`solo:${row.legacyId}`, row);
  }

  const finalClusters: GuardianCluster[] = [];
  const phoneOwnerByLegacyId = new Map<string, PhoneOwnerDecision>();

  clusters.forEach((c, key) => {
    const validPhones = [
      ...new Set(c.members.map((m) => m.guardian!.phone).filter((p) => p.classification === 'VALID').map((p) => p.normalized)),
    ];
    const phoneConflict = validPhones.length > 1;
    const cpf = key.startsWith('cpf:') ? key.slice(4) : '';
    const nameVariants = [...new Set(c.members.map((m) => m.guardian!.name))];
    const cluster: GuardianCluster = {
      clusterKey: key,
      name: mostFrequent(c.members.map((m) => m.guardian!.name)),
      cpf,
      phone: phoneConflict ? '' : validPhones[0] || '',
      email: mostFrequent(c.members.map((m) => m.guardian!.email).filter(Boolean)) || '',
      memberLegacyIds: c.members.map((m) => m.legacyId),
      relationshipByLegacyId: Object.fromEntries(c.members.map((m) => [m.legacyId, m.guardian!.relationshipType])),
      phoneConflict,
      nameVariants,
    };

    // Reaproveita responsável já cadastrado no tenant (mesmos critérios de
    // resolveGuardianMatch; se mais de um candidato bater, não escolhe).
    const byCpf = cpf ? existingGuardians.filter((g) => (g.cpf || '').replace(/\D/g, '') === cpf) : [];
    const byNamePhone = cluster.phone
      ? existingGuardians.filter(
          (g) =>
            (g.phone || '').replace(/\D/g, '') === cluster.phone &&
            normalizeGuardianName(g.name) === normalizeGuardianName(cluster.name)
        )
      : [];
    const candidates = byCpf.length > 0 ? byCpf : byNamePhone;
    if (candidates.length > 1) {
      c.members.forEach((m) =>
        addReview(m, 'Mais de um responsável já cadastrado corresponde a este responsável.', 'Escolher o responsável existente')
      );
      return;
    }
    if (candidates.length === 1) {
      cluster.existingGuardianId = candidates[0].id;
      cluster.existingGuardianPhone = (candidates[0].phone || '').replace(/\D/g, '');
    }

    if (phoneConflict) {
      c.members.forEach((m) =>
        review.push({
          legacyId: m.legacyId,
          legacyClientId: m.legacyClientId,
          patientName: m.name,
          guardianName: cluster.name,
          reason: `Responsável (CPF) com telefones diferentes entre pacientes (${validPhones.length}) — criado sem telefone; pacientes mantêm o próprio telefone.`,
          requiredDecision: 'Informar o telefone correto do responsável (informativo — importação não bloqueada)',
        })
      );
    }

    finalClusters.push(cluster);
    c.members.forEach((m) => assignment.set(m.legacyId, { clusterKey: key, relationshipType: m.guardian!.relationshipType }));
  });

  // phone_owner de cada paciente a criar.
  const clusterByKey = new Map(finalClusters.map((c) => [c.clusterKey, c]));
  for (const r of results) {
    if (!isCreatableResult(r)) continue;
    const own = r.row.phone; // '' quando não é VALID
    const a = assignment.get(r.row.legacyId);
    const cluster = a ? clusterByKey.get(a.clusterKey) : undefined;
    const guardianPhone = cluster ? effectiveGuardianPhone(cluster) : '';
    let decision: PhoneOwnerDecision;
    if (guardianPhone && own && own === guardianPhone) {
      decision = { phoneOwner: 'RESPONSIBLE', effectivePhone: guardianPhone, basis: 'IGUAL_AO_RESPONSAVEL' };
    } else if (guardianPhone && !own) {
      decision = { phoneOwner: 'RESPONSIBLE', effectivePhone: guardianPhone, basis: 'SEM_TELEFONE_PROPRIO_USA_RESPONSAVEL' };
    } else if (own) {
      decision = { phoneOwner: 'PATIENT', effectivePhone: own, basis: guardianPhone ? 'PROPRIO_DIFERENTE_DO_RESPONSAVEL' : 'PROPRIO' };
    } else {
      decision = { phoneOwner: 'PATIENT', effectivePhone: '', basis: 'SEM_TELEFONE' };
    }
    phoneOwnerByLegacyId.set(r.row.legacyId, decision);
  }

  return { clusters: finalClusters, assignmentByLegacyId: assignment, phoneOwnerByLegacyId, review, selfReferenceCount };
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
  clientMatchByLegacyId: Map<string, ClientMatchResult>,
  existingRecordLegacyMap: Set<string>
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
      return { row, status: 'IGNORAR', reason: 'Paciente correspondente é inválido no arquivo de Clientes.' };
    }
    if (clientMatch.status === 'CONFLITO' || clientMatch.status === 'REVISAR') {
      return { row, status: 'REVISAR', reason: 'Paciente correspondente está pendente de decisão humana (conflito/revisão) em Clientes.xls.' };
    }
    if (clientMatch.status === 'IGNORAR') {
      return { row, status: 'IGNORAR', reason: 'Paciente correspondente foi excluído/rejeitado pela clínica — prontuário não é importado.' };
    }

    if (row.dataAbertura.reviewRequired || row.dataRealizacao.reviewRequired) {
      return { row, status: 'REVISAR', reason: 'Data implausível em data_abertura ou data_realizacao — requer correção humana antes de importar.' };
    }

    if (row.statusLegado === 'Finalizado') {
      if (!row.dataRealizacao.value && !row.dataAbertura.value) {
        return { row, status: 'REVISAR', reason: 'Status "Finalizado" sem nenhuma data utilizável.' };
      }
      return { row, status: 'NOVO', reason: 'Procedimento finalizado, pronto para importação.', recordDate: row.dataRealizacao.value || row.dataAbertura.value || undefined };
    }

    if (row.statusLegado === 'Em Execução') {
      if (!row.dataAbertura.value) {
        return { row, status: 'REVISAR', reason: 'Status "Em Execução" sem data_abertura utilizável como referência.' };
      }
      return { row, status: 'NOVO', reason: 'Procedimento em andamento no sistema anterior — histórico legado (nunca rascunho operacional).', recordDate: row.dataAbertura.value };
    }

    return { row, status: 'REVISAR', reason: `Status legado desconhecido: "${row.statusLegado}".` };
  });
}

// ----------------------------------------------------------------------
// Resolução prontuário -> patient_id pelo mapa legado definitivo (gate da
// futura importação clínica). Não cria nada.
// ----------------------------------------------------------------------

export type RecordPatientResolution =
  | 'RESOLVED'
  | 'PENDING_PATIENT_IMPORT'
  | 'BLOCKED_BY_PATIENT_REVIEW'
  | 'ORPHAN'
  | 'DIVERGENCE'
  | 'PATIENT_DELETED';

// Motivo de revisão do PRÓPRIO prontuário (independe da identidade do paciente): fica de fora
// até correção manual e NUNCA bloqueia os demais registros.
export type RecordReviewCode = 'REVIEW_INVALID_RECORD_DATE' | 'REVIEW_INVALID_RECORD_STATUS';

export interface RecordResolutionResult {
  record: NormalizedLegacyRecord;
  resolution: RecordPatientResolution;
  patientId?: string;
  recordNeedsReview: boolean;
  recordReviewCode?: RecordReviewCode;
  reason: string;
}

export function resolveRecordsToPatients(
  records: NormalizedLegacyRecord[],
  clientMatchByLegacyId: Map<string, ClientMatchResult>,
  mapByPrimary: Map<string, string>, // Clientes.identificador -> patient_id
  mapBySecondary: Map<string, string> // Clientes.id_cliente -> patient_id
): RecordResolutionResult[] {
  return records.map((record) => {
    const recordNeedsReview =
      record.dataAbertura.reviewRequired ||
      record.dataRealizacao.reviewRequired ||
      (record.statusLegado !== 'Finalizado' && record.statusLegado !== 'Em Execução') ||
      (record.statusLegado === 'Em Execução' && !record.dataAbertura.value) ||
      (record.statusLegado === 'Finalizado' && !record.dataRealizacao.value && !record.dataAbertura.value);
    const recordReviewCode: RecordReviewCode | undefined =
      record.dataAbertura.reviewRequired || record.dataRealizacao.reviewRequired
        ? 'REVIEW_INVALID_RECORD_DATE'
        : recordNeedsReview
        ? 'REVIEW_INVALID_RECORD_STATUS'
        : undefined;
    const client = clientMatchByLegacyId.get(record.patientLegacyId);
    if (!client) {
      return { record, resolution: 'ORPHAN', recordNeedsReview, recordReviewCode, reason: 'identificador_cliente sem cliente correspondente no arquivo.' };
    }
    if (client.row.legacyClientId !== record.patientLegacyClientId) {
      return { record, resolution: 'DIVERGENCE', recordNeedsReview, recordReviewCode, reason: 'identificador_cliente e id_cliente apontam para clientes diferentes.' };
    }
    const byPrimary = mapByPrimary.get(record.patientLegacyId);
    const bySecondary = mapBySecondary.get(record.patientLegacyClientId);
    if (byPrimary || bySecondary) {
      if (byPrimary && bySecondary && byPrimary === bySecondary) {
        return { record, resolution: 'RESOLVED', patientId: byPrimary, recordNeedsReview, recordReviewCode, reason: 'Resolvido pelas duas chaves legadas.' };
      }
      return { record, resolution: 'DIVERGENCE', recordNeedsReview, recordReviewCode, reason: 'Mapa legado inconsistente entre identificador e id_cliente.' };
    }
    if (client.status === 'IGNORAR') {
      return { record, resolution: 'PATIENT_DELETED', recordNeedsReview, recordReviewCode, reason: 'Cadastro legado excluído/rejeitado pela clínica — sem paciente para receber o prontuário.' };
    }
    if (client.status === 'NOVO' || client.status === 'VINCULAR' || client.status === 'PROVISORIO') {
      return { record, resolution: 'PENDING_PATIENT_IMPORT', recordNeedsReview, recordReviewCode, reason: 'Paciente ainda não importado/vinculado.' };
    }
    return {
      record,
      resolution: 'BLOCKED_BY_PATIENT_REVIEW',
      recordNeedsReview,
      recordReviewCode,
      reason: `Paciente em ${client.status} (${client.reviewCategory || 'revisão'}) — não importado.`,
    };
  });
}
