// Telefone EFETIVO de um paciente — ponto único de leitura para não divergir
// no futuro (Fase 15 do hardening). Regra:
//   PATIENT     -> patient.phone
//   RESPONSIBLE -> telefone do responsável PRIMÁRIO
//
// Na prática, df_patients.phone e df_patient_guardians.phone são mantidos em
// sincronia pelo banco (triggers fn_sync_guardian_phone_to_patients e
// fn_sync_patient_link_phone, ver migration 20260922200000), então
// patient.phone já É o telefone efetivo em qualquer leitura pós-commit — os
// dois gatilhos garantem que nunca fica desatualizado. Esta função existe
// para (a) documentar o contrato explicitamente, (b) resolver o telefone
// ANTES de um guardian ter sido persistido ainda (ex.: dentro do próprio
// formulário de cadastro, ou no futuro importador da Odonto Minas montando o
// payload em memória antes de gravar), quando `guardianPhone` precisa ser
// passado explicitamente em vez de confiado ao cache já sincronizado.

export interface EffectivePhoneInput {
  phone?: string;
  phoneOwner?: 'PATIENT' | 'RESPONSIBLE';
}

export function getEffectivePatientPhone(
  patient: EffectivePhoneInput,
  primaryGuardianPhone?: string
): string {
  if (patient.phoneOwner === 'RESPONSIBLE') {
    return primaryGuardianPhone !== undefined ? primaryGuardianPhone || '' : patient.phone || '';
  }
  return patient.phone || '';
}
