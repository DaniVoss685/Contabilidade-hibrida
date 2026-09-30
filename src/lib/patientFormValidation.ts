// Validação pura do formulário de paciente (PatientModal).
//
// Extraída do componente para poder ser testada sem DOM e para garantir uma única
// fonte das mensagens. A obrigatoriedade de CPF/telefone/nascimento vem de
// patientRequiredFields.ts (paciente legado sem esses dados continua editável);
// o que o usuário DIGITAR passa sempre pela validação completa de formato.

import {
  isValidCpf,
  isValidCnpj,
  isValidPhone,
  isValidEmail,
  isValidCivilDate,
  isFutureCivilDate,
} from './masks';
import { isFieldRequired, PatientFieldContext } from './patientRequiredFields';

export interface PatientFormInput {
  name: string;
  cpf: string;
  phone: string;
  birthDate: string;
  email: string;
  guardianName: string;
}

export interface PatientFormOptions {
  /**
   * Devolve true quando OUTRO paciente da clínica já usa esse documento (só dígitos).
   * O chamador exclui o próprio paciente em edição.
   */
  isDocumentTaken?: (digits: string) => boolean;
}

export type PatientFormErrors = Record<string, string>;

export function validatePatientForm(
  input: PatientFormInput,
  ctx: PatientFieldContext,
  options: PatientFormOptions = {}
): PatientFormErrors {
  const errors: PatientFormErrors = {};
  const isCnpj = ctx.documentType === 'CNPJ';

  // 1. Nome
  if (!input.name.trim().replace(/\s+/g, ' ')) {
    errors.name = 'Informe o nome completo do paciente.';
  }

  // 2. CPF / CNPJ
  const cleanCpf = input.cpf.replace(/\D/g, '');
  if (!cleanCpf) {
    if (isFieldRequired('cpf', ctx)) {
      errors.cpf = isCnpj ? 'Informe o CNPJ da empresa.' : 'Informe o CPF do paciente.';
    }
  } else if (isCnpj ? cleanCpf.length !== 14 || !isValidCnpj(cleanCpf) : cleanCpf.length !== 11 || !isValidCpf(cleanCpf)) {
    errors.cpf = isCnpj ? 'Informe um CNPJ válido.' : 'Informe um CPF válido.';
  } else if (options.isDocumentTaken?.(cleanCpf)) {
    errors.cpf = isCnpj
      ? 'Já existe um cliente cadastrado com este CNPJ.'
      : 'Já existe um paciente cadastrado com este CPF.';
  }

  // 3. Telefone
  const cleanPhone = input.phone.replace(/\D/g, '');
  if (!cleanPhone) {
    if (isFieldRequired('phone', ctx)) errors.phone = 'Informe o WhatsApp ou telefone do paciente.';
  } else if (!isValidPhone(cleanPhone)) {
    // Preenchido mas inválido: o texto original vale para todos os casos.
    errors.phone = 'Informe o WhatsApp ou telefone do paciente.';
  }

  // 3b. Responsável (obrigatório apenas se o telefone for do responsável)
  if (ctx.phoneOwner === 'RESPONSIBLE' && !input.guardianName.trim()) {
    errors.guardianName = 'Informe o nome do responsável.';
  }

  // 4. Nascimento — só Pessoa Física; empresa nunca tem.
  if (!isCnpj) {
    const birth = input.birthDate.trim();
    if (!birth) {
      if (isFieldRequired('birthDate', ctx)) errors.birthDate = 'Informe a data de nascimento do paciente.';
    } else if (!isValidCivilDate(birth)) {
      errors.birthDate = 'Informe uma data de nascimento válida.';
    } else if (isFutureCivilDate(birth)) {
      errors.birthDate = 'A data de nascimento não pode ser futura.';
    }
  }

  // 5. E-mail (opcional, mas se preenchido deve ser válido)
  if (input.email.trim() && !isValidEmail(input.email)) {
    errors.email = 'E-mail em formato inválido.';
  }

  return errors;
}
