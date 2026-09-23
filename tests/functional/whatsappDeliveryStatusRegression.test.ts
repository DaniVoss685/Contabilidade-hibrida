/**
 * SUÍTE DE TESTES FUNCIONAIS: REGRESSÃO DE delivery_status (rodada notificações)
 *
 * BUG REAL: DentalWhatsAppService.sendMessage/sendMediaMessage/sendAudioMessage
 * gravavam delivery_status = -1 para representar falha no envio, mas a constraint
 * df_wa_messages_delivery_status_check (desde a criação da tabela, 20260917_26)
 * só permitia 1-5. Toda vez que o envio para a Evolution API falhava (ex.: 502
 * upstream), o INSERT de log da mensagem falhava com HTTP 400 ("violates check
 * constraint"), e a mensagem falha desaparecia sem nenhum registro — quebrando
 * também o botão de reenvio, que depende de localizar mensagens com esse status.
 *
 * Correção: 0 passa a ser o valor válido para FAILED (migration
 * 20260923104836_add_failed_delivery_status_value.sql amplia a constraint para
 * 0-5). Código e tipos atualizados para usar 0 em vez de -1 em todo lugar.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WhatsAppDeliveryStatus } from '../../src/types/whatsapp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../', relPath), 'utf-8');
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: REGRESSÃO delivery_status (0-5, sem -1)');
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

  await test('WhatsAppDeliveryStatus (tipo) aceita 0 (FAILED) em tempo de compilação', () => {
    const failed: WhatsAppDeliveryStatus = 0;
    assert(failed === 0, 'O tipo deve aceitar 0 como valor válido');
  });

  await test('Nenhum arquivo de origem grava delivery_status = -1 (padrão inválido reintroduzido)', () => {
    const files = [
      'src/services/dentalWhatsAppService.ts',
      'src/components/WhatsApp/WhatsAppChatArea.tsx',
    ];
    for (const f of files) {
      const content = readSrc(f);
      const matches = content.match(/delivery_status[^\n]*-1|status === -1/g);
      assert(!matches, `${f} não pode mais usar -1 como sentinela de falha (encontrado: ${matches?.join(', ')})`);
    }
  });

  await test('Os 3 pontos de envio (texto/mídia/áudio) usam 0 como sentinela de falha', () => {
    const content = readSrc('src/services/dentalWhatsAppService.ts');
    const matches = content.match(/delivery_status: evolutionMsgId \? 2 : 0/g);
    assert((matches?.length ?? 0) === 3, `Esperado 3 ocorrências (texto/mídia/áudio), encontrado ${matches?.length ?? 0}`);
  });

  await test('WhatsAppChatArea detecta falha via status === 0, não mais -1', () => {
    const content = readSrc('src/components/WhatsApp/WhatsAppChatArea.tsx');
    assert(content.includes('if (status === 0) {'), 'renderDeliveryStatus deve checar status === 0 para o estado de falha');
  });

  await test('Migration de constraint documenta os 6 valores válidos (0-5), sem remover a constraint', () => {
    const migrationFiles = fs.readdirSync(path.resolve(__dirname, '../../supabase/migrations'));
    const target = migrationFiles.find((f) => f.includes('add_failed_delivery_status_value'));
    assert(Boolean(target), 'Migration de correção da constraint deve existir em supabase/migrations/');
    const content = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', target!), 'utf-8');
    assert(content.includes('CHECK (delivery_status IN (0, 1, 2, 3, 4, 5))'), 'Constraint deve permitir exatamente 0-5');
    assert(!content.toUpperCase().includes('DROP CONSTRAINT') || content.includes('ADD CONSTRAINT'), 'Deve recriar a constraint, nunca apenas removê-la');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
