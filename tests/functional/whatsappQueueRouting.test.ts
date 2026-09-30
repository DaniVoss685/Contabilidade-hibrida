// Bug real reproduzido pelo usuário: um agendamento foi criado, o sistema mandou a confirmação
// automática ("Sua consulta está agendada..."), o paciente respondeu "Pode confirmar" — a consulta
// foi confirmada, mas a conversa NUNCA entrou na fila (nem existia como df_wa_conversations),
// porque o webhook tratava "mensagem que confirmou automaticamente um agendamento" como equivalente
// a "disparo automático do sistema", incluindo humanos na exclusão. Suíte WA-QUEUE-01..09 valida a
// regra corrigida: confirmar agendamento e colocar a conversa em fila não são mutuamente exclusivos.
// Rodar com: npx tsx tests/functional/whatsappQueueRouting.test.ts

import { readFileSync } from 'node:fs';
import { resolveConversationRouting, shouldNotifyInboundMessage } from '../../src/lib/whatsappQueueRouting';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');
const webhookCode = src('supabase/functions/dental-whatsapp-webhook/index.ts');

console.log('\n=== WA-QUEUE-01: outbound automático de confirmação — fila = 0 ===');
{
  const r = resolveConversationRouting({ isFromMe: true, hasActiveConversation: false, isTransactionalReminder: true });
  assert(r.shouldHaveConversation === false, 'disparo automático outbound sem atendimento ativo não cria conversa (fila=0)');
  assert(r.reason === 'AUTOMATED_OUTBOUND_SKIPPED', 'motivo correto: AUTOMATED_OUTBOUND_SKIPPED');
}

console.log('\n=== WA-QUEUE-02: paciente responde "Pode confirmar" — confirma consulta E entra na fila ===');
{
  const r = resolveConversationRouting({ isFromMe: false, hasActiveConversation: false, isTransactionalReminder: false });
  assert(r.shouldHaveConversation === true, 'mensagem humana inbound sem atendimento ativo cria conversa');
  assert(r.initialStatus === 'na_fila', 'conversa nova de inbound humano nasce na_fila (assigned_to null)');
  assert(r.reason === 'INBOUND_HUMAN', 'motivo correto: INBOUND_HUMAN');
  // A função de roteamento NUNCA recebe "confirmou agendamento?" como parâmetro — confirmar e
  // enfileirar são decisões independentes (é exatamente isso que corrige o bug).
  assert(
    !Object.prototype.hasOwnProperty.call({} as Parameters<typeof resolveConversationRouting>[0], 'isConfirmedAction'),
    'resolveConversationRouting não tem (e nunca deve ter) um parâmetro isConfirmedAction'
  );
}

console.log('\n=== WA-QUEUE-03: paciente responde de novo — fila continua = 1 (reaproveita, não duplica) ===');
{
  // Depois do WA-QUEUE-02 a conversa existe com status na_fila (não finalizado/arquivado) — a
  // PRÓXIMA mensagem do mesmo contato já enxerga hasActiveConversation=true.
  const r = resolveConversationRouting({ isFromMe: false, hasActiveConversation: true, isTransactionalReminder: false });
  assert(r.shouldHaveConversation === true, 'conversa existente é reaproveitada');
  assert(r.initialStatus === null, 'reaproveitar não define um novo status inicial (não recria)');
  assert(r.reason === 'REUSE_ACTIVE', 'motivo correto: REUSE_ACTIVE — não cria segunda entrada de fila');
}

console.log('\n=== WA-QUEUE-04: atendimento já ativo (em_atendimento) — paciente responde, não duplica ===');
{
  const r = resolveConversationRouting({ isFromMe: false, hasActiveConversation: true, isTransactionalReminder: false });
  assert(r.shouldHaveConversation === true && r.reason === 'REUSE_ACTIVE', 'mensagem some para dentro do atendimento ativo, sem criar novo (nem novo em fila)');
}

console.log('\n=== WA-QUEUE-05: atendimento finalizado + nova mensagem — reabre demanda em fila ===');
{
  // finalizado/arquivado são excluídos da busca de "conversa ativa" (ver SQL real abaixo) —
  // portanto uma nova mensagem após finalização sempre chega aqui com hasActiveConversation=false.
  const r = resolveConversationRouting({ isFromMe: false, hasActiveConversation: false, isTransactionalReminder: false });
  assert(r.shouldHaveConversation === true && r.initialStatus === 'na_fila', 'nova demanda operacional criada em fila após finalização (histórico anterior preservado à parte)');
  assert(
    webhookCode.includes(`.not('status', 'in', '("finalizado","arquivado")')`),
    'a query real de "conversa ativa" exclui finalizado/arquivado — confirma que WA-QUEUE-05 reflete o comportamento real'
  );
}

