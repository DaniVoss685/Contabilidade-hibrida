import React, { useEffect, useMemo, useState } from 'react';
import { X, Calculator, CreditCard, AlertTriangle } from 'lucide-react';
import { db } from '../../lib/db';
import { ReceivingMode } from '../../types';
import { CustomSelect, CurrencyInput } from '../UI';
import { formatCurrency, formatDateBr } from '../../lib/masks';
import {
  CREDIT_INSTALLMENTS,
  formatFeeRule,
  getActiveBrands,
  getActiveSettlementProfile,
  grossUpCardFee,
  isAnticipationEnabled,
  missingFeeMessage,
  planCardSchedule,
  receivingModeLabel,
  receivingModeOptions,
  resolveReceivingMode,
  simulateCardFee,
} from '../../lib/cardFees';

// Calculadora rápida (somente leitura): mesmo motor da Nova Receita (resolveCardFee/computeFee/planCardSchedule).
// Não cria venda, recebível, paciente nem nenhum registro financeiro.
//
// Dois modos, nunca misturados:
//  RECEBO  → "cobrei R$ X, quanto a clínica recebe líquido?"          (bruto → líquido)
//  COBRAR  → "quero receber R$ X líquido, quanto cobro do paciente?"  (líquido → bruto, gross-up)
type SimulatorMode = 'RECEBO' | 'COBRAR';
const MODE_STORAGE_KEY = 'df_card_simulator_mode_v1';

