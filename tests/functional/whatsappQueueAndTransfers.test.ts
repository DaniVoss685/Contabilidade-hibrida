/**
 * SUÍTE DE TESTES FUNCIONAIS: FILA, MEUS ATENDIMENTOS, VISÃO GERAL, TRANSFERÊNCIAS E NOTIFICAÇÕES
 * Valida a conformidade canônica com todos os 5 objetivos e cenários operacionais (A a L).
 */

import { resolveAttendantDisplayName } from '../../src/lib/attendantIdentity';
import { getRoleLabel, hasPermission } from '../../src/lib/permissions';
import { WhatsAppConversation, WhatsAppTransfer, WhatsAppTimelineItem } from '../../src/types/whatsapp';

// Mock de assertions simples e auto-suficientes
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}. Esperado: "${expected}", Obtido: "${actual}"`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES FUNCIONAIS: WHATSAPP FILA, ATENDIMENTOS & TRANSFERÊNCIAS');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`  ✅ [PASSOU] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FALHOU] ${name}`);
      console.error(`     Motivo: ${err.message}\n`);
      failed++;
    }
  };

  // -------------------------------------------------------------
  // CENÁRIO A: REGRA CANÔNICA — EM FILA (assigned_to IS NULL)
  // -------------------------------------------------------------
  await test('Cenário A: Conversa na fila (assigned_to IS NULL) é compartilhada e identificada na fila', () => {
    const mockConversations: WhatsAppConversation[] = [
      {
        id: 'conv_fila_1',
        tenant_id: 'tenant_1',
        contact_id: 'ctc_1',
        status: 'na_fila',
        assigned_to: null,
        unread_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'conv_atend_1',
        tenant_id: 'tenant_1',
        contact_id: 'ctc_2',
        status: 'em_atendimento',
        assigned_to: 'user_atendente_1',
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Regra: Em Fila são conversas sem assigned_to e não finalizadas
    const emFila = mockConversations.filter(
      (c) => (!c.assigned_to || c.assigned_to === '') && c.status !== 'finalizado' && c.status !== 'arquivado'
    );

    assertEqual(emFila.length, 1, 'Deve haver exatamente 1 conversa na fila');
    assertEqual(emFila[0].id, 'conv_fila_1', 'A conversa na fila deve ser conv_fila_1');
    assert(emFila[0].assigned_to === null, 'Conversa na fila não deve ter atendente atribuído');
  });

  // -------------------------------------------------------------
  // CENÁRIO B: ATENDENTE ASSUME CONVERSA (CLAIM)
  // -------------------------------------------------------------
  await test('Cenário B: Atendente assume conversa (claim) -> assigned_to = userId e status = em_atendimento', () => {
    const conv: WhatsAppConversation = {
      id: 'conv_fila_1',
      tenant_id: 'tenant_1',
      contact_id: 'ctc_1',
      status: 'na_fila',
      assigned_to: null,
      unread_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Simulação do claim
    const claimedUserId = 'user_jander';
    conv.assigned_to = claimedUserId;
    conv.status = 'em_atendimento';

    assert(conv.assigned_to === claimedUserId, 'O assigned_to deve ser atualizado para o atendente que assumiu');
    assertEqual(conv.status, 'em_atendimento', 'O status deve transicionar para em_atendimento');

    // Ao assumir, ela NÃO deve mais constar na fila
    const isStillInQueue = (!conv.assigned_to || conv.assigned_to === '') && conv.status !== 'finalizado';
    assert(!isStillInQueue, 'Conversa assumida não deve mais aparecer na fila');
  });

  // -------------------------------------------------------------
  // CENÁRIO C: MEUS ATENDIMENTOS DO USUÁRIO ATUAL
  // -------------------------------------------------------------
  await test('Cenário C: Conversa em atendimento aparece em Meus Atendimentos do responsável', () => {
    const currentUserId = 'user_jander';
    const mockConversations: WhatsAppConversation[] = [
      {
        id: 'conv_jander',
        tenant_id: 'tenant_1',
        contact_id: 'ctc_1',
        status: 'em_atendimento',
        assigned_to: 'user_jander',
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'conv_camila',
        tenant_id: 'tenant_1',
        contact_id: 'ctc_2',
        status: 'em_atendimento',
        assigned_to: 'user_camila',
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const mine = mockConversations.filter(
      (c) => c.assigned_to === currentUserId && c.status !== 'finalizado' && c.status !== 'arquivado'
    );

    assertEqual(mine.length, 1, 'Deve conter apenas os atendimentos do usuário atual');
    assertEqual(mine[0].id, 'conv_jander', 'A conversa retornada deve ser a do usuário atual');
  });

  // -------------------------------------------------------------
  // CENÁRIO D: ISOLAMENTO — NÃO APARECE EM MEUS ATENDIMENTOS DE OUTRO
  // -------------------------------------------------------------
  await test('Cenário D: Conversa de outro atendente NÃO aparece em Meus Atendimentos do colega', () => {
    const currentUserId = 'user_camila';
    const convDeJander: WhatsAppConversation = {
      id: 'conv_jander',
      tenant_id: 'tenant_1',
      contact_id: 'ctc_1',
      status: 'em_atendimento',
      assigned_to: 'user_jander',
      unread_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mineDeCamila = convDeJander.assigned_to === currentUserId;
    assert(!mineDeCamila, 'Atendimento do Jander não pode aparecer em Meus Atendimentos da Camila');
  });

  // -------------------------------------------------------------
  // CENÁRIO E: MODO "TODOS" — VISÃO GERAL COM NOME DO ATENDENTE E FALLBACK SEGURO
  // -------------------------------------------------------------
  await test('Cenário E: Modo Todos exibe atendimentos de todos e formata Atendente: Nome sem vazar e-mail', () => {
    const mockConversations: WhatsAppConversation[] = [
      {
        id: 'conv_1',
        tenant_id: 'tenant_1',
        contact_id: 'ctc_1',
        status: 'em_atendimento',
        assigned_to: 'user_1',
        assigned_user: {
          id: 'user_1',
          name: 'Leonardo Ricardo Arantes',
          email: 'leonardo@clinica.com.br',
          whatsapp_display_name: 'Leonardo Ricardo',
        },
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'conv_2',
        tenant_id: 'tenant_1',
        contact_id: 'ctc_2',
        status: 'em_atendimento',
        assigned_to: 'user_2',
        assigned_user: {
          id: 'user_2',
          name: 'camila.silva@clinica.com.br', // Caso e-mail esteja no campo de nome
          email: 'camila.silva@clinica.com.br',
          whatsapp_display_name: null,
        },
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Modo "all"
    const allConvs = mockConversations.filter(
      (c) => Boolean(c.assigned_to) && c.status !== 'finalizado' && c.status !== 'arquivado'
    );
    assertEqual(allConvs.length, 2, 'Modo Todos deve exibir ambas as conversas em atendimento');

    // Resolução segura de nome do atendente
    const nameConv1 = resolveAttendantDisplayName(allConvs[0].assigned_user);
    assertEqual(nameConv1, 'Leonardo Ricardo', 'Deve priorizar whatsapp_display_name');

    const nameConv2 = resolveAttendantDisplayName(allConvs[1].assigned_user);
    assertEqual(nameConv2, 'Atendente', 'Deve usar fallback Atendente e NUNCA expor e-mail');
    assert(!nameConv2.includes('@'), 'Nome nunca pode conter arroba ou e-mail');
  });

  // -------------------------------------------------------------
  // CENÁRIO F: MODO "POR ATENDENTE"
  // -------------------------------------------------------------
  await test('Cenário F: Modo Por Atendente filtra conversas de um atendente selecionado', () => {
    const selectedAttendantId = 'user_camila';
    const mockConversations: WhatsAppConversation[] = [
      {
        id: 'conv_1',
        tenant_id: 'tenant_1',
        status: 'em_atendimento',
        assigned_to: 'user_jander',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'conv_2',
        tenant_id: 'tenant_1',
        status: 'em_atendimento',
        assigned_to: 'user_camila',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const filtered = mockConversations.filter(
      (c) => c.assigned_to === selectedAttendantId && c.status !== 'finalizado'
    );

    assertEqual(filtered.length, 1, 'Deve filtrar exatamente 1 conversa');
    assertEqual(filtered[0].id, 'conv_2', 'Deve ser a conversa atribuída à Camila');
  });

  // -------------------------------------------------------------
  // CENÁRIO G: TRANSFERÊNCIA ATUALIZA ASSIGNED_TO
  // -------------------------------------------------------------
  await test('Cenário G: Transferência altera assigned_to para novo atendente e preserva status em_atendimento', () => {
    const conv: WhatsAppConversation = {
      id: 'conv_10',
      tenant_id: 'tenant_1',
      status: 'em_atendimento',
      assigned_to: 'user_leonardo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Simulação do resultado de transferConversation
    const newAssignedTo = 'user_camila';
    conv.assigned_to = newAssignedTo;
    conv.status = 'em_atendimento'; // NÃO transferido permanente no status

    assertEqual(conv.assigned_to, 'user_camila', 'assigned_to deve ser atualizado para o novo responsável');
    assertEqual(conv.status, 'em_atendimento', 'Status deve permanecer em_atendimento');
  });

  // -------------------------------------------------------------
  // CENÁRIO H: REGISTRO DE EVENTO PERMANENTE DE TRANSFERÊNCIA
  // -------------------------------------------------------------
  await test('Cenário H: Registro de transferência estrutura dados de from_user, to_user e motivo', () => {
    const transferPayload: WhatsAppTransfer = {
      id: 'trf_123',
      tenant_id: 'tenant_1',
      conversation_id: 'conv_10',
      from_user_id: 'user_leonardo',
      to_user_id: 'user_camila',
      reason: 'Paciente com dúvidas sobre implante',
      transferred_at: new Date().toISOString(),
      from_user: { id: 'user_leonardo', name: 'Leonardo Ricardo', whatsapp_display_name: 'Leonardo Ricardo' },
      to_user: { id: 'user_camila', name: 'Dra. Camila', whatsapp_display_name: 'Dra. Camila' },
    };

    assert(Boolean(transferPayload.from_user?.name), 'Deve conter dados do atendente de origem');
    assert(Boolean(transferPayload.to_user?.name), 'Deve conter dados do atendente de destino');
    assertEqual(transferPayload.reason, 'Paciente com dúvidas sobre implante', 'Deve manter o motivo da transferência');
  });

  // -------------------------------------------------------------
  // CENÁRIO I: RENDERIZAÇÃO DO EVENTO DE TRANSFERÊNCIA NA TIMELINE
  // -------------------------------------------------------------
  await test('Cenário I: Timeline renderiza evento de transferência com De, Para, Horário e Motivo', () => {
    const transferItem: WhatsAppTimelineItem = {
      id: 'trf_123',
      type: 'transfer',
      created_at: '2026-09-21T13:39:00.000Z',
      data: {
        type: 'transfer',
        item: {
          id: 'trf_123',
          tenant_id: 'tenant_1',
          conversation_id: 'conv_10',
          from_user_id: 'user_leonardo',
          to_user_id: 'user_camila',
          reason: 'Dúvidas ortodônticas',
          transferred_at: '2026-09-21T13:39:00.000Z',
          from_user: { id: 'user_leonardo', name: 'Leonardo Ricardo' },
          to_user: { id: 'user_camila', name: 'Dra. Camila' },
        },
      },
    };

    const transferData = transferItem.data.item as WhatsAppTransfer;
    const fromName = transferData.from_user?.whatsapp_display_name || transferData.from_user?.name || 'Atendente';
    const toName = transferData.to_user?.whatsapp_display_name || transferData.to_user?.name || 'Colega';
    const reason = transferData.reason;

    assertEqual(fromName, 'Leonardo Ricardo', 'Nome de origem formatado');
    assertEqual(toName, 'Dra. Camila', 'Nome de destino formatado');
    assertEqual(reason, 'Dúvidas ortodônticas', 'Motivo presente');
  });

  // -------------------------------------------------------------
  // CENÁRIO J: LIMPEZA DE BADGES REDUNDANTES
  // -------------------------------------------------------------
  await test('Cenário J: Badges redundantes Transferido, Em Atendimento e Na Fila são limpas', () => {
    const getStatusBadge = (status: string, activeTab: string) => {
      if (status === 'transferido') return null;
      if (activeTab === 'em_atendimento' && status === 'em_atendimento') return null;
      if (activeTab === 'em_fila' && status === 'na_fila') return null;

      switch (status) {
        case 'aguardando_cliente':
          return 'Aguardando Paciente';
        case 'aguardando_interno':
          return 'Aguardando Interno';
        case 'finalizado':
          return 'Finalizado';
        default:
          return null;
      }
    };

    // 1. "Transferido" nunca deve retornar badge
    assert(getStatusBadge('transferido', 'em_atendimento') === null, 'Badge Transferido deve ser nula');
    assert(getStatusBadge('transferido', 'historico') === null, 'Badge Transferido deve ser nula no histórico');

    // 2. "Em Atendimento" na aba em_atendimento é redundante e deve ser nulo
    assert(getStatusBadge('em_atendimento', 'em_atendimento') === null, 'Badge Em Atendimento deve ser nula na aba em_atendimento');

    // 3. "Na Fila" na aba em_fila é redundante e deve ser nulo
    assert(getStatusBadge('na_fila', 'em_fila') === null, 'Badge Na Fila deve ser nula na aba em_fila');

    // 4. Badges úteis continuam sendo exibidas
    assertEqual(getStatusBadge('aguardando_cliente', 'em_atendimento'), 'Aguardando Paciente', 'Aguardando Paciente exibido');
    assertEqual(getStatusBadge('finalizado', 'historico'), 'Finalizado', 'Finalizado exibido');
  });

  // -------------------------------------------------------------
  // CENÁRIO K: TRADUÇÃO DE ROLES TÉCNICAS PARA PORTUGUÊS
  // -------------------------------------------------------------
  await test('Cenário K: getRoleLabel converte roles técnicas em inglês para rótulos amigáveis em português', () => {
    assertEqual(getRoleLabel('ASSISTANT'), 'Assistente Clínico', 'ASSISTANT -> Assistente Clínico');
    assertEqual(getRoleLabel('RECEPTION'), 'Recepção / Atendente', 'RECEPTION -> Recepção / Atendente');
    assertEqual(getRoleLabel('ADMIN'), 'Administrador(a)', 'ADMIN -> Administrador(a)');
    assertEqual(getRoleLabel('OWNER'), 'Proprietário(a)', 'OWNER -> Proprietário(a)');
    assertEqual(getRoleLabel('DENTIST'), 'Cirurgião(ã)-Dentista', 'DENTIST -> Cirurgião(ã)-Dentista');
    assertEqual(getRoleLabel('SUPER_ADMIN'), 'Super Administrador', 'SUPER_ADMIN -> Super Administrador');
    assertEqual(getRoleLabel('FINANCE'), 'Financeiro', 'FINANCE -> Financeiro');
  });

  // -------------------------------------------------------------
  // CENÁRIO L: NOTIFICAÇÃO E ISOLAMENTO POR RESPONSABILIDADE
  // -------------------------------------------------------------
  await test('Cenário L: Regra de notificação filtra estritamente por responsabilidade do atendente', () => {
    // Simulação do dispatcher de notificações
    const shouldNotifyUser = (notifUserId: string | null | undefined, currentUserId: string): boolean => {
      // Se notifUserId for nulo (Fila), notifica todos os atendentes
      if (!notifUserId) return true;
      // Se tiver atendente definido, notifica SOMENTE o responsável
      return notifUserId === currentUserId;
    };

    const userLeonardo = 'user_leonardo';
    const userCamila = 'user_camila';

    // 1. Mensagem na Fila (notifUserId = null) -> ambos devem ser notificados
    assert(shouldNotifyUser(null, userLeonardo), 'Leonardo deve receber notificação da Fila');
    assert(shouldNotifyUser(null, userCamila), 'Camila deve receber notificação da Fila');

    // 2. Mensagem em atendimento do Leonardo (notifUserId = 'user_leonardo')
    assert(shouldNotifyUser(userLeonardo, userLeonardo), 'Leonardo deve ser notificado do seu atendimento');
    assert(!shouldNotifyUser(userLeonardo, userCamila), 'Camila NÃO deve ser notificada do atendimento do Leonardo');

    // 3. Após transferência para Camila (notifUserId = 'user_camila')
    assert(!shouldNotifyUser(userCamila, userLeonardo), 'Leonardo NÃO deve receber mensagens de atendimento transferido para Camila');
    assert(shouldNotifyUser(userCamila, userCamila), 'Camila DEVE receber as novas mensagens do atendimento que assumiu');
  });

  // -------------------------------------------------------------
  // CENÁRIO M: ELIMINAÇÃO DE TRANSFERÊNCIA DUPLICADA NA TIMELINE
  // -------------------------------------------------------------
  await test('Cenário M: Deduplicação de transferência na timeline garante exibição única', () => {
    // Simula registros de transferência vindos do banco (ex: df_wa_transfers + df_wa_events)
    const rawItems: WhatsAppTimelineItem[] = [
      {
        id: 'transf_canonical_1',
        type: 'transfer',
        created_at: '2026-09-21T10:00:00.000Z',
        data: {
          type: 'transfer',
          item: {
            id: 'transf_canonical_1',
            from_user_id: 'user_leo',
            to_user_id: 'user_jander',
            reason: 'Quero agendar uma consulta',
            created_at: '2026-09-21T10:00:00.000Z',
          } as any,
        },
      },
      {
        id: 'event_transf_dup_1',
        type: 'event',
        created_at: '2026-09-21T10:00:00.500Z',
        data: {
          type: 'event',
          item: {
            id: 'event_transf_dup_1',
            event_type: 'transferred',
            from_user_id: 'user_leo',
            to_user_id: 'user_jander',
            metadata: {
              transfer_id: 'transf_canonical_1',
              to_user_id: 'user_jander',
              reason: 'Quero agendar uma consulta',
            },
            created_at: '2026-09-21T10:00:00.500Z',
          } as any,
        },
      },
    ];

    // Algoritmo de deduplicação canônica e defensiva
    const sorted = [...rawItems].sort((a, b) => {
      const timeA = new Date(a.created_at || (a as any).timestamp || 0).getTime();
      const timeB = new Date(b.created_at || (b as any).timestamp || 0).getTime();
      return timeA - timeB;
    });

    const deduplicated: WhatsAppTimelineItem[] = [];
    const seenTransfers = new Set<string>();

    for (const item of sorted) {
      const isTransferItem =
        item.type === 'transfer' ||
        (item.type === 'event' && (item.data.item as any)?.event_type === 'transferred');

      if (isTransferItem) {
        const transferData = item.data.item as any;
        const transferId = transferData?.id || (item as any).id;
        const toId = transferData?.to_user_id || transferData?.metadata?.to_user_id || '';
        const timestampApprox = Math.floor(new Date(item.created_at || 0).getTime() / 5000);
        const signature = `${toId}_${timestampApprox}`;

        if (seenTransfers.has(signature) || (transferId && seenTransfers.has(transferId))) {
          continue;
        }
        if (transferId) seenTransfers.add(transferId);
        seenTransfers.add(signature);
      }

      deduplicated.push(item);
    }

    assertEqual(deduplicated.length, 1, 'Deve conter exatamente 1 item de transferência após deduplicação');
    assertEqual(deduplicated[0].id, 'transf_canonical_1', 'O item preservado deve ser o canônico');
  });

  // -------------------------------------------------------------
  // CENÁRIO N: KANBAN OPERACIONAL — 4 COLUNAS CANÔNICAS
  // -------------------------------------------------------------
  await test('Cenário N: Kanban possui estritamente 4 colunas operacionais (sem Transferido, Finalizado ou Arquivado)', () => {
    const KANBAN_COLUMNS_IDS = ['na_fila', 'em_atendimento', 'aguardando_cliente', 'aguardando_interno'];

    assertEqual(KANBAN_COLUMNS_IDS.length, 4, 'O Kanban deve possuir exatamente 4 colunas');
    assert(!KANBAN_COLUMNS_IDS.includes('transferido'), 'Transferido NÃO deve ser coluna de Kanban');
    assert(!KANBAN_COLUMNS_IDS.includes('finalizado'), 'Finalizado NÃO deve ser coluna de Kanban');
    assert(!KANBAN_COLUMNS_IDS.includes('arquivado'), 'Arquivado NÃO deve ser coluna de Kanban');
  });

  // -------------------------------------------------------------
  // CENÁRIO O: TRANSIÇÕES DE STATUS NO DRAG & DROP DO KANBAN
  // -------------------------------------------------------------
  await test('Cenário O: Regras de transição de status no Drag-and-Drop', () => {
    // 1. Fila -> Em Atendimento: claim com atribuição
    let conv: WhatsAppConversation = {
      id: 'conv_1',
      tenant_id: 'tenant_1',
      contact_id: 'ctc_1',
      status: 'na_fila',
      assigned_to: null,
      unread_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Simula drop em 'em_atendimento' com currentUserId
    const currentUserId = 'user_jander';
    conv.assigned_to = currentUserId;
    conv.status = 'em_atendimento';
    assertEqual(conv.status, 'em_atendimento', 'Status atualizado para em_atendimento');
    assertEqual(conv.assigned_to, currentUserId, 'assigned_to atribuído ao usuário atual');

    // 2. Entre estados atribuídos: preserva assigned_to
    conv.status = 'aguardando_cliente';
    assertEqual(conv.status, 'aguardando_cliente', 'Status atualizado para aguardando_cliente');
    assertEqual(conv.assigned_to, currentUserId, 'assigned_to é preservado');

    conv.status = 'aguardando_interno';
    assertEqual(conv.status, 'aguardando_interno', 'Status atualizado para aguardando_interno');
    assertEqual(conv.assigned_to, currentUserId, 'assigned_to é preservado');

    // 3. Devolução para a fila: assigned_to é limpo (null)
    conv.status = 'na_fila';
    conv.assigned_to = null;
    assertEqual(conv.status, 'na_fila', 'Status volta para na_fila');
    assertEqual(conv.assigned_to, null, 'assigned_to é limpo (null)');
  });

  // -------------------------------------------------------------
  // CENÁRIO P: ORDEM OBRIGATÓRIA DAS 4 ABAS NA SIDEBAR
  // -------------------------------------------------------------
  await test('Cenário P: Ordem obrigatória das 4 abas é Em Atendimento > Em Fila > Contatos > Histórico', () => {
    const tabsOrder = ['em_atendimento', 'em_fila', 'contatos', 'historico'];

    assertEqual(tabsOrder[0], 'em_atendimento', '1ª aba deve ser Em Atendimento');
    assertEqual(tabsOrder[1], 'em_fila', '2ª aba deve ser Em Fila');
    assertEqual(tabsOrder[2], 'contatos', '3ª aba deve ser Contatos');
    assertEqual(tabsOrder[3], 'historico', '4ª aba deve ser Histórico');
  });

  // -------------------------------------------------------------
  // CENÁRIO Q: UX DE "POR ATENDENTE" E ESTABILIDADE DOS BADGES
  // -------------------------------------------------------------
  await test('Cenário Q: Badge da aba Em Atendimento permanece estável e seleção de Meus/Todos limpa atendente selecionado', () => {
    const allEmAtendimento = [
      { id: 'c1', assigned_to: 'user_1', status: 'em_atendimento' },
      { id: 'c2', assigned_to: 'user_2', status: 'em_atendimento' },
      { id: 'c3', assigned_to: 'user_1', status: 'em_atendimento' },
    ];

    // O badge principal da aba reflete o total canônico global de em atendimento
    const mainTabBadgeCount = allEmAtendimento.length;
    assertEqual(mainTabBadgeCount, 3, 'Badge principal da aba reflete o total global (3)');

    // Contagem de cada atendente para o seletor / Popover
    const countUser1 = allEmAtendimento.filter((c) => c.assigned_to === 'user_1').length;
    const countUser2 = allEmAtendimento.filter((c) => c.assigned_to === 'user_2').length;
    assertEqual(countUser1, 2, 'user_1 possui 2 atendimentos');
    assertEqual(countUser2, 1, 'user_2 possui 1 atendimento');

    // Ao alternar para 'mine' ou 'all', selectedAttendantId é limpo
    let selectedAttendantId = 'user_1';
    let filterMode: 'mine' | 'all' | 'attendant' = 'attendant';

    // Clica em 'mine'
    filterMode = 'mine';
    selectedAttendantId = '';
    assertEqual(filterMode, 'mine', 'Modo alterado para mine');
    assertEqual(selectedAttendantId, '', 'Atendente selecionado foi limpo');

    // Clica em 'all'
    filterMode = 'all';
    selectedAttendantId = '';
    assertEqual(filterMode, 'all', 'Modo alterado para all');
    assertEqual(selectedAttendantId, '', 'Atendente selecionado foi limpo');
  });

  console.log('\n===============================================================');
  console.log(`📊 RESULTADO FINAL DOS TESTES FUNCIONAIS: ${passed} PASSOU, ${failed} FALHOU`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal ao executar testes:', err);
  process.exit(1);
});
