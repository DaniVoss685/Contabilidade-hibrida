// Regras puras de agenda multi-profissional. USUÁRIO/LOGIN ≠ PROFISSIONAL CLÍNICO: duas dentistas
// podem compartilhar o mesmo login da clínica, cada uma com seu ClinicalProfessional próprio — a
// mesma sala/horário só é conflito quando é o MESMO profissional em ambos os agendamentos.
// Espelha a lógica de AppointmentModal.tsx (conflictAppointment) — mantido em sincronia manualmente.

export interface SchedulingIdentity {
  professionalId?: string | null;
  dentistName?: string | null;
}

export interface SchedulingCandidate extends SchedulingIdentity {
  id: string;
  date: string;
  status: string;
  startTime: string;
  endTime: string;
}

/**
 * Duas mensagens/agendamentos são do MESMO profissional quando:
 * - ambos têm professionalId e ele é igual (sinal forte, preferido); senão
 * - ambos têm dentistName (texto livre legado) e é igual; senão
 * - não há informação suficiente para diferenciar -> trata como mesmo profissional (comportamento
 *   conservador pré-existente: sem dado nenhum, mantém o bloqueio de conflito por segurança).
 */
export function isSameProfessional(a: SchedulingIdentity, b: SchedulingIdentity): boolean {
  if (a.professionalId && b.professionalId) return a.professionalId === b.professionalId;
  if (a.dentistName && b.dentistName) return a.dentistName === b.dentistName;
  return true;
}

function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface SchedulingCandidateInput extends SchedulingIdentity {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Mesmo profissional + mesmo horário -> bloqueado. Profissionais diferentes podem atender
 * simultaneamente (nunca bloqueado só por coincidir o horário quando são pessoas distintas).
 */
export function findSchedulingConflict<T extends SchedulingCandidate>(
  existing: T[],
  candidate: SchedulingCandidateInput
): T | null {
  const startMin = timeToMinutes(candidate.startTime);
  const endMin = timeToMinutes(candidate.endTime);
  for (const a of existing) {
    if (candidate.id && a.id === candidate.id) continue;
    if (a.date !== candidate.date) continue;
    if (a.status === 'CANCELADA') continue;
    if (!isSameProfessional(a, candidate)) continue;
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    if (startMin < aEnd && endMin > aStart) return a;
  }
  return null;
}

/**
 * Pré-seleção de profissional responsável (Agenda/Prontuário): só quando inequívoco — nunca o
 * usuário logado por padrão, nunca a identidade fiscal. Ordem: um preferido explícito ainda válido
 * (ex.: o profissional já gravado ao editar) > o profissional vinculado ao usuário atual (userId)
 * > o único ativo cadastrado. Com 2+ profissionais e nenhum critério acima, retorna '' (exige
 * escolha explícita do usuário — duas dentistas no mesmo login não têm como o sistema adivinhar).
 */
export function defaultProfessionalId(
  activeProfessionals: { id: string; userId?: string | null }[],
  currentUserId?: string | null,
  preferredId?: string | null
): string {
  if (preferredId && activeProfessionals.some((p) => p.id === preferredId)) return preferredId;
  const linkedToMe = currentUserId ? activeProfessionals.find((p) => p.userId === currentUserId) : undefined;
  if (linkedToMe) return linkedToMe.id;
  if (activeProfessionals.length === 1) return activeProfessionals[0].id;
  return '';
}

/**
 * Procedimento sem NENHUM vínculo em df_procedure_professionals = disponível a todos os
 * profissionais ativos. Com vínculos, só os listados (e ainda ativos) podem executá-lo.
 */
export function resolveEligibleProfessionals<T extends { id: string; isActive: boolean }>(
  allProfessionals: T[],
  linkedProfessionalIds: string[]
): T[] {
  const activeOnes = allProfessionals.filter((p) => p.isActive);
  if (linkedProfessionalIds.length === 0) return activeOnes;
  const allowed = new Set(linkedProfessionalIds);
  return activeOnes.filter((p) => allowed.has(p.id));
}
