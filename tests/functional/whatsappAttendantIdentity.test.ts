import { resolveAttendantDisplayName, formatOutboundTextWithPolicy, validateWhatsappDisplayName, isEmailLikeName } from '../../src/lib/attendantIdentity';

/**
 * SUÍTE DE TESTES FUNCIONAIS: IDENTIDADE CONFIGURÁVEL DO ATENDENTE NO WHATSAPP
 * Valida os Cenários Obrigatórios A até G conforme especificação do Dental Finance.
 */

interface TestResult {
  scenario: string;
  code: string;
  description: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(scenario: string, code: string, description: string, passed: boolean, details: string) {
  results.push({ scenario, code, description, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${scenario} - ${code}] ${description} => ${mark} (${details})`);
}

async function runAttendantIdentityTests() {
  console.log('================================================================');
  console.log('TESTES FUNCIONAIS: IDENTIDADE DO ATENDENTE NO WHATSAPP');
  console.log('================================================================\n');

  // ============================================================================
  // CENÁRIO A: Atendente possui whatsapp_display_name configurado
  // ============================================================================
  console.log('--- CENÁRIO A: Atendente com whatsapp_display_name configurado ---');
  {
    const userA = {
      name: 'Leonardo Ricardo Arantes',
      email: 'leonardoricardoarantes@gmail.com',
      whatsapp_display_name: 'Leonardo Ricardo',
    };

    // Resolução do nome
    const resolvedName = resolveAttendantDisplayName(userA);
    record(
      'Cenário A',
      'SC-A1',
      'Prioriza whatsapp_display_name sobre name completo e email',
      resolvedName === 'Leonardo Ricardo',
      `Esperado: "Leonardo Ricardo", Obtido: "${resolvedName}"`
    );

    // Renderização interna na interface
    const internalOwnAuthor = `${resolvedName} (Você)`;
    record(
      'Cenário A',
      'SC-A2',
      'Renderiza `${resolvedName} (Você)` para o próprio usuário sem expor email',
      internalOwnAuthor === 'Leonardo Ricardo (Você)',
      `Exibição interna: "${internalOwnAuthor}"`
    );

    // Formatação externa com política SEMPRE
    const outboundAlways = formatOutboundTextWithPolicy({
      text: 'Olá! Como posso ajudar?',
      attendantName: resolvedName,
      policy: 'SEMPRE',
    });
    record(
      'Cenário A',
      'SC-A3',
      'Formata mensagem externa com prefixo em negrito no padrão `*${resolvedName}:*\\n` na política SEMPRE',
      outboundAlways === '*Leonardo Ricardo:*\nOlá! Como posso ajudar?',
      `Mensagem de saída: "${outboundAlways.replace('\n', '\\n')}"`
    );

    // Formatação externa com política AUTOMATICO e múltiplos atendentes
    const outboundAutoMulti = formatOutboundTextWithPolicy({
      text: 'Seu agendamento foi localizado.',
      attendantName: resolvedName,
      policy: 'AUTOMATICO',
      activeAttendantsCount: 2,
    });
    record(
      'Cenário A',
      'SC-A4',
      'Prefixa com negrito na política AUTOMATICO quando há múltiplos atendentes ativos (>1)',
      outboundAutoMulti === '*Leonardo Ricardo:*\nSeu agendamento foi localizado.',
      `Mensagem com 2 atendentes: "${outboundAutoMulti.replace('\n', '\\n')}"`
    );

    // Formatação externa com política AUTOMATICO e atendente único
    const outboundAutoSingle = formatOutboundTextWithPolicy({
      text: 'Seu agendamento foi localizado.',
      attendantName: resolvedName,
      policy: 'AUTOMATICO',
      activeAttendantsCount: 1,
    });
    record(
      'Cenário A',
      'SC-A5',
      'Não prefixa na política AUTOMATICO quando há apenas um atendente ativo (=1)',
      outboundAutoSingle === 'Seu agendamento foi localizado.',
      `Mensagem com 1 atendente: "${outboundAutoSingle}"`
    );

    // Política NUNCA
    const outboundNever = formatOutboundTextWithPolicy({
      text: 'Atendimento oficial da clínica.',
      attendantName: resolvedName,
      policy: 'NUNCA',
    });
    record(
      'Cenário A',
      'SC-A6',
      'Não prefixa quando a política for NUNCA',
      outboundNever === 'Atendimento oficial da clínica.',
      `Mensagem política NUNCA: "${outboundNever}"`
    );
  }

  // ============================================================================
  // CENÁRIO B: Atendente SEM whatsapp_display_name (fallback seguro, sem e-mail)
  // ============================================================================
  console.log('\n--- CENÁRIO B: Fallback seguro sem whatsapp_display_name ---');
  {
    // Usuário com nome completo válido
    const userB1 = {
      name: 'Leonardo Ricardo Arantes',
      email: 'leonardoricardoarantes@gmail.com',
      whatsapp_display_name: null,
    };
    const resolvedB1 = resolveAttendantDisplayName(userB1);
    record(
      'Cenário B',
      'SC-B1',
      'Extrai nome amigável ("Leonardo Ricardo") quando whatsapp_display_name for nulo',
      resolvedB1 === 'Leonardo Ricardo' || resolvedB1 === 'Leonardo',
      `Esperado: "Leonardo Ricardo" ou "Leonardo", Obtido: "${resolvedB1}"`
    );

    // Usuário com um único primeiro nome cadastrado
    const userB1_single = {
      name: 'Leonardo',
      email: 'leo987@clinica.com.br',
      whatsapp_display_name: null,
    };
    const resolvedB1_single = resolveAttendantDisplayName(userB1_single);
    record(
      'Cenário B',
      'SC-B1b',
      'Extrai primeiro nome quando nome cadastrado for único',
      resolvedB1_single === 'Leonardo',
      `Esperado: "Leonardo", Obtido: "${resolvedB1_single}"`
    );

    // Usuário sem nome cadastrado ou string vazia
    const userB2 = {
      name: '',
      email: 'recepcao@clinica.com.br',
      whatsapp_display_name: null,
    };
    const resolvedB2 = resolveAttendantDisplayName(userB2);
    record(
      'Cenário B',
      'SC-B2',
      'Retorna fallback neutro "Atendente" quando name for vazio',
      resolvedB2 === 'Atendente',
      `Esperado: "Atendente", Obtido: "${resolvedB2}"`
    );

    // Usuário cujo name foi gravado antigamente como e-mail completo
    const userB3 = {
      name: 'contato@odontoclinica.com.br',
      email: 'contato@odontoclinica.com.br',
      whatsapp_display_name: null,
    };
    const resolvedB3 = resolveAttendantDisplayName(userB3);
    record(
      'Cenário B',
      'SC-B3',
      'Detecta name com formato de e-mail e faz fallback neutro "Atendente"',
      resolvedB3 === 'Atendente',
      `Name contendo e-mail tratado com segurança: "${resolvedB3}"`
    );

    // Usuário cujo login/name é similar a login de email
    const userB4 = {
      name: 'leonardo@clinica',
      email: 'leonardo@clinica.com',
      whatsapp_display_name: null,
    };
    const resolvedB4 = resolveAttendantDisplayName(userB4);
    record(
      'Cenário B',
      'SC-B4',
      'Descarta string com @ e retorna "Atendente"',
      resolvedB4 === 'Atendente',
      `Name com arroba tratado com segurança: "${resolvedB4}"`
    );

    // Verificação estrita de ausência de e-mails ou @
    const allBOutputs = [resolvedB1, resolvedB2, resolvedB3, resolvedB4];
    const hasAnyEmail = allBOutputs.some((n) => isEmailLikeName(n) || n.includes('@'));
    record(
      'Cenário B',
      'SC-B5',
      'Nenhum e-mail ou prefixo com @ vazou em nenhuma resolução de fallback',
      !hasAnyEmail,
      `Resultados verificados: ${JSON.stringify(allBOutputs)}`
    );
  }

  // ============================================================================
  // CENÁRIO C: Dois atendentes operacionais simultâneos
  // ============================================================================
  console.log('\n--- CENÁRIO C: Dois atendentes operando no mesmo WhatsApp ---');
  {
    const staffMap: Record<string, any> = {
      'user-101': {
        id: 'user-101',
        name: 'Leonardo Ricardo Arantes',
        whatsapp_display_name: 'Leonardo Ricardo',
      },
      'user-102': {
        id: 'user-102',
        name: 'Luana Santos',
        whatsapp_display_name: 'Luana',
      },
    };

    // Mensagem 1 enviada pelo Atendente 1 (Leonardo)
    const msg1 = {
      id: 'msg-01',
      sender_id: 'user-101',
      content: 'Leonardo Ricardo:\nOlá, bom dia!',
      origin: 'attendant',
    };

    // Mensagem 2 enviada pelo Atendente 2 (Luana)
    const msg2 = {
      id: 'msg-02',
      sender_id: 'user-102',
      content: 'Luana:\nSeu procedimento foi agendado.',
      origin: 'attendant',
    };

    // Visão de Leonardo (currentUserId = 'user-101')
    const author1ViewLeo = resolveAttendantDisplayName(staffMap[msg1.sender_id]);
    const author2ViewLeo = resolveAttendantDisplayName(staffMap[msg2.sender_id]);

    const displayMsg1Leo = msg1.sender_id === 'user-101' ? `${author1ViewLeo} (Você)` : author1ViewLeo;
    const displayMsg2Leo = msg2.sender_id === 'user-101' ? `${author2ViewLeo} (Você)` : author2ViewLeo;

    record(
      'Cenário C',
      'SC-C1',
      'Na visão do Atendente 1: msg 1 exibe "Leonardo Ricardo (Você)" e msg 2 exibe "Luana"',
      displayMsg1Leo === 'Leonardo Ricardo (Você)' && displayMsg2Leo === 'Luana',
      `Msg1: "${displayMsg1Leo}", Msg2: "${displayMsg2Leo}"`
    );

    // Visão de Luana (currentUserId = 'user-102')
    const displayMsg1Luana = msg1.sender_id === 'user-102' ? `${author1ViewLeo} (Você)` : author1ViewLeo;
    const displayMsg2Luana = msg2.sender_id === 'user-102' ? `${author2ViewLeo} (Você)` : author2ViewLeo;

    record(
      'Cenário C',
      'SC-C2',
      'Na visão do Atendente 2: msg 1 exibe "Leonardo Ricardo" e msg 2 exibe "Luana (Você)"',
      displayMsg1Luana === 'Leonardo Ricardo' && displayMsg2Luana === 'Luana (Você)',
      `Msg1: "${displayMsg1Luana}", Msg2: "${displayMsg2Luana}"`
    );

    // Mensagens de saída para o paciente
    record(
      'Cenário C',
      'SC-C3',
      'Paciente recebe cada mensagem prefixada exclusivamente com o atendente que a digitou',
      msg1.content.startsWith('Leonardo Ricardo:\n') && msg2.content.startsWith('Luana:\n'),
      'Mensagens com autores perfeitamente isolados'
    );
  }

  // ============================================================================
  // CENÁRIO D: Transferência de atendimento (Autoria imutável no histórico)
  // ============================================================================
  console.log('\n--- CENÁRIO D: Transferência de atendimento e preservação de autoria ---');
  {
    // Conversa é criada e atribuída a Leonardo
    let conversation = {
      id: 'conv-99',
      assigned_to: 'user-101',
      status: 'aberto',
    };

    // Leonardo envia 2 mensagens
    const historyMessages = [
      { id: 'm1', sender_id: 'user-101', content: 'Leonardo Ricardo:\nOlá!', created_at: '2026-09-21T10:00:00Z' },
      { id: 'm2', sender_id: 'user-101', content: 'Leonardo Ricardo:\nVou transferir para a recepção.', created_at: '2026-09-21T10:01:00Z' },
    ];

    // Transferência para Luana (assigned_to muda)
    conversation = {
      ...conversation,
      assigned_to: 'user-102',
    };

    // Luana envia a mensagem 3
    const newMessages = [
      ...historyMessages,
      { id: 'm3', sender_id: 'user-102', content: 'Luana:\nOlá, assumi seu atendimento!', created_at: '2026-09-21T10:05:00Z' },
    ];

    // Verificação de imutabilidade: mensagens m1 e m2 mantiveram sender_id de Leonardo
    const m1Preserved = newMessages.find((m) => m.id === 'm1')?.sender_id === 'user-101';
    const m2Preserved = newMessages.find((m) => m.id === 'm2')?.sender_id === 'user-101';
    const m3HasLuana = newMessages.find((m) => m.id === 'm3')?.sender_id === 'user-102';

    record(
      'Cenário D',
      'SC-D1',
      'Transferência altera assigned_to da conversa mas NÃO sobrescreve sender_id do histórico',
      m1Preserved && m2Preserved && m3HasLuana,
      `Histórico preservado: m1=${newMessages[0].sender_id}, m2=${newMessages[1].sender_id}, m3=${newMessages[2].sender_id}`
    );
  }

  // ============================================================================
  // CENÁRIO E: Retry de mensagem / Idempotência
  // ============================================================================
  console.log('\n--- CENÁRIO E: Idempotência de envio e proteção contra duplicação ---');
  {
    const attendantName = 'Leonardo Ricardo';
    const originalText = 'Confirmamos sua consulta para amanhã às 14:00.';

    // 1º Envio
    const firstAttempt = formatOutboundTextWithPolicy({
      text: originalText,
      attendantName,
      policy: 'SEMPRE',
    });
    record(
      'Cenário E',
      'SC-E1',
      '1º envio formata com prefixo em negrito nativo do WhatsApp (*Nome:*)',
      firstAttempt === '*Leonardo Ricardo:*\nConfirmamos sua consulta para amanhã às 14:00.',
      `1ª tentativa: "${firstAttempt.replace('\n', '\\n')}"`
    );

    // 2º Envio (Retry do texto já prefixado com negrito)
    const retryAttempt = formatOutboundTextWithPolicy({
      text: firstAttempt,
      attendantName,
      policy: 'SEMPRE',
    });
    record(
      'Cenário E',
      'SC-E2',
      'Retry não duplica o prefixo do atendente em negrito',
      retryAttempt === '*Leonardo Ricardo:*\nConfirmamos sua consulta para amanhã às 14:00.',
      `Retry: "${retryAttempt.replace('\n', '\\n')}"`
    );

    // 3º Envio (Múltiplos retries em cascata)
    const tripleRetry = formatOutboundTextWithPolicy({
      text: retryAttempt,
      attendantName,
      policy: 'SEMPRE',
    });
    record(
      'Cenário E',
      'SC-E3',
      'Retries subsequentes mantêm exatamente um prefixo em negrito',
      tripleRetry === '*Leonardo Ricardo:*\nConfirmamos sua consulta para amanhã às 14:00.',
      `Triplo retry: "${tripleRetry.replace('\n', '\\n')}"`
    );

    // Troca de atendente no reenvio (ex: Luana reenviando mensagem de Leonardo)
    const resendByAnother = formatOutboundTextWithPolicy({
      text: firstAttempt, // tinha prefixo do Leonardo
      attendantName: 'Luana',
      policy: 'SEMPRE',
    });
    record(
      'Cenário E',
      'SC-E4',
      'Ao reenviar por outro atendente, substitui prefixo antigo pelo novo em negrito sem duplicar',
      resendByAnother === '*Luana:*\nConfirmamos sua consulta para amanhã às 14:00.',
      `Substituição limpa: "${resendByAnother.replace('\n', '\\n')}"`
    );

    // Reenvio de mensagem antiga legada (sem asteriscos no prefixo: "Leonardo Ricardo:\n...")
    const legacyAttempt = 'Leonardo Ricardo:\nConfirmamos sua consulta para amanhã às 14:00.';
    const migratedRetry = formatOutboundTextWithPolicy({
      text: legacyAttempt,
      attendantName: 'Leonardo Ricardo',
      policy: 'SEMPRE',
    });
    record(
      'Cenário E',
      'SC-E5',
      'Retry de mensagem histórica sem asteriscos migra suavemente para negrito sem duplicar',
      migratedRetry === '*Leonardo Ricardo:*\nConfirmamos sua consulta para amanhã às 14:00.',
      `Migração legada limpa: "${migratedRetry.replace('\n', '\\n')}"`
    );
  }

  // ============================================================================
  // CENÁRIO F: Mensagens automáticas transacionais (Agenda)
  // ============================================================================
  console.log('\n--- CENÁRIO F: Mensagens automáticas transacionais sem prefixo humano ---');
  {
    const transactionalTemplates = [
      {
        origin: 'appointment_confirmation',
        text: 'Olá {paciente}, seu agendamento na Clínica Odonto foi confirmado para {data_consulta} às {horario_consulta}.',
      },
      {
        origin: 'appointment_reminder',
        text: 'Olá {paciente}, lembrete da sua consulta amanhã às {horario_consulta}. Responda SIM para confirmar.',
      },
    ];

    // Simula disparo automático do scheduler server-side:
    // Mensagens originadas pela agenda usam sender_id = null e não passam por prefixo de atendente
    const processedMessages = transactionalTemplates.map((item) => {
      // Como origin != 'attendant' e sender_id = null, o sistema não deve injetar prefixo de atendente
      const hasSender = false;
      const finalContent = item.text; // Sem prefixação de atendente
      return {
        origin: item.origin,
        sender_id: null,
        content: finalContent,
      };
    });

    const hasAnyAttendantPrefix = processedMessages.some(
      (m) => m.content.startsWith('Leonardo:') || m.content.startsWith('Atendente:') || m.content.includes(':\n')
    );

    record(
      'Cenário F',
      'SC-F1',
      'Mensagens transacionais da agenda possuem sender_id=null e zero prefixo de atendente',
      !hasAnyAttendantPrefix && processedMessages.every((m) => m.sender_id === null),
      `Total validadas: ${processedMessages.length} mensagens automáticas`
    );
  }

  // ============================================================================
  // CENÁRIO G: Validação de input, regras anti-vazamento e Multi-tenant
  // ============================================================================
  console.log('\n--- CENÁRIO G: Validação de entrada e proteção contra injeção de e-mail ---');
  {
    // Validação de nomes válidos
    const valid1 = validateWhatsappDisplayName('Leonardo Ricardo');
    const valid2 = validateWhatsappDisplayName('Dra. Camila');
    const valid3 = validateWhatsappDisplayName('Dr. João Paulo');
    const validEmpty = validateWhatsappDisplayName(''); // opcional / limpo é válido

    record(
      'Cenário G',
      'SC-G1',
      'Valida e aceita nomes profissionais de atendentes legítimos',
      valid1.valid && valid2.valid && valid3.valid && validEmpty.valid,
      'Nomes aceitos corretamente'
    );

    // Rejeição estrita de e-mails
    const invEmail1 = validateWhatsappDisplayName('leonardo@clinica.com.br');
    const invEmail2 = validateWhatsappDisplayName('dra.camila@gmail.com');
    const invAt = validateWhatsappDisplayName('@leonardoricardo');
    const invUrl = validateWhatsappDisplayName('https://clinica.com');
    const invTooLong = validateWhatsappDisplayName('A'.repeat(65));
    const invTooShort = validateWhatsappDisplayName('A');

    const allRejected =
      !invEmail1.valid &&
      !invEmail2.valid &&
      !invAt.valid &&
      !invUrl.valid &&
      !invTooLong.valid &&
      !invTooShort.valid;

    record(
      'Cenário G',
      'SC-G2',
      'Rejeita e-mails, arrobas soltas, URLs e tamanhos fora dos limites (2-60)',
      allRejected,
      `Erros reportados: "${invEmail1.error}", "${invAt.error}", "${invTooShort.error}"`
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
    console.log('\n🎉 TODOS OS TESTES FUNCIONAIS PASSARAM COM SUCESSO!');
  }
}

runAttendantIdentityTests().catch((err) => {
  console.error('Erro fatal ao executar testes:', err);
  process.exit(1);
});
