import type { ClinicalRecord } from '../types';

export interface PossibleClinicalDuplicate {
  groupId: string;
  count: number;
  position: number;
  reviewStatus?: 'CONFIRMED_DUPLICATE' | 'DISTINCT_RECORDS';
}

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleUpperCase('pt-BR');

/**
 * Marks imported procedure records that match on every clinical field retained
 * from the legacy sheet. This is a review hint only; it never removes records.
 */
export function findPossibleClinicalDuplicates(
  records: ClinicalRecord[],
): Map<string, PossibleClinicalDuplicate> {
  const groups = new Map<string, ClinicalRecord[]>();

  for (const record of records) {
    if (record.origin !== 'IMPORT' || record.recordType !== 'PROCEDIMENTO') continue;

    const metadata = record.importMetadata || {};
    if (record.status === 'VOIDED' && metadata.duplicateReview?.status !== 'CONFIRMED_DUPLICATE') continue;
    const fingerprint = [
      record.patientId,
      record.recordDate,
      record.recordTime,
      record.legacyProcedureName || record.procedureName,
      metadata.specialty || metadata.descricaoEspecialidade || metadata.descricao_especialidade,
      record.legacyTussCode,
      record.toothNumber,
      record.toothFace,
      record.legacyDentistName || record.professionalName,
    ].map(normalize).join('|');

    groups.set(fingerprint, [...(groups.get(fingerprint) || []), record]);
  }

  const duplicates = new Map<string, PossibleClinicalDuplicate>();
  for (const [fingerprint, group] of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) =>
      (a.createdAt || a.id).localeCompare(b.createdAt || b.id) || a.id.localeCompare(b.id)
    );
    const storedReviews = ordered.map((record) => record.importMetadata?.duplicateReview);
    const reviewStatus = storedReviews.every((review) => review?.status === 'CONFIRMED_DUPLICATE')
      ? 'CONFIRMED_DUPLICATE'
      : storedReviews.every((review) => review?.status === 'DISTINCT_RECORDS')
        ? 'DISTINCT_RECORDS'
        : undefined;
    const groupId = storedReviews.every((review) => review?.groupId && review.groupId === storedReviews[0]?.groupId)
      ? storedReviews[0].groupId
      : fingerprint;

    ordered.forEach((record, index) => duplicates.set(record.id, {
      groupId,
      count: ordered.length,
      position: index + 1,
      reviewStatus,
    }));
  }
  return duplicates;
}
