import React, { useState } from 'react';
import {
  X,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Building,
  User,
  CreditCard,
} from 'lucide-react';
import { db } from '../../lib/db';
import {
  AccountReceivableItem,
  PaymentMethod,
  BankAccount,
  ReceitaSaudeStatus,
} from '../../types';
import { formatCurrency, formatDateBr } from '../../lib/masks';
import { DatePicker, CurrencyInput, CustomSelect, useToast } from '../UI';

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
  const toast = useToast();
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

  const paymentOptions = [
    { value: 'PIX', label: 'PIX (Instantâneo)' },
    { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
    { value: 'DINHEIRO', label: 'Dinheiro em Espécie' },
    { value: 'TRANSFERENCIA', label: 'Transferência / TED' },
    { value: 'BOLETO', label: 'Boleto Bancário' },
  ];

  const bankAccountOptions = bankAccounts.map((b) => ({
    value: b.id,
    label: b.name,
    description: b.accountType === 'CORRENTE_PF' ? 'Conta Física (PF)' : 'Conta Jurídica (PJ)',
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (bankAccounts.length === 0) {
      toast.warning('É necessário cadastrar uma conta bancária em Configurações > Contas Bancárias antes de registrar o recebimento.');
      return;
    }

    if (amountReceived <= 0) {
      toast.warning('O valor recebido deve ser maior que zero.');
      return;
    }

    if (!bankAccountId || bankAccountId.trim() === '') {
      toast.warning('A seleção da conta bancária de destino é obrigatória para liquidar a parcela.');
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

    toast.success('Parcela liquidada com sucesso.');
    if (onSettled) onSettled();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Registrar Recebimento de Parcela</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                Parcela {item.installmentNumber} de {item.totalInstallments} • {item.taxOrigin}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs">
            <div className="flex justify-between font-bold text-slate-800">
              <span>Paciente:</span>
              <span className="text-slate-950">{item.patientName}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Procedimento:</span>
              <span>{item.procedureName}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Vencimento Original:</span>
              <span className="font-mono">{formatDateBr(item.dueDate)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 text-sm pt-2 border-t border-slate-200">
              <span>Saldo a Receber:</span>
              <span className="text-emerald-700 font-mono tabular-nums">{formatCurrency(item.balance || item.value)}</span>
            </div>
          </div>

          {/* Settle Details with DatePicker and CurrencyInput */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <DatePicker
              label="Data do Recebimento *"
              required
              value={paymentDate}
              onChange={setPaymentDate}
            />

            <CurrencyInput
              label="Valor Recebido"
              required
              value={amountReceived}
              onChange={setAmountReceived}
            />
          </div>

          {bankAccounts.length === 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold">Nenhuma conta bancária cadastrada</p>
                <p>
                  Para liquidar o recebimento, é necessário ter ao menos uma conta bancária cadastrada. Acesse <strong>Configurações &gt; Contas Bancárias</strong> para cadastrar sua conta.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <CustomSelect
              label="Forma de Pagamento"
              options={paymentOptions}
              value={paymentMethod}
              onChange={(val) => setPaymentMethod(val as PaymentMethod)}
            />

            <CustomSelect
              label="Conta Bancária de Destino *"
              options={bankAccountOptions}
              value={bankAccountId}
              onChange={setBankAccountId}
              required
              placeholder={bankAccounts.length === 0 ? "Nenhuma conta cadastrada" : "Selecione..."}
            />
          </div>

          {/* If CPF: Receita Saúde Document details */}
          {isCpf && (
            <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markAsEmitted}
                  onChange={(e) => setMarkAsEmitted(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-emerald-950">
                  Emitir e homologar Recibo Receita Saúde imediatamente
                </span>
              </label>

              {markAsEmitted && (
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                    Nº do Recibo / Identificador Receita Saúde
                  </label>
                  <input
                    type="text"
                    value={receitaSaudeId}
                    onChange={(e) => setReceitaSaudeId(e.target.value)}
                    className="w-full text-xs font-mono rounded-xl border border-emerald-300 px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Ex: RS-2025-05-1029"
                    required={markAsEmitted}
                  />
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Gera recibo vinculado ao CPF do paciente no Livro Caixa para o Carnê-Leão.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={bankAccounts.length === 0}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer ${
                bankAccounts.length === 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
            >
              Confirmar Recebimento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
