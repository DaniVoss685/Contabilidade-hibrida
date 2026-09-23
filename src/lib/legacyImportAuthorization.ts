// Lógica pura de autorização para a migração de sistema anterior — espelha
// EXATAMENTE resolveAuthorizationForTenant em
// supabase/functions/dental-legacy-patient-import/index.ts. Manter em
// sincronia (mesmo padrão de duplicação controlada já usado no projeto para
// permissões dentro de Edge Functions, ver hasPatientManagePermission em
// dental-whatsapp-attach-document).
//
// É a peça de segurança testável em tests/functional/legacyImportTenantIsolation.test.ts:
// a Edge Function não pode ser invocada nos testes automatizados deste
// ambiente (nunca grava nos arquivos reais nesta rodada), então a garantia de
// isolamento de tenant é verificada aqui, na função que a Edge Function usa
// literalmente com a mesma regra.

export interface LegacyImportCallerRow {
  id: string;
  clinicId: string | null;
  role: string | null;
  permissions: string[] | Record<string, boolean> | null | undefined;
  isPrimary: boolean | null;
  isActive: boolean;
  name: string | null;
}

export interface LegacyImportAuthorizationResult {
  authorized: boolean;
  effectiveProfile: LegacyImportCallerRow | null;
  isPlatformAdmin: boolean;
}

const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'PLATFORM_ADMIN'];
const ROLES_WITHOUT_PATIENT_MANAGE = ['FINANCE'];

export function resolveAuthorizationForTenant(
  callerRows: LegacyImportCallerRow[],
  targetTenantId: string
): LegacyImportAuthorizationResult {
  const isPlatformAdmin = callerRows.some(
    (u) => u.isPrimary || PLATFORM_ADMIN_ROLES.includes((u.role || '').toUpperCase())
  );
  const clinicProfile = callerRows.find((u) => u.clinicId === targetTenantId) || null;
  const isClinicMember = Boolean(clinicProfile);

  if (!isClinicMember && !isPlatformAdmin) {
    return { authorized: false, effectiveProfile: null, isPlatformAdmin };
  }

  const effectiveProfile =
    clinicProfile ||
    callerRows.find((u) => u.isPrimary || PLATFORM_ADMIN_ROLES.includes((u.role || '').toUpperCase())) ||
    callerRows[0];

  return { authorized: true, effectiveProfile, isPlatformAdmin };
}

export function hasPatientManagePermission(
  role: string | null | undefined,
  permissions: LegacyImportCallerRow['permissions'],
  isPrimary: boolean | null | undefined
): boolean {
  const upperRole = (role || '').toUpperCase();
  if (isPrimary || ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'OWNER'].includes(upperRole)) return true;

  if (permissions) {
    if (Array.isArray(permissions)) {
      return permissions.includes('patients:manage');
    }
    if (typeof permissions === 'object' && permissions['patients:manage'] !== undefined) {
      return Boolean(permissions['patients:manage']);
    }
  }

  return !ROLES_WITHOUT_PATIENT_MANAGE.includes(upperRole);
}
