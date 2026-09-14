import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import { formatDate, formatMonthYear, formatMonthYearShort } from '../../src/lib/masks';
import fs from 'fs';
import path from 'path';

describe('Rodada 13: Onboarding Operacional, Padrão de Competências, Limpeza do Header e Insumos/Procedimentos', 1, () => {
  // Test 1: Header Global Limpo
  test('R13-HEADER-CLEAN: Header Global Não Deve Ter Simular Fator R Nem Toggle de CPF', () => {
    const headerPath = path.join(process.cwd(), 'src', 'components', 'Layout', 'Header.tsx');
    const headerCode = fs.readFileSync(headerPath, 'utf-8');

    // Botão Simular Fator R removido do Header
    expect(headerCode.includes('Simular Fator R')).toBe(false);
    expect(headerCode.includes("onNavigateTab('simulator')")).toBe(false);

    // Toggle de CPF Oculto / Visível removido do Header
    expect(headerCode.includes('CPF Oculto')).toBe(false);
    expect(headerCode.includes('CPF Visível')).toBe(false);
    expect(headerCode.includes('toggleCpfVisibility')).toBe(false);
  }, { requirement: 'R13' });

  // Test 2: Padrão Central de Datas e Competências
  test('R13-DATE-FORMATTERS: Formatadores Centrais de Datas e Competências sem Vazamento ISO', () => {
    // 1. formatDate DD/MM/AAAA
    expect(formatDate('2026-09-11')).toBe('11/09/2026');
    expect(formatDate('2025-01-05')).toBe('05/01/2025');
    expect(formatDate('')).toBe('—');

    // 2. formatMonthYear (Títulos e controles: Mês por extenso de AAAA)
    expect(formatMonthYear('2026-09')).toBe('Setembro de 2026');
    expect(formatMonthYear('2026-01')).toBe('Janeiro de 2026');
    expect(formatMonthYear('2025-12')).toBe('Dezembro de 2025');

    // 3. formatMonthYearShort (Tabelas e janela móvel: MM/AAAA)
    expect(formatMonthYearShort('2026-09')).toBe('09/2026');
    expect(formatMonthYearShort('2026-01')).toBe('01/2026');
    expect(formatMonthYearShort('2025-12')).toBe('12/2025');
  }, { requirement: 'R13' });

  // Test 3: Eliminação de Tela Branca no Onboarding
  test('R13-ONBOARDING-NO-WHITE-SCREEN: Checklist Usa Rotas Válidas Sem Rotas Fantasmas', () => {
    const checklistPath = path.join(process.cwd(), 'src', 'components', 'Dashboard', 'FirstStepsChecklist.tsx');
    const checklistCode = fs.readFileSync(checklistPath, 'utf-8');

    // Não deve conter referências a abas inexistentes que quebravam com tela branca
    expect(checklistCode.includes("'appointments'")).toBe(false);
    expect(checklistCode.includes("'cashbook'")).toBe(false);

    // Deve usar as rotas reais do sistema
    expect(checklistCode.includes("'patients'")).toBe(true);
    expect(checklistCode.includes("'supplies'")).toBe(true);
    expect(checklistCode.includes("'procedures'")).toBe(true);
    expect(checklistCode.includes("'taxes'")).toBe(true);
    expect(checklistCode.includes("'sales'")).toBe(true);
    expect(checklistCode.includes("'expenses'")).toBe(true);
  }, { requirement: 'R13' });

  // Test 4: Sequência Lógica do Onboarding Operacional
  test('R13-ONBOARDING-REAL-DATA-FLOW: Sequência de Dependências Reais e Contagens do DB', () => {
    const checklistPath = path.join(process.cwd(), 'src', 'components', 'Dashboard', 'FirstStepsChecklist.tsx');
    const checklistCode = fs.readFileSync(checklistPath, 'utf-8');

    // Paciente deve vir antes de procedimentos e agendamentos
    const posPatient = checklistCode.indexOf('Cadastrar primeiro paciente');
    const posSupply = checklistCode.indexOf('Cadastrar primeiro insumo');
    const posProcedure = checklistCode.indexOf('Cadastrar primeiro procedimento');
    const posFinancial = checklistCode.indexOf('Registrar primeira movimentação');

    expect(posPatient).toBeGreaterThan(-1);
    expect(posSupply).toBeGreaterThan(posPatient);
    expect(posProcedure).toBeGreaterThan(posSupply);
    expect(posFinancial).toBeGreaterThan(posProcedure);

    // DashboardView deve repassar contagens reais
    const dashboardPath = path.join(process.cwd(), 'src', 'components', 'Dashboard', 'DashboardView.tsx');
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    expect(dashboardCode.includes('suppliesCount={suppliesCount}')).toBe(true);
    expect(dashboardCode.includes('proceduresCount={proceduresCount}')).toBe(true);
    expect(dashboardCode.includes('db.getClinicalInputs().length')).toBe(true);
    expect(dashboardCode.includes('db.getProcedures().length')).toBe(true);
  }, { requirement: 'R13' });

  // Test 5: Novo Procedimento sem Insumo Fictício e com Empty State Claro
  test('R13-PROCEDURE-NO-DEFAULT-SUPPLY: Procedimento Inicia Sem Insumos Pré-preenchidos', () => {
    const procedureModalPath = path.join(process.cwd(), 'src', 'components', 'Modals', 'ProcedureModal.tsx');
    const modalCode = fs.readFileSync(procedureModalPath, 'utf-8');

    // Não deve conter o insumo fake default
    expect(modalCode.includes('Kit Biossegurança Descartável')).toBe(false);
    expect(modalCode.includes('initialProcedure?.inputs || []')).toBe(true);

    // Deve conter o empty state com as 3 ações
    expect(modalCode.includes('Nenhum insumo adicionado')).toBe(true);
    expect(modalCode.includes('Adicione materiais utilizados neste procedimento para calcular o custo direto.')).toBe(true);
    expect(modalCode.includes('Selecionar do Catálogo')).toBe(true);
    expect(modalCode.includes('+ Novo Insumo')).toBe(true);
    expect(modalCode.includes('+ Item Avulso')).toBe(true);
  }, { requirement: 'R13' });

  // Test 6: UX de Insumos Arejada e Confirmação de Sucesso com Concluir / Cadastrar Outro
  test('R13-SUPPLY-MODAL-UX-SUCCESS: Insumos com Seletor Arejado e Opções de Sucesso', () => {
    const inputModalPath = path.join(process.cwd(), 'src', 'components', 'Modals', 'ClinicalInputModal.tsx');
    const inputCode = fs.readFileSync(inputModalPath, 'utf-8');

    // As 6 unidades de uso organizadas com cards e descrições claras
    expect(inputCode.includes("unit: 'tubete', label: 'Tubete'")).toBe(true);
    expect(inputCode.includes("unit: 'ml', label: 'Mililitro (ml)'")).toBe(true);
    expect(inputCode.includes("unit: 'g', label: 'Grama (g)'")).toBe(true);
    expect(inputCode.includes("unit: 'un', label: 'Unidade (un)'")).toBe(true);
    expect(inputCode.includes("unit: 'dose', label: 'Dose / Aplicação'")).toBe(true);
    expect(inputCode.includes("unit: 'kit', label: 'Kit descartável'")).toBe(true);

    // Confirmação de Sucesso com Concluir e Cadastrar outro
    expect(inputCode.includes('primaryActionLabel="Concluir"')).toBe(true);
    expect(inputCode.includes("label: 'Cadastrar outro'")).toBe(true);
    expect(inputCode.includes('resetForm()')).toBe(true);
  }, { requirement: 'R13' });

  // Test 7: TaxesView com Datas Formatadas e Suporte a Deep Links
  test('R13-TAXES-COMPETENCE-FORMAT: Formatação de Competência em TaxesView e Deep Link de Bases', () => {
    const taxesPath = path.join(process.cwd(), 'src', 'components', 'Taxes', 'TaxesView.tsx');
    const taxesCode = fs.readFileSync(taxesPath, 'utf-8');

    // Usa os formatadores centrais
    expect(taxesCode.includes('formatMonthYear(competenceStr)')).toBe(true);
    expect(taxesCode.includes('formatMonthYearShort(')).toBe(true);

    // Suporte a abertura automática do modal de bases fiscais
    expect(taxesCode.includes('initialOpenBasesModal')).toBe(true);
    expect(taxesCode.includes('setIsBasesModalOpen(true)')).toBe(true);
  }, { requirement: 'R13' });
});
