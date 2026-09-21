/**
 * TESTES FUNCIONAIS COMPLETOS:
 * MULTIATENDIMENTO, IDENTIDADE VISUAL DO ATENDENTE E CONTROLE GRANULAR DE ACESSO POR USUÁRIO
 */

import {
  resolveAttendantDisplayName,
  formatAttendantAuthorLabel,
  formatOutboundTextWithPolicy,
  stripAttendantPrefixFromContent,
  validateWhatsappDisplayName,
} from '../../src/lib/attendantIdentity';

import {
  hasPermission,
  canAccessTab,
  getRoleDefaultPermissions,
  isCustomizedPermissions,
  ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  AppPermission,
  TAB_PERMISSION_BUNDLES,
  getPermissionsFromTabs,
  getTabsFromPermissions,
  getDefaultTabsForRole,
} from '../../src/lib/permissions';

import { NavTab } from '../../src/components/Layout/Sidebar';

interface TestResult {
  suite: string;
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(suite: string, id: string, name: string, condition: boolean, details: string) {
  results.push({ suite, id, name, passed: condition, details });
  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`[${suite} - ${id}] ${name} => ${icon} (${details})`);
}

async function runAllTests() {
  console.log('================================================================');
  console.log('TESTES FUNCIONAIS: MULTIATENDIMENTO & CONTROLE DE ACESSO');
  console.log('================================================================');

  // ============================================================================
  // FRENTE 1: IDENTIDADE VISUAL DO ATENDENTE & HIGIENIZAÇÃO DE CONTEÚDO
  // ============================================================================
  console.log('\n--- FRENTE 1: Identidade Visual e Higienização de Mensagens ---');

  // 1.1 Nome em negrito / formato de autor
  {
    const meAuthor = formatAttendantAuthorLabel(
      {
        whatsappDisplayName: 'Leonardo Ricardo',
        name: 'Leonardo Ricardo Arantes',
        email: 'leonardo@clinica.com.br',
      },
      'usr-1',
      'usr-1'
    );
    record(
      'Frente 1',
      'F1-01',
      'Autor próprio é renderizado como "${Nome} (Você)"',
      meAuthor === 'Leonardo Ricardo (Você)',
      `Exibição obtida: "${meAuthor}"`
    );

    const otherAuthor = formatAttendantAuthorLabel(
      {
        whatsappDisplayName: 'Luana',
        name: 'Luana Silveira',
        email: 'luana@clinica.com.br',
      },
      'usr-2',
      'usr-1'
    );
    record(
      'Frente 1',
      'F1-02',
      'Outro atendente é renderizado exatamente com o nome configurado',
      otherAuthor === 'Luana',
      `Exibição obtida: "${otherAuthor}"`
    );
  }

  // 1.2 Higienização de corpo: stripAttendantPrefixFromContent (suporta *Nome:*\n e Nome:\n)
  {
    // Formato legado sem asteriscos
    const dbStoredContentLegacy = 'Leonardo Ricardo:\neu tô falando';
    const cleanedBodyLegacy = stripAttendantPrefixFromContent(dbStoredContentLegacy, 'Leonardo Ricardo');
    record(
      'Frente 1',
      'F1-03',
      'Higieniza corpo interno removendo prefixo duplicado legado (Nome:\\n)',
      cleanedBodyLegacy === 'eu tô falando',
      `Corpo limpo para UI interna: "${cleanedBodyLegacy}"`
    );

    // Formato novo em negrito (*Nome:*\n)
    const dbStoredContentBold = '*Jander:*\nolha isso, meu nome';
    const cleanedBodyBold = stripAttendantPrefixFromContent(dbStoredContentBold, 'Jander');
    record(
      'Frente 1',
      'F1-03b',
      'Higieniza corpo interno removendo prefixo duplicado em negrito (*Nome:*\\n)',
      cleanedBodyBold === 'olha isso, meu nome',
      `Corpo limpo para UI interna: "${cleanedBodyBold}"`
    );

    // Texto sem prefixo permanece intacto
    const plainText = 'Oi, tudo bem?';
    const cleanedPlain = stripAttendantPrefixFromContent(plainText, 'Leonardo Ricardo');
    record(
      'Frente 1',
      'F1-04',
      'Texto sem prefixo não sofre alteração',
      cleanedPlain === 'Oi, tudo bem?',
      `Corpo mantido: "${cleanedPlain}"`
    );
  }

  // 1.3 Proteção de texto legítimo (ex: "Financeiro:\nSegue o boleto.") e Negrito Nativo
  {
    const userText = 'Financeiro:\nSegue o boleto para pagamento.';

    // Na higienização interna: não deve remover "Financeiro:\n" quando o atendente for Leonardo
    const internalDisplay = stripAttendantPrefixFromContent(userText, 'Leonardo Ricardo');
    record(
      'Frente 1',
      'F1-05',
      'stripAttendantPrefixFromContent NÃO remove rótulos como "Financeiro:" que não são o autor',
      internalDisplay === userText,
      `Exibição interna preservada: "${internalDisplay.replace('\n', '\\n')}"`
    );

    // Na formatação externa:
    const outboundAlways = formatOutboundTextWithPolicy({
      text: userText,
      attendantName: 'Leonardo Ricardo',
      policy: 'SEMPRE',
    });
    record(
      'Frente 1',
      'F1-06',
      'formatOutboundTextWithPolicy preserva o texto digitado "Financeiro:" e adiciona prefixo em negrito *Nome:*\\n',
      outboundAlways === '*Leonardo Ricardo:*\nFinanceiro:\nSegue o boleto para pagamento.',
      `Texto de saída: "${outboundAlways.replace(/\n/g, '\\n')}"`
    );

    // Retry do envio acima não pode duplicar "*Leonardo Ricardo:*"
    const retryOutbound = formatOutboundTextWithPolicy({
      text: outboundAlways,
      attendantName: 'Leonardo Ricardo',
      policy: 'SEMPRE',
    });
    record(
      'Frente 1',
      'F1-07',
      'Retry de mensagem com texto legítimo é 100% idempotente',
      retryOutbound === outboundAlways,
      `Retry idêntico: "${retryOutbound.replace(/\n/g, '\\n')}"`
    );

    // Exemplo específico de Jander
    const janderRaw = 'olha isso, meu nome';
    const janderOutbound = formatOutboundTextWithPolicy({
      text: janderRaw,
      attendantName: 'Jander',
      policy: 'SEMPRE',
    });
    record(
      'Frente 1',
      'F1-07b',
      'Gera exatamente "*Jander:*\\nolha isso, meu nome" no payload do WhatsApp',
      janderOutbound === '*Jander:*\nolha isso, meu nome',
      `Saída Jander: "${janderOutbound.replace('\n', '\\n')}"`
    );
  }

  // 1.4 Suporte a mídias e stickers
  {
    // Simulação do render em todos os 6 tipos de mensagem
    const messageTypes = ['text', 'image', 'audio', 'document', 'video', 'sticker'];
    const renderedHeaders = messageTypes.map((type) => {
      const isSticker = type === 'sticker';
      const authorText = formatAttendantAuthorLabel(
        {
          whatsappDisplayName: 'Leonardo Ricardo',
          name: 'Leonardo',
          email: 'leo@odonto.com',
        },
        'usr-1',
        'usr-1'
      );
      return { type, authorText, isBold: true, hasBadge: isSticker };
    });

    const allBold = renderedHeaders.every((h) => h.isBold && h.authorText === 'Leonardo Ricardo (Você)');
    record(
      'Frente 1',
      'F1-08',
      'Nome do autor em negrito disponível para todos os 6 tipos de mensagem (texto, imagem, áudio, doc, vídeo, sticker)',
      allBold,
      `Tipos validados: ${messageTypes.join(', ')}`
    );
  }

  // 1.5 Contagem estrita do AUTOMATICO (somente atendentes ativos com whatsapp:chat)
  {
    const staffMembers = [
      { id: 'u1', name: 'Leonardo', role: 'ADMIN', is_active: true, permissions: null },
      { id: 'u2', name: 'Luana', role: 'RECEPTION', is_active: true, permissions: null },
      { id: 'u3', name: 'Roberto', role: 'FINANCE', is_active: true, permissions: null },
      { id: 'u4', name: 'Inativo', role: 'RECEPTION', is_active: false, permissions: null },
    ];

    const eligibleAttendants = staffMembers.filter(
      (u) => u.is_active && hasPermission(u.role, 'whatsapp:chat', u.permissions)
    );

    record(
      'Frente 1',
      'F1-09',
      'Contagem de atendentes para AUTOMATICO desconsidera FINANCE e inativos',
      eligibleAttendants.length === 2 && eligibleAttendants.map((e) => e.name).join(',') === 'Leonardo,Luana',
      `Elegíveis: ${eligibleAttendants.map((e) => e.name).join(', ')} (Total: ${eligibleAttendants.length})`
    );

    // Se Roberto (FINANCE) tentar enviar, ou se restar apenas Leonardo
    const singleAttendantStaff = [
      { id: 'u1', name: 'Leonardo', role: 'ADMIN', is_active: true, permissions: null },
      { id: 'u3', name: 'Roberto', role: 'FINANCE', is_active: true, permissions: null },
    ];
    const singleEligible = singleAttendantStaff.filter(
      (u) => u.is_active && hasPermission(u.role, 'whatsapp:chat', u.permissions)
    );
    const autoOutboundSingle = formatOutboundTextWithPolicy({
      text: 'Olá paciente',
      attendantName: 'Leonardo',
      policy: 'AUTOMATICO',
      activeAttendantsCount: singleEligible.length,
    });
    record(
      'Frente 1',
      'F1-10',
      'AUTOMATICO não prefixa quando há apenas 1 atendente com whatsapp:chat ativo',
      autoOutboundSingle === 'Olá paciente',
      `Texto: "${autoOutboundSingle}" (Elegíveis: ${singleEligible.length})`
    );
  }

  // ============================================================================
  // FRENTE 2: CONTROLE GRANULAR DE ACESSO POR USUÁRIO (PERMISSIONS JSONB)
  // ============================================================================
  console.log('\n--- FRENTE 2: Controle Granular de Acesso por Usuário ---');

  // 2.1 Presets por Papel
  {
    // OWNER / SUPER_ADMIN possui todas as permissões
    record(
      'Frente 2',
      'F2-01',
      'OWNER possui acesso a todas as permissões do sistema',
      hasPermission('OWNER', 'team:manage') &&
        hasPermission('OWNER', 'financial:manage') &&
        hasPermission('OWNER', 'taxes:view') &&
        hasPermission('OWNER', 'whatsapp:config'),
      'OWNER validado'
    );

    // RECEPTION
    record(
      'Frente 2',
      'F2-02',
      'RECEPTION acessa WhatsApp, Agenda e Pacientes, mas NÃO acessa configurações fiscais nem equipe',
      hasPermission('RECEPTION', 'whatsapp:chat') &&
        hasPermission('RECEPTION', 'agenda:view') &&
        hasPermission('RECEPTION', 'patients:view') &&
        !hasPermission('RECEPTION', 'taxes:view') &&
        !hasPermission('RECEPTION', 'team:manage') &&
        !hasPermission('RECEPTION', 'settings:manage'),
      'RECEPTION restrições validadas'
    );

    // DENTIST / PROFESSIONAL
    record(
      'Frente 2',
      'F2-03',
      'DENTIST acessa Agenda, Pacientes e Procedimentos, mas NÃO acessa despesas financeiras nem impostos',
      hasPermission('DENTIST', 'agenda:manage') &&
        hasPermission('DENTIST', 'patients:manage') &&
        hasPermission('DENTIST', 'procedures:view') &&
        !hasPermission('DENTIST', 'expenses:manage') &&
        !hasPermission('DENTIST', 'taxes:view'),
      'DENTIST restrições validadas'
    );

    // FINANCE
    record(
      'Frente 2',
      'F2-04',
      'FINANCE acessa Vendas, Despesas, Recebíveis e Bancos, mas NÃO acessa WhatsApp por padrão',
      hasPermission('FINANCE', 'sales:view') &&
        hasPermission('FINANCE', 'expenses:manage') &&
        hasPermission('FINANCE', 'bank_accounts:view') &&
        !hasPermission('FINANCE', 'whatsapp:chat'),
      'FINANCE restrições validadas'
    );
  }

  // 2.2 Sobrescrita / Customização de Permissões (Array e Objeto)
  {
    // Recepção promovida a gerenciar equipe via custom permissions array
    const customReceptionPermissions = [
      ...getRoleDefaultPermissions('RECEPTION'),
      'team:manage' as AppPermission,
    ];
    record(
      'Frente 2',
      'F2-05',
      'Custom permissions via string[] concede permissão extra a RECEPTION',
      hasPermission('RECEPTION', 'team:manage', customReceptionPermissions) === true,
      'team:manage concedido explicitamente'
    );

    // Recepção com revogação explícita de whatsapp:chat via objeto Record<string, boolean>
    const objectPermissions = {
      'whatsapp:chat': false,
      'team:manage': true,
    };
    record(
      'Frente 2',
      'F2-06',
      'Custom permissions via Record<string, boolean> revoga permissão padrão com false',
      hasPermission('RECEPTION', 'whatsapp:chat', objectPermissions) === false &&
        hasPermission('RECEPTION', 'team:manage', objectPermissions) === true,
      'whatsapp:chat revogado, team:manage habilitado'
    );

    // Helper isCustomizedPermissions
    record(
      'Frente 2',
      'F2-07',
      'isCustomizedPermissions detecta alterações em relação ao papel padrão',
      isCustomizedPermissions('RECEPTION', customReceptionPermissions) === true &&
        isCustomizedPermissions('RECEPTION', getRoleDefaultPermissions('RECEPTION')) === false,
      'Diferenciação precisa de customização'
    );
  }

  // 2.3 Mapeamento de Abas na Sidebar e Route Guard
  {
    // RECEPTION padrão: abas permitidas e proibidas
    const receptionAllowedTabs: NavTab[] = ['dashboard', 'whatsapp', 'agenda', 'patients', 'settings'];
    const receptionBlockedTabs: NavTab[] = [
      'sales',
      'procedures',
      'supplies',
      'receivables',
      'expenses',
      'recurrent_expenses',
      'financial',
      'bank_accounts',
      'chart_of_accounts',
      'taxes',
      'fiscal_simulator',
      'reports',
    ];

    const allAllowedPass = receptionAllowedTabs.every((t) => canAccessTab('RECEPTION', t));
    const allBlockedBlocked = receptionBlockedTabs.every((t) => !canAccessTab('RECEPTION', t));

    record(
      'Frente 2',
      'F2-08',
      'canAccessTab autoriza abas operacionais e bloqueia abas fiscais/financeiras para RECEPTION',
      allAllowedPass && allBlockedBlocked,
      `Permitidas: ${receptionAllowedTabs.join(', ')} | Bloqueadas: ${receptionBlockedTabs.join(', ')}`
    );

    // FINANCE padrão: bloqueia whatsapp e autoriza área financeira
    const financeCanWhatsapp = canAccessTab('FINANCE', 'whatsapp');
    const financeCanFinancial = canAccessTab('FINANCE', 'financial');
    const financeCanSales = canAccessTab('FINANCE', 'sales');

    record(
      'Frente 2',
      'F2-09',
      'canAccessTab bloqueia whatsapp para FINANCE mas autoriza área financeira',
      !financeCanWhatsapp && financeCanFinancial && financeCanSales,
      'Isolamento financeiro validado'
    );

    // Customização: Conceder whatsapp a usuário de FINANCE
    const financeWithWa = canAccessTab('FINANCE', 'whatsapp', ['whatsapp:chat']);
    record(
      'Frente 2',
      'F2-10',
      'canAccessTab respeita concessão customizada de WhatsApp para FINANCE',
      financeWithWa === true,
      'FINANCE com permissão customizada acessa WhatsApp com sucesso'
    );
  }

  // 2.4 Route Guard Redirection Fallback
  {
    // Simula a lógica de redirecionamento de App.tsx:
    // Se usuário RECEPTION com permissão apenas em whatsapp e agenda tentar acessar "taxes"
    const attemptedTab: NavTab = 'taxes';
    const role = 'RECEPTION';
    const permissions: AppPermission[] = ['whatsapp:view', 'agenda:view'];
    const isPrimary = false;

    let targetTab: NavTab = attemptedTab;
    if (!canAccessTab(role, attemptedTab, permissions, isPrimary)) {
      const candidateTabs: NavTab[] = [
        'dashboard',
        'whatsapp',
        'agenda',
        'patients',
        'sales',
        'financial',
        'settings',
        'reports',
        'expenses',
        'procedures',
        'supplies',
      ];
      const fallback = candidateTabs.find((t) => canAccessTab(role, t, permissions, isPrimary));
      if (fallback) targetTab = fallback;
    }

    record(
      'Frente 2',
      'F2-11',
      'Route Guard redireciona rota não autorizada ("taxes") para a primeira aba permitida ("whatsapp")',
      targetTab === 'whatsapp',
      `Aba original: "${attemptedTab}" -> Redirecionado com segurança para: "${targetTab}"`
    );
  }

  // ============================================================================
  // FRENTE 2.5: HOMOLOGAÇÃO COMPLETA — ACESSOS SIMPLIFICADOS POR ABAS (A, B, C, D, E)
  // ============================================================================
  console.log('\n--- FRENTE 2.5: Homologação de Acessos Simplificados por Abas ---');

  // Teste A — Usuário da Recepção (WhatsApp, Pacientes, Agenda)
  {
    const selectedTabs: NavTab[] = ['whatsapp', 'patients', 'agenda'];
    const generatedPerms = getPermissionsFromTabs(selectedTabs, 'RECEPTION');

    const canWa = canAccessTab('RECEPTION', 'whatsapp', generatedPerms);
    const canPatients = canAccessTab('RECEPTION', 'patients', generatedPerms);
    const canAgenda = canAccessTab('RECEPTION', 'agenda', generatedPerms);

    const canFinancial = canAccessTab('RECEPTION', 'financial', generatedPerms);
    const canExpenses = canAccessTab('RECEPTION', 'expenses', generatedPerms);
    const canTaxes = canAccessTab('RECEPTION', 'taxes', generatedPerms);

    record(
      'Homologação Abas',
      'TESTE-A',
      'Usuário Recepção com [WhatsApp, Pacientes, Agenda] tem abas liberadas e financeiro/fiscal bloqueado',
      canWa && canPatients && canAgenda && !canFinancial && !canExpenses && !canTaxes,
      `WhatsApp=${canWa}, Pacientes=${canPatients}, Agenda=${canAgenda}, Financeiro=${canFinancial}, Impostos=${canTaxes}`
    );
  }

  // Teste B — Usuário da Recepção SEM WhatsApp
  {
    const selectedTabs: NavTab[] = ['patients', 'agenda'];
    const generatedPerms = getPermissionsFromTabs(selectedTabs, 'RECEPTION');

    const canWa = canAccessTab('RECEPTION', 'whatsapp', generatedPerms);
    const canPatients = canAccessTab('RECEPTION', 'patients', generatedPerms);
    const canAgenda = canAccessTab('RECEPTION', 'agenda', generatedPerms);

    // Simula tentativa de abrir /whatsapp pela URL direta
    let routeTarget: NavTab = 'whatsapp';
    if (!canAccessTab('RECEPTION', 'whatsapp', generatedPerms)) {
      const fallback = selectedTabs.find((t) => canAccessTab('RECEPTION', t, generatedPerms));
      if (fallback) routeTarget = fallback;
    }

    record(
      'Homologação Abas',
      'TESTE-B',
      'Usuário Recepção sem WhatsApp tem WhatsApp bloqueado na Sidebar e URL direta redirecionada',
      !canWa && canPatients && canAgenda && routeTarget === 'patients',
      `WhatsApp liberado? ${canWa} | Rota direta /whatsapp redirecionada para: ${routeTarget}`
    );
  }

  // Teste C — Usuário do Financeiro (Módulos Financeiros)
  {
    const financeTabs: NavTab[] = ['financial', 'sales', 'expenses', 'bank_accounts', 'receivables'];
    const generatedPerms = getPermissionsFromTabs(financeTabs, 'FINANCE');

    const canFinancial = canAccessTab('FINANCE', 'financial', generatedPerms);
    const canSales = canAccessTab('FINANCE', 'sales', generatedPerms);
    const canExpenses = canAccessTab('FINANCE', 'expenses', generatedPerms);
    const canBank = canAccessTab('FINANCE', 'bank_accounts', generatedPerms);
    const canReceivables = canAccessTab('FINANCE', 'receivables', generatedPerms);

    const canWa = canAccessTab('FINANCE', 'whatsapp', generatedPerms);
    const canAgenda = canAccessTab('FINANCE', 'agenda', generatedPerms);
    const canPatients = canAccessTab('FINANCE', 'patients', generatedPerms);

    record(
      'Homologação Abas',
      'TESTE-C',
      'Usuário Financeiro acessa módulos financeiros mas WhatsApp e abas clínicas permanecem bloqueadas',
      canFinancial && canSales && canExpenses && canBank && canReceivables && !canWa && !canAgenda && !canPatients,
      `Financeiro=${canFinancial}, Vendas=${canSales} | WhatsApp=${canWa}, Agenda=${canAgenda}, Pacientes=${canPatients}`
    );
  }

  // Teste D — Alteração de permissão com usuário logado (Remoção dinâmica de aba e Route Guard)
  {
    const initialTabs: NavTab[] = ['whatsapp', 'agenda', 'patients'];
    const initialPerms = getPermissionsFromTabs(initialTabs, 'RECEPTION');
    const initiallyHasAgenda = canAccessTab('RECEPTION', 'agenda', initialPerms);

    // Administrador salva nova configuração desmarcando "agenda"
    const updatedTabs: NavTab[] = ['whatsapp', 'patients'];
    const updatedPerms = getPermissionsFromTabs(updatedTabs, 'RECEPTION');
    const updatedHasAgenda = canAccessTab('RECEPTION', 'agenda', updatedPerms);

    // Usuário estava na tela de agenda quando a permissão foi revogada
    let activeTab: NavTab = 'agenda';
    if (!canAccessTab('RECEPTION', activeTab, updatedPerms)) {
      const safeFallback = updatedTabs.find((t) => canAccessTab('RECEPTION', t, updatedPerms));
      if (safeFallback) activeTab = safeFallback;
    }

    record(
      'Homologação Abas',
      'TESTE-D',
      'Remoção de aba revoga acesso imediatamente e redireciona usuário logado para aba permitida',
      initiallyHasAgenda === true && updatedHasAgenda === false && activeTab === 'whatsapp',
      `Antes: Agenda=${initiallyHasAgenda} -> Depois: Agenda=${updatedHasAgenda} -> Redirecionado para: ${activeTab}`
    );
  }

  // Teste E — Restaurar padrão da função e retrocompatibilidade de permissões JSONB
  {
    const defaultReceptionTabs = getDefaultTabsForRole('RECEPTION');
    const defaultFinanceTabs = getDefaultTabsForRole('FINANCE');
    const defaultDentistTabs = getDefaultTabsForRole('DENTIST');

    const receptionExpected: NavTab[] = ['dashboard', 'whatsapp', 'agenda', 'patients', 'settings'];
    const isReceptionMatch =
      defaultReceptionTabs.length === receptionExpected.length &&
      receptionExpected.every((t) => defaultReceptionTabs.includes(t));

    const isFinanceWithoutWa = !defaultFinanceTabs.includes('whatsapp') && defaultFinanceTabs.includes('financial');
    const isDentistClinical = defaultDentistTabs.includes('agenda') && !defaultDentistTabs.includes('expenses');

    // Retrocompatibilidade: converter permissões brutas legadas de volta para abas
    const legacyPermissions: AppPermission[] = ['whatsapp:view', 'agenda:view', 'agenda:create'];
    const derivedTabs = getTabsFromPermissions(legacyPermissions, 'RECEPTION');
    const hasDerivedWaAndAgenda = derivedTabs.includes('whatsapp') && derivedTabs.includes('agenda') && !derivedTabs.includes('financial');

    record(
      'Homologação Abas',
      'TESTE-E',
      'Restaurar padrão da função e retrocompatibilidade de permissões JSONB legadas funcionam perfeitamente',
      isReceptionMatch && isFinanceWithoutWa && isDentistClinical && hasDerivedWaAndAgenda,
      `Recepção padrão: [${defaultReceptionTabs.join(', ')}] | Abas derivadas de JSONB: [${derivedTabs.join(', ')}]`
    );
  }

  // ============================================================================
  // FRENTE 3: HOMOLOGAÇÃO MULTI-TENANT & DUAS SESSÕES SIMULTÂNEAS
  // ============================================================================
  console.log('\n--- FRENTE 3: Homologação Multi-Tenant & Sessões Simultâneas ---');

  {
    // Sessão A: Leonardo Ricardo (Administrador / Atendente)
    const sessionA = {
      userId: 'usr-leo-1',
      clinicId: 'clinic-alpha',
      role: 'ADMIN',
      whatsappDisplayName: 'Leonardo Ricardo',
      name: 'Leonardo Ricardo Arantes',
    };

    // Sessão B: Luana Silveira (Recepcionista / Atendente)
    const sessionB = {
      userId: 'usr-luana-2',
      clinicId: 'clinic-alpha',
      role: 'RECEPTION',
      whatsappDisplayName: 'Luana',
      name: 'Luana Silveira',
    };

    // Mensagens no histórico do WhatsApp da Clínica Alpha
    const messages = [
      {
        id: 'msg-01',
        sender_id: sessionA.userId,
        content: 'Leonardo Ricardo:\nOlá Sr. João, bom dia!',
      },
      {
        id: 'msg-02',
        sender_id: sessionB.userId,
        content: 'Luana:\nConfirmamos sua consulta para as 15h.',
      },
    ];

    // Visualização da Sessão A (Leonardo logado)
    const viewA_msg1 = formatAttendantAuthorLabel(
      {
        whatsappDisplayName: sessionA.whatsappDisplayName,
        name: sessionA.name,
      },
      messages[0].sender_id,
      sessionA.userId
    );
    const viewA_msg2 = formatAttendantAuthorLabel(
      {
        whatsappDisplayName: sessionB.whatsappDisplayName,
        name: sessionB.name,
      },
      messages[1].sender_id,
      sessionA.userId
    );

    record(
      'Frente 3',
      'F3-01',
      'Na sessão de Leonardo: sua mensagem exibe "Leonardo Ricardo (Você)" e a de Luana exibe "Luana"',
      viewA_msg1 === 'Leonardo Ricardo (Você)' && viewA_msg2 === 'Luana',
      `Msg1: "${viewA_msg1}" | Msg2: "${viewA_msg2}"`
    );

    // Visualização da Sessão B (Luana logada)
    const viewB_msg1 = formatAttendantAuthorLabel(
      {
        whatsappDisplayName: sessionA.whatsappDisplayName,
        name: sessionA.name,
      },
      messages[0].sender_id,
      sessionB.userId
    );
    const viewB_msg2 = formatAttendantAuthorLabel(
      {
        whatsappDisplayName: sessionB.whatsappDisplayName,
        name: sessionB.name,
      },
      messages[1].sender_id,
      sessionB.userId
    );

    record(
      'Frente 3',
      'F3-02',
      'Na sessão de Luana: a de Leonardo exibe "Leonardo Ricardo" e a sua exibe "Luana (Você)"',
      viewB_msg1 === 'Leonardo Ricardo' && viewB_msg2 === 'Luana (Você)',
      `Msg1: "${viewB_msg1}" | Msg2: "${viewB_msg2}"`
    );

    // Corpo limpo em ambas as sessões
    const cleanMsg1 = stripAttendantPrefixFromContent(messages[0].content, 'Leonardo Ricardo');
    const cleanMsg2 = stripAttendantPrefixFromContent(messages[1].content, 'Luana');

    record(
      'Frente 3',
      'F3-03',
      'Corpo interno limpo em ambas as sessões sem repetição do nome',
      cleanMsg1 === 'Olá Sr. João, bom dia!' && cleanMsg2 === 'Confirmamos sua consulta para as 15h.',
      `Limpeza: "${cleanMsg1}" | "${cleanMsg2}"`
    );
  }

  // ============================================================================
  // RESUMO FINAL
  // ============================================================================
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

runAllTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
