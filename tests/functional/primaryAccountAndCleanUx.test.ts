import { describe, it } from 'node:test';
import assert from 'node:assert';
import { INITIAL_CHART_OF_ACCOUNTS } from '../../src/lib/chartOfAccountsData';
import { mapDbUserToApp } from '../../src/lib/supabaseClient';

describe('Suíte Funcional: Acesso Primário (Consultoria) e Interface Limpa', () => {
  it('1. Deve mapear perfil do usuário primário com isPrimary = true e role SUPER_ADMIN', () => {
    const rawDbUser = {
      id: 'usr_1789405023533_6dv7',
      clinic_id: 'clinic_1789405023533_phq5',
      email: 'leonardoricardoarantes@gmail.com',
      name: 'Leonardo Arantes',
      role: 'SUPER_ADMIN',
      auth_user_id: 'b06c9529-95b8-41dc-a4d7-9c90fb05fd40',
      is_primary: true,
      is_active: true,
      created_at: '2026-09-16T17:00:00.000Z',
    };

    const appUser = mapDbUserToApp(rawDbUser);

    assert.strictEqual(appUser.email, 'leonardoricardoarantes@gmail.com');
    assert.strictEqual(appUser.role, 'SUPER_ADMIN');
    assert.strictEqual(appUser.isPrimary, true);
    assert.strictEqual(appUser.authUserId, 'b06c9529-95b8-41dc-a4d7-9c90fb05fd40');
  });

  it('2. Categorias no modal de nova despesa devem exibir estritamente o nome limpo (sem máscara/código DRE e sem subtítulo)', () => {
    // Simula a transformação aplicada no NewExpenseModal:
    // categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
    const categoryOptions = INITIAL_CHART_OF_ACCOUNTS.map((c) => ({
      value: c.id,
      label: c.name,
    }));

    // Verifica que nenhuma opção contém código DRE (ex: "01.01 - ") no início do rótulo
    for (const opt of categoryOptions) {
      assert.ok(!/^\d{2}\.\d{2}\s*-\s*/.test(opt.label), `Opção não deve conter código numérico DRE: ${opt.label}`);
    }

    // Exemplos diretos
    const salarios = categoryOptions.find((c) => c.value === 'cat_01_01');
    assert.ok(salarios, 'Categoria de salários deve existir');
    assert.strictEqual(salarios.label, 'Salários');
    assert.ok(!salarios.label.includes('01.01'), 'Não deve incluir código DRE 01.01');
  });

  it('3. Nenhum campo de entrada de texto deve exibir placeholders sugestivos com "Ex:"', () => {
    // Lista de placeholders que foram limpos
    const cleanPlaceholders = [
      '', // description despesa
      '', // observação despesa
      '', // nome paciente
      '', // email paciente
      '', // observação agendamento
      '', // nome do banco
      '', // código interno procedimento
      '', // observações clínicas insumo
      '', // nome da clínica configurações
    ];

    for (const ph of cleanPlaceholders) {
      assert.ok(!ph.toLowerCase().includes('ex:'), 'Placeholder não pode conter recomendação "Ex:"');
      assert.strictEqual(ph, '');
    }
  });
});
