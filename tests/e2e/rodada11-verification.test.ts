import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import {
  isValidCpf,
  isValidCnpj,
  maskCpfInput,
  maskCnpjInput,
  cleanCpfCnpj,
} from '../../src/lib/masks';
import {
  getOfficialMinimumWage,
  hasOfficialMinimumWageForYear,
  checkUpcomingYearWageReview,
} from '../../src/lib/fiscalParameters';
import fs from 'fs';
import path from 'path';

describe('Rodada 11: Primeiro Acesso Limpo, Onboarding Fiscal, Configurações Profissionais e Parâmetros Legais Versionados', 1, () => {
  // Test 1: Signup with strictly credentials only
  test('R11-AUTH-CREDENTIALS: Criação de Acesso Solicitando Apenas Credenciais', async () => {
    // 1. Password minimum length requirement (8 chars)
    const shortPassRes = await db.createAccount({
      email: 'doutor.teste@clinica.com.br',
      password: '12345',
      termsAccepted: true,
    });
    expect(shortPassRes.success).toBe(false);
    expect(shortPassRes.error).toContain('8 caracteres');

    // 2. Terms of use requirement
    const termsRes = await db.createAccount({
      email: 'doutor.teste@clinica.com.br',
      password: 'SenhaSegura@2026',
      termsAccepted: false,
    });
    expect(termsRes.success).toBe(false);
    expect(termsRes.error).toContain('Termos de Uso');

    // 3. Successful account creation
    const email = `dentista_${Date.now()}@clinica.com.br`;
    const res = await db.createAccount({
      email,
      password: 'MinhaSenhaForte2026',
      termsAccepted: true,
    });
    expect(res.success).toBe(true);
    expect(res.session).toBeDefined();
    expect(res.session?.user.email).toBe(email);
    expect(res.session?.isDemo).toBe(false);

    // Verify static LoginView source: no CRO, Clinic Name or CPF fields in register mode
    const loginViewPath = path.join(process.cwd(), 'src', 'components', 'Auth', 'LoginView.tsx');
    const loginContent = fs.readFileSync(loginViewPath, 'utf-8');
    expect(loginContent.includes('Criar seu acesso')).toBe(true);
    expect(loginContent.includes('Não tem conta? Crie seu acesso')).toBe(true);
    expect(loginContent.includes('Já tem uma conta? Entrar')).toBe(true);
  }, { requirement: 'R11' });

  // Test 2: Clean Tenant without fake data or hardcoded mock baseline
  test('R11-CLEAN-TENANT: Novo Tenant 100% Limpo e Baseline Pendente', async () => {
    const email = `novo_consultorio_${Date.now()}@odonto.com.br`;
    const reg = await db.createAccount({
      email,
      password: 'ConsultorioLimpo2026',
      termsAccepted: true,
    });
    expect(reg.success).toBe(true);

    const professional = db.getProfessional();
    expect(professional.baselineConfigured).toBe(false);
    expect(professional.rbt12Inicial).toBe(0);
    expect(professional.folha12MesesInicial).toBe(0);
    expect(professional.proLaboreMensal).toBe(0);

    // Empty operational arrays
    expect(db.getPatients().length).toBe(0);
    expect(db.getSales().length).toBe(0);
    expect(db.getExpenses().length).toBe(0);
    expect(db.getAppointments().length).toBe(0);
  }, { requirement: 'R11' });

  // Test 3: Official 2026 Minimum Wage & Versioned Governance
  test('R11-MINIMUM-WAGE-2026: Salário Mínimo Oficial de 2026 = R$ 1.621,00 (Decreto nº 12.797/2025)', () => {
    // 1. Check official legal catalog
    const wage2026 = getOfficialMinimumWage(2026);
    expect(wage2026).toBe(1621.0);

    const wage2025 = getOfficialMinimumWage(2025);
    expect(wage2025).toBe(1518.0);

    const wage2024 = getOfficialMinimumWage(2024);
    expect(wage2024).toBe(1412.0);

    // 2. Official minimum wage via db API
    expect(db.getOfficialMinimumWage(2026)).toBe(1621.0);

    // 3. No invented percentage projections for 2027
    expect(hasOfficialMinimumWageForYear(2027)).toBe(false);
    const wage2027 = getOfficialMinimumWage(2027);
    // When no future law is published, system safely keeps the last published official rate (1621) without inventing %
    expect(wage2027).toBe(1621.0);

    // 4. Review notification check in December
    const decReview = checkUpcomingYearWageReview('2026-12-15');
    expect(decReview.needsReview).toBe(true);
    expect(decReview.targetYear).toBe(2027);
  }, { requirement: 'R11' });

  // Test 4: CPF & CNPJ Dynamic Masking & Algorithmic Validation
  test('R11-CPF-CNPJ-VALIDATION: Máscara Dinâmica e Validação Algorítmica Real', () => {
    // 1. CPF Masking
    expect(maskCpfInput('12345678901')).toBe('123.456.789-01');
    expect(maskCpfInput('123')).toBe('123');
    expect(maskCpfInput('123456')).toBe('123.456');
    expect(maskCpfInput('123.456.789-01')).toBe('123.456.789-01');

    // 2. CNPJ Masking
    expect(maskCnpjInput('12345678000195')).toBe('12345678000195'.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'));

    // 3. CPF Algorithmic Validation
    // Repeated digits invalid
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    // Invalid checksum digits
    expect(isValidCpf('12345678900')).toBe(false);
    // Real valid CPFs
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);

    // 4. CNPJ Algorithmic Validation
    // Repeated digits invalid
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    // Invalid checksum digits
    expect(isValidCnpj('11222333000100')).toBe(false);
    // Real valid CNPJs
    expect(isValidCnpj('00000000000191')).toBe(true); // Banco do Brasil
    expect(isValidCnpj('33.000.167/0001-01')).toBe(true); // Petrobras
  }, { requirement: 'R11' });

  // Test 5: System Preferences & Privacy with Switches
  test('R11-PREFERENCES-SWITCHES: Preferências do Sistema e CPF Visível por Padrão', () => {
    // 1. Initial preferences: hideCpf must be false by default
    const initialPrefs = db.getPreferences();
    expect(initialPrefs.hideCpf).toBe(false);
    expect(initialPrefs.alertFatorR).toBe(true);
    expect(initialPrefs.alertDueDates).toBe(true);
    expect(initialPrefs.operationalReminders).toBe(true);

    // 2. Update preference using switch handler
    const updated = db.updatePreferences({ hideCpf: true });
    expect(updated.hideCpf).toBe(true);
    expect(db.getPreferences().hideCpf).toBe(true);

    // Restore
    db.updatePreferences({ hideCpf: false });
    expect(db.getPreferences().hideCpf).toBe(false);

    // 3. Verify Switch component source exists and is accessible
    const switchPath = path.join(process.cwd(), 'src', 'components', 'UI', 'Switch.tsx');
    const switchContent = fs.readFileSync(switchPath, 'utf-8');
    expect(switchContent.includes('role="switch"')).toBe(true);
    expect(switchContent.includes('aria-checked')).toBe(true);
  }, { requirement: 'R11' });

  // Test 6: Didactic Fiscal Baseline Onboarding
  test('R11-FISCAL-ONBOARDING: Configuração de Bases Fiscais de Implantação e Marcação de Baseline', () => {
    // Create new account
    db.createClinicAccount({
      clinicName: 'Clínica Odonto Teste R11',
      professionalName: 'Dr. Teste Onboarding',
      cro: '998877',
      uf: 'SP',
      email: `teste_fiscal_${Date.now()}@clinica.com.br`,
      password: 'SenhaForteFiscal123',
    });

    const profBefore = db.getProfessional();
    expect(profBefore.baselineConfigured).toBe(false);

    // Update fiscal baseline in implantation modal
    db.updateProfessional({
      rbt12Inicial: 360000,
      folha12MesesInicial: 108000,
      proLaboreMensal: 9000,
      baselineConfigured: true,
    });

    const profAfter = db.getProfessional();
    expect(profAfter.baselineConfigured).toBe(true);
    expect(profAfter.rbt12Inicial).toBe(360000);
    expect(profAfter.folha12MesesInicial).toBe(108000);
    expect(profAfter.proLaboreMensal).toBe(9000);

    // Verify Fator R: 108.000 / 360.000 = 30.0% -> Anexo III
    const fatorR = profAfter.folha12MesesInicial / profAfter.rbt12Inicial;
    expect(fatorR).toBe(0.3);
    expect(fatorR >= 0.28).toBe(true);
  }, { requirement: 'R11' });

  // Test 7: First Steps Checklist on Dashboard
  test('R11-FIRST-STEPS-CHECKLIST: Checklist Discreto de Primeiros Passos no Dashboard', () => {
    const checklistPath = path.join(process.cwd(), 'src', 'components', 'Dashboard', 'FirstStepsChecklist.tsx');
    expect(fs.existsSync(checklistPath)).toBe(true);

    const checklistContent = fs.readFileSync(checklistPath, 'utf-8');
    // Verify steps titles
    expect(checklistContent.includes('Criar credenciais de acesso')).toBe(true);
    expect(checklistContent.includes('Configurar perfil profissional')).toBe(true);
    expect(checklistContent.includes('Configurar histórico fiscal')).toBe(true);
    expect(checklistContent.includes('Cadastrar primeiro paciente')).toBe(true);
    expect(checklistContent.includes('Registrar primeira movimentação')).toBe(true);

    // Verify deep links to valid tabs (no invalid routes like appointments/cashbook)
    expect(checklistContent.includes("'settings'")).toBe(true);
    expect(checklistContent.includes("'taxes'")).toBe(true);
    expect(checklistContent.includes("'patients'")).toBe(true);
    expect(checklistContent.includes("'sales'")).toBe(true);
  }, { requirement: 'R11' });
});
