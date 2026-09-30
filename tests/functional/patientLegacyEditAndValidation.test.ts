// Paciente migrado de sistema anterior sem CPF / telefone / nascimento precisa continuar
// EDITÁVEL (nome, responsável, alertas...) sem que o usuário tenha de digitar valor fictício,
// e o cadastro NOVO precisa continuar exigindo tudo como sempre exigiu.
// Rodar com: npx tsx tests/functional/patientLegacyEditAndValidation.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validatePatientForm, PatientFormInput } from '../../src/lib/patientFormValidation';
import {
  isFieldRequired,
  missingFieldHint,
  absentValueLabel,
  listMissingFields,
  describeMissingFields,
  PatientFieldContext,
} from '../../src/lib/patientRequiredFields';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

const VALID_CPF = '52998224725'; // CPF válido (dígitos verificadores corretos)
const VALID_PHONE = '(34) 99874-3774';

const baseInput = (over: Partial<PatientFormInput> = {}): PatientFormInput => ({
  name: 'Maria da Silva',
  cpf: VALID_CPF,
  phone: VALID_PHONE,
  birthDate: '1990-05-10',
  email: '',
  guardianName: '',
  ...over,
});

const createCtx: PatientFieldContext = {
  isEdit: false,
  isLegacyImport: false,
  documentType: 'CPF',
  phoneOwner: 'PATIENT',
  original: null,
};

const legacyEditCtx = (
  original: { cpf?: string; phone?: string; birthDate?: string },
  over: Partial<PatientFieldContext> = {}
): PatientFieldContext => ({
  isEdit: true,
  isLegacyImport: true,
  documentType: 'CPF',
  phoneOwner: 'PATIENT',
  original,
  ...over,
});

// ─── Cadastro NOVO: validação preservada ────────────────────────────────────────
{
  const errs = validatePatientForm(baseInput({ cpf: '', phone: '', birthDate: '' }), createCtx);
  assert(Boolean(errs.cpf) && Boolean(errs.phone) && Boolean(errs.birthDate), 'novo paciente: CPF, telefone e nascimento continuam OBRIGATÓRIOS');
  assert(errs.cpf === 'Informe o CPF do paciente.', 'novo paciente: mensagem de CPF obrigatório preservada');
  assert(errs.phone === 'Informe o WhatsApp ou telefone do paciente.', 'novo paciente: mensagem de telefone obrigatório preservada');
  assert(errs.birthDate === 'Informe a data de nascimento do paciente.', 'novo paciente: mensagem de nascimento obrigatório preservada');

  assert(Object.keys(validatePatientForm(baseInput(), createCtx)).length === 0, 'novo paciente completo e válido passa sem erros');
  assert(Boolean(validatePatientForm(baseInput({ name: '   ' }), createCtx).name), 'novo paciente: nome em branco é rejeitado');
  assert(Boolean(validatePatientForm(baseInput({ cpf: '11111111111' }), createCtx).cpf), 'novo paciente: CPF inválido (repetido) é rejeitado');
  assert(Boolean(validatePatientForm(baseInput({ phone: '123' }), createCtx).phone), 'novo paciente: telefone inválido é rejeitado');
  assert(Boolean(validatePatientForm(baseInput({ birthDate: '2999-01-01' }), createCtx).birthDate), 'novo paciente: nascimento futuro é rejeitado');
  assert(Boolean(validatePatientForm(baseInput({ email: 'sem-arroba' }), createCtx).email), 'e-mail preenchido e inválido é rejeitado');
  assert(
    validatePatientForm(baseInput(), createCtx, { isDocumentTaken: (d) => d === VALID_CPF }).cpf ===
      'Já existe um paciente cadastrado com este CPF.',
    'novo paciente: CPF já usado por outro paciente é rejeitado'
  );
  assert(
    validatePatientForm(baseInput({ cpf: '' }), createCtx, { isDocumentTaken: () => true }).cpf === 'Informe o CPF do paciente.',
    'CPF vazio nunca entra na checagem de duplicidade'
  );
}

// ─── Paciente comum (NÃO legado) em edição: continua exigindo tudo ──────────────
{
  const ctx: PatientFieldContext = { ...createCtx, isEdit: true, original: { cpf: '', phone: '', birthDate: '' } };
  const errs = validatePatientForm(baseInput({ cpf: '', phone: '', birthDate: '' }), ctx);
  assert(Boolean(errs.cpf && errs.phone && errs.birthDate), 'paciente NÃO legado sem dados continua exigindo CPF/telefone/nascimento ao editar');
}

// ─── Paciente legado SEM CPF/telefone/nascimento: editável ──────────────────────
{
  const ctx = legacyEditCtx({ cpf: '', phone: '', birthDate: '' });
  const errs = validatePatientForm(baseInput({ cpf: '', phone: '', birthDate: '', name: 'Maria da Silva Souza' }), ctx);
  assert(Object.keys(errs).length === 0, 'legado sem CPF/telefone/nascimento: editar o nome NÃO é bloqueado');
  assert(!isFieldRequired('cpf', ctx) && !isFieldRequired('phone', ctx) && !isFieldRequired('birthDate', ctx), 'legado: os 3 campos deixam de ser obrigatórios');
}

