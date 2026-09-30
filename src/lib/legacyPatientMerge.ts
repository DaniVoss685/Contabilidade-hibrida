// Consolidação de paciente duplicado (cadastro manual × cadastro importado do sistema anterior).
//
// Modelo PURO do que a consolidação faz e de como se prova que nada ficou apontando para o
// cadastro removido. A execução em produção é um bloco SQL atômico e escopado por tenant
// (ver docs da rodada); este módulo é o contrato que o teste automatizado exercita e a
// verificação usada para conferir o resultado antes de qualquer remoção.
//
// Regras:
//  - Só consolida a MESMA pessoa: CPF igual (quando ambos têm), nome normalizado igual e
//    nascimento igual (quando ambos têm). Nome/telefone/e-mail sozinhos NUNCA bastam.
//  - Canônico = quem tem referências de negócio (venda, agenda, prontuário, anexos...). Sem
//    referências em nenhum dos lados, o cadastro mais antigo.
//  - Nada de negócio (venda/agenda/prontuário) é movido: se o duplicado as tem, a consolidação
//    recusa (a decisão passa a ser humana). O duplicado só pode ter mapa legado, metadados
//    legados, vínculos de contato WhatsApp e de responsável.
//  - O registro só pode ser removido quando findDanglingReferences() devolve vazio.

export interface MergePatient {
  id: string;
  name: string;
  cpf?: string;
  birthDate?: string;
  createdAt?: string;
  legacyMetadata?: Record<string, unknown> | null;
}

export interface MergeMapRow {
  entityType: string;
  legacyId: string; // Clientes.identificador
  legacySecondaryId?: string; // Clientes.id_cliente
  targetId: string;
  matchKind?: string;
}

export interface MergeContactLink {
  contactId: string;
  patientId: string;
  isPrimary: boolean;
}

export interface MergeContact {
  id: string;
  /** df_wa_contacts.patient_id — referência primária/legada 1:1. */
  patientId: string | null;
}

export interface MergeGuardianLink {
  guardianId: string;
  patientId: string;
  isPrimary: boolean;
}

export interface MergeGuardian {
  id: string;
  linkedPatientId: string | null;
}

/** Referências de negócio por tabela (contagens por paciente). */
export type BusinessRefs = Record<string, number>;

export interface MergeSnapshot {
  patients: MergePatient[];
  mapRows: MergeMapRow[];
  contacts: MergeContact[];
  contactLinks: MergeContactLink[];
  guardianLinks: MergeGuardianLink[];
  guardians: MergeGuardian[];
  /** patientId -> { df_sales: n, df_appointments: n, df_clinical_records: n, ... } */
  businessRefs: Record<string, BusinessRefs>;
}

const normalizeName = (s: string | undefined): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const digits = (s: string | undefined): string => (s || '').replace(/\D/g, '');

const totalRefs = (r: BusinessRefs | undefined): number => Object.values(r || {}).reduce((a, b) => a + b, 0);

export interface CanonicalChoice {
  canonicalId: string;
  duplicateId: string;
  reason: string;
}

/** Escolhe o canônico pelos fatos (referências de negócio), nunca por preferência de origem. */
export function chooseCanonical(a: MergePatient, b: MergePatient, refs: Record<string, BusinessRefs>): CanonicalChoice {
  const ra = totalRefs(refs[a.id]);
  const rb = totalRefs(refs[b.id]);
  if (ra !== rb) {
    const [win, lose, wr] = ra > rb ? [a, b, ra] : [b, a, rb];
    return {
      canonicalId: win.id,
      duplicateId: lose.id,
      reason: `${win.id} tem ${wr} referência(s) de negócio; ${lose.id} tem ${Math.min(ra, rb)}.`,
    };
  }
  const older = (a.createdAt || '') <= (b.createdAt || '') ? a : b;
  const newer = older === a ? b : a;
  return {
    canonicalId: older.id,
    duplicateId: newer.id,
    reason: 'Sem referências de negócio em nenhum dos lados; mantido o cadastro mais antigo.',
  };
}

export interface MergePlan {
  ok: boolean;
  errors: string[];
  canonicalId: string;
  duplicateId: string;
  mapRepoints: number;
  contactPrimaryRepoints: number;
  contactLinksRemoved: number;
  guardianLinksMoved: number;
  guardianLinksDropped: number;
  guardianLinkedPatientRepoints: number;
  legacyMetadataAction: 'COPIED_TO_CANONICAL' | 'KEPT_CANONICAL_AND_ARCHIVED_DUPLICATE' | 'NONE';
}

