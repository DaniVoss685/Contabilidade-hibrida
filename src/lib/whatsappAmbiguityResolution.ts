// Regra pura de desambiguação de confirmação de consulta via WhatsApp quando
// um contato tem N pacientes vinculados (telefone compartilhado — mãe/pai +
// filhos no mesmo número). A MESMA regra está implementada inline em
// supabase/functions/dental-whatsapp-webhook/index.ts (Prioridade 2, "Sem
// reply, resposta afirmativa solta") — manter em sincronia com este arquivo
// ao alterar qualquer um dos dois (edge functions não importam src/lib).
//
// Contrato: uma resposta "Sim" solta (sem reply explícito) só pode confirmar
// automaticamente uma consulta quando existir EXATAMENTE UMA consulta
// pendente entre TODOS os pacientes vinculados ao contato que respondeu —
// nunca apenas entre as consultas de um único paciente, pois isso confirmaria
// a consulta errada quando dois pacientes do mesmo telefone têm consultas
// pendentes distintas.

export interface PendingAppointmentCandidate {
  id: string;
  patientId: string;
}

export type AmbiguityResolution =
  | { outcome: 'UNIQUE'; appointment: PendingAppointmentCandidate }
  | { outcome: 'NONE' }
  | { outcome: 'AMBIGUOUS'; candidates: PendingAppointmentCandidate[] };

export function resolveUniquePendingAppointment(
  pendingAcrossAllLinkedPatients: PendingAppointmentCandidate[]
): AmbiguityResolution {
  if (pendingAcrossAllLinkedPatients.length === 0) return { outcome: 'NONE' };
  if (pendingAcrossAllLinkedPatients.length === 1) {
    return { outcome: 'UNIQUE', appointment: pendingAcrossAllLinkedPatients[0] };
  }
  return { outcome: 'AMBIGUOUS', candidates: pendingAcrossAllLinkedPatients };
}
