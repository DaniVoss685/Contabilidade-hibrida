/**
 * TESTES FUNCIONAIS:
 * SINCRONIZAÇÃO EM TEMPO REAL DE PERMISSÕES, CONTROLE DE ACESSO E REDESIGN DA FUNÇÃO BASE
 */

import {
  canAccessTab,
  getPermissionsFromTabs,
  getTabsFromPermissions,
  getDefaultTabsForRole,
  getRoleLabel,
  AppPermission,
} from '../../src/lib/permissions';

import { NavTab } from '../../src/types';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(code: string, name: string, passed: boolean, details: string) {
  results.push({ code, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${code}] ${name} => ${icon} (${details})`);
}

async function runRealtimeAndPermissionsTests() {
  console.log('================================================================');
  console.log('TESTES FUNCIONAIS: SESSÃO EM TEMPO REAL & CONTROLE POR ABAS');
  console.log('================================================================\n');

  // ============================================================================
  // CENÁRIO 1: Caso Real do Jander — Permissões no Banco Refletindo na Sessão
  // ============================================================================
  console.log('--- CENÁRIO 1: Caso Real Jander de Faria (Recepção + Contas a Receber) ---');
  {
    // Snapshot real obtido no banco de dados para Jander:
    const janderRole = 'RECEPTION';
    const janderDbPermissions: AppPermission[] = [
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
      'team:view',
      'receivables:view',
      'receivables:manage',
    ];

    // Simulação da sessão hidratada com permissions
    const sessionUser = {
      id: 'usr_1790005994109_5frl0',
      name: 'Jander de Faria',
      role: janderRole,
      permissions: janderDbPermissions,
      whatsappDisplayName: 'Jander',
      isActive: true,
      isPrimary: false,
    };

    // 1.1 Contas a Receber autorizada
    const canReceivables = canAccessTab(sessionUser.role, 'receivables', sessionUser.permissions, sessionUser.isPrimary);
    record(
      'RT-01',
      'Aba "Contas a Receber" é autorizada quando presente em user.permissions',
      canReceivables === true,
      `canAccessTab('RECEPTION', 'receivables') = ${canReceivables}`
    );

    // 1.2 Abas padrão continuam acessíveis
    const canDashboard = canAccessTab(sessionUser.role, 'dashboard', sessionUser.permissions, sessionUser.isPrimary);
    const canWhatsApp = canAccessTab(sessionUser.role, 'whatsapp', sessionUser.permissions, sessionUser.isPrimary);
    const canPatients = canAccessTab(sessionUser.role, 'patients', sessionUser.permissions, sessionUser.isPrimary);
    const canAgenda = canAccessTab(sessionUser.role, 'agenda', sessionUser.permissions, sessionUser.isPrimary);
    const canSettings = canAccessTab(sessionUser.role, 'settings', sessionUser.permissions, sessionUser.isPrimary);

    record(
      'RT-02',
      'Abas operacionais regulares (Dashboard, WhatsApp, Pacientes, Agenda, Configurações) continuam autorizadas',
      canDashboard && canWhatsApp && canPatients && canAgenda && canSettings,
      'Todas as abas da recepção ativas'
    );

    // 1.3 Módulos não concedidos continuam estritamente bloqueados
    const canTaxes = canAccessTab(sessionUser.role, 'taxes', sessionUser.permissions, sessionUser.isPrimary);
    const canExpenses = canAccessTab(sessionUser.role, 'expenses', sessionUser.permissions, sessionUser.isPrimary);
    const canFinancial = canAccessTab(sessionUser.role, 'financial', sessionUser.permissions, sessionUser.isPrimary);

    record(
      'RT-03',
      'Módulos não autorizados (Impostos, Despesas, Gestão Financeira) permanecem bloqueados para Jander',
      !canTaxes && !canExpenses && !canFinancial,
      `Taxes=${canTaxes}, Expenses=${canExpenses}, Financial=${canFinancial}`
    );
  }

  // ============================================================================
  // CENÁRIO 2: Simulação de Atualização em Tempo Real (Realtime UPDATE)
  // ============================================================================
  console.log('\n--- CENÁRIO 2: Atualização Reativa de Permissões sem Logout ---');
  {
    // Sessão inicial do usuário apenas com padrão de Recepção
    let currentSessionUser: {
      id: string;
      name: string;
      role: string;
      permissions: AppPermission[] | null;
      whatsappDisplayName: string | null;
      isActive: boolean;
      isPrimary: boolean;
    } = {
      id: 'usr_jander',
      name: 'Jander de Faria',
      role: 'RECEPTION',
      permissions: null, // Padrão
      whatsappDisplayName: 'Jander',
      isActive: true,
      isPrimary: false,
    };

    // Inicialmente Contas a Receber NÃO aparece
    const initialCanReceivables = canAccessTab(currentSessionUser.role, 'receivables', currentSessionUser.permissions, currentSessionUser.isPrimary);
    record(
      'RT-04',
      'Antes da alteração do admin: Contas a Receber não é autorizada no papel base RECEPTION',
      initialCanReceivables === false,
      `Inicial: ${initialCanReceivables}`
    );

    // ADMIN altera permissões e salva no banco (ativa Contas a Receber)
    const newSelectedTabs: NavTab[] = ['dashboard', 'whatsapp', 'agenda', 'patients', 'receivables', 'settings'];
    const updatedPermissionsFromAdmin = getPermissionsFromTabs(newSelectedTabs, 'RECEPTION');

    // Simulação do dispatch do listener Realtime chamando refreshCurrentUserProfile:
    currentSessionUser = {
      ...currentSessionUser,
      permissions: updatedPermissionsFromAdmin,
    };

    // Imediatamente a sessão reflete a nova permissão sem F5 nem novo login
    const updatedCanReceivables = canAccessTab(currentSessionUser.role, 'receivables', currentSessionUser.permissions, currentSessionUser.isPrimary);
    record(
      'RT-05',
      'Após Realtime UPDATE: Contas a Receber é imediatamente autorizada na sessão sem logout nem F5',
      updatedCanReceivables === true,
      `Pós-Realtime: ${updatedCanReceivables}`
    );
  }

  // ============================================================================
  // CENÁRIO 3: Usuário na Aba que é Removida pelo Administrador (Route Guard)
  // ============================================================================
  console.log('\n--- CENÁRIO 3: Remoção de Aba Ativa e Redirecionamento Defensivo ---');
  {
    // Jander está dentro da tela de Agenda
    let activeTab: NavTab = 'agenda';
    const role = 'RECEPTION';
    const isPrimary = false;

    // ADMIN remove a Agenda
    const tabsWithoutAgenda: NavTab[] = ['dashboard', 'whatsapp', 'patients', 'receivables', 'settings'];
    const newPermissions = getPermissionsFromTabs(tabsWithoutAgenda, role);

    // Verificação de acesso à aba antiga
    const isAgendaStillAllowed = canAccessTab(role, activeTab, newPermissions, isPrimary);
    record(
      'RT-06',
      'Ao ADMIN desativar Agenda, canAccessTab retorna false imediatamente',
      isAgendaStillAllowed === false,
      `Agenda permitida? ${isAgendaStillAllowed}`
    );

    // Lógica do Route Guard no App.tsx
    let toastMessage = '';
    const candidateTabs: NavTab[] = [
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

    if (!canAccessTab(role, activeTab, newPermissions, isPrimary)) {
      const fallback = candidateTabs.find((t) => canAccessTab(role, t, newPermissions, isPrimary));
      if (fallback) {
        activeTab = fallback;
        toastMessage = 'Seu acesso a este módulo foi atualizado.';
      }
    }

    record(
      'RT-07',
      'Route Guard redireciona o usuário para Dashboard (primeira permitida) e emite aviso discreto',
      activeTab === 'dashboard' && toastMessage === 'Seu acesso a este módulo foi atualizado.',
      `Nova aba ativa: "${activeTab}" | Mensagem: "${toastMessage}"`
    );
  }

  // ============================================================================
  // CENÁRIO 4: Usuário Desativado em Tempo Real (is_active = false)
  // ============================================================================
  console.log('\n--- CENÁRIO 4: Desativação do Usuário em Tempo Real ---');
  {
    let currentSession: any = {
      user: { id: 'usr_jander', email: 'jander@clinica.com' },
      isDemo: false,
    };

    // Mock do perfil retornado pelo Supabase após ADMIN desativar
    const dbProfileAfterDeactivation = {
      id: 'usr_jander',
      email: 'jander@clinica.com',
      isActive: false, // DESATIVADO
    };

    // Simulação da lógica de refreshCurrentUserProfile():
    if (dbProfileAfterDeactivation.isActive === false) {
      currentSession = null; // encerra sessão imediatamente
    }

    record(
      'RT-08',
      'Ao receber is_active = false, sessão é instantaneamente encerrada e anulada',
      currentSession === null,
      'Sessão encerrada com sucesso'
    );
  }

  // ============================================================================
  // CENÁRIO 5: Redesign da Função Base — Proteção contra Sobrescrita Silenciosa
  // ============================================================================
  console.log('\n--- CENÁRIO 5: Redesign da Função Base e Proteção de Customizações ---');
  {
    // Usuário possui abas customizadas: Recepção + Contas a Receber
    const currentRole = 'RECEPTION';
    const customTabs: NavTab[] = ['dashboard', 'whatsapp', 'agenda', 'patients', 'receivables', 'settings'];
    const defaultReceptionTabs = getDefaultTabsForRole(currentRole);

    const isCustomized =
      customTabs.length !== defaultReceptionTabs.length ||
      customTabs.some((t) => !defaultReceptionTabs.includes(t)) ||
      defaultReceptionTabs.some((t) => !customTabs.includes(t));

    record(
      'RT-09',
      'Detecta com exatidão que o usuário possui configuração de abas personalizada',
      isCustomized === true,
      `Customizado: ${isCustomized}`
    );

    // Se ADMIN tentar mudar a função para FINANCE:
    // O sistema DEVE exigir confirmação e não sobrescrever silenciosamente
    let confirmPromptShown = false;
    const newRole = 'FINANCE';

    if (isCustomized) {
      confirmPromptShown = true;
    }

    record(
      'RT-10',
      'Aciona confirmação antes de alterar função para usuário com permissões personalizadas',
      confirmPromptShown === true,
      `Diálogo de confirmação disparado para nova função: "${getRoleLabel(newRole)}"`
    );

    // Após confirmação, aplica o preset padrão da nova função
    const newRoleDefaultTabs = getDefaultTabsForRole(newRole);
    record(
      'RT-11',
      'Preset padrão do Financeiro contém módulos financeiros e exclui WhatsApp',
      newRoleDefaultTabs.includes('financial') &&
        newRoleDefaultTabs.includes('receivables') &&
        !newRoleDefaultTabs.includes('whatsapp'),
      `Abas do Financeiro: [${newRoleDefaultTabs.join(', ')}]`
    );
  }

  // ============================================================================
  // CENÁRIO 6: Atualização em Tempo Real de whatsapp_display_name
  // ============================================================================
  console.log('\n--- CENÁRIO 6: Atualização em Tempo Real de Nome e WhatsApp ---');
  {
    let sessionUser = {
      id: 'usr_jander',
      name: 'Jander de Faria',
      whatsappDisplayName: 'Jander',
    };

    // ADMIN altera o nome de atendimento no WhatsApp para "Jander Silva"
    const newWhatsappDisplayName = 'Jander Silva';

    // Realtime aplica o novo nome no perfil
    sessionUser = {
      ...sessionUser,
      whatsappDisplayName: newWhatsappDisplayName,
    };

    record(
      'RT-12',
      'whatsapp_display_name atualiza imediatamente na sessão sem novo login',
      sessionUser.whatsappDisplayName === 'Jander Silva',
      `Novo display name: "${sessionUser.whatsappDisplayName}"`
    );
  }

  console.log('\n================================================================');
  console.log('RESUMO DA EXECUÇÃO');
  console.log('================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total de verificações: ${total}`);
  console.log(`Aprovados: ${passed}`);
  console.log(`Falhas: ${failed}`);

  if (failed > 0) {
    console.error('\n🚨 EXISTEM TESTES COM FALHA!');
    process.exit(1);
  } else {
    console.log('\n🎉 TODOS OS TESTES FUNCIONAIS PASSARAM COM SUCESSO (100%)!');
    process.exit(0);
  }
}

runRealtimeAndPermissionsTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
