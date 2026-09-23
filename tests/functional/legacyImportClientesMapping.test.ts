// Testa normalização/validação de linhas de Clientes.xls (nome, CPF, telefone,
// data, mapeamento de campos legados) em legacyImportMatching.ts.
// Rodar com: npx tsx tests/functional/legacyImportClientesMapping.test.ts

import {
  normalizeName,
  classifyCpf,
  normalizePatientPhone,
  parseLegacyDateTime,
  buildNormalizedClient,
} from '../../src/lib/legacyImportMatching';
import { LegacyCellValue } from '../../src/lib/legacyImportParsers';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  // NOME-01/02: trim + colapso de espaços duplos, sem alterar acentos/caixa
  assert(normalizeName('  ALAN  SEBASTIAO   DE OLIVEIRA ') === 'ALAN SEBASTIAO DE OLIVEIRA', 'NOME-01: trim + espaços duplos colapsados');
  assert(normalizeName('José da Conceição') === 'José da Conceição', 'NOME-02: acentuação e caixa preservadas');

  // CPF-01: CPF válido reconhecido
  assert(classifyCpf('134.421.376-58').classification === 'INVALID' || classifyCpf('134.421.376-58').classification === 'VALID', 'CPF-01: classificação executa sem lançar exceção');
  {
    // CPF real válido conhecido (dígitos verificadores corretos): 111.444.777-35
    const r = classifyCpf('111.444.777-35');
    assert(r.classification === 'VALID', 'CPF-01b: CPF com dígitos verificadores corretos é classificado como VALID');
    assert(r.cleaned === '11144477735', 'CPF-01c: CPF limpo mantém somente dígitos');
  }

  // CPF-02: CPF inválido (dígito verificador errado, não é placeholder)
  {
    const r = classifyCpf('111.444.777-36');
    assert(r.classification === 'INVALID', 'CPF-02: CPF com dígito verificador incorreto é classificado como INVALID');
  }

  // CPF-03: CPF placeholder (sequência repetida) reconhecido distintamente de INVALID genérico
  {
    const r = classifyCpf('999.999.999-99');
    assert(r.classification === 'PLACEHOLDER', 'CPF-03: CPF de sequência repetida (placeholder do sistema legado) classificado como PLACEHOLDER, não INVALID');
  }

  // CPF-04: CPF ausente/vazio
  {
    const r = classifyCpf('');
    assert(r.classification === 'BLANK', 'CPF-04: CPF vazio classificado como BLANK');
  }

  // TEL-01: telefone normalizado para o padrão de armazenamento do Dental (sem DDI 55)
  {
    const phone = normalizePatientPhone('(34)99874-3774');
    assert(phone === '34998743774', `TEL-01: telefone normalizado sem DDI 55, obtido "${phone}"`);
  }

  // TEL-03: celular com 8 dígitos locais (sem o 9º dígito) recebe o reparo do padrão Dental
  {
    const phone = normalizePatientPhone('(34) 8874-3774');
    assert(phone === '34988743774', `TEL-03: celular de 8 dígitos ganha o 9º dígito, obtido "${phone}"`);
  }

  // TEL-02: telefone fixo de 8 dígitos locais não ganha 9º dígito indevidamente
  {
    const phone = normalizePatientPhone('(34)3212-3456');
    assert(phone.length === 10, 'TEL-02: telefone fixo de 8 dígitos locais mantém 10 dígitos totais (DDD+8)');
  }

  // DATA-01: data "DD/MM/AAAA HH:mm:ss" convertida para YYYY-MM-DD
  {
    const parsed = parseLegacyDateTime('09/04/1949 00:00:00');
    assert(parsed.value === '1949-04-09', `DATA-01: data legada convertida corretamente, obtido "${parsed.value}"`);
    assert(parsed.reviewRequired === false, 'DATA-01b: data plausível não marcada para revisão');
  }

  // DATA-02: data com ano implausível (ex.: 4021, o mesmo defeito do arquivo real) exige revisão, sem correção silenciosa
  {
    const parsed = parseLegacyDateTime('12/05/4021 15:17:00');
    assert(parsed.value === null, 'DATA-02a: data implausível NÃO é corrigida/convertida silenciosamente');
    assert(parsed.reviewRequired === true, 'DATA-02b: data implausível marcada como reviewRequired');
    assert(parsed.raw === '12/05/4021 15:17:00', 'DATA-02c: valor bruto original preservado para auditoria');
  }

  // DATA-03: célula vazia não é tratada como erro
  {
    const parsed = parseLegacyDateTime('');
    assert(parsed.value === null && parsed.reviewRequired === false, 'DATA-03: célula de data vazia não força revisão');
  }

  // MAP-01: buildNormalizedClient mapeia campos diretos e campos legados corretamente
  {
    const row: Record<string, LegacyCellValue> = {
      identificador: 'fc51085c-c880-434c-b918-41d362eb46b2',
      id_cliente: '925',
      nome_completo: '  ALAN SEBASTIAO DE OLIVEIRA',
      cpf: '',
      rg: '',
      data_nascimento: '09/04/1949 00:00:00',
      sexo: 'MASCULINO',
      profissao: '',
      telefone1: '',
      telefone2: '',
      telefone3: '',
      email: '',
      nome_cidade: '',
      uf: '',
      observacao_prontuario: '',
      observacao: '',
      nome_responsavel: '',
    };
    const client = buildNormalizedClient(row, 'legacy_test');
    assert(client.legacyId === 'fc51085c-c880-434c-b918-41d362eb46b2', 'MAP-01a: identificador mapeado como legacyId (nunca vira patient.id)');
    assert(client.legacyClientId === '925', 'MAP-01b: id_cliente mapeado como legacyClientId');
    assert(client.name === 'ALAN SEBASTIAO DE OLIVEIRA', 'MAP-01c: nome_completo normalizado (trim aplicado)');
    assert(client.birthDate.value === '1949-04-09', 'MAP-01d: data_nascimento convertida corretamente');
    assert(client.legacyMetadata.sexo === 'MASCULINO', 'MAP-01e: sexo preservado em legacy_metadata (campo classe C)');
    assert(client.legacyMetadata.responsavel === undefined, 'MAP-01f: sem nome_responsavel, bloco de responsável ausente');
  }

  // MAP-02: dados de responsável (paciente menor) preservados em metadata estruturada, sem descarte
  {
    const row: Record<string, LegacyCellValue> = {
      identificador: '3dcda396-2af9-4c58-ba6b-739e0f8527b6',
      id_cliente: '2135',
      nome_completo: 'Guilherme Duarte Freitas',
      cpf: '999.999.999-99',
      rg: '99999999999',
      data_nascimento: '15/10/2021 00:00:00',
      nome_responsavel: 'ZAINE CAMILA RIBEIRO DUARTE',
      nascimento_responsavel: '12/03/1998 00:00:00',
      cpf_responsavel: '143.421.376-58',
      telefone1_responsavel: '(34)99874-3774',
      grau_parentesco: '',
    };
    const client = buildNormalizedClient(row, 'legacy_test');
    assert(client.cpf.classification === 'PLACEHOLDER', 'MAP-02a: CPF placeholder do arquivo real reconhecido corretamente');
    assert(client.legacyMetadata.rawCpfOriginal === '999.999.999-99', 'MAP-02b: CPF original preservado em metadata quando não é VALID');
    assert(client.legacyMetadata.responsavel?.nome === 'ZAINE CAMILA RIBEIRO DUARTE', 'MAP-02c: nome do responsável preservado');
    assert(client.legacyMetadata.responsavel?.cpf === '143.421.376-58', 'MAP-02d: CPF do responsável preservado');
    assert(client.legacyMetadata.responsavel?.telefone === '34998743774', 'MAP-02e: telefone do responsável normalizado');
  }

  console.log('\n🎉 legacyImportClientesMapping: todos os critérios passaram.');
}

runTests();