function sameIdentity(a: MergePatient, b: MergePatient): string[] {
  const errs: string[] = [];
  if (normalizeName(a.name) !== normalizeName(b.name)) errs.push('Nomes divergentes — não é a mesma pessoa.');
  if (digits(a.cpf) && digits(b.cpf) && digits(a.cpf) !== digits(b.cpf)) errs.push('CPFs divergentes — não é a mesma pessoa.');
  if (!digits(a.cpf) || !digits(b.cpf)) errs.push('Consolidação exige CPF nos dois cadastros (nome/telefone sozinhos não bastam).');
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) errs.push('Nascimentos divergentes — não é a mesma pessoa.');
  return errs;
}

/**
 * Aplica a consolidação sobre uma CÓPIA do snapshot. Devolve o plano (com erros que impedem
 * a execução) e o snapshot resultante para verificação. Se o plano não está ok, o snapshot
 * devolvido é o original, intocado.
 */
export function applyPatientMerge(
  snapshot: MergeSnapshot,
  canonicalId: string,
  duplicateId: string
): { plan: MergePlan; result: MergeSnapshot } {
  const plan: MergePlan = {
    ok: false,
    errors: [],
    canonicalId,
    duplicateId,
    mapRepoints: 0,
    contactPrimaryRepoints: 0,
    contactLinksRemoved: 0,
    guardianLinksMoved: 0,
    guardianLinksDropped: 0,
    guardianLinkedPatientRepoints: 0,
    legacyMetadataAction: 'NONE',
  };

  const canonical = snapshot.patients.find((p) => p.id === canonicalId);
  const duplicate = snapshot.patients.find((p) => p.id === duplicateId);
  if (!canonical || !duplicate) plan.errors.push('Paciente canônico ou duplicado não encontrado no tenant.');
  if (canonicalId === duplicateId) plan.errors.push('Canônico e duplicado são o mesmo registro.');
  if (canonical && duplicate) plan.errors.push(...sameIdentity(canonical, duplicate));

  // Nada de negócio do duplicado é movido: se existir, a decisão é humana.
  const dupBusiness = snapshot.businessRefs[duplicateId] || {};
  for (const [table, n] of Object.entries(dupBusiness)) {
    if (n > 0) plan.errors.push(`O duplicado tem ${n} registro(s) em ${table} — consolidação recusada (nada de negócio é movido).`);
  }

  // O canônico não pode já ser o contato PRIMÁRIO de outro contato (1 primário por paciente).
  const dupPrimaryContacts = snapshot.contacts.filter((c) => c.patientId === duplicateId);
  const canonPrimaryElsewhere = snapshot.contacts.some(
    (c) => c.patientId === canonicalId && !dupPrimaryContacts.some((d) => d.id === c.id)
  );
  if (dupPrimaryContacts.length > 0 && canonPrimaryElsewhere) {
    plan.errors.push('O canônico já é o paciente primário de outro contato WhatsApp — resolver manualmente.');
  }

  if (plan.errors.length > 0 || !canonical || !duplicate) return { plan, result: snapshot };

  const next: MergeSnapshot = JSON.parse(JSON.stringify(snapshot));
  const nCanon = next.patients.find((p) => p.id === canonicalId)!;
  const nDup = next.patients.find((p) => p.id === duplicateId)!;

  // 1. Metadados legados: nunca se perdem nem se sobrescrevem.
  if (nDup.legacyMetadata) {
    if (!nCanon.legacyMetadata) {
      nCanon.legacyMetadata = nDup.legacyMetadata;
      plan.legacyMetadataAction = 'COPIED_TO_CANONICAL';
    } else {
      nCanon.legacyMetadata = { ...nCanon.legacyMetadata, mergedFromDuplicate: nDup.legacyMetadata };
      plan.legacyMetadataAction = 'KEPT_CANONICAL_AND_ARCHIVED_DUPLICATE';
    }
  }

  // 2. Contatos WhatsApp: o canônico assume o vínculo (primário quando o duplicado era) sem duplicar.
  for (const c of next.contacts.filter((x) => x.patientId === duplicateId)) {
    c.patientId = canonicalId;
    plan.contactPrimaryRepoints++;
  }
  const dupLinks = next.contactLinks.filter((l) => l.patientId === duplicateId);
  for (const dl of dupLinks) {
    const existing = next.contactLinks.find((l) => l.contactId === dl.contactId && l.patientId === canonicalId);
    if (existing) {
      existing.isPrimary = existing.isPrimary || dl.isPrimary;
    } else {
      next.contactLinks.push({ contactId: dl.contactId, patientId: canonicalId, isPrimary: dl.isPrimary });
    }
    plan.contactLinksRemoved++;
  }
  next.contactLinks = next.contactLinks.filter((l) => l.patientId !== duplicateId);

  // 3. Responsáveis: move vínculos que o canônico não tem; descarta os repetidos (sem duplicar).
  const canonHasPrimaryGuardian = next.guardianLinks.some((l) => l.patientId === canonicalId && l.isPrimary);
  for (const gl of next.guardianLinks.filter((l) => l.patientId === duplicateId)) {
    const already = next.guardianLinks.some((l) => l.patientId === canonicalId && l.guardianId === gl.guardianId);
    if (already) {
      plan.guardianLinksDropped++;
    } else {
      next.guardianLinks.push({
        guardianId: gl.guardianId,
        patientId: canonicalId,
        isPrimary: gl.isPrimary && !canonHasPrimaryGuardian,
      });
      plan.guardianLinksMoved++;
    }
  }
  next.guardianLinks = next.guardianLinks.filter((l) => l.patientId !== duplicateId);

  // 4. Responsável que é o próprio duplicado (linked_patient_id) passa a apontar para o canônico.
  for (const g of next.guardians.filter((x) => x.linkedPatientId === duplicateId)) {
    g.linkedPatientId = canonicalId;
    plan.guardianLinkedPatientRepoints++;
  }

  // 5. Mapa legado: as DUAS chaves (identificador e id_cliente vivem na mesma linha) passam a
  //    resolver para o canônico.
  for (const m of next.mapRows.filter((r) => r.entityType === 'patient' && r.targetId === duplicateId)) {
    m.targetId = canonicalId;
    m.matchKind = 'MERGED_MANUAL';
    plan.mapRepoints++;
  }

  // 6. Só agora o duplicado sai — e apenas se a verificação de referências pendentes for vazia.
  const dangling = findDanglingReferences(next, duplicateId);
  if (dangling.length > 0) {
    plan.errors.push(...dangling.map((d) => `Referência pendente ao duplicado: ${d}`));
    return { plan, result: snapshot };
  }
  next.patients = next.patients.filter((p) => p.id !== duplicateId);

  plan.ok = true;
  return { plan, result: next };
}

