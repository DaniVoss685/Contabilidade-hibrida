// Lógica pura do tipo de documento do paciente (Pessoa Física/CPF vs. Pessoa
// Jurídica/CNPJ) — usada por PatientModal.tsx e testável sem renderizar
// React. Independente de Sale.taxOrigin (escolhido por venda, não derivado
// do cadastro do paciente).

export type PatientDocumentType = 'CPF' | 'CNPJ';

export function getNameFieldLabel(documentType: PatientDocumentType | undefined): string {
  return documentType === 'CNPJ' ? 'Razão Social / Nome da Empresa' : 'Nome Completo';
}

export function getDocumentFieldLabel(documentType: PatientDocumentType | undefined): string {
  return documentType === 'CNPJ' ? 'CNPJ' : 'CPF';
}

// Pessoa Jurídica não tem data de nascimento — nunca obrigatória, nunca
// gravada quando o cadastro é CNPJ.
export function isBirthDateRequired(documentType: PatientDocumentType | undefined): boolean {
  return documentType !== 'CNPJ';
}
