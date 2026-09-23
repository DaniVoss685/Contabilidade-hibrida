/**
 * SUÍTE DE TESTES FUNCIONAIS: DETECÇÃO DE TELEFONE PLACEHOLDER (A23)
 * Espelha fn_is_placeholder_phone_local (supabase/migrations/20260923083019_placeholder_phone_no_contact_sync.sql).
 * Validado também com dados sintéticos reais em tenant de teste (clinic_1790079941_71ac,
 * is_test=true) nesta sessão: placeholder e sequência ascendente NÃO criaram df_wa_contact;
 * telefone real criou normalmente; atualizar um paciente já vinculado para um placeholder
 * NÃO sobrescreveu o número real do contato existente. Dados removidos ao final (contagens
 * confirmadas em zero).
 */

import { isPlaceholderPhoneNumber } from '../../src/lib/phoneUtils';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: DETECÇÃO DE TELEFONE PLACEHOLDER (A23)');
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

  await test('Todos os dígitos iguais (99999999999) é placeholder', () => {
    assert(isPlaceholderPhoneNumber('5599999999999'), 'Deveria detectar como placeholder');
  });

  await test('Todos os dígitos iguais com zero (5534000000000) é placeholder', () => {
    assert(isPlaceholderPhoneNumber('5534000000000'), 'Deveria detectar como placeholder');
  });

  await test('Sequência ascendente (34123456789) é placeholder', () => {
    assert(isPlaceholderPhoneNumber('34123456789'), 'Deveria detectar sequência ascendente como placeholder');
  });

  await test('Sequência descendente é placeholder', () => {
    assert(isPlaceholderPhoneNumber('34987654321'), 'Deveria detectar sequência descendente como placeholder');
  });

  await test('Telefone real (5534991112233) NÃO é placeholder', () => {
    assert(!isPlaceholderPhoneNumber('5534991112233'), 'Número real não pode ser marcado como placeholder');
  });

  await test('Telefone real com padrão misto (5534998765432... não estritamente sequencial) NÃO é placeholder', () => {
    assert(!isPlaceholderPhoneNumber('5534996851290'), 'Número real de contato de produção não pode ser falso-positivo');
  });

  await test('Telefone vazio/curto NÃO quebra a função e retorna false', () => {
    assert(!isPlaceholderPhoneNumber(''), 'Vazio não é placeholder, apenas inválido');
    assert(!isPlaceholderPhoneNumber('123'), 'Muito curto não é placeholder, apenas inválido');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
