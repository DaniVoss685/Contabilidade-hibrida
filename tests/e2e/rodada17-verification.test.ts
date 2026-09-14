import { describe, test, expect } from './harness/testHarness';
import { SupabaseService } from '../../src/lib/supabaseClient';
import { db, pruneLocalStorage } from '../../src/lib/db';
import { Professional } from '../../src/types';
import fs from 'fs';
import path from 'path';

describe('Rodada 17: Correção Definitiva de Persistência 409 + Login Premium V2', 1, () => {
  // Test 1: Ausência de Erro 409 em saveProfessional e Foreign Key garantida
  test('R17-PERSISTENCE-FOREIGN-KEY-RESOLVED: ensureTenantExists previne 409 Conflict', async () => {
    const dynamicTenant = `clinic_r17_fk_${Date.now()}`;
    const testProf: Professional = {
      id: `prof_${dynamicTenant}`,
      orgId: `org_${dynamicTenant}`,
      name: 'Dr. Teste FK R17',
      cpf: '000.000.000-00',
      cro: '12345',
      croUf: 'SP',
      cnpj: '00.000.000/0001-00',
      razaoSocial: 'Clínica FK Teste',
      nomeFantasia: 'FK Teste',
      municipio: 'São Paulo - SP',
      regimeTributario: 'SIMPLES_NACIONAL',
      optanteSimples: true,
      dataAbertura: '2026-01-01',
      rbt12Inicial: 296000,
      folha12MesesInicial: 73210.56,
      proLaboreMensal: 3242,
      baselineConfigured: true,
      fiscalSourceType: 'MANUAL_TOTAL',
      fiscalSnapshots: [],
      initialFiscalHistory: [],
      uf: 'SP',
      numDependentes: 0,
      inssProprioMensal: 0,
      outrosRendimentosTributaveis: 0,
    };

    // Chamada em tenant que ainda não existia em df_tenants:
    // Deve criar automaticamente o tenant pai e salvar o professional com 201/200, sem 409 Conflict
    const res = await SupabaseService.saveProfessional(testProf, dynamicTenant);
    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();

    // Validar que o registro pai em df_tenants realmente foi criado
    const allClinics = await SupabaseService.getAllClinics();
    const createdClinic = allClinics.find((c) => c.id === dynamicTenant);
    expect(createdClinic).toBeDefined();
  }, { requirement: 'R17' });

  // Test 2: Persistência Real e Exata dos Valores Solicitados no Supabase
  test('R17-PERSISTENCE-VALUES-EXACT: RBT12 R$ 296k, FS12 R$ 73.210,56, Pró-labore R$ 3.242', async () => {
    const tenantId = `clinic_r17_exact_${Date.now()}`;
    const prof: Professional = {
      id: `prof_${tenantId}`,
      orgId: `org_${tenantId}`,
      name: 'Dr. Persistência Exata',
      cpf: '111.222.333-44',
      cro: '54321',
      croUf: 'SP',
      cnpj: '11.222.333/0001-44',
      razaoSocial: 'Clínica Exata Ltda',
      nomeFantasia: 'Odonto Exata',
      municipio: 'São Paulo - SP',
      regimeTributario: 'SIMPLES_NACIONAL',
      optanteSimples: true,
      dataAbertura: '2025-01-01',
      rbt12Inicial: 296000,
      folha12MesesInicial: 73210.56,
      proLaboreMensal: 3242,
      baselineConfigured: true,
      fiscalSourceType: 'MANUAL_TOTAL',
      fiscalSnapshots: [
        {
          competence: '2026-03',
          rbt12: 296000,
          fs12: 73210.56,
          sourceType: 'MANUAL_TOTAL',
          updatedAt: new Date().toISOString(),
        },
      ],
      initialFiscalHistory: [],
      uf: 'SP',
      numDependentes: 0,
      inssProprioMensal: 0,
      outrosRendimentosTributaveis: 0,
    };

    const res = await SupabaseService.saveProfessional(prof, tenantId);
    expect(res.success).toBe(true);

    const fetched = await SupabaseService.fetchProfessional(tenantId);
    expect(fetched).not.toBeNull();
    expect(fetched?.rbt12Inicial).toBe(296000);
    expect(fetched?.folha12MesesInicial).toBe(73210.56);
    expect(fetched?.proLaboreMensal).toBe(3242);
    expect(fetched?.fiscalSourceType).toBe('MANUAL_TOTAL');
    expect(fetched?.baselineConfigured).toBe(true);
  }, { requirement: 'R17' });

  // Test 3: Ciclo Completo de UPDATE no Supabase
  test('R17-PERSISTENCE-UPDATE-CYCLE: Alteração e UPDATE subsequente das bases', async () => {
    const tenantId = `clinic_r17_update_${Date.now()}`;
    const prof: Professional = {
      id: `prof_${tenantId}`,
      orgId: `org_${tenantId}`,
      name: 'Dr. Ciclo Update',
      cpf: '',
      cro: '12345',
      croUf: 'SP',
      cnpj: '',
      razaoSocial: 'Clínica Update Ltda',
      nomeFantasia: 'Update Odonto',
      municipio: 'São Paulo - SP',
      regimeTributario: 'SIMPLES_NACIONAL',
      optanteSimples: true,
      dataAbertura: '2025-01-01',
      rbt12Inicial: 296000,
      folha12MesesInicial: 73210.56,
      proLaboreMensal: 3242,
      baselineConfigured: true,
      fiscalSourceType: 'MANUAL_TOTAL',
      fiscalSnapshots: [],
      initialFiscalHistory: [],
      uf: 'SP',
      numDependentes: 0,
      inssProprioMensal: 0,
      outrosRendimentosTributaveis: 0,
    };

    await SupabaseService.saveProfessional(prof, tenantId);

    // Atualização com novos valores
    const updatedProf: Professional = {
      ...prof,
      rbt12Inicial: 315000,
      folha12MesesInicial: 78500,
      proLaboreMensal: 3500,
    };

    const updateRes = await SupabaseService.saveProfessional(updatedProf, tenantId);
    expect(updateRes.success).toBe(true);

    const fetched = await SupabaseService.fetchProfessional(tenantId);
    expect(fetched?.rbt12Inicial).toBe(315000);
    expect(fetched?.folha12MesesInicial).toBe(78500);
    expect(fetched?.proLaboreMensal).toBe(3500);
  }, { requirement: 'R17' });

  // Test 4: Resiliência a Quota do LocalStorage e Auto-limpeza
  test('R17-QUOTA-EXCEEDED-RESILIENCE: pruneLocalStorage limpa dados obsoletos sem corromper sessão ativa', () => {
    // Simular chaves antigas de outros tenants no localStorage
    localStorage.setItem('df_clinic_old_test_1_df_sales_v1', JSON.stringify([{ id: 1 }]));
    localStorage.setItem('df_clinic_old_test_2_df_expenses_v1', JSON.stringify([{ id: 2 }]));

    pruneLocalStorage('tenant_current_active');

    // As chaves de outros tenants devem ter sido removidas
    expect(localStorage.getItem('df_clinic_old_test_1_df_sales_v1')).toBeNull();
    expect(localStorage.getItem('df_clinic_old_test_2_df_expenses_v1')).toBeNull();
  }, { requirement: 'R17' });

  // Test 5: Verificação dos Elementos Visuais do Login Premium V2
  test('R17-LOGIN-PREMIUM-V2-ELEMENTS: Layout Centrado, Vidro Luxo, Orbes, Grid de Dados e Badge Contábil', () => {
    const loginFilePath = path.resolve(process.cwd(), 'src/components/Auth/LoginView.tsx');
    const loginContent = fs.readFileSync(loginFilePath, 'utf-8');

    // 1. Layout centrado sem split-screen
    expect(loginContent).not.toContain('grid-cols-2');
    expect(loginContent).not.toContain('lg:w-1/2');

    // 2. Card com acabamento de vidro luxo e respiro vertical
    expect(loginContent).toContain('w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl');

    // 3. Top Badge indicando especialidade contábil-odontológica
    expect(loginContent).toContain('Contabilidade Híbrida Odontológica');

    // 4. Ambientação dinâmica com orbes perceptíveis e suporte a reduced motion
    expect(loginContent).toContain('ambient-orb-1');
    expect(loginContent).toContain('ambient-orb-2');
    expect(loginContent).toContain('ambient-orb-3');
    expect(loginContent).toContain('prefers-reduced-motion: reduce');

    // 5. Camada sutil de dados geométricos
    expect(loginContent).toContain('df-data-grid');
    expect(loginContent).toContain('strokeDasharray');

    // 6. Botão CTA esmeralda com transições refinadas
    expect(loginContent).toContain('bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800');
    expect(loginContent).toContain('active:scale-[0.99]');

    // 7. Rodapé oficial do Escritório Contaju
    expect(loginContent).toContain('© 2026 Escritório Contaju LTDA — CNPJ 66.281.288/0001-28');
    expect(loginContent).toContain('Todos os direitos reservados.');
  }, { requirement: 'R17' });
});
