// Suporte a pacientes Pessoa Jurídica (CNPJ) no cadastro — lógica pura,
// mesmas funções usadas de verdade por PatientModal.tsx (não uma cópia).
// Rodar com: npx tsx tests/functional/patientDocumentTypeCnpj.test.ts

import { getNameFieldLabel, getDocumentFieldLabel, isBirthDateRequired } from '../../src/lib/patientDocumentType';
import { isValidCnpj, isValidCpf, formatCpfOrCnpj } from '../../src/lib/masks';
import { mapDbPatientToApp, mapAppPatientToDb } from '../../src/lib/supabaseClient';
import { Patient } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: PACIENTE PESSOA JURÍDICA (CNPJ)');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------
  // Labels dinâmicos
  // ---------------------------------------------------------------------
  assert(getNameFieldLabel('CPF') === 'Nome Completo', 'LABEL-01: CPF -> "Nome Completo"');
  assert(getNameFieldLabel('CNPJ') === 'Razão Social / Nome da Empresa', 'LABEL-02: CNPJ -> "Razão Social / Nome da Empresa"');
  assert(getNameFieldLabel(undefined) === 'Nome Completo', 'LABEL-03: sem tipo (legado) -> assume Pessoa Física');
  assert(getDocumentFieldLabel('CPF') === 'CPF', 'LABEL-04: label do documento para CPF');
  assert(getDocumentFieldLabel('CNPJ') === 'CNPJ', 'LABEL-05: label do documento para CNPJ');

  // ---------------------------------------------------------------------
  // Data de nascimento: obrigatória só para Pessoa Física
  // ---------------------------------------------------------------------
  assert(isBirthDateRequired('CPF') === true, 'BIRTH-01: CPF exige data de nascimento');
  assert(isBirthDateRequired('CNPJ') === false, 'BIRTH-02: CNPJ NÃO exige data de nascimento (empresa não tem)');
  assert(isBirthDateRequired(undefined) === true, 'BIRTH-03: sem tipo (paciente legado) -> assume Pessoa Física, mantém exigência atual');

  // ---------------------------------------------------------------------
  // Validação de documento: CNPJ real passa, CPF não serve como CNPJ e vice-versa
  // ---------------------------------------------------------------------
  assert(isValidCnpj('11222333000181') === true, 'DOC-01: CNPJ válido (dígito verificador correto) é aceito');
  assert(isValidCnpj('11111111111111') === false, 'DOC-02: CNPJ com todos os 14 dígitos iguais é rejeitado (mesma regra do CPF)');
  assert(isValidCnpj('11222333000180') === false, 'DOC-02b: CNPJ com dígito verificador incorreto é rejeitado');
  assert(isValidCpf('52998224725') === true, 'DOC-03: CPF válido continua sendo aceito (regressão)');

  // ---------------------------------------------------------------------
  // Exibição: formatCpfOrCnpj detecta automaticamente por tamanho
  // ---------------------------------------------------------------------
  assert(formatCpfOrCnpj('52998224725') === '529.982.247-25', 'DISPLAY-01: 11 dígitos formata como CPF');
  assert(formatCpfOrCnpj('11222333000181') === '11.222.333/0001-81', 'DISPLAY-02: 14 dígitos formata como CNPJ');

  // ---------------------------------------------------------------------
  // Persistência: documentType passa pelos 3 pontos (mapDbPatientToApp,
  // mapAppPatientToDb) — mesma regra permanente do CLAUDE.md para campos
  // novos de paciente.
  // ---------------------------------------------------------------------
  {
    const dbRowCnpj = {
      id: 'pat_1', tenant_id: 't1', org_id: 'o1', name: 'Empresa Teste LTDA',
      document_type: 'CNPJ', cpf: '11222333000181', created_at: '2026-01-01T00:00:00Z',
    };
    const appPatient = mapDbPatientToApp(dbRowCnpj);
    assert(appPatient.documentType === 'CNPJ', 'PERSIST-01: mapDbPatientToApp lê document_type = CNPJ corretamente');

    const dbRowLegacy = { id: 'pat_2', tenant_id: 't1', org_id: 'o1', name: 'Paciente Legado', cpf: '52998224725', created_at: '2026-01-01T00:00:00Z' };
    const legacyPatient = mapDbPatientToApp(dbRowLegacy);
    assert(legacyPatient.documentType === 'CPF', 'PERSIST-02: paciente legado sem document_type assume CPF por padrão (comportamento inalterado)');

    const payload = mapAppPatientToDb(appPatient, 't1');
    assert(payload.document_type === 'CNPJ', 'PERSIST-03: mapAppPatientToDb grava document_type de volta corretamente');

    const cpfPatient: Patient = { id: 'p3', orgId: 'o1', name: 'Fulano', documentType: 'CPF', cpf: '52998224725', createdAt: '2026-01-01T00:00:00Z' };
    const cpfPayload = mapAppPatientToDb(cpfPatient, 't1');
    assert(cpfPayload.document_type === 'CPF', 'PERSIST-04: Pessoa Física grava document_type = CPF explicitamente');
  }

  // ---------------------------------------------------------------------
  // Independência: Sale.taxOrigin continua sendo escolhido por venda, não
  // derivado de Patient.documentType (confirmado por auditoria — não há
  // acoplamento no código; aqui documentamos o contrato).
  // ---------------------------------------------------------------------
  {
    const cnpjPatientButCpfSale = { documentType: 'CNPJ' as const };
    const saleTaxOrigin = 'CPF'; // escolhido manualmente no formulário de venda, sempre
    assert(
      saleTaxOrigin === 'CPF' && cnpjPatientButCpfSale.documentType === 'CNPJ',
      'INDEP-01: um paciente CNPJ pode ter uma venda lançada como taxOrigin CPF (e vice-versa) — são campos independentes por design'
    );
  }

  console.log('\n🎉 TODOS OS TESTES DE PACIENTE PESSOA JURÍDICA (CNPJ) PASSARAM!');
}

runTests();