/** Tudo que ainda aponta para o paciente (lista vazia = seguro remover). */
export function findDanglingReferences(snapshot: MergeSnapshot, patientId: string): string[] {
  const out: string[] = [];
  const mapN = snapshot.mapRows.filter((r) => r.targetId === patientId).length;
  if (mapN) out.push(`df_legacy_import_map (${mapN})`);
  const contactN = snapshot.contacts.filter((c) => c.patientId === patientId).length;
  if (contactN) out.push(`df_wa_contacts.patient_id (${contactN})`);
  const linkN = snapshot.contactLinks.filter((l) => l.patientId === patientId).length;
  if (linkN) out.push(`df_wa_contact_patients (${linkN})`);
  const gLinkN = snapshot.guardianLinks.filter((l) => l.patientId === patientId).length;
  if (gLinkN) out.push(`df_patient_guardian_links (${gLinkN})`);
  const gN = snapshot.guardians.filter((g) => g.linkedPatientId === patientId).length;
  if (gN) out.push(`df_patient_guardians.linked_patient_id (${gN})`);
  for (const [table, n] of Object.entries(snapshot.businessRefs[patientId] || {})) {
    if (n > 0) out.push(`${table} (${n})`);
  }
  return out;
}

/** Mapas para resolveRecordsToPatients (identificador -> patient_id / id_cliente -> patient_id). */
export function buildResolutionMaps(mapRows: MergeMapRow[]): {
  mapByPrimary: Map<string, string>;
  mapBySecondary: Map<string, string>;
} {
  const mapByPrimary = new Map<string, string>();
  const mapBySecondary = new Map<string, string>();
  for (const r of mapRows) {
    if (r.entityType !== 'patient') continue;
    mapByPrimary.set(r.legacyId, r.targetId);
    if (r.legacySecondaryId) mapBySecondary.set(r.legacySecondaryId, r.targetId);
  }
  return { mapByPrimary, mapBySecondary };
}
