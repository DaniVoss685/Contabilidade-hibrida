import { UserRole } from '../types';

export type AppPermission =
  // WhatsApp
  | 'whatsapp:view'
  | 'whatsapp:chat'
  | 'whatsapp:claim'
  | 'whatsapp:transfer'
  | 'whatsapp:finalize'
  | 'whatsapp:config'
  // Agenda
  | 'agenda:view'
  | 'agenda:manage'
  // Pacientes
  | 'patients:view'
  | 'patients:manage'
  // Financeiro & Gestão
  | 'financial:view'
  | 'financial:manage'
  // Equipe & Configurações
  | 'team:manage'
  | 'settings:manage';

export const ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  SUPER_ADMIN: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'whatsapp:config',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'financial:view',
    'financial:manage',
    'team:manage',
    'settings:manage',
  ],
  PLATFORM_ADMIN: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'whatsapp:config',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'financial:view',
    'financial:manage',
    'team:manage',
    'settings:manage',
  ],
  OWNER: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'whatsapp:config',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'financial:view',
    'financial:manage',
    'team:manage',
    'settings:manage',
  ],
  ADMIN: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'whatsapp:config',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'financial:view',
    'financial:manage',
    'team:manage',
    'settings:manage',
  ],
  RECEPTION: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
  ],
  ASSISTANT: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
  ],
  DENTIST: [
    'whatsapp:view',
    'whatsapp:chat',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
  ],
  PROFESSIONAL: [
    'whatsapp:view',
    'whatsapp:chat',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
  ],
  FINANCE: [
    'financial:view',
    'financial:manage',
    'agenda:view',
    'patients:view',
  ],
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário(a)',
  ADMIN: 'Administrador(a)',
  RECEPTION: 'Recepção / Atendente',
  ASSISTANT: 'Assistente Clínico',
  DENTIST: 'Cirurgião(ã)-Dentista',
  PROFESSIONAL: 'Profissional Clínico',
  FINANCE: 'Financeiro',
  SUPER_ADMIN: 'Super Administrador',
  PLATFORM_ADMIN: 'Administrador da Plataforma',
};

/**
 * Valida se um determinado papel de usuário possui uma capacidade específica.
 * Suporta permissões customizadas pontuais gravadas no perfil.
 */
export function hasPermission(
  role?: string,
  permission?: AppPermission,
  customPermissions?: string[] | null,
  isPrimary?: boolean
): boolean {
  if (!role || !permission) return false;
  if (isPrimary || role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN') return true;

  // Checar override customizado
  if (customPermissions && Array.isArray(customPermissions)) {
    if (customPermissions.includes(permission)) return true;
  }

  const allowed = ROLE_PERMISSIONS[role.toUpperCase()] || [];
  return allowed.includes(permission);
}

/**
 * Valida se o usuário pode acessar determinada aba principal do sistema.
 */
export function canAccessTab(
  role?: string,
  tab?: string,
  customPermissions?: string[] | null,
  isPrimary?: boolean
): boolean {
  if (!role || !tab) return false;
  if (isPrimary || role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN') return true;

  switch (tab) {
    case 'whatsapp':
      return hasPermission(role, 'whatsapp:view', customPermissions, isPrimary);
    case 'agenda':
      return hasPermission(role, 'agenda:view', customPermissions, isPrimary);
    case 'patients':
      return hasPermission(role, 'patients:view', customPermissions, isPrimary);
    case 'dashboard':
    case 'entries':
    case 'expenses':
    case 'dre':
    case 'taxes':
    case 'carne-leao':
    case 'folha-pagamento':
    case 'conciliacao':
    case 'planejamento':
      return hasPermission(role, 'financial:view', customPermissions, isPrimary);
    case 'settings':
      // Todos podem acessar configurações para ver seu próprio perfil ou dados básicos,
      // mas seções administrativas (como equipe) são filtradas internamente.
      return true;
    default:
      return true;
  }
}

/**
 * Retorna o rótulo amigável em português do papel.
 */
export function getRoleLabel(role?: string): string {
  if (!role) return 'Membro da Equipe';
  return ROLE_LABELS[role.toUpperCase()] || role;
}
