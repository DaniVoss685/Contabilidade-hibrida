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
export const CardFeeSimulatorModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const settings = db.getPreferences().cardFees;
  const brands = useMemo(() => getActiveBrands(settings), [settings, isOpen]);
  const profile = getActiveSettlementProfile(settings);

  const [gross, setGross] = useState<number>(0);
  const [brandId, setBrandId] = useState<string>('');
  const [mode, setMode] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  const [installments, setInstallments] = useState<number>(1);
  const [receiving, setReceiving] = useState<ReceivingMode>('NORMAL');

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

  const sim =
    effectiveBrand && gross > 0
      ? simulateCardFee(settings, {
          gross,
          brandId: effectiveBrand.id,
          mode,
          installments: customerInstallments,
          receivingMode,
        })
      : null;
  const plan =
    sim && sim.configured
      ? planCardSchedule({
          gross,
          rule: sim.rule,
          customerInstallments,
          saleDate: new Date().toISOString().split('T')[0],
          mode: receivingMode,
          profile,
          isCredit: mode === 'CREDIT',
        })
      : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200/80 my-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Simular Taxa do Cartão</h2>
              <p className="text-xs text-slate-500 mt-0.5">Veja quanto a clínica recebe líquido antes de lançar a venda.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {brands.length === 0 ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Nenhuma bandeira ativa cadastrada. Configure em Configurações → Taxas de Cartão &amp; Maquininha.</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CurrencyInput label="Valor da venda" value={gross} onChange={setGross} />
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

              {gross <= 0 ? (
                <p className="text-xs text-slate-500">Informe o valor da venda para ver a simulação.</p>
              ) : sim && sim.configured && plan ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                    {effectiveBrand?.name} • {mode === 'CREDIT' ? `Crédito • ${installments}x` : 'Débito'} • {receivingModeLabel(receivingMode, profile)}
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="block text-[10px] uppercase font-bold text-slate-500">Valor bruto (paciente paga)</span>
                      <span className="text-sm font-bold font-mono text-slate-900">{formatCurrency(sim.gross)}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="block text-[10px] uppercase font-bold text-slate-500">Taxa aplicada</span>
                      <span className="text-sm font-bold font-mono text-slate-900">{formatFeeRule(sim.rule)}</span>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                      <span className="block text-[10px] uppercase font-bold text-rose-700">Custo da taxa</span>
                      <span className="text-sm font-bold font-mono text-rose-700">− {formatCurrency(sim.feeAmount)}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="block text-[10px] uppercase font-bold text-emerald-800">Líquido para a clínica</span>
                      <span className="text-sm font-black font-mono text-emerald-900">{formatCurrency(sim.netValue)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                    <div>
                      <strong>Recebimento:</strong>{' '}
                      {plan.rows.length > 1
                        ? `${plan.rows.length} recebimentos mensais (${formatDateBr(plan.rows[0].dueDate)} → ${formatDateBr(plan.rows[plan.rows.length - 1].dueDate)})`
                        : `${receivingMode === 'ANTICIPATED' ? settlementLabel(profile) : 'conforme a parcela'} — previsto para ${formatDateBr(plan.rows[0].dueDate)}`}
                    </div>
                    <div className="text-slate-500">
                      O líquido é o que a clínica recebe; o paciente continua pagando o valor bruto. Simulação apenas de cálculo — nada é lançado.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold">
                  {missingFeeMessage(effectiveBrand?.name || 'Bandeira', mode, customerInstallments)} •{' '}
                  {receivingMode === 'ANTICIPATED' ? 'Recebimento antecipado' : 'Recebimento normal'}. Configure em Configurações →
                  Taxas de Cartão &amp; Maquininha.
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
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
