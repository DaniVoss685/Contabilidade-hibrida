// Lógica pura de exibição/filtro/busca do modelo de responsável (guardian)
// na tela de Pacientes — extraída de PatientsView.tsx / PatientModal.tsx
// para ser testável sem precisar renderizar React (este projeto não tem
// testing-library/jest, ver CLAUDE.md "Testing").

import { Patient } from '../types';
import { normalizeSearchText, matchDocumentSearch } from './masks';

export interface GuardianSummaries {
  byPatientId: Record<string, { guardianId: string; guardianName: string; guardianPhone?: string; guardianEmail?: string; relationshipType?: string }>;
  guardianOfPatientId: Record<string, { dependents: Array<{ patientId: string; relationshipType?: string }> }>;
}

export type GuardianFilter = 'ALL' | 'WITH_GUARDIAN' | 'WITHOUT_GUARDIAN' | 'IS_GUARDIAN';

// Fase 1: rótulo dinâmico do campo de telefone no formulário de paciente.
export function getPhoneFieldLabel(phoneOwner: 'PATIENT' | 'RESPONSIBLE' | undefined): string {
  return phoneOwner === 'RESPONSIBLE' ? 'WhatsApp / Telefone do responsável' : 'WhatsApp / Telefone do paciente';
}

// Fase 8: COM RESPONSÁVEL = possui guardian primário. SEM RESPONSÁVEL =
// não possui. RESPONSÁVEL (IS_GUARDIAN) = é guardian de pelo menos outro
// paciente (vínculo explícito por CPF) — semanticamente independente do
// filtro anterior; uma pessoa pode estar nos dois grupos ao mesmo tempo.
export function filterPatientsByGuardian(
  patients: Patient[],
  summaries: GuardianSummaries,
  filter: GuardianFilter
): Patient[] {
  if (filter === 'WITH_GUARDIAN') return patients.filter((p) => Boolean(summaries.byPatientId[p.id]));
  if (filter === 'WITHOUT_GUARDIAN') return patients.filter((p) => !summaries.byPatientId[p.id]);
  if (filter === 'IS_GUARDIAN') return patients.filter((p) => Boolean(summaries.guardianOfPatientId[p.id]));
  return patients;
}

// Fase 14: busca por nome/CPF/telefone do paciente OU nome do responsável.
export function searchPatientsWithGuardian(
  patients: Patient[],
  summaries: GuardianSummaries,
  term: string
): Patient[] {
  const trimmed = term.trim();
  if (!trimmed) return patients;
  const normQuery = normalizeSearchText(trimmed);
  const searchDigits = trimmed.replace(/\D/g, '');

  return patients.filter((p) => {
    const nameMatch = normalizeSearchText(p.name).includes(normQuery);
    const cpfMatch = matchDocumentSearch(p.cpf, trimmed);
    const phoneDigits = (p.phone || '').replace(/\D/g, '');
    const phoneMatch = searchDigits.length >= 3 && phoneDigits.includes(searchDigits);
    const guardianName = summaries.byPatientId[p.id]?.guardianName || '';
    const guardianMatch = Boolean(guardianName) && normalizeSearchText(guardianName).includes(normQuery);
    return nameMatch || cpfMatch || phoneMatch || guardianMatch;
  });
}
