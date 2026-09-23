import { WhatsAppContact, WhatsAppContactRelations } from '../types/whatsapp';
import { getContactDisplayName, isWhatsAppGroup } from './phoneUtils';

/**
 * Filtra a lista de contatos (aba WhatsApp → Contatos) por nome/telefone/responsável/
 * pacientes relacionados (A32). Contrato deliberado: NUNCA recebe/considera status de
 * conversa, fila ou atendimento — df_wa_contacts (e portanto esta lista) é persistente
 * e independente do episódio operacional (ver CLAUDE.md, "Guardian / responsável e
 * telefone compartilhado" e regra A1/A27-A30). Sem termo de busca, retorna a lista
 * completa sem excluir nenhum contato. `relations` é opcional para não quebrar quem
 * ainda não carregou o enriquecimento (getContactRelations) — nesse caso busca apenas
 * por nome/telefone do próprio contato, como já funcionava.
 */
export function filterContacts(
  contacts: WhatsAppContact[],
  search: string,
  relations?: Record<string, WhatsAppContactRelations>
): WhatsAppContact[] {
  const term = search.trim().toLowerCase();
  if (!term) return contacts;

  return contacts.filter((ctc) => {
    const displayName = getContactDisplayName(ctc).toLowerCase();
    if (displayName.includes(term) || ctc.whatsapp_number.includes(term)) return true;

    const rel = relations?.[ctc.id];
    if (!rel) return false;

    if (rel.guardianName && rel.guardianName.toLowerCase().includes(term)) return true;
    if (rel.patientNames.some((name) => name.toLowerCase().includes(term))) return true;

    return false;
  });
}

/**
 * Nome de exibição do contato na aba Contatos, respeitando a precedência A31:
 * quando o número é de um responsável (guardian), mostra o NOME DO RESPONSÁVEL,
 * nunca o nome do primeiro paciente vinculado ao contato. `getContactDisplayName`
 * (phoneUtils) prioriza `contact.patient.name` — correto para o caso comum de
 * telefone próprio, mas produz um resultado enganoso quando o número é
 * compartilhado: ex. contato do telefone da mãe (Marilda), vinculado como
 * paciente primário a um dos filhos (Sebastião) por ordem de cadastro, exibia
 * "Sebastião" com a tag "Responsável por 2 pacientes" — parecendo que o próprio
 * Sebastião era responsável por si mesmo e pelo irmão, quando na verdade é
 * Marilda quem responde por aquele número. Bug real relatado e corrigido nesta
 * sessão (tenant clinic_1789650130_ec5b, contato "Sebastião"/telefone da Marilda).
 */
export function getContactDisplayNameForList(
  contact: Parameters<typeof getContactDisplayName>[0],
  relation: WhatsAppContactRelations | undefined
): string {
  if (relation?.isGuardianPhone && relation.guardianName) {
    return relation.guardianName;
  }
  return getContactDisplayName(contact);
}

/**
 * Anexa `guardianDisplayName` (ContactNameResolvable, phoneUtils.ts) a um contato,
 * a partir do enriquecimento em lote (getContactRelations). Com isso,
 * getContactDisplayName — usado em TODO lugar que mostra o nome de um contato
 * (header do chat, drawer, sidebar de conversas, Kanban, reply-to) — já resolve
 * o nome do responsável automaticamente, sem cada componente precisar receber
 * `relations` separadamente e reimplementar a precedência A31. Retorna um NOVO
 * objeto (nunca muta o original) só quando há mudança real, para não quebrar
 * referências/memoização React à toa.
 */
export function withGuardianDisplayName<T extends WhatsAppContact>(
  contact: T | null | undefined,
  relations: Record<string, WhatsAppContactRelations>
): T | null | undefined {
  if (!contact) return contact;
  const relation = relations[contact.id];
  const guardianDisplayName = relation?.isGuardianPhone ? relation.guardianName || null : null;
  if ((contact as any).guardianDisplayName === guardianDisplayName) return contact;
  return { ...contact, guardianDisplayName };
}

/**
 * Tags visuais da aba Contatos (A3-A6): reflete o modelo N:N (df_wa_contact_patients)
 * e o de responsável (df_patient_guardians) já homologados, sem reduzir de volta a 1:1.
 * Um contato pode combinar múltiplas tags (ex.: responsável que também é paciente da
 * clínica) — nunca esconde uma condição real em favor de outra.
 */
export interface ContactTag {
  label: string;
  variant: 'patient' | 'guardian' | 'group' | 'unregistered';
}

export function getContactTags(
  contact: Pick<WhatsAppContact, 'whatsapp_number' | 'patient_id' | 'patient'>,
  relation: WhatsAppContactRelations | undefined
): ContactTag[] {
  if (isWhatsAppGroup(contact.whatsapp_number)) {
    return [{ label: 'Grupo', variant: 'group' }];
  }

  const patientCount = relation?.patientCount ?? (contact.patient || contact.patient_id ? 1 : 0);
  const isGuardianPhone = relation?.isGuardianPhone ?? false;

  const tags: ContactTag[] = [];

  if (isGuardianPhone) {
    const dependentCount = relation?.guardianDependentCount ?? 0;
    tags.push({
      label: dependentCount > 1 ? `Responsável por ${dependentCount} pacientes` : 'Responsável',
      variant: 'guardian',
    });
  }

  // "Paciente" aparece quando o contato tem pelo menos 1 paciente vinculado E, se o
  // número é de um responsável, apenas quando esse responsável também é paciente
  // cadastrado (linked_patient_id) — evita mostrar "Paciente" genérico quando na
  // verdade só os DEPENDENTES são pacientes, não o dono do número.
  const showPatientTag = isGuardianPhone ? Boolean(relation?.guardianIsAlsoPatient) : patientCount > 0;
  if (showPatientTag) {
    tags.push({ label: 'Paciente', variant: 'patient' });
  }

  if (tags.length === 0) {
    tags.push({ label: 'Não cadastrado', variant: 'unregistered' });
  }

  return tags;
}
