/**
 * SUÍTE DE TESTES FUNCIONAIS: INICIAR CONVERSA A PARTIR DE UM CONTATO SEM HISTÓRICO (A19)
 *
 * BUG REAL ENCONTRADO NESTA RODADA: WhatsAppMainView.handleSelectContact monta, para um
 * contato sem NENHUM atendimento prévio, uma WhatsAppConversation "de consulta" só em
 * memória, com id sintético `consult_${contact.id}` (nunca persistido — deliberado, para
 * não criar conversation apenas para abrir em modo leitura). Só que WhatsAppChatArea
 * usava esse id sintético DIRETO em handleSendText / handleSendAttachments / envio de
 * áudio, chamando DentalWhatsAppService.sendMessage/sendMediaMessage/sendAudioMessage
 * com conversationId = 'consult_...'. Essas funções fazem
 * `.from('df_wa_conversations').eq('id', conversationId).single()` — como a linha nunca
 * existe, a query falha, e o erro era engolido pelo try/catch do handler: o composer
 * parecia funcional, mas a mensagem nunca era enviada nem persistida, sem feedback ao
 * usuário. Esse é exatamente o cenário relatado: "tenho pacientes cadastrados com
 * telefone, aparecem em Contatos, mas não consigo iniciar uma nova conversa."
 *
 * Correção: WhatsAppChatArea.ensureRealConversation() materializa a conversa real via
 * DentalWhatsAppService.getOrCreateActiveConversationForContact (idempotente, já trata
 * concorrência) ANTES de qualquer chamada de envio, e atualiza o estado do pai via
 * onSelectConversation.
 *
 * Este teste varre o código-fonte para garantir que NENHUM dos 4 pontos de escrita
 * (mensagem de texto, nota interna, anexos, áudio) volte a usar `conversation.id` cru
 * sem antes passar por ensureRealConversation().
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: CONVERSA A PARTIR DE CONTATO SEM HISTÓRICO (A19)');
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

  const chatAreaPath = path.resolve(__dirname, '../../src/components/WhatsApp/WhatsAppChatArea.tsx');
  const content = fs.readFileSync(chatAreaPath, 'utf-8');

  await test('ensureRealConversation existe e materializa via getOrCreateActiveConversationForContact', () => {
    assert(content.includes('const ensureRealConversation'), 'Helper ensureRealConversation deve existir');
    assert(
      content.includes('DentalWhatsAppService.getOrCreateActiveConversationForContact'),
      'Deve reutilizar a função idempotente já existente, não reimplementar criação de conversa'
    );
  });

  // Extrai uma janela de N caracteres a partir da primeira ocorrência de `marker`,
  // evitando parsing frágil por corte em comentários/declarações vizinhas.
  function windowAfter(marker: string, size: number): string {
    const idx = content.indexOf(marker);
    assert(idx !== -1, `Marcador "${marker}" não encontrado no arquivo`);
    return content.slice(idx, idx + size);
  }

  await test('ensureRealConversation propaga a conversa real ao estado do pai (sem F5)', () => {
    const fn = windowAfter('const ensureRealConversation', 800);
    assert(
      fn.includes('onSelectConversation?.(realConv)'),
      'A conversa materializada deve ser propagada via onSelectConversation antes de retornar'
    );
  });

  await test('envio de mensagem de texto usa a conversa resolvida por ensureRealConversation', () => {
    const fn = windowAfter('const handleSendText', 900);
    assert(fn.includes('await ensureRealConversation()'), 'handleSendText deve chamar ensureRealConversation()');
    assert(fn.includes('activeConversation.id'), 'sendMessage/addInternalNote devem usar o id da conversa resolvida');
    assert(!fn.includes('conversationId: conversation.id'), 'Não pode mais usar conversation.id cru no envio de texto');
  });

  await test('envio de anexos usa a conversa resolvida por ensureRealConversation', () => {
    const fn = windowAfter('const handleSendAttachments', 700);
    assert(fn.includes('await ensureRealConversation()'), 'handleSendAttachments deve chamar ensureRealConversation()');
    assert(fn.includes('activeConversation.id'), 'sendMediaMessage deve usar o id da conversa resolvida');
    assert(!fn.includes('conversationId: conversation.id'), 'Não pode mais usar conversation.id cru no envio de anexos');
  });

  await test('envio de áudio usa a conversa resolvida por ensureRealConversation', () => {
    const fn = windowAfter('mediaRecorder.onstop', 700);
    assert(fn.includes('await ensureRealConversation()'), 'onstop do gravador de áudio deve chamar ensureRealConversation()');
    assert(fn.includes('activeConversation.id'), 'sendAudioMessage deve usar o id da conversa resolvida');
    assert(!fn.includes('conversationId: conversation.id'), 'Não pode mais usar conversation.id cru no envio de áudio');
  });

  await test('ensureRealConversation recusa materializar sem um atendente identificado (nunca assigned_to vazio)', () => {
    assert(
      /if \(!currentUserId\)\s*{\s*throw/.test(content),
      'Sem currentUserId, deve lançar erro explícito em vez de criar conversa com assigned_to vazio'
    );
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
