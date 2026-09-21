import { UserRole, NavTab } from '../types';

export type AppPermission =
  // Visão Geral
  | 'dashboard:view'
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
  // Movimentação / Financeiro
  | 'sales:view'
  | 'sales:manage'
  | 'receivables:view'
  | 'receivables:manage'
  | 'expenses:view'
  | 'expenses:manage'
  | 'financial:view'
  | 'financial:manage'
  | 'bank_accounts:view'
  | 'bank_accounts:manage'
  | 'chart_of_accounts:view'
  | 'chart_of_accounts:manage'
  // Fiscal & Estratégico
  | 'taxes:view'
  | 'fiscal_simulator:view'
  | 'reports:view'
  // Cadastros & Gestão
  | 'procedures:view'
  | 'procedures:manage'
  | 'supplies:view'
  | 'supplies:manage'
  // Equipe & Configurações
  | 'team:view'
  | 'team:manage'
  | 'settings:view'
  | 'settings:manage';

export const ALL_APP_PERMISSIONS: AppPermission[] = [
  'dashboard:view',
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
  'sales:view',
  'sales:manage',
  'receivables:view',
  'receivables:manage',
  'expenses:view',
  'expenses:manage',
  'financial:view',
  'financial:manage',
  'bank_accounts:view',
  'bank_accounts:manage',
  'chart_of_accounts:view',
  'chart_of_accounts:manage',
  'taxes:view',
  'fiscal_simulator:view',
  'reports:view',
  'procedures:view',
  'procedures:manage',
  'supplies:view',
  'supplies:manage',
  'team:view',
  'team:manage',
  'settings:view',
  'settings:manage',
];

