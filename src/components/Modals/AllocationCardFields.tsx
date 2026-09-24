import React from 'react';
import { CreditCard } from 'lucide-react';
import { CustomSelect } from '../UI';
import { formatCurrency, formatDateBr } from '../../lib/masks';
import { CardFeeSettings, PaymentMethod, ReceivingMode } from '../../types';
import {
  formatFeeRule,
  getActiveBrands,
  getActiveSettlementProfile,
  isAnticipationEnabled,
  missingFeeMessage,
  receivingModeLabel,
  receivingModeOptions,
  settlementProfileLabel,
} from '../../lib/cardFees';
import { AllocationEvaluation, AllocationRow } from '../../lib/salePayments';

// Campos de cartão de UMA alocação do pagamento dividido (bandeira, parcelas, recebimento, taxa, líquido).
// Cada alocação tem estado próprio: nada é copiado do outro pagamento.
export const AllocationCardFields: React.FC<{
  method: PaymentMethod;
  amount: number;
  ev: AllocationEvaluation;
  rows: AllocationRow[] | null;
  settings: CardFeeSettings | undefined;
  brandId: string;
  brandName?: string;
  onBrand: (id: string) => void;
  installments: number;
  onInstallments: (n: number) => void;
  receivingOverride: ReceivingMode | '';
  onReceiving: (m: ReceivingMode) => void;
  locked?: boolean;
}> = ({ method, amount, ev, rows, settings, brandId, brandName, onBrand, installments, onInstallments, receivingOverride, onReceiving, locked }) => {
  const brands = getActiveBrands(settings);
  const profile = getActiveSettlementProfile(settings);
  const selected = brands.find((b) => b.id === brandId);
  const showReceiving = isAnticipationEnabled(settings) || Boolean(receivingOverride);
  const label = selected?.name || brandName || 'Bandeira';
  const missingMsg =
    ev.missing && (brandId || brands.length === 0)
      ? `${missingFeeMessage(label, ev.mode, ev.customerInstallments)} • ${ev.receivingMode === 'ANTICIPATED' ? `Recebimento antecipado (${settlementProfileLabel(profile)})` : 'Recebimento normal (sem antecipação)'}`
      : null;

  return (
    <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-indigo-600" />
        <span className="font-bold text-xs text-slate-900">
          {method === 'CARTAO_DEBITO' ? 'Cartão de Débito' : `Cartão de Crédito (${installments}x)`} — sobre {formatCurrency(amount)}
        </span>
      </div>

      {method === 'CARTAO_CREDITO' && (
        <div className="max-w-xs">
          <CustomSelect
            label="Quantidade de Parcelas"
            options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
              value: String(n),
              label: n === 1 ? '1x À vista' : `${n}x de ${formatCurrency(amount / n)}`,
            }))}
            value={String(installments)}
            onChange={(v) => onInstallments(parseInt(v, 10))}
          />
        </div>
      )}

      <div className="max-w-xs">
        <CustomSelect
          label="Bandeira do cartão *"
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          value={brandId}
          onChange={onBrand}
          placeholder={brands.length === 0 ? 'Nenhuma bandeira cadastrada' : 'Selecione a bandeira...'}
        />
      </div>

      {showReceiving && (
        <div className="max-w-xs">
          <CustomSelect
            label="Recebimento da clínica"
            options={receivingModeOptions(profile)}
            value={ev.receivingMode}
            onChange={(v) => {
              if (!locked) onReceiving(v as ReceivingMode);
            }}
          />
          {locked && <p className="text-[10px] text-slate-500 mt-1">Parcelas já recebidas: o modo não pode ser alterado.</p>}
        </div>
      )}

      {missingMsg && (
        <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-900 font-semibold">
          {missingMsg}. Configure em Configurações → Taxas de Cartão &amp; Maquininha.
        </div>
      )}

      {ev.feeRule && rows && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
          <div className="p-2.5 bg-white rounded-xl border border-slate-200">
            <span className="block text-[10px] text-slate-500 font-sans">Taxa</span>
            <span className="font-bold text-slate-800 text-xs">{formatFeeRule(ev.feeRule)}</span>
          </div>
          <div className="p-2.5 bg-white rounded-xl border border-slate-200">
            <span className="block text-[10px] text-slate-500 font-sans">Taxa em reais</span>
            <span className="font-bold text-rose-600 text-xs">− {formatCurrency(ev.feeAmount)}</span>
          </div>
          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
            <span className="block text-[10px] text-emerald-800 font-sans font-bold">Líquido a receber</span>
            <span className="font-black text-emerald-900 text-xs">{formatCurrency(ev.netValue)}</span>
          </div>
          <div className="p-2.5 bg-white rounded-xl border border-slate-200">
            <span className="block text-[10px] text-slate-500 font-sans">
              {rows.length > 1 ? `${rows.length} recebimentos` : 'Data prevista'}
            </span>
            <span className="font-bold text-slate-800 text-xs">
              {rows.length > 1
                ? `${formatDateBr(rows[0].dueDate)} → ${formatDateBr(rows[rows.length - 1].dueDate)}`
                : formatDateBr(rows[0].dueDate)}
            </span>
          </div>
        </div>
      )}
      {ev.feeRule && (
        <p className="text-[10.5px] text-slate-500">{receivingModeLabel(ev.receivingMode, profile)}</p>
      )}
    </div>
  );
};
