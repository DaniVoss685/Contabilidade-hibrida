/**
 * SUÍTE DE TESTES FUNCIONAIS: NOTIFICAÇÕES EM MODO CONSULTORIA (causa raiz real)
 *
 * BUG REAL: "notificações do WhatsApp pararam de funcionar" para usuários operando
 * em Modo Consultoria (is_primary=true/SUPER_ADMIN acessando o tenant de um
 * cliente, não o próprio clinic_id). Mensagens/conversas continuavam funcionando
 * (df_wa_messages/df_wa_conversations usam is_dental_tenant_member, que já tinha
 * bypass cross-tenant desde sempre) — só o pipeline de NOTIFICAÇÃO quebrava,
 * porque can_user_access_whatsapp() e as RPCs get_unread_notifications/
 * mark_notification_as_read/mark_all_notifications_as_read (criadas em
 * 20260918_36/37) exigiam categoricamente df_users.clinic_id = tenant do
 * cliente, sem NENHUM bypass para is_primary/SUPER_ADMIN.
 *
 * Confirmado e corrigido nesta sessão via simulação real de RLS contra produção
 * (fbkouuvupdyffizwoiti): antes da correção, can_user_access_whatsapp() retornava
 * false para o consultor em qualquer tenant de cliente; depois, retorna true (e
 * get_unread_notifications passou a retornar as notificações reais existentes).
 * Cross-tenant para staff comum continua bloqueado (validado na mesma sessão).
 *
 * Este teste NÃO bate no banco (suíte deste projeto é toda TS pura/scan de
 * código) — varre a migration corretiva para garantir que o contrato semântico
 * (bypass is_primary/SUPER_ADMIN, sem enfraquecer o isolamento de staff comum)
 * permanece presente caso alguém regenere/edite o arquivo no futuro.
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
  console.log('🚀 INICIANDO TESTES: NOTIFICAÇÕES EM MODO CONSULTORIA');
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

  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const target = fs.readdirSync(migrationsDir).find((f) => f.includes('fix_notifications_consulting_mode_access'));

  await test('Migration corretiva existe em supabase/migrations/', () => {
    assert(Boolean(target), 'Deve existir uma migration corrigindo o acesso de notificações em Modo Consultoria');
  });

  const content = fs.readFileSync(path.resolve(migrationsDir, target!), 'utf-8');

  await test('can_user_access_whatsapp tem bypass explícito para is_primary/SUPER_ADMIN', () => {
    const fnBody = content.split('CREATE OR REPLACE FUNCTION public.can_user_access_whatsapp')[1]?.split('$$;')[0] || '';
    assert(fnBody.includes("is_primary = true"), 'Deve permitir is_primary=true cross-tenant');
    assert(fnBody.includes("role = 'SUPER_ADMIN'"), 'Deve permitir SUPER_ADMIN cross-tenant');
  });

  await test('Staff comum (não is_primary/SUPER_ADMIN) continua exigindo clinic_id = p_tenant_id', () => {
    const fnBody = content.split('CREATE OR REPLACE FUNCTION public.can_user_access_whatsapp')[1]?.split('$$;')[0] || '';
    assert(fnBody.includes('clinic_id = p_tenant_id'), 'Isolamento por clínica deve ser preservado para staff comum');
  });

  await test('resolve_notification_actor_id existe e tem fallback cross-tenant explícito', () => {
    assert(content.includes('CREATE OR REPLACE FUNCTION public.resolve_notification_actor_id'), 'Helper de identidade deve existir');
    const fnBody = content.split('CREATE OR REPLACE FUNCTION public.resolve_notification_actor_id')[1]?.split('END;\n$$;')[0] || '';
    assert(fnBody.includes('is_primary = true') && fnBody.includes("role = 'SUPER_ADMIN'"), 'Fallback deve considerar is_primary/SUPER_ADMIN quando não há linha própria no tenant');
  });

  await test('As 3 RPCs de notificação usam resolve_notification_actor_id (identidade unificada)', () => {
    for (const fn of ['get_unread_notifications', 'mark_notification_as_read', 'mark_all_notifications_as_read']) {
      const fnBody = content.split(`CREATE OR REPLACE FUNCTION public.${fn}`)[1]?.split('REVOKE ALL')[0] || '';
      assert(fnBody.includes('resolve_notification_actor_id'), `${fn} deve resolver a identidade via resolve_notification_actor_id`);
    }
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