export const ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  SUPER_ADMIN: [...ALL_APP_PERMISSIONS],
  PLATFORM_ADMIN: [...ALL_APP_PERMISSIONS],
  OWNER: [...ALL_APP_PERMISSIONS],
  ADMIN: [...ALL_APP_PERMISSIONS],
  RECEPTION: [
    'dashboard:view',
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'settings:view',
  ],
  ASSISTANT: [
    'dashboard:view',
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'settings:view',
  ],
  DENTIST: [
    'dashboard:view',
    'whatsapp:view',
    'whatsapp:chat',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'procedures:view',
    'settings:view',
  ],
  PROFESSIONAL: [
    'dashboard:view',
    'whatsapp:view',
    'whatsapp:chat',
    'agenda:view',
    'agenda:manage',
    'patients:view',
    'patients:manage',
    'procedures:view',
    'settings:view',
  ],
  FINANCE: [
    'dashboard:view',
    'sales:view',
    'sales:manage',
    'receivables:view',
    'receivables:manage',
    'expenses:view',
    'expenses:manage',
    'financial:view',
    'financial:manage',
    'bank_accounts:view',
    'bank_accounts:manage',
    'chart_of_accounts:view',
    'chart_of_accounts:manage',
    'taxes:view',
    'fiscal_simulator:view',
    'reports:view',
    'procedures:view',
    'procedures:manage',
    'supplies:view',
    'supplies:manage',
    'patients:view',
    'agenda:view',
    'settings:view',
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

export interface PermissionDefinition {
  key: AppPermission;
  label: string;
  description?: string;
}

export interface PermissionGroup {
  id: string;
  title: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'attendance',
    title: 'ATENDIMENTO & WHATSAPP',
    description: 'Gestão de conversas, fila de espera, contatos e agenda',
    permissions: [
      { key: 'whatsapp:view', label: 'Visualizar WhatsApp', description: 'Acessar mensagens e conversas' },
      { key: 'whatsapp:chat', label: 'Enviar Mensagens', description: 'Responder pacientes no chat' },
      { key: 'whatsapp:claim', label: 'Assumir Atendimentos', description: 'Puxar conversas da fila de espera' },
      { key: 'whatsapp:transfer', label: 'Transferir Atendimentos', description: 'Encaminhar conversas para outro atendente' },
      { key: 'whatsapp:finalize', label: 'Finalizar Atendimentos', description: 'Concluir ciclo de conversa com motivo' },
      { key: 'whatsapp:config', label: 'Configurar WhatsApp', description: 'Conexão QR Code e políticas de envio' },
      { key: 'patients:view', label: 'Visualizar Pacientes', description: 'Consultar prontuários e fichas cadastrais' },
      { key: 'patients:manage', label: 'Gerenciar Pacientes', description: 'Cadastrar e editar dados dos pacientes' },
      { key: 'agenda:view', label: 'Visualizar Agenda', description: 'Consultar horários e compromissos clínicos' },
      { key: 'agenda:manage', label: 'Gerenciar Agenda', description: 'Criar, reagendar e cancelar consultas' },
    ],
  },
  {
    id: 'financial',
    title: 'FINANCEIRO & MOVIMENTAÇÃO',
    description: 'Lançamentos, receitas, despesas e fluxo de caixa',
    permissions: [
      { key: 'sales:view', label: 'Visualizar Receitas / Vendas', description: 'Ver vendas e procedimentos faturados' },
      { key: 'sales:manage', label: 'Gerenciar Receitas / Vendas', description: 'Cadastrar vendas e emitir cobranças' },
      { key: 'receivables:view', label: 'Contas a Receber', description: 'Acompanhar recebimentos e conciliações' },
      { key: 'receivables:manage', label: 'Gerenciar Recebíveis', description: 'Baixar e conciliar recebimentos' },
      { key: 'expenses:view', label: 'Despesas / A Pagar', description: 'Visualizar contas a pagar da clínica' },
      { key: 'expenses:manage', label: 'Gerenciar Despesas', description: 'Lançar e pagar contas da clínica' },
      { key: 'financial:view', label: 'Gestão Financeira Geral', description: 'Visualizar painel e fluxo de caixa consolidado' },
      { key: 'financial:manage', label: 'Operar Gestão Financeira', description: 'Transferências e lançamentos diretos' },
      { key: 'bank_accounts:view', label: 'Contas Bancárias', description: 'Visualizar saldos e extratos bancários' },
      { key: 'bank_accounts:manage', label: 'Gerenciar Bancos', description: 'Adicionar e editar contas bancárias' },
      { key: 'chart_of_accounts:view', label: 'Plano de Contas', description: 'Visualizar categorias de receita/despesa' },
      { key: 'chart_of_accounts:manage', label: 'Gerenciar Categorias', description: 'Criar e editar categorias do plano de contas' },
    ],
  },
  {
    id: 'tax',
    title: 'FISCAL & ESTRATÉGICO',
    description: 'Cálculo de impostos, simulações tributárias e DRE',
    permissions: [
      { key: 'taxes:view', label: 'Impostos & Fator R', description: 'Consultar apuração do Simples e Fator R' },
      { key: 'fiscal_simulator:view', label: 'Simulador Fiscal', description: 'Comparar regimes tributários (PF x PJ)' },
      { key: 'reports:view', label: 'Relatórios & DRE', description: 'Demonstrativo de Resultados e relatórios gerenciais' },
    ],
  },
  {
    id: 'management',
    title: 'CADASTROS & GESTÃO',
    description: 'Catálogo de procedimentos, insumos e estoque clínico',
    permissions: [
      { key: 'procedures:view', label: 'Procedimentos & Custos', description: 'Consultar tabela de preços e precificação' },
      { key: 'procedures:manage', label: 'Gerenciar Procedimentos', description: 'Criar e editar procedimentos e custos' },
      { key: 'supplies:view', label: 'Insumos & Estoque', description: 'Consultar estoque e produtos da clínica' },
      { key: 'supplies:manage', label: 'Gerenciar Estoque', description: 'Dar entrada, saída e gerenciar fornecedores' },
    ],
  },
  {
    id: 'administration',
    title: 'ADMINISTRAÇÃO DA CLÍNICA',
    description: 'Configurações gerais, equipe e segurança da clínica',
    permissions: [
      { key: 'team:view', label: 'Visualizar Equipe', description: 'Ver membros e status de acesso' },
      { key: 'team:manage', label: 'Gerenciar Equipe & Acessos', description: 'Convidar membros e alterar permissões' },
      { key: 'settings:view', label: 'Visualizar Configurações', description: 'Acessar configurações da clínica' },
      { key: 'settings:manage', label: 'Alterar Configurações', description: 'Editar dados cadastrais, CNPJ e integração' },
    ],
  },
];

/**
 * Valida se um determinado papel de usuário possui uma capacidade específica.
 * Suporta permissões customizadas pontuais gravadas no perfil (array ou Record<string, boolean>).
 * OWNER, SUPER_ADMIN e isPrimary sempre possuem acesso total incondicional.
 */
