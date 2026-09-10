import React, { useState } from 'react';
import {
  X,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Building,
  User,
} from 'lucide-react';
import { db } from '../../lib/db';
import {
  AccountReceivableItem,
  PaymentMethod,
  BankAccount,
  ReceitaSaudeStatus,
} from '../../types';
import { formatCurrency, formatDateBr } from '../../lib/masks';

interface SettlePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: AccountReceivableItem | null;
  bankAccounts: BankAccount[];
  onSettled?: () => void;
}

export const SettlePaymentModal: React.FC<SettlePaymentModalProps> = ({
  isOpen,
  onClose,
  item,
  bankAccounts,
  onSettled,
}) => {
  if (!isOpen || !item) return null;

  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [amountReceived, setAmountReceived] = useState<number>(item.balance || item.value);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [bankAccountId, setBankAccountId] = useState<string>(
    item.taxOrigin === 'CPF'
      ? bankAccounts.find((b) => b.accountType === 'CORRENTE_PF')?.id || bankAccounts[0]?.id || ''
      : bankAccounts.find((b) => b.accountType === 'CORRENTE_PJ')?.id || bankAccounts[0]?.id || ''
  );

  // CPF Receita Saúde handling
  const isCpf = item.taxOrigin === 'CPF';
  const [receitaSaudeId, setReceitaSaudeId] = useState<string>(
    item.receitaSaudeId || `RS-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [markAsEmitted, setMarkAsEmitted] = useState<boolean>(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (amountReceived <= 0) {
      alert('O valor recebido deve ser maior que zero.');
      return;
    }

    const receitaStatus: ReceitaSaudeStatus | undefined = isCpf
      ? markAsEmitted
        ? 'EMITIDO'
        : 'A_EMITIR'
      : undefined;

    db.settleInstallment(
      item.saleId,
      item.installmentId,
      paymentDate,
      amountReceived,
      paymentMethod,
      bankAccountId,
      isCpf && markAsEmitted ? receitaSaudeId.trim() : undefined,
      receitaStatus
    );

    if (onSettled) onSettled();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold">Registrar Recebimento de Parcela</h2>
              <p className="text-xs text-slate-400">
                Parcela {item.installmentNumber} de {item.totalInstallments} • {item.taxOrigin}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Summary Box */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between font-bold text-slate-800">
              <span>Paciente:</span>
              <span>{item.patientName}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Procedimento:</span>
              <span>{item.procedureName}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Vencimento Original:</span>
              <span>{formatDateBr(item.dueDate)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-slate-200">
              <span>Saldo a Receber:</span>
              <span className="text-emerald-700">{formatCurrency(item.balance || item.value)}</span>
            </div>
          </div>

          {/* Settle Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data do Recebimento <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valor Recebido (R$) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountReceived}
                onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white font-bold text-emerald-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="BOLETO">Boleto Compensado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Conta Bancária de Destino</label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CRITICAL COMPLIANCE NOTICE FOR CPF (Section 5 Alert) */}
          {isCpf && (
            <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2 text-xs text-amber-950">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Obrigação Fiscal: Emissão de Receita Saúde</span>
              </div>
              <p className="leading-relaxed">
                Ao confirmar o recebimento em <strong>CPF</strong>, o valor passa a compor a apuração do Carnê-Leão no mês de recebimento ({paymentDate}). Cada parcela recebida exige seu respectivo Receita Saúde.
              </p>

              <div className="pt-2 border-t border-amber-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={markAsEmitted}
                    onChange={(e) => setMarkAsEmitted(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                  />
                  <span>Marcar Receita Saúde como emitido agora</span>
                </label>

                {markAsEmitted ? (
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Identificador / Número do Receita Saúde
                    </label>
                    <input
                      type="text"
                      value={receitaSaudeId}
                      onChange={(e) => setReceitaSaudeId(e.target.value)}
                      className="w-full text-xs rounded-lg border border-amber-300 p-2 bg-white font-mono"
                      placeholder="Ex: RS-2025-05-1234"
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-rose-700 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Ficará registrado como alerta de "Receita Saúde Pendente".</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md shadow-emerald-700/20 active:scale-98 transition-all cursor-pointer"
            >
              Confirmar Recebimento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
