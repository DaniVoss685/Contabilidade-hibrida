/**
 * SUÍTE DE TESTES FUNCIONAIS: DEDUPLICAÇÃO DE NOTIFICAÇÕES (rodada notificações)
 *
 * BUG REAL encontrado nesta sessão (não fazia parte do sintoma relatado
 * originalmente, achado durante a auditoria do item 20 do pedido): o id de
 * df_notifications era gerado com Date.now()+random a cada execução do webhook,
 * então o `onConflict: 'id', ignoreDuplicates: true` do upsert NUNCA colidia de
 * verdade — reentregas do mesmo webhook pela Evolution (retry de rede) geravam
 * uma notificação NOVA a cada tentativa. Confirmado em produção: algumas
 * mensagens tinham até 10 notificações duplicadas para o mesmo
 * evolution_msg_id (mesmo toast/som/push repetidos).
 *
 * Correção: id determinístico `notif_${tenantId}_${evolutionMsgId}` — reentregas
 * colidem na mesma linha, ignoreDuplicates funciona de verdade. O disparo de
 * Web Push também passou a checar se a notificação era realmente nova antes de
 * disparar, para nunca reenviar push numa reentrega de webhook.
 *
 * Este teste varre o código-fonte da Edge Function (mesmo padrão de scan usado
 * nas outras suítes deste projeto) para garantir que o id volta a ser aleatório
 * não seja reintroduzido no futuro.
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
  console.log('🚀 INICIANDO TESTES: DEDUPLICAÇÃO DE NOTIFICAÇÕES DO WEBHOOK');
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

  const content = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/functions/dental-whatsapp-webhook/index.ts'),
    'utf-8'
  );

  await test('notifId é determinístico por tenant+evolution_msg_id, nunca aleatório', () => {
    assert(
      content.includes('const notifId = `notif_${tenantId}_${evolutionMsgId}`'),
      'notifId deve ser derivado deterministicamente de tenantId e evolutionMsgId'
    );
    assert(
      !/const notifId = `notif_\$\{Date\.now\(\)\}/.test(content),
      'notifId NUNCA mais pode ser gerado com Date.now()+random (reintroduziria duplicação em retries)'
    );
  });

  await test('Upsert de df_notifications mantém onConflict/ignoreDuplicates e detecta se é realmente nova', () => {
    const idx = content.indexOf("from('df_notifications')");
    const block = content.slice(idx, idx + 1800);
    assert(block.includes("onConflict: 'id'") && block.includes('ignoreDuplicates: true'), 'Upsert deve continuar idempotente por id');
    assert(block.includes('notificationIsNew'), 'Deve calcular se a notificação foi realmente inserida (não uma reentrega)');
  });

  await test('Web Push só dispara quando a notificação é realmente nova (nunca em reentrega de webhook)', () => {
    const pushIdx = content.indexOf("action: 'send_push_notification'");
    const before = content.slice(Math.max(0, pushIdx - 400), pushIdx);
    assert(before.includes('if (notificationIsNew)'), 'Disparo de push deve estar condicionado a notificationIsNew');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