export function hasPermission(
  role?: string,
  permission?: AppPermission,
  customPermissions?: string[] | Record<string, boolean> | null,
  isPrimary?: boolean
): boolean {
  if (!role || !permission) return false;
  const upperRole = role.toUpperCase();

  // OWNER, SUPER_ADMIN, PLATFORM_ADMIN e conta primária têm acesso total incondicional
  if (isPrimary || upperRole === 'SUPER_ADMIN' || upperRole === 'PLATFORM_ADMIN' || upperRole === 'OWNER') {
    return true;
  }

  // Checar customPermissions com suporte a string[] ou Record<string, boolean>
  if (customPermissions) {
    if (Array.isArray(customPermissions)) {
      return customPermissions.includes(permission);
    } else if (typeof customPermissions === 'object') {
      if (customPermissions[permission] !== undefined) {
        return Boolean(customPermissions[permission]);
      }
    }
  }

  const allowed = ROLE_PERMISSIONS[upperRole] || [];
  return allowed.includes(permission);
}

/**
 * Valida se o usuário pode acessar determinada aba principal do sistema.
 */
export function canAccessTab(
  role?: string,
  tab?: string,
  customPermissions?: string[] | Record<string, boolean> | null,
  isPrimary?: boolean
): boolean {
  if (!role || !tab) return false;
  const upperRole = role.toUpperCase();

  if (isPrimary || upperRole === 'SUPER_ADMIN' || upperRole === 'PLATFORM_ADMIN' || upperRole === 'OWNER') {
    return true;
  }

  switch (tab) {
    case 'dashboard':
      return hasPermission(role, 'dashboard:view', customPermissions, isPrimary);
    case 'whatsapp':
      return (
        hasPermission(role, 'whatsapp:view', customPermissions, isPrimary) ||
        hasPermission(role, 'whatsapp:chat', customPermissions, isPrimary)
      );
    case 'agenda':
      return hasPermission(role, 'agenda:view', customPermissions, isPrimary);
    case 'patients':
      return hasPermission(role, 'patients:view', customPermissions, isPrimary);
    case 'sales':
      return (
        hasPermission(role, 'sales:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'receivables':
      return (
        hasPermission(role, 'receivables:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'expenses':
    case 'recurrent_expenses':
      return (
        hasPermission(role, 'expenses:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'taxes':
      return (
        hasPermission(role, 'taxes:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'fiscal_simulator':
      return (
        hasPermission(role, 'fiscal_simulator:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'reports':
      return (
        hasPermission(role, 'reports:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'procedures':
      return (
        hasPermission(role, 'procedures:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'supplies':
      return (
        hasPermission(role, 'supplies:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'financial':
    case 'entries':
    case 'dre':
    case 'carne-leao':
    case 'folha-pagamento':
    case 'conciliacao':
    case 'planejamento':
      return hasPermission(role, 'financial:view', customPermissions, isPrimary);
    case 'bank_accounts':
      return (
        hasPermission(role, 'bank_accounts:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'chart_of_accounts':
      return (
        hasPermission(role, 'chart_of_accounts:view', customPermissions, isPrimary) ||
        hasPermission(role, 'financial:view', customPermissions, isPrimary)
      );
    case 'settings':
      return hasPermission(role, 'settings:view', customPermissions, isPrimary);
    default:
      return true;
  }
}

/**
 * Mapeamento centralizado de cada Aba da Sidebar para o pacote de permissões correspondente.
 */
export const TAB_PERMISSION_BUNDLES: Record<NavTab, AppPermission[]> = {
  dashboard: ['dashboard:view'],
  whatsapp: [
    'whatsapp:view',
    'whatsapp:chat',
    'whatsapp:claim',
    'whatsapp:transfer',
    'whatsapp:finalize',
  ],
  agenda: ['agenda:view', 'agenda:manage'],
  patients: ['patients:view', 'patients:manage'],
  sales: ['sales:view', 'sales:manage'],
  receivables: ['receivables:view', 'receivables:manage'],
  expenses: ['expenses:view', 'expenses:manage'],
  recurrent_expenses: ['expenses:view', 'expenses:manage'],
  financial: ['financial:view', 'financial:manage'],
  bank_accounts: ['bank_accounts:view', 'bank_accounts:manage'],
  chart_of_accounts: ['chart_of_accounts:view', 'chart_of_accounts:manage'],
  taxes: ['taxes:view'],
  fiscal_simulator: ['fiscal_simulator:view'],
  reports: ['reports:view'],
  procedures: ['procedures:view', 'procedures:manage'],
  supplies: ['supplies:view', 'supplies:manage'],
  settings: ['settings:view', 'team:view'],
};

export interface NavTabOptionDef {
  id: NavTab;
  label: string;
  category: string;
}

export const NAV_TAB_OPTIONS: NavTabOptionDef[] = [
  { id: 'dashboard', label: 'Dashboard', category: 'Visão Geral' },
  { id: 'whatsapp', label: 'WhatsApp', category: 'Pacientes & Atendimento' },
  { id: 'patients', label: 'Pacientes', category: 'Pacientes & Atendimento' },
  { id: 'agenda', label: 'Agenda', category: 'Pacientes & Atendimento' },
  { id: 'sales', label: 'Receitas / Vendas', category: 'Movimentação' },
  { id: 'receivables', label: 'Contas a Receber', category: 'Movimentação' },
  { id: 'expenses', label: 'Despesas / A Pagar', category: 'Movimentação' },
  { id: 'financial', label: 'Gestão Financeira', category: 'Financeiro' },
  { id: 'bank_accounts', label: 'Contas Bancárias', category: 'Financeiro' },
  { id: 'chart_of_accounts', label: 'Plano de Contas', category: 'Financeiro' },
  { id: 'taxes', label: 'Impostos & Fator R', category: 'Fiscal & Estratégico' },
  { id: 'fiscal_simulator', label: 'Simulador Fiscal', category: 'Fiscal & Estratégico' },
  { id: 'reports', label: 'Relatórios & DRE', category: 'Fiscal & Estratégico' },
  { id: 'procedures', label: 'Procedimentos & Custos', category: 'Cadastros & Gestão' },
  { id: 'supplies', label: 'Insumos & Estoque', category: 'Cadastros & Gestão' },
  { id: 'settings', label: 'Configurações', category: 'Administração' },
];

/**
 * Converte um conjunto de abas selecionadas na UI em permissões granulares para persistência.
 */
export function getPermissionsFromTabs(tabs: NavTab[], role?: string): AppPermission[] {
  const set = new Set<AppPermission>();
  const upperRole = role?.toUpperCase() || 'RECEPTION';

  tabs.forEach((tab) => {
    const bundle = TAB_PERMISSION_BUNDLES[tab] || [];
    bundle.forEach((p) => set.add(p));
  });

  // Se for ADMIN, OWNER ou SUPER_ADMIN com a aba settings ativa, garante permissões de gestão
  if (tabs.includes('settings') && (upperRole === 'ADMIN' || upperRole === 'OWNER' || upperRole === 'SUPER_ADMIN')) {
    set.add('team:manage');
    set.add('settings:manage');
    set.add('whatsapp:config');
  }

  return Array.from(set);
}

/**
 * Deriva as abas ativas a partir das permissões de um usuário (migração e exibição retrocompatível).
 */
export function getTabsFromPermissions(
  permissions?: string[] | Record<string, boolean> | null,
  role?: string,
  isPrimary?: boolean
): NavTab[] {
  const allTabs: NavTab[] = [
    'dashboard',
    'whatsapp',
    'agenda',
    'patients',
    'sales',
    'receivables',
    'expenses',
    'financial',
    'bank_accounts',
    'chart_of_accounts',
    'taxes',
    'fiscal_simulator',
    'reports',
    'procedures',
    'supplies',
    'settings',
  ];

  if (isPrimary || role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN' || role === 'OWNER') {
    return allTabs;
  }

  return allTabs.filter((tab) => canAccessTab(role, tab, permissions, isPrimary));
}

/**
 * Retorna o conjunto padrão de abas para um determinado papel.
 */
export function getDefaultTabsForRole(role: string): NavTab[] {
  const defaultPerms = getRoleDefaultPermissions(role);
  return getTabsFromPermissions(defaultPerms, role);
}

/**
 * Retorna as permissões padrão para um determinado papel.
 */
export function getRoleDefaultPermissions(role: string): AppPermission[] {
  const upper = role.toUpperCase();
  return ROLE_PERMISSIONS[upper] ? [...ROLE_PERMISSIONS[upper]] : [];
}

/**
 * Verifica se um usuário possui permissões customizadas diferentes do preset padrão de sua role.
 */
export function isCustomizedPermissions(
  role: string,
  permissions?: string[] | Record<string, boolean> | null
): boolean {
  if (!permissions) return false;
  const defaultList = getRoleDefaultPermissions(role).sort();

  let userList: string[] = [];
  if (Array.isArray(permissions)) {
    userList = [...permissions].sort();
  } else if (typeof permissions === 'object') {
    userList = Object.entries(permissions)
      .filter(([_, allowed]) => allowed === true)
      .map(([key]) => key)
      .sort();
  }

  if (userList.length !== defaultList.length) return true;
  return userList.some((perm, idx) => perm !== defaultList[idx]);
}

/**
 * Retorna o rótulo amigável em português do papel.
 */
export function getRoleLabel(role?: string): string {
  if (!role) return 'Membro da Equipe';
  return ROLE_LABELS[role.toUpperCase()] || role;
}