function readStoredMode(): SimulatorMode {
  try {
    const v = window.localStorage.getItem(MODE_STORAGE_KEY);
    return v === 'RECEBO' ? 'RECEBO' : 'COBRAR';
  } catch {
    return 'COBRAR';
  }
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export const CardFeeSimulatorModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const settings = db.getPreferences().cardFees;
  const brands = useMemo(() => getActiveBrands(settings), [settings, isOpen]);
  const profile = getActiveSettlementProfile(settings);

  const [simMode, setSimMode] = useState<SimulatorMode>(readStoredMode);
  const [amount, setAmount] = useState<number>(0); // bruto (RECEBO) ou líquido desejado (COBRAR)
  const [brandId, setBrandId] = useState<string>('');
  const [mode, setMode] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  const [installments, setInstallments] = useState<number>(1);
  const [receiving, setReceiving] = useState<ReceivingMode>('NORMAL');

  const chooseSimMode = (m: SimulatorMode) => {
    setSimMode(m);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* preferência de conveniência: sem storage, apenas não lembra */
    }
  };

  // Abre sempre com o padrão da clínica pré-selecionado (sem opção "usar padrão").
  useEffect(() => {
    if (!isOpen) return;
    setReceiving(resolveReceivingMode(db.getPreferences().cardFees));
    setBrandId((prev) => (getActiveBrands(db.getPreferences().cardFees).some((b) => b.id === prev) ? prev : ''));
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveBrand = brands.find((b) => b.id === brandId) || brands[0];
  const showReceivingSelect = isAnticipationEnabled(settings);
  const receivingMode: ReceivingMode = showReceivingSelect ? receiving : 'NORMAL';
  const customerInstallments = mode === 'CREDIT' ? installments : 1;
  const feeParams = effectiveBrand
    ? { brandId: effectiveBrand.id, mode, installments: customerInstallments, receivingMode }
    : null;

  // RECEBO: bruto → líquido
  const sim = simMode === 'RECEBO' && feeParams && amount > 0 ? simulateCardFee(settings, { gross: amount, ...feeParams }) : null;
  // COBRAR: líquido desejado → bruto
  const grossUp = simMode === 'COBRAR' && feeParams && amount > 0 ? grossUpCardFee(settings, { netDesired: amount, ...feeParams }) : null;

  const configured = simMode === 'RECEBO' ? Boolean(sim && sim.configured) : Boolean(grossUp && grossUp.configured);
  const rule = simMode === 'RECEBO' ? (sim && sim.configured ? sim.rule : null) : grossUp && grossUp.configured ? grossUp.rule : null;
  const grossForPlan = simMode === 'RECEBO' ? amount : grossUp && grossUp.configured && grossUp.reachable ? grossUp.gross : 0;
  const plan =
    configured && rule && grossForPlan > 0
      ? planCardSchedule({
          gross: grossForPlan,
          rule,
          customerInstallments,
          saleDate: new Date().toISOString().split('T')[0],
          mode: receivingMode,
          profile,
          isCredit: mode === 'CREDIT',
        })
      : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200/80 my-auto max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Simular Taxa do Cartão</h2>
              <p className="text-xs text-slate-500 mt-0.5">Calcule antes de lançar a venda. Nada é gravado.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {/* Modo: dois conceitos, nunca misturados */}
          <div className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold" role="group" aria-label="Modo da simulação">
            {([
              ['RECEBO', 'Quero saber quanto recebo'],
              ['COBRAR', 'Quero saber quanto cobrar'],
            ] as Array<[SimulatorMode, string]>).map(([m, label]) => (
              <button
                key={m}
                type="button"
                data-testid={`sim-mode-${m}`}
                aria-pressed={simMode === m}
                onClick={() => chooseSimMode(m)}
                className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
                  simMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {brands.length === 0 ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Nenhuma bandeira ativa cadastrada. Configure em Configurações → Taxas de Cartão &amp; Maquininha.</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div data-testid="sim-amount">
                  <CurrencyInput
                    label={simMode === 'COBRAR' ? 'Quero receber (líquido)' : 'Valor cobrado do paciente'}
                    value={amount}
                    onChange={setAmount}
                  />
                </div>
                <CustomSelect
                  label="Forma"
                  options={[
                    { value: 'CREDIT', label: 'Cartão de crédito' },
                    { value: 'DEBIT', label: 'Cartão de débito' },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as 'DEBIT' | 'CREDIT')}
                />
                <CustomSelect
                  label="Bandeira"
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  value={effectiveBrand?.id || ''}
                  onChange={setBrandId}
                />
                {mode === 'CREDIT' && (
                  <CustomSelect
                    label="Parcelas"
                    options={CREDIT_INSTALLMENTS.map((n) => ({ value: String(n), label: `${n}x` }))}
                    value={String(installments)}
                    onChange={(v) => setInstallments(Number(v))}
                  />
                )}
                {showReceivingSelect && (
                  <CustomSelect
                    label="Recebimento da clínica"
                    options={receivingModeOptions(profile)}
                    value={receivingMode}
                    onChange={(v) => setReceiving(v as ReceivingMode)}
                  />
                )}
              </div>

              {amount <= 0 ? (
                <p className="text-xs text-slate-500">
                  {simMode === 'COBRAR'
                    ? 'Informe quanto a clínica quer receber para ver o valor a cobrar do paciente.'
                    : 'Informe o valor cobrado para ver quanto a clínica recebe.'}
                </p>
              ) : !configured ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold">
                  {missingFeeMessage(effectiveBrand?.name || 'Bandeira', mode, customerInstallments)} •{' '}
                  {receivingMode === 'ANTICIPATED' ? 'Recebimento antecipado' : 'Recebimento normal'}. Configure em Configurações →
                  Taxas de Cartão &amp; Maquininha.
                </div>
              ) : simMode === 'COBRAR' && grossUp && grossUp.configured && !grossUp.reachable ? (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold">
                  Com a taxa configurada ({formatFeeRule(grossUp.rule)}) não é possível receber esse valor líquido: a taxa consome todo o valor cobrado.
                </div>
              ) : (
                <div className="space-y-3" data-testid="sim-result">
                  <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                    {effectiveBrand?.name} • {mode === 'CREDIT' ? `Crédito • ${installments}x` : 'Débito'} • {receivingModeLabel(receivingMode, profile)}
                  </div>

                  {simMode === 'COBRAR' && grossUp && grossUp.configured && grossUp.reachable ? (
                    <>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="block text-[10px] uppercase font-bold text-slate-500">Você quer receber</span>
                          <span className="text-sm font-bold font-mono text-slate-900" data-testid="sim-net-desired">{formatCurrency(grossUp.netDesired)}</span>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-xl border-2 border-indigo-300 col-span-2 lg:col-span-1">
                          <span className="block text-[10px] uppercase font-bold text-indigo-700">Valor a cobrar</span>
                          <span className="text-lg font-black font-mono text-indigo-950" data-testid="sim-gross">{formatCurrency(grossUp.gross)}</span>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                          <span className="block text-[10px] uppercase font-bold text-rose-700">Taxa estimada</span>
                          <span className="text-sm font-bold font-mono text-rose-700" data-testid="sim-fee">{formatCurrency(grossUp.feeAmount)}</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="block text-[10px] uppercase font-bold text-slate-500">Taxa efetiva</span>
                          <span className="text-sm font-bold font-mono text-slate-900" data-testid="sim-effective-rate">{pct(grossUp.effectiveRatePercent)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3" data-testid="sim-explain">
                        Este valor foi calculado para que, após as taxas selecionadas ({formatFeeRule(grossUp.rule)}), a clínica receba
                        aproximadamente {formatCurrency(grossUp.netDesired)}
                        {mode === 'CREDIT' && installments > 1
                          ? `. O paciente pode pagar em ${installments}x de ${formatCurrency(Math.round((grossUp.gross / installments) * 100) / 100)}.`
                          : '.'}
                      </p>
                    </>
                  ) : sim && sim.configured ? (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="block text-[10px] uppercase font-bold text-slate-500">Valor bruto (paciente paga)</span>
                        <span className="text-sm font-bold font-mono text-slate-900" data-testid="sim-gross">{formatCurrency(sim.gross)}</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="block text-[10px] uppercase font-bold text-slate-500">Taxa aplicada</span>
                        <span className="text-sm font-bold font-mono text-slate-900">{formatFeeRule(sim.rule)}</span>
                      </div>
                      <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                        <span className="block text-[10px] uppercase font-bold text-rose-700">Custo da taxa</span>
                        <span className="text-sm font-bold font-mono text-rose-700" data-testid="sim-fee">− {formatCurrency(sim.feeAmount)}</span>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="block text-[10px] uppercase font-bold text-emerald-800">Líquido para a clínica</span>
                        <span className="text-sm font-black font-mono text-emerald-900" data-testid="sim-net">{formatCurrency(sim.netValue)}</span>
                      </div>
                    </div>
                  ) : null}

                  {plan && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                      <div>
                        <strong>Recebimento:</strong>{' '}
                        {plan.rows.length > 1
                          ? `${plan.rows.length} recebimentos mensais (${formatDateBr(plan.rows[0].dueDate)} → ${formatDateBr(plan.rows[plan.rows.length - 1].dueDate)})`
                          : `${receivingMode === 'ANTICIPATED' ? settlementLabel(profile) : 'conforme a parcela'} — previsto para ${formatDateBr(plan.rows[0].dueDate)}`}
                      </div>
                      <div className="text-slate-500">
                        O líquido é o que a clínica recebe; o paciente paga o valor bruto. Simulação apenas de cálculo — nada é lançado.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end flex-shrink-0 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

function settlementLabel(profile: ReturnType<typeof getActiveSettlementProfile>): string {
  return receivingModeLabel('ANTICIPATED', profile).replace('Antecipado — ', '');
}
