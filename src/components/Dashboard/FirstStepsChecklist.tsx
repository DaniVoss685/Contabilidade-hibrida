import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  UserCheck,
  Building,
  Calculator,
  Users,
  Package,
  Activity,
  Receipt,
  Plus,
  Calendar,
  X,
} from 'lucide-react';
import { Professional } from '../../types';
import { NavTab } from '../Layout/Sidebar';
import { db } from '../../lib/db';

interface FirstStepsChecklistProps {
  professional: Professional;
  patientsCount: number;
  suppliesCount: number;
  proceduresCount: number;
  salesCount: number;
  expensesCount: number;
  onNavigateTab: (tab: NavTab, action?: string) => void;
  onOpenNewSale?: () => void;
  onOpenNewExpense?: () => void;
}

export const FirstStepsChecklist: React.FC<FirstStepsChecklistProps> = ({
  professional,
  patientsCount,
  suppliesCount,
  proceduresCount,
  salesCount,
  expensesCount,
  onNavigateTab,
  onOpenNewSale,
  onOpenNewExpense,
}) => {
  // Regras de conclusão das 7 etapas baseadas em dados reais do tenant
  const step1Done = true; // 1. Criar credenciais de acesso (já autenticado)
  const step2Done = Boolean(
    professional.name?.trim() &&
    professional.cro?.trim() &&
    professional.croUf?.trim() &&
    professional.especialidade?.trim()
  ); // 2. Perfil profissional
  const step3Done = Boolean(professional.baselineConfigured); // 3. Histórico fiscal
  const step4Done = patientsCount > 0; // 4. Primeiro paciente
  const step5Done = suppliesCount > 0; // 5. Primeiro insumo
  const step6Done = proceduresCount > 0; // 6. Primeiro procedimento
  const step7Done = salesCount > 0 || expensesCount > 0; // 7. Primeira movimentação

  const steps: {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    icon: React.ComponentType<{ className?: string }>;
    actionLabel: string | null;
    targetTab: NavTab | null;
    targetAction?: string;
    isFinancialActions?: boolean;
  }[] = [
    {
      id: 'step1',
      title: '1. Criar credenciais de acesso',
      description: 'Conta criada e autenticação inicial realizada.',
      completed: step1Done,
      icon: UserCheck,
      actionLabel: null,
      targetTab: null,
    },
    {
      id: 'step2',
      title: '2. Configurar perfil profissional',
      description: 'Nome, Clínica, CRO, UF e Especialidade Principal.',
      completed: step2Done,
      icon: Building,
      actionLabel: 'Configurar Perfil',
      targetTab: 'settings',
    },
    {
      id: 'step3',
      title: '3. Configurar histórico fiscal',
      description: 'Informe os 12 meses anteriores ou início de atividade.',
      completed: step3Done,
      icon: Calculator,
      actionLabel: 'Histórico Fiscal',
      targetTab: 'taxes',
      targetAction: 'configure_fiscal',
    },
    {
      id: 'step4',
      title: '4. Cadastrar primeiro paciente',
      description: 'Cadastre seus pacientes para viabilizar tratamentos e receitas.',
      completed: step4Done,
      icon: Users,
      actionLabel: 'Cadastrar Paciente',
      targetTab: 'patients',
      targetAction: 'new_patient',
    },
    {
      id: 'step5',
      title: '5. Cadastrar primeiro insumo',
      description: 'Cadastre materiais de uso clínico para apuração de custo direto.',
      completed: step5Done,
      icon: Package,
      actionLabel: 'Cadastrar Insumo',
      targetTab: 'supplies',
      targetAction: 'new_supply',
    },
    {
      id: 'step6',
      title: '6. Cadastrar primeiro procedimento',
      description: 'Precifique seus procedimentos por tempo de cadeira e insumos.',
      completed: step6Done,
      icon: Activity,
      actionLabel: 'Cadastrar Procedimento',
      targetTab: 'procedures',
      targetAction: 'new_procedure',
    },
    {
      id: 'step7',
      title: '7. Registrar primeira movimentação',
      description: 'Lance sua primeira receita de atendimento ou despesa da clínica.',
      completed: step7Done,
      icon: Receipt,
      actionLabel: null,
      targetTab: null,
      isFinancialActions: true,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const allCompleted = completedCount === totalSteps;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const tenantKey = professional?.orgId || professional?.id || 'default';
  const storageKey = `df_onboarding_dismissed_${tenantKey}`;
  const collapseKey = `df_onboarding_collapsed_${tenantKey}`;

  // Estado de fechamento manual do checklist
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      const pref = db.getPreferences();
      if (pref.dismissedOnboarding) return true;
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  // Estado de recolhido (persiste a preferência visual do usuário)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(collapseKey);
      if (saved !== null) return saved === 'true';
      return false;
    } catch {
      return false;
    }
  });

  // Sincroniza estado caso as preferências do sistema sejam atualizadas
  useEffect(() => {
    const unsub = db.subscribe(() => {
      const pref = db.getPreferences();
      const stored = localStorage.getItem(storageKey) === 'true';
      setIsDismissed(Boolean(pref.dismissedOnboarding || stored));
    });
    return () => unsub();
  }, [storageKey]);

  const handleToggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem(collapseKey, String(next));
    } catch {}
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, 'true');
      db.updatePreferences({ dismissedOnboarding: true });
    } catch (e) {
      console.warn('Erro ao salvar fechamento do onboarding:', e);
    }
    setIsDismissed(true);
  };

  // 1. Se todas as 7 etapas foram concluídas, o onboarding some completamente
  // 2. Se o usuário fechou manualmente o checklist, ele também não é exibido
  if (allCompleted || isDismissed) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-white p-4 sm:p-5 shadow-2xs transition-all">
      {/* Top bar header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Onboarding Operacional Dental Finance
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {completedCount} de {totalSteps} etapas concluídas ({progressPercent}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Siga a ordem recomendada abaixo para configurar sua clínica e liberar os cálculos automáticos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold shrink-0"
            aria-label={isCollapsed ? 'Expandir checklist' : 'Recolher checklist'}
          >
            <span className="hidden sm:inline text-[11px]">
              {isCollapsed ? 'Expandir' : 'Recolher'}
            </span>
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold shrink-0"
            title="Fechar onboarding"
            aria-label="Fechar onboarding"
          >
            <span className="hidden sm:inline text-[11px]">Fechar</span>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-emerald-600 h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Checklist items when not collapsed */}
      {!isCollapsed && (
        <div className="mt-4 pt-3 border-t border-emerald-100/80 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                    step.completed
                      ? 'bg-white/85 border-emerald-200/80 shadow-2xs'
                      : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Etapa {idx + 1}
                      </span>
                      {step.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                    </div>
                    <h4
                      className={`text-[11px] font-bold leading-snug ${
                        step.completed ? 'text-slate-700 line-through' : 'text-slate-900'
                      }`}
                    >
                      {step.title}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                      {step.description}
                    </p>
                  </div>

                  {/* Standard Action Button */}
                  {step.actionLabel && !step.completed && step.targetTab && (
                    <div className="pt-2 mt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => onNavigateTab(step.targetTab!, step.targetAction)}
                        className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <span>{step.actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Step 7: Financial Actions */}
                  {step.isFinancialActions && !step.completed && (
                    <div className="pt-2 mt-2 border-t border-slate-100 grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenNewSale) onOpenNewSale();
                          else onNavigateTab('sales', 'new_sale');
                        }}
                        className="py-1 px-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] transition-colors text-center cursor-pointer"
                        title="Registrar primeira receita"
                      >
                        + Receita
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenNewExpense) onOpenNewExpense();
                          else onNavigateTab('expenses', 'new_expense');
                        }}
                        className="py-1 px-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] transition-colors text-center cursor-pointer"
                        title="Registrar primeira despesa"
                      >
                        + Despesa
                      </button>
                    </div>
                  )}

                  {/* Completed Badge */}
                  {step.completed && (
                    <div className="pt-2 mt-2 border-t border-emerald-100 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Concluído
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Follow-up Suggestion: Agenda after Patient exists */}
          {patientsCount > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-100/60 border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-[11px] font-medium">
                  <strong>Próximo passo recomendado:</strong> Com pacientes cadastrados, você já pode agendar consultas diretamente na agenda clínica.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('agenda')}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] transition-colors shrink-0 cursor-pointer ml-3"
              >
                Abrir Agenda
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

