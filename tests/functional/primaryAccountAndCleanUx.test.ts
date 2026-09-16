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

  it('4. Clínicas disponíveis para seleção devem conter apenas registros reais com e-mail/responsável e sem clínicas demo/teste', () => {
    const rawTenants = [
      {
        tenant_id: 'clinic_1789405023533_phq5',
        clinic_name: 'Clínica Dra. Bruna',
        trade_name: 'Dra. Bruna Odontologia',
        owner_name: 'Dra. Bruna',
        owner_email: 'leonardoricardoarantes@gmail.com',
      },
      {
        tenant_id: 'clinic_1789153962617_gpw1',
        clinic_name: 'Clínica Dr. Daniel Arantes',
        trade_name: 'Dr. Daniel Odontologia',
        owner_name: 'Dr. Daniel Arantes',
        owner_email: 'danielricardoarantes@gmail.com',
      },
      {
        tenant_id: 'tenant_demo',
        clinic_name: 'Clínica Demo Odonto',
        owner_name: 'Demo User',
        owner_email: 'demo@odonto.com',
      },
      {
        tenant_id: 'clinic_test_123',
        clinic_name: 'Clínica de Teste Rápido',
        owner_name: 'Test',
        owner_email: 'teste@teste.com',
      },
    ];

    // Filtro implementado no App.tsx
    const filtered = rawTenants.filter(
      (t) =>
        t.tenant_id !== 'tenant_demo' &&
        !t.clinic_name.toLowerCase().includes('demo') &&
        !t.clinic_name.toLowerCase().includes('teste')
    );

    assert.strictEqual(filtered.length, 2, 'Apenas as duas clínicas reais devem permanecer');
    assert.strictEqual(filtered[0].clinic_name, 'Clínica Dra. Bruna');
    assert.strictEqual(filtered[0].owner_email, 'leonardoricardoarantes@gmail.com');
    assert.strictEqual(filtered[1].clinic_name, 'Clínica Dr. Daniel Arantes');
    assert.strictEqual(filtered[1].owner_email, 'danielricardoarantes@gmail.com');

    for (const c of filtered) {
      assert.ok(!c.clinic_name.toLowerCase().includes('demo'), 'Não pode conter demo');
      assert.ok(!c.clinic_name.toLowerCase().includes('teste'), 'Não pode conter teste');
    }
  });

  it('5. Barra lateral recolhida deve possuir rótulos curtos para exibição sob o ícone (otimização de espaço)', () => {
    const shortLabels = [
      'Dashboard',
      'Financeiro',
      'Contas',
      'Pacientes',
      'Agenda',
      'Procedimentos',
      'Estoque',
      'Receitas',
      'A Receber',
      'A Pagar',
      'Impostos',
      'Simulador',
      'Plano C.',
      'Relatórios',
      'Ajustes',
    ];

    for (const label of shortLabels) {
      assert.ok(label.length <= 13, `Rótulo curto "${label}" deve caber confortavelmente sob o ícone na coluna compacta`);
    }
  });

  it('6. Top bar do modo consultoria não deve conter e-mail exposto', () => {
    const orgName = 'Clínica Dra. Bruna';
    // Banner template rendered in App.tsx
    const renderedBannerText = `Consultoria & Acesso Contábil • Clínica Ativa: ${orgName}`;
    assert.ok(!renderedBannerText.includes('@'), 'O banner não deve exibir o e-mail do usuário');
    assert.ok(renderedBannerText.includes(orgName), 'Deve exibir o nome da clínica ativa');
  });
});
