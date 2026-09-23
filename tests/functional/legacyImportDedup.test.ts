// Testa a ordem de matching/deduplicação de pacientes (Fase 6 do pedido):
// 1. legacy_id já mapeado; 2. CPF válido único; 3. nome+nascimento+telefone;
// 4. revisão humana. Nunca mescla automaticamente por nome/telefone/email
// isolados. CPF válido duplicado (2 pares reais no arquivo) vira CONFLITO.
// Rodar com: npx tsx tests/functional/legacyImportDedup.test.ts

import { Patient } from '../../src/types';
import { buildNormalizedClient, classifyPatientRows, NormalizedLegacyClient } from '../../src/lib/legacyImportMatching';
import { LegacyCellValue } from '../../src/lib/legacyImportParsers';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function client(overrides: Partial<Record<string, LegacyCellValue>>): NormalizedLegacyClient {
  return buildNormalizedClient(
    {
      identificador: `uuid-${Math.random().toString(36).slice(2, 8)}`,
      id_cliente: '1',
      nome_completo: 'Paciente Teste',
      cpf: '',
      data_nascimento: '',
      telefone1: '',
      ...overrides,
    },
    'legacy_test'
  );
}

function fakePatient(overrides: Partial<Patient>): Patient {
  return {
    id: `pat_${Math.random().toString(36).slice(2, 8)}`,
    orgId: 'org_1',
    name: 'Paciente Existente',
    cpf: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function runTests() {
  // DEDUP-01: paciente novo, sem correspondência -> NOVO
  {
    const c = client({ identificador: 'legacy-1', cpf: '111.444.777-35' });
    const [result] = classifyPatientRows([c], [], new Map());
    assert(result.status === 'NOVO', 'DEDUP-01: sem correspondência -> NOVO');
  }

  // DEDUP-02: legacy_id já existente em df_legacy_import_map -> VINCULAR direto, sem reavaliar CPF/nome
  {
    const c = client({ identificador: 'legacy-2', cpf: '' });
    const legacyMap = new Map([['legacy-2', 'pat_existing_123']]);
    const [result] = classifyPatientRows([c], [], legacyMap);
    assert(result.status === 'VINCULAR' && result.matchedPatientId === 'pat_existing_123', 'DEDUP-02: vínculo de importação legado tem prioridade máxima');
  }

  // DEDUP-03: CPF válido e único corresponde a paciente existente -> VINCULAR
  {
    const c = client({ identificador: 'legacy-3', cpf: '111.444.777-35' });
    const existing = [fakePatient({ cpf: '11144477735' })];
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status === 'VINCULAR' && result.matchedPatientId === existing[0].id, 'DEDUP-03: CPF válido único vincula ao paciente existente correto');
  }

  // DEDUP-04: CPF válido duplicado no PRÓPRIO arquivo de origem (2 pares reais no arquivo real) -> CONFLITO, nunca mesclado automaticamente
  {
    const cpf = '111.444.777-35';
    const a = client({ identificador: 'legacy-4a', nome_completo: 'Fulano A', cpf });
    const b = client({ identificador: 'legacy-4b', nome_completo: 'Fulano B', cpf });
    const results = classifyPatientRows([a, b], [], new Map());
    assert(results[0].status === 'CONFLITO' && results[1].status === 'CONFLITO', 'DEDUP-04: CPF válido duplicado no arquivo de origem marca AMBAS as linhas como CONFLITO');
  }

  // DEDUP-05: CPF válido corresponde a MAIS DE UM paciente já cadastrado -> CONFLITO
  {
    const cpf = '111.444.777-35';
    const c = client({ identificador: 'legacy-5', cpf });
    const existing = [fakePatient({ cpf: '11144477735' }), fakePatient({ cpf: '11144477735' })];
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status === 'CONFLITO', 'DEDUP-05: CPF correspondendo a múltiplos pacientes existentes vira CONFLITO, não merge automático');
  }

  // DEDUP-06: combinação forte nome+nascimento+telefone vincula quando CPF não é confiável
  {
    const c = client({
      identificador: 'legacy-6',
      cpf: '999.999.999-99', // placeholder
      nome_completo: 'Maria Aparecida Souza',
      data_nascimento: '10/05/1980 00:00:00',
      telefone1: '(34) 99874-3774',
    });
    const existing = [fakePatient({ name: 'MARIA APARECIDA SOUZA', birthDate: '1980-05-10', phone: '34998743774' })];
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status === 'VINCULAR', 'DEDUP-06: nome + nascimento + telefone (combinação forte) vincula mesmo com CPF placeholder');
  }

  // DEDUP-07: NUNCA mescla automaticamente só por nome igual (sem nascimento/telefone batendo)
  {
    const c = client({ identificador: 'legacy-7', nome_completo: 'João Pedro Lima', cpf: '' });
    const existing = [fakePatient({ name: 'JOÃO PEDRO LIMA', birthDate: '1970-01-01', phone: '34988887777' })];
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status !== 'VINCULAR', 'DEDUP-07a: nome sozinho (sem nascimento/telefone do lado do arquivo) NUNCA vincula automaticamente');
    assert(result.status === 'NOVO' || result.status === 'REVISAR', 'DEDUP-07b: cai em NOVO ou REVISAR, nunca em VINCULAR/merge automático');
  }

  // DEDUP-08: NUNCA mescla automaticamente só por telefone igual (sem CPF nem nascimento)
  {
    const c = client({ identificador: 'legacy-8', nome_completo: 'Pessoa Distinta', cpf: '', telefone1: '(34) 99874-3774' });
    const existing = [fakePatient({ name: 'OUTRA PESSOA TOTALMENTE DIFERENTE', phone: '34998743774' })];
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status !== 'VINCULAR', 'DEDUP-08: telefone compartilhado sozinho (nomes diferentes) nunca vincula automaticamente');
  }

  // DEDUP-09: CPF genuinamente inválido (não placeholder) sem correspondência forte -> REVISAR
  {
    const c = client({ identificador: 'legacy-9', cpf: '111.444.777-36', nome_completo: 'Sem Match Nenhum' });
    const [result] = classifyPatientRows([c], [], new Map());
    assert(result.status === 'REVISAR', 'DEDUP-09: CPF inválido genuíno sem correspondência forte cai em REVISAR (revisão humana)');
  }

  // DEDUP-10: CPF ausente (BLANK, comum — 1.181 dos 3.715 pacientes reais) sem correspondência NÃO força revisão em massa
  {
    const c = client({ identificador: 'legacy-10', cpf: '', nome_completo: 'Paciente Sem CPF Cadastrado' });
    const [result] = classifyPatientRows([c], [], new Map());
    assert(result.status === 'NOVO', 'DEDUP-10: CPF ausente (não é erro, é comum no legado) não força REVISAR, vira NOVO diretamente');
  }

  // DEDUP-11: nome ausente/curto demais -> INVALIDO
  {
    const c = client({ identificador: 'legacy-11', nome_completo: '' });
    const [result] = classifyPatientRows([c], [], new Map());
    assert(result.status === 'INVALIDO', 'DEDUP-11: nome ausente marca a linha como INVALIDO');
  }

  console.log('\n🎉 legacyImportDedup: todos os critérios passaram.');
}

runTests();
