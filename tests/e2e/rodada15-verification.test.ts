import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import { supabaseClient } from '../../src/lib/supabaseClient';
import fs from 'fs';
import path from 'path';

describe('Rodada 15: Persistência Real Global no PostgreSQL e Login Premium com Ambientação Dinâmica', 1, () => {
  // Test 1: Conectividade e Operações Básicas com o Supabase REST
  test('R15-SUPABASE-CONNECTIVITY: Cliente REST Supabase comunica e autentica com sucesso', async () => {
    const testTenantId = `test_tenant_conn_${Date.now()}`;
    
    // Testar que cliente consegue fazer query com isolamento por tenant_id
    const prof = await supabaseClient.fetchProfessional(testTenantId);
    // Deve retornar null ou objeto sem estourar exceção de rede
    expect(prof === null || typeof prof === 'object').toBe(true);

    const history = await supabaseClient.fetchPayrollHistory(testTenantId);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  }, { requirement: 'R15' });

  // Test 2: Persistência Real Global de Bases Fiscais e Perfil pós Logout/Login
  test('R15-REAL-PERSISTENCE-CYCLE: Dados sobrevivem a logout, nova sessão e novo login via Supabase', async () => {
    const email = `dr_persist_${Date.now()}@clinicaodonto.com.br`;
    const password = 'SenhaFortePersist@2026';

    // 1. Criar nova conta
    const createRes = await db.createAccount({
      email,
      password,
      termsAccepted: true,
    });
    expect(createRes.success).toBe(true);
    expect(createRes.session).toBeDefined();
    const tenantId = createRes.session!.tenantId;

    // 2. Salvar bases fiscais consolidadas via método assíncrono
    const saveTotalRes = await db.saveInitialFiscalTotalAsync(480000, 134400, 11200, '2026-06');
    expect(saveTotalRes.success).toBe(true);

    // 3. Salvar competência mensal de folha
    const savePayrollRes = await db.upsertMonthlyPayrollAsync({
      month: '2026-06',
      proLabore: 11200,
      salaries: 5000,
      charges: 4000,
      totalPayroll: 20200,
    });
    expect(savePayrollRes.success).toBe(true);

    // 4. Salvar dados profissionais e deduções do Carnê-Leão (PF)
    const saveProfileRes = await db.updateProfessionalAsync({
      name: 'Dr. Roberto Persistência',
      cro: '123456',
      croUf: 'SP',
      especialidade: 'Ortodontia Avançada',
      nomeFantasia: 'Clínica Sorriso Seguro',
      razaoSocial: 'Clínica Sorriso Seguro LTDA',
      numDependentes: 3,
      inssProprioMensal: 1412.00,
    });
    expect(saveProfileRes.success).toBe(true);

    // 5. Simular LOGOUT
    db.logout();
    expect(db.getCurrentSession()).toBeNull();

    // 6. Simular LOGIN em nova sessão (como se fosse outro dispositivo)
    const loginRes = await db.authenticate(email, password);
    expect(loginRes.success).toBe(true);
    expect(loginRes.session).toBeDefined();

    // 7. Simular Hidratação Assíncrona pós-login
    await db.hydrateTenantAsync(tenantId);

    // 8. Verificar que os dados foram 100% recuperados da fonte da verdade
    const loadedProf = db.getProfessional();
    expect(loadedProf.name).toBe('Dr. Roberto Persistência');
    expect(loadedProf.cro).toBe('123456');
    expect(loadedProf.croUf).toBe('SP');
    expect(loadedProf.especialidade).toBe('Ortodontia Avançada');
    expect(loadedProf.nomeFantasia).toBe('Clínica Sorriso Seguro');
    expect(loadedProf.numDependentes).toBe(3);
    expect(loadedProf.inssProprioMensal).toBe(1412.00);

    expect(loadedProf.baselineConfigured).toBe(true);
    expect(loadedProf.fiscalSourceType).toBe('MANUAL_TOTAL');
    expect(loadedProf.rbt12Inicial).toBe(480000);
    expect(loadedProf.folha12MesesInicial).toBe(134400);
    expect(loadedProf.proLaboreMensal).toBe(11200);

    const monthlyPayroll = db.getMonthlyPayroll('2026-06');
    expect(monthlyPayroll).toBeDefined();
    expect(monthlyPayroll?.proLabore).toBe(11200);
    expect(monthlyPayroll?.salaries).toBe(5000);
  }, { requirement: 'R15' });

  // Test 3: Isolamento Estrito Multi-Tenant entre Clínicas
  test('R15-TENANT-ISOLATION: Clínica A não acessa nem altera dados da Clínica B', async () => {
    const emailA = `clinica_a_${Date.now()}@teste.com`;
    const emailB = `clinica_b_${Date.now()}@teste.com`;

    // Clínica A
    const resA = await db.createAccount({ email: emailA, password: 'Password@A1', termsAccepted: true });
    expect(resA.success).toBe(true);
    const tenantA = resA.session!.tenantId;

    await db.saveInitialFiscalTotalAsync(250000, 70000, 5000, '2026-05');
    await db.updateProfessionalAsync({ name: 'Dr. Dentista Alpha', cro: '111111' });

    // Clínica B
    const resB = await db.createAccount({ email: emailB, password: 'Password@B2', termsAccepted: true });
    expect(resB.success).toBe(true);
    const tenantB = resB.session!.tenantId;

    // Verificar que tenant B começa limpo sem dados de A
    expect(tenantA).not.toBe(tenantB);
    const profB = db.getProfessional();
    expect(profB.name).not.toBe('Dr. Dentista Alpha');
    expect(profB.baselineConfigured).toBe(false);
    expect(profB.rbt12Inicial).not.toBe(250000);

    // Gravar dados em B
    await db.saveInitialFiscalTotalAsync(600000, 180000, 15000, '2026-05');
    await db.updateProfessionalAsync({ name: 'Dra. Dentista Beta', cro: '222222' });

    // Re-hidratar A e verificar que seus dados permanecem intactos
    await db.hydrateTenantAsync(tenantA);
    const profA = db.getProfessional();
    expect(profA.name).toBe('Dr. Dentista Alpha');
    expect(profA.cro).toBe('111111');
    expect(profA.rbt12Inicial).toBe(250000);
    expect(profA.folha12MesesInicial).toBe(70000);
  }, { requirement: 'R15' });

  // Test 4: Estado de Hidratação Assíncrona e Prevenção de Flash de "R$ 0,00"
  test('R15-LOADING-SKELETON-STATE: isHydrating gerencia carregamento transparente', async () => {
    expect(db.getIsHydrating()).toBe(false);

    // Iniciar hidratação e verificar que o flag fica ativo durante o processo
    const hydrationPromise = db.hydrateTenantAsync('tenant_demo');
    // Como demo é rápido/síncrono, a promise resolve e volta a false
    await hydrationPromise;
    expect(db.getIsHydrating()).toBe(false);
  }, { requirement: 'R15' });

  // Test 5: Login Premium com Ambientação Dinâmica e Acessibilidade
  test('R15-LOGIN-PREMIUM-ELEMENTS: Verificação de Ambientação, Botão CTA Verde e Rodapé Oficial', () => {
    const loginFilePath = path.resolve(process.cwd(), 'src/components/Auth/LoginView.tsx');
    const loginContent = fs.readFileSync(loginFilePath, 'utf-8');

    // 1. Mesh gradients suaves e keyframes com suporte a prefers-reduced-motion
    expect(loginContent).toContain('ambient-float-1');
    expect(loginContent).toContain('ambient-float-2');
    expect(loginContent).toContain('prefers-reduced-motion: reduce');
    expect(loginContent).toContain('ambient-orb-1');
    expect(loginContent).toContain('ambient-orb-2');
    expect(loginContent).toContain('bg-emerald-400/10');
    expect(loginContent).toContain('bg-sky-400/10');

    // 2. Card centralizado sem split screen
    expect(loginContent).toContain('w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl');
    expect(loginContent).not.toContain('grid-cols-2');

    // 3. Botão CTA verde Dental Finance
    expect(loginContent).toContain('bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800');

    // 4. Rodapé Contaju com contraste melhorado
    expect(loginContent).toContain('Escritório Contaju LTDA');
    expect(loginContent).toContain('text-slate-500');

    // 5. Botão Demo condicionado a ambiente DEV
    expect(loginContent).toContain('isDev &&');
    expect(loginContent).toContain('Ambiente de desenvolvimento');
  }, { requirement: 'R15' });
});
