import React, { useState, useMemo } from 'react';
import {
  SlidersHorizontal,
  Calculator,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle,
  AlertTriangle,
  Check,
  Trash2,
  Copy,
  Edit3,
  RotateCcw,
  Plus,
  Info,
  Bookmark,
  Building2,
  Calendar,
  X,
  FileCheck,
  Lock,
  Layers,
  Percent,
} from 'lucide-react';
import {
  Professional,
  PayrollHistoryEntry,
  Sale,
  SavedFiscalScenario,
} from '../../types';
import { formatCurrency, formatPercent } from '../../lib/masks';
import {
  calculateSimplesForParameters,
  getOfficialMinimumWage,
  calculateRollingRbt12,
} from '../../lib/taxEngine';
import { db } from '../../lib/db';
import { CurrencyInput, CustomSelect, ConfirmDialog, useToast } from '../UI';

interface FiscalSimulatorViewProps {
  professional: Professional;
  payrollHistory: PayrollHistoryEntry[];
  sales: Sale[];
  selectedYear: number;
  selectedMonth: number | 'ALL';
  onNavigateTab?: (tab: string) => void;
}

export const FiscalSimulatorView: React.FC<FiscalSimulatorViewProps> = ({
  professional,
  payrollHistory,
  sales,
  selectedYear,
  selectedMonth,
  onNavigateTab,
}) => {
  const toast = useToast();

  // Active Tab: 'current' | 'new_simulation' | 'saved_scenarios'
  const [activeTab, setActiveTab] = useState<'current' | 'new_simulation' | 'saved_scenarios'>('new_simulation');

  // Baseline Data (Situação Atual Oficial do Consultório)
  const baselineData = useMemo(() => {
    const rbt12 = professional.rbt12Inicial || 0;
    let calculatedFs12 = 0;
    if (payrollHistory && payrollHistory.length > 0) {
      const last12 = payrollHistory.slice(-12);
      calculatedFs12 = last12.reduce((acc, curr) => acc + curr.totalPayroll, 0);
    }
    const fs12 = calculatedFs12 > 0 ? calculatedFs12 : (professional.folha12MesesInicial || 0);

    // Faturamento do mês vigente selecionado
    let currentMonthRevenue = 0;
    const yearMonthStr =
      selectedMonth === 'ALL'
        ? `${selectedYear}`
        : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    for (const s of sales) {
      if (s.taxOrigin !== 'CNPJ') continue;
      if (s.serviceDate.startsWith(yearMonthStr)) {
        currentMonthRevenue += s.totalValue;
      }
    }
    const monthlyRevenue = currentMonthRevenue > 0 ? currentMonthRevenue : 0;
    const proLabore = professional.proLaboreMensal || 0;

    const calc = calculateSimplesForParameters(rbt12, fs12, monthlyRevenue, selectedYear);

    return {
      rbt12,
      fs12,
      monthlyRevenue,
      proLabore,
      ...calc,
    };
  }, [professional, payrollHistory, sales, selectedYear, selectedMonth]);

  // Salário Mínimo Oficial Vigente
  const officialMinWage = useMemo(() => {
    return getOfficialMinimumWage(selectedYear);
  }, [selectedYear]);

  // Simulation Mode & Competence
  const [simulationMode, setSimulationMode] = useState<'ISOLATED' | 'ROLLING_RBT12'>('ISOLATED');
  const [simCompetenceMonth, setSimCompetenceMonth] = useState<number>(
    selectedMonth === 'ALL' ? (new Date().getMonth() + 1) : (selectedMonth || (new Date().getMonth() + 1))
  );
  const [simCompetenceYear, setSimCompetenceYear] = useState<number>(selectedYear || new Date().getFullYear());

  const competenceSimulatedStr = `${simCompetenceYear}-${String(simCompetenceMonth).padStart(2, '0')}`;

  // Simulation State (Nova Simulação)
  const [simMonthlyProLabore, setSimMonthlyProLabore] = useState<number>(baselineData.proLabore);
  const [simFs12, setSimFs12] = useState<number>(baselineData.fs12);
  const [simRbt12Base, setSimRbt12Base] = useState<number>(baselineData.rbt12);
  const [simMonthlyRevenue, setSimMonthlyRevenue] = useState<number>(baselineData.monthlyRevenue);

  // Preset ativo de Pró-labore
  const [activePreset, setActivePreset] = useState<'1SM' | '2SM' | '3SM' | 'CUSTOM'>('CUSTOM');

  // Handle Pró-labore change (manual ou por preset)
  const handleProLaboreChange = (val: number, presetType?: '1SM' | '2SM' | '3SM' | 'CUSTOM') => {
    setSimMonthlyProLabore(val);
    const suggestedFs12 = Math.max(val * 12, val);
    setSimFs12(suggestedFs12);
    setActivePreset(presetType || 'CUSTOM');
  };

  // Cálculo da Janela Móvel quando Incorporar ao RBT12 estiver ativo
  const rollingWindowInfo = useMemo(() => {
    return calculateRollingRbt12(
      sales,
      competenceSimulatedStr,
      simMonthlyRevenue,
      simRbt12Base
    );
  }, [sales, competenceSimulatedStr, simMonthlyRevenue, simRbt12Base]);

  // RBT12 efetivo usado na simulação
  const effectiveSimRbt12 = useMemo(() => {
    if (simulationMode === 'ROLLING_RBT12') {
      return rollingWindowInfo.newRbt12;
    }
    return simRbt12Base;
  }, [simulationMode, rollingWindowInfo.newRbt12, simRbt12Base]);

  // Reset simulation to baseline
  const handleResetToBaseline = () => {
    setSimMonthlyProLabore(baselineData.proLabore);
    setSimFs12(baselineData.fs12);
    setSimRbt12Base(baselineData.rbt12);
    setSimMonthlyRevenue(baselineData.monthlyRevenue);
    setSimulationMode('ISOLATED');
    setActivePreset('CUSTOM');
    toast.info('Parâmetros restaurados para a baseline oficial do consultório.');
  };

  // Simulation Calculation Result
  const simulationResult = useMemo(() => {
    return calculateSimplesForParameters(
      effectiveSimRbt12,
      simFs12,
      simMonthlyRevenue,
      selectedYear
    );
  }, [effectiveSimRbt12, simFs12, simMonthlyRevenue, selectedYear]);

  // Comparative Deltas
  const monthlySavingsDelta = useMemo(() => {
    return baselineData.dasEstimated - simulationResult.dasEstimated;
  }, [baselineData.dasEstimated, simulationResult.dasEstimated]);

  const annualSavingsDelta = monthlySavingsDelta * 12;
  const fatorRDeltaPp = simulationResult.fatorRPercent - baselineData.fatorRPercent;
  const effectiveRateDeltaPp = simulationResult.effectiveTaxRate - baselineData.effectiveTaxRate;

  // Saved Scenarios from DB
  const [savedScenarios, setSavedScenarios] = useState<SavedFiscalScenario[]>(() =>
    db.getFiscalScenarios()
  );

  const refreshSavedScenarios = () => {
    setSavedScenarios([...db.getFiscalScenarios()]);
  };

  // Modal: Save Scenario
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaveSuccess, setIsSaveSuccess] = useState(false);
  const [scenarioNameInput, setScenarioNameInput] = useState('');
  const [scenarioDescInput, setScenarioDescInput] = useState('');

  // Modal: Edit / Rename Scenario
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);

  // Modal: Compare Scenarios
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [compareTargetScenario, setCompareTargetScenario] = useState<SavedFiscalScenario | null>(null);
  const [compareSecondaryScenarioId, setCompareSecondaryScenarioId] = useState<string>('BASELINE');

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Action: Open Save Modal
  const handleOpenSaveModal = () => {
    const isIII = simulationResult.isAnexoIII;
    const defaultName = `Pró-labore ${formatCurrency(simMonthlyProLabore)} — ${isIII ? 'Anexo III' : 'Anexo V'}`;
    setScenarioNameInput(defaultName);
    setScenarioDescInput(
      `Simulação com faturamento mensal de ${formatCurrency(simMonthlyRevenue)}, gerando Fator R de ${simulationResult.fatorRPercent.toFixed(1)}% e DAS estimado em ${formatCurrency(simulationResult.dasEstimated)}.`
    );
    setIsSaveSuccess(false);
    setIsSaveModalOpen(true);
  };

  // Action: Save Scenario
  const handleSaveScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenarioNameInput.trim()) {
      toast.warning('Por favor informe um nome para o cenário.');
      return;
    }

    db.addFiscalScenario({
      name: scenarioNameInput.trim(),
      description: scenarioDescInput.trim() || undefined,
      parameters: {
        rbt12: effectiveSimRbt12,
        fs12: simFs12,
        monthlyRevenueNfse: simMonthlyRevenue,
        monthlyProLabore: simMonthlyProLabore,
      },
      results: simulationResult,
    });

    refreshSavedScenarios();
    setIsSaveSuccess(true);
    toast.success('Cenário tributário salvo com sucesso!');
  };

  // Action: Load Scenario into Simulator
  const handleLoadScenarioIntoSimulator = (scen: SavedFiscalScenario) => {
    setSimRbt12Base(scen.parameters.rbt12);
    setSimFs12(scen.parameters.fs12);
    setSimMonthlyRevenue(scen.parameters.monthlyRevenueNfse);
    setSimMonthlyProLabore(scen.parameters.monthlyProLabore);
    setSimulationMode('ISOLATED');
    setActivePreset('CUSTOM');
    setActiveTab('new_simulation');
    toast.info(`Cenário "${scen.name}" carregado no simulador.`);
  };

  // Action: Duplicate Scenario
  const handleDuplicateScenario = (scen: SavedFiscalScenario) => {
    db.addFiscalScenario({
      name: `${scen.name} (Cópia)`,
      description: scen.description,
      parameters: { ...scen.parameters },
      results: { ...scen.results },
    });
    refreshSavedScenarios();
    toast.success('Cenário duplicado com sucesso.');
  };

  // Action: Open Edit Scenario Modal
  const handleOpenEditModal = (scen: SavedFiscalScenario) => {
    setEditingScenarioId(scen.id);
    setScenarioNameInput(scen.name);
    setScenarioDescInput(scen.description || '');
    setIsEditModalOpen(true);
  };

  // Action: Save Edit Scenario
  const handleSaveEditScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScenarioId || !scenarioNameInput.trim()) return;

    db.updateFiscalScenario(editingScenarioId, {
      name: scenarioNameInput.trim(),
      description: scenarioDescInput.trim() || undefined,
    });
    refreshSavedScenarios();
    setIsEditModalOpen(false);
    setEditingScenarioId(null);
    toast.success('Cenário atualizado.');
  };

  // Action: Delete Scenario
  const handleDeleteScenario = (scen: SavedFiscalScenario) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Cenário Salvo',
      message: `Deseja realmente excluir o cenário "${scen.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        db.deleteFiscalScenario(scen.id);
        refreshSavedScenarios();
        toast.success('Cenário excluído.');
      },
    });
  };

  // Action: Apply Scenario to Real System
  const handleApplyScenarioToSystem = (scen: SavedFiscalScenario) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Aplicar Cenário aos Parâmetros Oficiais',
      message: `Atenção: Ao aplicar o cenário "${scen.name}", o Pró-labore oficial do consultório será atualizado para ${formatCurrency(scen.parameters.monthlyProLabore)}, a Folha Inicial para ${formatCurrency(scen.parameters.fs12)} e o RBT12 para ${formatCurrency(scen.parameters.rbt12)}. Deseja continuar?`,
      confirmLabel: 'Aplicar ao Sistema',
      variant: 'primary',
      onConfirm: () => {
        db.applyFiscalScenario(scen);
        toast.success(`Cenário "${scen.name}" aplicado aos parâmetros oficiais com sucesso!`);
        if (onNavigateTab) onNavigateTab('taxes');
      },
    });
  };

  const monthNames = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-xs">
              <SlidersHorizontal className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Central Única de Simulações Fiscais
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 pl-11">
            Ambiente estratégico integrado para modelar Fator R, pró-labore, Anexo III vs. V e projetar economia tributária
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold self-stretch sm:self-auto border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'current'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-teal-600" />
            <span>Situação Atual</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('new_simulation')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'new_simulation'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Nova Simulação</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('saved_scenarios')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'saved_scenarios'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-600" />
            <span>Cenários Salvos</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-bold">
              {savedScenarios.length}
            </span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: SITUAÇÃO ATUAL ================= */}
      {activeTab === 'current' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Main Status Hero */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 border border-indigo-900/50 shadow-md relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 text-slate-200 border border-white/20 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-300" />
                    Parâmetros Vigentes • Competência {selectedYear}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      baselineData.isAnexoIII
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {baselineData.isAnexoIII ? 'Enquadrado no Anexo III' : 'Tributado no Anexo V'}
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-tight text-white">
                  Fator R Atual: {baselineData.fatorRPercent.toFixed(1)}%
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {baselineData.isAnexoIII
                    ? 'Excelente! Sua relação entre folha de salários/pró-labore e faturamento está acima do limite legal de 28%, garantindo a menor alíquota do Simples Nacional.'
                    : 'Atenção! Sua folha acumulada representa menos de 28% do faturamento, gerando tributação majorada pelo Anexo V (a partir de 15,5%). Uma simulação de pró-labore pode gerar grande economia.'}
                </p>
              </div>

              {/* Action Button */}
              <div className="shrink-0 flex flex-col items-start sm:items-end gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    handleResetToBaseline();
                    setActiveTab('new_simulation');
                  }}
                  className="w-full md:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Iniciar Simulação a partir da Base</span>
                </button>
                <span className="text-[11px] text-slate-400">
                  Experimente novos valores sem alterar os dados oficiais
                </span>
              </div>
            </div>

            {/* Progress Bar towards 28% */}
            <div className="mt-6 pt-5 border-t border-white/10">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-300 font-medium">Meta do Fator R (Gatilho Anexo III):</span>
                <span className="font-mono font-bold text-white">
                  {baselineData.fatorRPercent.toFixed(1)}% / 28,0%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    baselineData.isAnexoIII
                      ? 'bg-gradient-to-r from-teal-400 to-emerald-400'
                      : 'bg-gradient-to-r from-amber-500 to-orange-400'
                  }`}
                  style={{ width: `${Math.min(100, (baselineData.fatorRPercent / 28) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Baseline KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                RBT12 Oficial
              </span>
              <div className="mt-1 text-lg font-black text-slate-900 font-mono">
                {formatCurrency(baselineData.rbt12)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Receita bruta acumulada (12m)
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                Folha Anual (FS12)
              </span>
              <div className="mt-1 text-lg font-black text-slate-900 font-mono">
                {formatCurrency(baselineData.fs12)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Folha + encargos + pró-labore (12m)
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                Alíquota Efetiva Vigente
              </span>
              <div className="mt-1 text-lg font-black text-slate-800 font-mono">
                {formatPercent(baselineData.effectiveTaxRate)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Faixa {baselineData.bracketNumber} • {baselineData.effectiveAnnex === 'ANEXO_III' ? 'Anexo III' : 'Anexo V'}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                DAS Estimado no Mês
              </span>
              <div className="mt-1 text-lg font-black text-slate-900 font-mono">
                {formatCurrency(baselineData.dasEstimated)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Sobre faturamento de {formatCurrency(baselineData.monthlyRevenue)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: NOVA SIMULAÇÃO INTERATIVA ================= */}
      {activeTab === 'new_simulation' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Controls and Side-by-Side Comparator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Simulation Controls (5 Cols) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Painel de Ajuste Simulado
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={handleResetToBaseline}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Voltar aos parâmetros vigentes da clínica"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Base</span>
                </button>
              </div>

              {/* 1. Pró-labore Mensal com Presets Rápidos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Pró-labore Mensal Simulado
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Baseline: {formatCurrency(baselineData.proLabore)}
                  </span>
                </div>

                {/* Presets Rápidos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleProLaboreChange(officialMinWage, '1SM')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      activePreset === '1SM'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/15'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>1 SM</span>
                    <span className="block text-[9.5px] font-normal font-mono opacity-80">
                      {formatCurrency(officialMinWage)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProLaboreChange(officialMinWage * 2, '2SM')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      activePreset === '2SM'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/15'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>2 SM</span>
                    <span className="block text-[9.5px] font-normal font-mono opacity-80">
                      {formatCurrency(officialMinWage * 2)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProLaboreChange(officialMinWage * 3, '3SM')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      activePreset === '3SM'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/15'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>3 SM</span>
                    <span className="block text-[9.5px] font-normal font-mono opacity-80">
                      {formatCurrency(officialMinWage * 3)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePreset('CUSTOM')}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      activePreset === 'CUSTOM'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/15'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>Personalizado</span>
                    <span className="block text-[9.5px] font-normal opacity-80">
                      Livre
                    </span>
                  </button>
                </div>

                <CurrencyInput
                  value={simMonthlyProLabore}
                  onChange={(val) => handleProLaboreChange(val, 'CUSTOM')}
                  placeholder="R$ 0,00"
                  required
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="text-[10px] text-slate-400">Salário mínimo ref.: {formatCurrency(officialMinWage)}</span>
                  <button
                    type="button"
                    onClick={() => handleProLaboreChange((baselineData.rbt12 * 0.28) / 12, 'CUSTOM')}
                    className="text-indigo-600 hover:underline font-semibold cursor-pointer text-[10.5px]"
                  >
                    Meta 28%: {formatCurrency((baselineData.rbt12 * 0.28) / 12)}/mês
                  </button>
                </div>
              </div>

              {/* 2. Folha Anual (FS12) */}
              <div className="space-y-1.5">
                <CurrencyInput
                  label="Folha Acumulada 12 Meses (FS12)"
                  value={simFs12}
                  onChange={setSimFs12}
                  required
                />
                <span className="text-[11px] text-slate-400 block">
                  Inclui 12 meses de salários de equipe, encargos e pró-labore
                </span>
              </div>

              {/* 3. Faturamento do Mês & Modo de Simulação RBT12 */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Faturamento Mensal Simulado (NFS-e)
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Baseline: {formatCurrency(baselineData.monthlyRevenue)}
                  </span>
                </div>

                <CurrencyInput
                  value={simMonthlyRevenue}
                  onChange={setSimMonthlyRevenue}
                  required
                />

                {/* Modo de Simulação de Faturamento */}
                <div className="space-y-2 pt-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Modo de Simulação do Faturamento
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSimulationMode('ISOLATED')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left border ${
                        simulationMode === 'ISOLATED'
                          ? 'bg-white border-indigo-400 text-indigo-950 shadow-xs ring-2 ring-indigo-500/15'
                          : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/80'
                      }`}
                    >
                      <span className="block font-bold text-xs">Simulação isolada</span>
                      <span className="text-[10px] font-normal text-slate-500 mt-0.5 block leading-tight">
                        Apenas competência
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSimulationMode('ROLLING_RBT12')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left border ${
                        simulationMode === 'ROLLING_RBT12'
                          ? 'bg-white border-indigo-400 text-indigo-950 shadow-xs ring-2 ring-indigo-500/15'
                          : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/80'
                      }`}
                    >
                      <span className="block font-bold text-xs">Incorporar ao RBT12</span>
                      <span className="text-[10px] font-normal text-slate-500 mt-0.5 block leading-tight">
                        Janela de 12 meses
                      </span>
                    </button>
                  </div>

                  {/* Helper Text Explicativo */}
                  <div className="text-[11px] text-slate-600 pt-1 leading-relaxed">
                    {simulationMode === 'ROLLING_RBT12' ? (
                      <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200/60 text-indigo-950 space-y-1">
                        <p className="font-semibold text-[11px]">
                          Recalcula a janela dos últimos 12 meses considerando esta competência.
                        </p>
                        <p className="text-[10.5px] text-indigo-800">
                          Competência simulada: <strong>{monthNames[simCompetenceMonth]} / {simCompetenceYear}</strong>.
                          Mês que sai da janela: <strong>{rollingWindowInfo.oldestMonth}</strong> ({formatCurrency(rollingWindowInfo.replacedMonthRevenue)}).
                        </p>
                        <p className="text-[10.5px] font-mono font-bold text-indigo-900 pt-0.5">
                          Novo RBT12 resultante: {formatCurrency(effectiveSimRbt12)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-500">
                        Usa o RBT12 atual como base e simula apenas o mês.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. RBT12 Base (quando em simulação isolada) */}
              {simulationMode === 'ISOLATED' && (
                <div className="space-y-1.5">
                  <CurrencyInput
                    label="Receita Bruta Acumulada 12 Meses (RBT12 Base)"
                    value={simRbt12Base}
                    onChange={setSimRbt12Base}
                    required
                  />
                  <span className="text-[11px] text-slate-400 block">
                    Base fixa para apuração da alíquota efetiva
                  </span>
                </div>
              )}

              {/* Action: Save Scenario */}
              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleOpenSaveModal}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                >
                  <Bookmark className="w-4 h-4 text-teal-400" />
                  <span>Salvar Cenário como Snapshot</span>
                </button>
              </div>
            </div>

            {/* Live Comparative Panel (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Resultado Comparativo Superior Explicito */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Resultado Comparativo Superior
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Competência {competenceSimulatedStr}
                  </span>
                </div>

                {/* 4 Comparison Blocks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  {/* Block 1: Fator R */}
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-2">
                    <span className="font-bold text-slate-700 block">Fator R</span>
                    <div className="flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Atual
                        </span>
                        <strong className="font-mono text-slate-700 text-sm">
                          {baselineData.fatorRPercent.toFixed(1)}%
                        </strong>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                      <div className="space-y-0.5 text-right">
                        <span className="text-[10px] text-indigo-600 block uppercase font-bold">
                          Simulado
                        </span>
                        <strong className="font-mono text-indigo-950 text-sm font-black">
                          {simulationResult.fatorRPercent.toFixed(1)}%
                        </strong>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/60 flex justify-end">
                      {fatorRDeltaPp === 0 ? (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          Sem alteração
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-help ${
                            fatorRDeltaPp > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                          title={`Variação de ${fatorRDeltaPp > 0 ? '+' : ''}${fatorRDeltaPp.toFixed(1)} pontos percentuais (p.p.) na razão Folha/Faturamento`}
                        >
                          {fatorRDeltaPp > 0 ? '+' : ''}{fatorRDeltaPp.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Block 2: Enquadramento */}
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-2">
                    <span className="font-bold text-slate-700 block">Enquadramento</span>
                    <div className="flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Atual
                        </span>
                        <strong className="text-slate-700">
                          {baselineData.isAnexoIII ? 'Anexo III (6%)' : 'Anexo V (15,5%)'}
                        </strong>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                      <div className="space-y-0.5 text-right">
                        <span className="text-[10px] text-indigo-600 block uppercase font-bold">
                          Simulado
                        </span>
                        <strong
                          className={`font-black ${
                            simulationResult.isAnexoIII ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {simulationResult.isAnexoIII ? 'Anexo III (6%)' : 'Anexo V (15,5%)'}
                        </strong>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/60 flex justify-end">
                      {baselineData.effectiveAnnex === simulationResult.effectiveAnnex ? (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          Sem alteração
                        </span>
                      ) : simulationResult.isAnexoIII ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Migração para Anexo III
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Perda do Anexo III
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Block 3: Alíquota Efetiva */}
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-2">
                    <span className="font-bold text-slate-700 block">Alíquota Efetiva</span>
                    <div className="flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Atual
                        </span>
                        <strong className="font-mono text-slate-700 text-sm">
                          {formatPercent(baselineData.effectiveTaxRate)}
                        </strong>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                      <div className="space-y-0.5 text-right">
                        <span className="text-[10px] text-indigo-600 block uppercase font-bold">
                          Simulado
                        </span>
                        <strong className="font-mono text-indigo-950 text-sm font-black">
                          {formatPercent(simulationResult.effectiveTaxRate)}
                        </strong>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/60 flex justify-end">
                      {effectiveRateDeltaPp === 0 ? (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          Sem alteração
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            effectiveRateDeltaPp < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {effectiveRateDeltaPp > 0 ? '+' : ''}{effectiveRateDeltaPp.toFixed(2)} p.p.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Block 4: DAS Mensal Projetado */}
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-2">
                    <span className="font-bold text-slate-700 block">DAS Mensal Projetado</span>
                    <div className="flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Atual
                        </span>
                        <strong className="font-mono text-slate-700 text-sm">
                          {formatCurrency(baselineData.dasEstimated)}
                        </strong>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                      <div className="space-y-0.5 text-right">
                        <span className="text-[10px] text-indigo-600 block uppercase font-bold">
                          Simulado
                        </span>
                        <strong className="font-mono text-indigo-950 text-sm font-black">
                          {formatCurrency(simulationResult.dasEstimated)}
                        </strong>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/60 flex justify-end">
                      {monthlySavingsDelta === 0 ? (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          Sem alteração
                        </span>
                      ) : monthlySavingsDelta > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          − {formatCurrency(monthlySavingsDelta)}/mês
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          + {formatCurrency(Math.abs(monthlySavingsDelta))}/mês
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison Table com Cabeçalhos Explícitos */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                    Comparação Lado a Lado Detalhada
                  </span>
                  <span className="text-[11px] text-slate-500">Cálculo Simples Nacional (LC 123)</span>
                </div>

                {/* Explicit Table Headers */}
                <div className="grid grid-cols-3 p-3 bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <span>Indicador Fiscal</span>
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Atual (Oficial)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-indigo-900">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>Simulado</span>
                  </span>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {/* Row 1: Pró-labore */}
                  <div className="grid grid-cols-3 p-3.5 items-center">
                    <span className="text-slate-600 font-medium">Pró-labore Mensal</span>
                    <span className="font-mono text-slate-700 font-semibold bg-slate-50/70 p-1.5 rounded-lg">
                      {formatCurrency(baselineData.proLabore)}
                    </span>
                    <span className="font-mono text-indigo-950 font-bold bg-indigo-50/50 p-1.5 rounded-lg">
                      {formatCurrency(simMonthlyProLabore)}
                    </span>
                  </div>

                  {/* Row 2: FS12 */}
                  <div className="grid grid-cols-3 p-3.5 items-center">
                    <span className="text-slate-600 font-medium">Folha 12 Meses (FS12)</span>
                    <span className="font-mono text-slate-700 bg-slate-50/70 p-1.5 rounded-lg">
                      {formatCurrency(baselineData.fs12)}
                    </span>
                    <span className="font-mono text-indigo-950 font-bold bg-indigo-50/50 p-1.5 rounded-lg">
                      {formatCurrency(simFs12)}
                    </span>
                  </div>

                  {/* Row 3: RBT12 */}
                  <div className="grid grid-cols-3 p-3.5 items-center">
                    <span className="text-slate-600 font-medium">Receita 12m (RBT12)</span>
                    <span className="font-mono text-slate-700 bg-slate-50/70 p-1.5 rounded-lg">
                      {formatCurrency(baselineData.rbt12)}
                    </span>
                    <span className="font-mono text-indigo-950 font-bold bg-indigo-50/50 p-1.5 rounded-lg">
                      {formatCurrency(effectiveSimRbt12)}
                    </span>
                  </div>

                  {/* Row 4: Fator R */}
                  <div className="grid grid-cols-3 p-3.5 items-center">
                    <span className="text-slate-600 font-medium">Fator R Resultante</span>
                    <span className="font-mono font-bold text-slate-700 bg-slate-50/70 p-1.5 rounded-lg">
                      {baselineData.fatorRPercent.toFixed(1)}% ({baselineData.isAnexoIII ? '≥ 28%' : '< 28%'})
                    </span>
                    <span className="bg-indigo-50/50 p-1.5 rounded-lg">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                          simulationResult.isAnexoIII
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {simulationResult.fatorRPercent.toFixed(1)}% (
                        {simulationResult.isAnexoIII ? '≥ 28%' : '< 28%'})
                      </span>
                    </span>
                  </div>

                  {/* Row 5: Enquadramento */}
                  <div className="grid grid-cols-3 p-3.5 items-center">
                    <span className="text-slate-600 font-medium">Anexo de Tributação</span>
                    <span className="font-bold text-slate-700 bg-slate-50/70 p-1.5 rounded-lg">
                      {baselineData.effectiveAnnex === 'ANEXO_III' ? 'Anexo III' : 'Anexo V'}
                    </span>
                    <span
                      className={`font-bold bg-indigo-50/50 p-1.5 rounded-lg ${
                        simulationResult.isAnexoIII ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {simulationResult.effectiveAnnex === 'ANEXO_III'
                        ? 'Anexo III (Favorecido)'
                        : 'Anexo V (Majorado)'}
                    </span>
                  </div>

                  {/* Row 6: Alíquota Efetiva */}
                  <div className="grid grid-cols-3 p-3.5 items-center">
                    <span className="text-slate-600 font-medium">Alíquota Efetiva</span>
                    <span className="font-mono text-slate-700 bg-slate-50/70 p-1.5 rounded-lg">
                      {formatPercent(baselineData.effectiveTaxRate)}
                    </span>
                    <span className="font-mono text-indigo-950 font-bold text-sm bg-indigo-50/50 p-1.5 rounded-lg">
                      {formatPercent(simulationResult.effectiveTaxRate)}
                    </span>
                  </div>

                  {/* Row 7: DAS Estimado */}
                  <div className="grid grid-cols-3 p-4 items-center bg-indigo-50/40 border-t border-indigo-100">
                    <span className="font-bold text-slate-900">DAS Mensal Projetado</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {formatCurrency(baselineData.dasEstimated)}
                    </span>
                    <span className="font-mono font-black text-indigo-950 text-base">
                      {formatCurrency(simulationResult.dasEstimated)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: CENÁRIOS SALVOS ================= */}
      {activeTab === 'saved_scenarios' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Snapshots de Cenários Fiscais Salvos
              </h3>
              <p className="text-xs text-slate-500">
                Compare múltiplos cenários, projete alterações anuais e aplique o modelo escolhido aos parâmetros oficiais
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                handleResetToBaseline();
                setActiveTab('new_simulation');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simular Novo Cenário</span>
            </button>
          </div>

          {savedScenarios.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <Bookmark className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nenhum cenário salvo até o momento.</p>
              <button
                type="button"
                onClick={() => setActiveTab('new_simulation')}
                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Abrir Simulador e Criar Primeiro Cenário
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedScenarios.map((scen) => {
                const isIII = scen.results.effectiveAnnex === 'ANEXO_III';
                return (
                  <div
                    key={scen.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                isIII
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {isIII ? 'Anexo III (6%)' : 'Anexo V (15,5%)'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Fator R: {scen.results.fatorRPercent.toFixed(1)}%
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm mt-1">
                            {scen.name}
                          </h4>
                        </div>

                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(scen.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      {scen.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {scen.description}
                        </p>
                      )}

                      {/* Scenario Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-[10px] text-slate-400 uppercase block font-medium">Pró-labore</span>
                          <span className="font-mono font-bold text-slate-800 mt-0.5 block">
                            {formatCurrency(scen.parameters.monthlyProLabore)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-[10px] text-slate-400 uppercase block font-medium">Alíquota</span>
                          <span className="font-mono font-bold text-indigo-900 mt-0.5 block">
                            {formatPercent(scen.results.effectiveTaxRate)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-[10px] text-slate-400 uppercase block font-medium">DAS Mensal</span>
                          <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                            {formatCurrency(scen.results.dasEstimated)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCompareTargetScenario(scen);
                            setCompareSecondaryScenarioId('BASELINE');
                            setIsCompareModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer flex items-center gap-1"
                          title="Comparar lado a lado"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Comparar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLoadScenarioIntoSimulator(scen)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                          title="Carregar no simulador"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Carregar</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateScenario(scen)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Duplicar cenário"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(scen)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Editar / Renomear"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteScenario(scen)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Excluir cenário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleApplyScenarioToSystem(scen)}
                          className="ml-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                          title="Aplicar aos parâmetros oficiais"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Aplicar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: SALVAR CENÁRIO COMO SNAPSHOT ================= */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {isSaveSuccess ? (
              /* Success Confirmation Banner */
              <div className="p-7 space-y-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                  <Check className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-900">Cenário salvo com sucesso!</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    O snapshot do cenário foi registrado e já está disponível para consultas, comparações e aplicação no sistema.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSaveModalOpen(false);
                      setIsSaveSuccess(false);
                      setActiveTab('saved_scenarios');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    Ver Cenários Salvos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSaveModalOpen(false);
                      setIsSaveSuccess(false);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Continuar simulando
                  </button>
                </div>
              </div>
            ) : (
              /* Form */
              <>
                <div className="px-6 py-4.5 bg-white border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-teal-600" />
                    <span>Salvar Cenário como Snapshot</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsSaveModalOpen(false)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveScenario} className="p-6 space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      Nome do Cenário <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={scenarioNameInput}
                      onChange={(e) => setScenarioNameInput(e.target.value)}
                      placeholder="Ex: Pró-labore R$ 4.554 — Anexo III"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      Observações Estratégicas <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <textarea
                      value={scenarioDescInput}
                      onChange={(e) => setScenarioDescInput(e.target.value)}
                      rows={3}
                      placeholder="Descreva a finalidade desta simulação (ex: planejamento semestral, contratação de ASB)..."
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none font-medium"
                    />
                  </div>

                  {/* Resumo antes de salvar */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs">
                    <span className="font-bold text-slate-700 block pb-1 border-b border-slate-200/60">
                      Resumo da Memória de Cálculo
                    </span>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pró-labore Mensal:</span>
                      <strong className="font-mono text-slate-900">{formatCurrency(simMonthlyProLabore)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fator R:</span>
                      <strong className="font-mono text-slate-900">{simulationResult.fatorRPercent.toFixed(1)}%</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Enquadramento:</span>
                      <strong className={simulationResult.isAnexoIII ? 'text-emerald-700' : 'text-amber-700'}>
                        {simulationResult.effectiveAnnex === 'ANEXO_III' ? 'Anexo III (6%)' : 'Anexo V (15,5%)'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">DAS Estimado:</span>
                      <strong className="font-mono text-indigo-950 font-black">{formatCurrency(simulationResult.dasEstimated)}</strong>
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsSaveModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Salvar Cenário
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: EDITAR CENÁRIO ================= */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4.5 bg-white border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Editar Cenário Salvo</h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditScenario} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nome do Cenário
                </label>
                <input
                  type="text"
                  value={scenarioNameInput}
                  onChange={(e) => setScenarioNameInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Observações
                </label>
                <textarea
                  value={scenarioDescInput}
                  onChange={(e) => setScenarioDescInput(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none font-medium"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-xs cursor-pointer"
                >
                  Atualizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: COMPARADOR AVANÇADO ================= */}
      {isCompareModalOpen && compareTargetScenario && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4.5 bg-white border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Comparador Lado a Lado de Cenários</h3>
                  <span className="text-[11px] text-slate-500">
                    Análise diferencial para tomada de decisão tributária
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCompareModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Secondary Scenario Selector */}
              <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-700">Comparar este cenário com:</span>
                <div className="w-64">
                  <CustomSelect
                    value={compareSecondaryScenarioId}
                    onChange={setCompareSecondaryScenarioId}
                    options={[
                      { value: 'BASELINE', label: 'Situação Atual do Sistema (Oficial)' },
                      ...savedScenarios
                        .filter((s) => s.id !== compareTargetScenario.id)
                        .map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                </div>
              </div>

              {/* Resolution of Secondary Scenario */}
              {(() => {
                const isBaseline = compareSecondaryScenarioId === 'BASELINE';
                const sec = isBaseline
                  ? {
                      name: 'Situação Atual Oficial',
                      parameters: {
                        rbt12: baselineData.rbt12,
                        fs12: baselineData.fs12,
                        monthlyRevenueNfse: baselineData.monthlyRevenue,
                        monthlyProLabore: baselineData.proLabore,
                      },
                      results: {
                        fatorR: baselineData.fatorR,
                        fatorRPercent: baselineData.fatorRPercent,
                        effectiveAnnex: baselineData.effectiveAnnex,
                        effectiveTaxRate: baselineData.effectiveTaxRate,
                        dasEstimated: baselineData.dasEstimated,
                      },
                    }
                  : savedScenarios.find((s) => s.id === compareSecondaryScenarioId) || savedScenarios[0];

                if (!sec) return null;

                const dasDelta = sec.results.dasEstimated - compareTargetScenario.results.dasEstimated;

                return (
                  <div className="space-y-4">
                    {/* Comparative Table */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                      <div className="grid grid-cols-3 bg-slate-100 p-3 font-bold text-slate-700 border-b border-slate-200 uppercase text-[10.5px] tracking-wider">
                        <span>Indicador Fiscal</span>
                        <span>{compareTargetScenario.name}</span>
                        <span>{sec.name}</span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        <div className="grid grid-cols-3 p-3 items-center">
                          <span className="text-slate-500 font-medium">Pró-labore Mensal</span>
                          <span className="font-mono font-bold text-slate-800">
                            {formatCurrency(compareTargetScenario.parameters.monthlyProLabore)}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            {formatCurrency(sec.parameters.monthlyProLabore)}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 items-center bg-slate-50/40">
                          <span className="text-slate-500 font-medium">Folha 12m (FS12)</span>
                          <span className="font-mono text-slate-700">
                            {formatCurrency(compareTargetScenario.parameters.fs12)}
                          </span>
                          <span className="font-mono text-slate-700">
                            {formatCurrency(sec.parameters.fs12)}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 items-center">
                          <span className="text-slate-500 font-medium">RBT12</span>
                          <span className="font-mono text-slate-700">
                            {formatCurrency(compareTargetScenario.parameters.rbt12)}
                          </span>
                          <span className="font-mono text-slate-700">
                            {formatCurrency(sec.parameters.rbt12)}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 items-center bg-slate-50/40">
                          <span className="text-slate-500 font-medium">Fator R</span>
                          <span
                            className={`font-mono font-bold ${
                              compareTargetScenario.results.effectiveAnnex === 'ANEXO_III'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {compareTargetScenario.results.fatorRPercent.toFixed(1)}%
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              sec.results.effectiveAnnex === 'ANEXO_III'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {sec.results.fatorRPercent.toFixed(1)}%
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 items-center">
                          <span className="text-slate-500 font-medium">Enquadramento</span>
                          <span className="font-bold text-slate-900">
                            {compareTargetScenario.results.effectiveAnnex === 'ANEXO_III'
                              ? 'Anexo III (6%)'
                              : 'Anexo V (15,5%)'}
                          </span>
                          <span className="font-bold text-slate-900">
                            {sec.results.effectiveAnnex === 'ANEXO_III'
                              ? 'Anexo III (6%)'
                              : 'Anexo V (15,5%)'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 items-center bg-slate-50/40">
                          <span className="text-slate-500 font-medium">Alíquota Efetiva</span>
                          <span className="font-mono font-bold text-indigo-900">
                            {formatPercent(compareTargetScenario.results.effectiveTaxRate)}
                          </span>
                          <span className="font-mono font-bold text-indigo-900">
                            {formatPercent(sec.results.effectiveTaxRate)}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3.5 items-center bg-indigo-50/40 font-bold">
                          <span className="text-slate-900">DAS Mensal Projetado</span>
                          <span className="font-mono text-indigo-950 text-sm">
                            {formatCurrency(compareTargetScenario.results.dasEstimated)}
                          </span>
                          <span className="font-mono text-indigo-950 text-sm">
                            {formatCurrency(sec.results.dasEstimated)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Comparative Verdict Banner */}
                    <div
                      className={`p-4 rounded-2xl border text-xs ${
                        dasDelta > 0
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                          : dasDelta < 0
                          ? 'bg-rose-50 border-rose-200 text-rose-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <strong className="block font-bold mb-0.5">
                        {dasDelta > 0
                          ? `Vantagem de ${formatCurrency(dasDelta)}/mês no cenário "${compareTargetScenario.name}"`
                          : dasDelta < 0
                          ? `Cenário "${sec.name}" possui custo tributário ${formatCurrency(Math.abs(dasDelta))}/mês menor`
                          : 'Ambos os cenários resultam no mesmo imposto mensal estimado'}
                      </strong>
                      <span className="opacity-85">
                        {dasDelta !== 0 &&
                          `Diferença anual estimada em ${formatCurrency(Math.abs(dasDelta) * 12)}.`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsCompareModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Fechar Comparação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
