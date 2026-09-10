import React, { useState, useEffect } from 'react';
import {
  X,
  ReceiptText,
  Calendar,
  CreditCard,
  Building,
  User,
  ExternalLink,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { db } from '../../lib/db';
import { AccountReceivableItem, TaxOrigin, PaymentMethod, InstallmentStatus } from '../../types';
import { formatCurrency, formatDateBr } from '../../lib/masks';

interface EditReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: AccountReceivableItem | null;
  onOpenEditSale?: (saleId: string) => void;
}

export const EditReceivableModal: React.FC<EditReceivableModalProps> = ({
  isOpen,
  onClose,
  item,
  onOpenEditSale,
}) => {
  if (!isOpen || !item) return null;

  const [value, setValue] = useState<number>(item.value);
  const [dueDate, setDueDate] = useState<string>(item.dueDate);
  const [taxOrigin, setTaxOrigin] = useState<TaxOrigin>(item.taxOrigin);
  const [status, setStatus] = useState<InstallmentStatus>(item.status);
  const [paymentDate, setPaymentDate] = useState<string>(
    item.paymentDate || new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(item.paymentMethod || 'PIX');
  const [bankAccountId, setBankAccountId] = useState<string>(item.bankAccountId || 'bank_01');
  const [receitaSaudeId, setReceitaSaudeId] = useState<string>(item.receitaSaudeId || '');
  const [nfseNumber, setNfseNumber] = useState<string>(item.nfseNumber || '');

  const bankAccounts = db.getBankAccounts();

  useEffect(() => {
    if (item) {
      setValue(item.value);
      setDueDate(item.dueDate);
      setTaxOrigin(item.taxOrigin);
      setStatus(item.status);
      setPaymentDate(item.paymentDate || new Date().toISOString().split('T')[0]);
      setPaymentMethod(item.paymentMethod || 'PIX');
      setBankAccountId(item.bankAccountId || 'bank_01');
      setReceitaSaudeId(item.receitaSaudeId || '');
      setNfseNumber(item.nfseNumber || '');
    }
  }, [item]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (value <= 0) {
      alert('O valor da parcela deve ser maior que zero.');
      return;
    }

    if (!dueDate) {
      alert('A data de vencimento é obrigatória.');
      return;
    }

    const success = db.updateReceivableInstallment(item.installmentId, {
      value,
      dueDate,
      taxOrigin,
      status,
      paymentDate: status === 'RECEBIDO' ? paymentDate : undefined,
      paymentMethod,
      bankAccountId,
      receitaSaudeId: taxOrigin === 'CPF' ? (receitaSaudeId.trim() || undefined) : undefined,
      receitaSaudeStatus:
        taxOrigin === 'CPF'
          ? (receitaSaudeId.trim() ? 'EMITIDO' : 'A_EMITIR')
          : undefined,
      nfseNumber: taxOrigin === 'CNPJ' ? (nfseNumber.trim() || undefined) : undefined,
    });

    if (success) {
      onClose();
    } else {
      alert('Não foi possível atualizar a parcela. Verifique se a receita ainda existe.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-800 text-teal-400">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Editar Conta a Receber</h2>
              <p className="text-xs text-slate-400">
                Parcela {item.installmentNumber} de {item.totalInstallments} • {item.patientName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info card & link to full sale edit */}
        <div className="px-6 pt-4 pb-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 font-medium">Procedimento: </span>
            <span className="font-bold text-slate-800">{item.procedureName}</span>
          </div>
          {onOpenEditSale && item.saleId && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenEditSale(item.saleId);
              }}
              className="text-teal-700 hover:text-teal-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              title="Abrir formulário completo da receita original"
            >
              <span>Editar Receita Completa</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Valor & Vencimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valor da Parcela (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={value}
                onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-bold text-slate-900 rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data de Vencimento
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs font-semibold text-slate-900 rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Origem Tributária */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Classificação Tributária
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTaxOrigin('CPF')}
                className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  taxOrigin === 'CPF'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <User className="w-4 h-4" />
                <span>CPF (Carnê-Leão)</span>
              </button>

              <button
                type="button"
                onClick={() => setTaxOrigin('CNPJ')}
                className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  taxOrigin === 'CNPJ'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>CNPJ (Clínica / NFS-e)</span>
              </button>
            </div>
          </div>

          {/* Status do Recebimento */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Status do Pagamento
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus('A_RECEBER')}
                className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  status === 'A_RECEBER'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Em Aberto (A Receber)</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('RECEBIDO')}
                className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  status === 'RECEBIDO'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>Liquidada (Recebido)</span>
              </button>
            </div>
          </div>

          {/* Campos condicionais quando RECEBIDO */}
          {status === 'RECEBIDO' && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                    Data do Recebimento
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-emerald-300 p-2 bg-white focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs font-semibold rounded-lg border border-emerald-300 p-2 bg-white focus:outline-none"
                  >
                    <option value="PIX">PIX</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                    <option value="CARTAO_DEBITO">Cartão de Débito</option>
                    <option value="DINHEIRO">Dinheiro em Espécie</option>
                    <option value="TRANSFERENCIA">Transferência / TED</option>
                    <option value="BOLETO">Boleto Bancário</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                  Conta Bancária de Destino
                </label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full text-xs font-semibold rounded-lg border border-emerald-300 p-2 bg-white focus:outline-none"
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.accountType === 'CORRENTE_PF' ? 'Conta PF' : 'Conta PJ'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Documento fiscal / Receita Saúde */}
          {taxOrigin === 'CPF' ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Identificador Receita Saúde (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: RS-2025-05-0012"
                value={receitaSaudeId}
                onChange={(e) => setReceitaSaudeId(e.target.value)}
                className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Número da NFS-e (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: NFS-2025-0089"
                value={nfseNumber}
                onChange={(e) => setNfseNumber(e.target.value)}
                className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            </div>
          )}

          {/* Rodapé de Ações */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-md transition-all cursor-pointer"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