// ─── ...mas o que for DIGITADO passa pela validação completa ────────────────────
{
  const ctx = legacyEditCtx({ cpf: '', phone: '', birthDate: '' });
  assert(Boolean(validatePatientForm(baseInput({ cpf: '12345678900', phone: '', birthDate: '' }), ctx).cpf), 'legado: CPF digitado inválido é rejeitado');
  assert(Boolean(validatePatientForm(baseInput({ cpf: '', phone: '99', birthDate: '' }), ctx).phone), 'legado: telefone digitado inválido é rejeitado');
  assert(Boolean(validatePatientForm(baseInput({ cpf: '', phone: '', birthDate: '2999-01-01' }), ctx).birthDate), 'legado: nascimento digitado no futuro é rejeitado');
  assert(
    validatePatientForm(baseInput({ phone: '', birthDate: '' }), ctx, { isDocumentTaken: (d) => d === VALID_CPF }).cpf ===
      'Já existe um paciente cadastrado com este CPF.',
    'legado: preencher um CPF que já pertence a outro paciente é bloqueado (duplicidade real no preenchimento futuro)'
  );
  assert(
    Object.keys(validatePatientForm(baseInput({ birthDate: '' }), ctx)).length === 0,
    'legado: preencher CPF e telefone válidos e únicos passa'
  );
}

// ─── Só o que estava vazio na origem é dispensado ───────────────────────────────
{
  const ctx = legacyEditCtx({ cpf: VALID_CPF, phone: '', birthDate: '' });
  const errs = validatePatientForm(baseInput({ cpf: '', phone: '', birthDate: '' }), ctx);
  assert(Boolean(errs.cpf), 'legado que TINHA CPF: apagar o CPF continua sendo erro');
  assert(!errs.phone && !errs.birthDate, 'legado: telefone e nascimento vazios na origem continuam dispensados');
}

// ─── Telefone do RESPONSÁVEL nunca pode ficar vazio ─────────────────────────────
{
  const ctx = legacyEditCtx({ cpf: '', phone: '', birthDate: '' }, { phoneOwner: 'RESPONSIBLE' });
  const errs = validatePatientForm(baseInput({ cpf: '', phone: '', birthDate: '', guardianName: 'Ana' }), ctx);
  assert(Boolean(errs.phone), 'telefone do responsável vazio é rejeitado (apagaria o telefone dos irmãos por trigger)');
  assert(
    Boolean(validatePatientForm(baseInput({ cpf: '', phone: VALID_PHONE, birthDate: '', guardianName: '' }), ctx).guardianName),
    'telefone do responsável exige o nome do responsável'
  );
}

// ─── Pessoa Jurídica ────────────────────────────────────────────────────────────
{
  const cnpjCtx: PatientFieldContext = { ...createCtx, documentType: 'CNPJ' };
  const errs = validatePatientForm(baseInput({ cpf: '', birthDate: '' }), cnpjCtx);
  assert(errs.cpf === 'Informe o CNPJ da empresa.', 'novo CNPJ: documento obrigatório com mensagem própria');
  assert(!errs.birthDate, 'CNPJ nunca exige nascimento');
  assert(Object.keys(validatePatientForm(baseInput({ cpf: '11222333000181', birthDate: '' }), cnpjCtx)).length === 0, 'CNPJ válido passa');
}

// ─── Textos discretos (nunca "erro") ────────────────────────────────────────────
{
  const ctx = legacyEditCtx({ cpf: '', phone: '', birthDate: '' });
  const hint = missingFieldHint('cpf', ctx, '');
  assert(hint === 'Não informado no sistema anterior — pode ser completado depois.', 'dica discreta para CPF ausente no legado');
  assert(missingFieldHint('cpf', ctx, '529.982.247-25') === null, 'dica some quando o usuário já preencheu');
  assert(missingFieldHint('cpf', createCtx, '') === null, 'cadastro novo não mostra dica de sistema anterior');
  assert(missingFieldHint('cpf', { ...ctx, isLegacyImport: false }, '') === null, 'paciente comum não mostra dica de sistema anterior');
  assert(missingFieldHint('birthDate', { ...ctx, documentType: 'CNPJ' }, '') === null, 'CNPJ não mostra dica de nascimento');
  assert(absentValueLabel('birthDate', false) === 'Nascimento não informado', 'rótulo de nascimento ausente (paciente comum)');
  assert(absentValueLabel('phone', true) === 'Sem telefone válido (sistema anterior)', 'rótulo de telefone ausente (legado)');
  assert(absentValueLabel('cpf', false) === 'CPF não informado', 'rótulo de CPF ausente');
}

// ─── Selo "Cadastro incompleto" ─────────────────────────────────────────────────
{
  assert(listMissingFields({ cpf: '', phone: '', birthDate: '' }).join(',') === 'cpf,phone,birthDate', 'lista os 3 campos ausentes');
  assert(listMissingFields({ cpf: VALID_CPF, phone: '(34) 99874-3774', birthDate: '1990-01-01' }).length === 0, 'cadastro completo não tem campos ausentes');
  assert(listMissingFields({ documentType: 'CNPJ', cpf: '11222333000181', phone: '3433334444', birthDate: '' }).length === 0, 'CNPJ sem nascimento não é incompleto');
  assert(describeMissingFields(['cpf', 'phone', 'birthDate']) === 'Sem CPF, telefone e data de nascimento', 'texto do selo com 3 campos');
  assert(describeMissingFields(['phone']) === 'Sem telefone', 'texto do selo com 1 campo');
}

// ─── Nenhum valor fictício é fabricado ──────────────────────────────────────────
{
  // A validação só devolve erros/vazio; não existe caminho que preencha 000.../999.../data falsa.
  const src = readFileSync(fileURLToPath(new URL('../../src/lib/patientFormValidation.ts', import.meta.url)), 'utf8');
  assert(!/00000000000|99999999999|1900-01-01|0000-00-00/.test(src), 'validação não contém valores placeholder');
}

console.log(`\n${passed} verificações passaram.`);