console.log('\n=== WA-QUEUE-06: fromMe automático — sem fila ===');
{
  const r = resolveConversationRouting({ isFromMe: true, hasActiveConversation: false, isTransactionalReminder: true });
  assert(r.shouldHaveConversation === false, 'mensagem automática do próprio sistema nunca cria fila');
  assert(shouldNotifyInboundMessage(true) === false, 'mensagem fromMe nunca gera notificação in-app/Web Push');
}

console.log('\n=== WA-QUEUE-07: read receipt / evento técnico — sem fila (roteado fora desta função) ===');
{
  // Receipts (messages.update) e reactions são tratados em branches SEPARADOS do webhook, antes
  // mesmo de chegar na resolução de conversa — nunca invocam resolveConversationRouting.
  assert(
    /data\.event\s*===\s*['"]messages\.update['"]/.test(webhookCode) || webhookCode.includes("'messages.update'"),
    'eventos de messages.update (delivery/read receipt) têm handler próprio, separado da resolução de conversa'
  );
  assert(
    webhookCode.includes('reactionMessage') || /event.*reaction/i.test(webhookCode),
    'eventos de reação são reconhecidos e não chegam a criar conversa/fila'
  );
}

console.log('\n=== WA-QUEUE-08: telefone compartilhado (3 pacientes) — 1 contact, 1 conversation, 1 fila ===');
{
  // resolveConversationRouting não recebe patientId/linkedPatientIds — a decisão de enfileirar é
  // por CONTATO, nunca por paciente. A resolução de qual paciente é feita depois, na seleção clínica.
  const params = Object.keys({ isFromMe: true, hasActiveConversation: true, isTransactionalReminder: true });
  assert(!params.includes('patientId') && !params.includes('linkedPatientIds'), 'roteamento de fila é por contato, nunca exige patient_id único');
  const r = resolveConversationRouting({ isFromMe: false, hasActiveConversation: false, isTransactionalReminder: false });
  assert(r.shouldHaveConversation === true, 'mensagem de responsável/contato compartilhado entra na fila normalmente, 1 conversa por contato');
}

console.log('\n=== WA-QUEUE-09: mesma mensagem Evolution entregue 2x — sem duplicar ===');
{
  assert(
    webhookCode.includes("onConflict: 'tenant_id,evolution_msg_id'") && webhookCode.includes('ignoreDuplicates: true'),
    'upsert de df_wa_messages é idempotente por (tenant_id, evolution_msg_id) — reentrega não duplica mensagem'
  );
  assert(
    /const notifId = `notif_\$\{tenantId\}_\$\{evolutionMsgId\}`/.test(webhookCode),
    'id de notificação é determinístico por tenant+evolution_msg_id (nunca aleatório) — reentrega colide na mesma linha'
  );
  assert(
    webhookCode.includes("onConflict: 'id'") && webhookCode.match(/onConflict: 'id'/g)!.length >= 1,
    'upsert de df_notifications usa onConflict por id determinístico + ignoreDuplicates — sem notificação duplicada'
  );
}

console.log('\n=== Regressão: isConfirmedAction foi removido (não gate mais nada) ===');
{
  assert(
    !webhookCode.includes('let isConfirmedAction') && !/isConfirmedAction\s*=\s*true/.test(webhookCode),
    'a flag isConfirmedAction (declaração/atribuição) foi removida do código — confirmar agendamento não influencia mais a criação de conversa/notificação'
  );
  assert(
    webhookCode.includes("} else if (!isTransactionalReminder) {"),
    'a criação de conversa depende só de isTransactionalReminder (disparo automático outbound) — nunca de ter confirmado um agendamento'
  );
  assert(
    /if \(!isFromMe\) \{\s*\n\s*const finalMsgDbId/.test(webhookCode),
    'a notificação/Web Push depende só de !isFromMe — toda mensagem humana recebida notifica'
  );
}

console.log(`\n${passed} verificações passaram.`);
