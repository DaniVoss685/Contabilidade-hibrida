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
import { DatePicker, CurrencyInput, CustomSelect, useToast } from '../UI';

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
  const toast = useToast();

  const [value, setValue] = useState<number>(item?.value || 0);
  const [dueDate, setDueDate] = useState<string>(item?.dueDate || '');
  const [taxOrigin, setTaxOrigin] = useState<TaxOrigin>(item?.taxOrigin || 'CPF');
  const [status, setStatus] = useState<InstallmentStatus>(item?.status || 'A_VENCER');
  const [paymentDate, setPaymentDate] = useState<string>(
    item?.paymentDate || new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(item?.paymentMethod || 'PIX');
  const [bankAccountId, setBankAccountId] = useState<string>(item?.bankAccountId || 'bank_01');
  const [receitaSaudeId, setReceitaSaudeId] = useState<string>(item?.receitaSaudeId || '');
  const [nfseNumber, setNfseNumber] = useState<string>(item?.nfseNumber || '');

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

  const paymentOptions = [
    { value: 'PIX', label: 'PIX' },
    { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
    { value: 'DINHEIRO', label: 'Dinheiro em Espécie' },
    { value: 'TRANSFERENCIA', label: 'Transferência / TED' },
    { value: 'BOLETO', label: 'Boleto Bancário' },
  ];

  const bankAccountOptions = bankAccounts.map((b) => ({
    value: b.id,
    label: `${b.isPreferred ? '⭐ ' : ''}${b.name}${b.isPreferred ? ' (Principal)' : ''}`,
    description: b.accountType === 'CORRENTE_PF' ? 'Conta Física (PF)' : 'Conta Jurídica (PJ)',
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (value <= 0) {
      toast.warning('O valor da parcela deve ser maior que zero.');
      return;
    }

    if (!dueDate) {
      toast.warning('A data de vencimento é obrigatória.');
      return;
    }

    if (status === 'RECEBIDO') {
      if (!bankAccountId || bankAccountId.trim() === '') {
        toast.warning('A seleção da conta bancária de destino é obrigatória para registrar o recebimento.');
        return;
      }
      if (!paymentDate) {
        toast.warning('A data do recebimento é obrigatória.');
        return;
      }
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
      toast.success('Parcela atualizada com sucesso.');
      onClose();
    } else {
      toast.error('Não foi possível atualizar a parcela. Verifique se a receita ainda existe.');
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-600 flex items-center justify-center">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Editar Conta a Receber</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                Parcela {item.installmentNumber} de {item.totalInstallments} • {item.patientName}
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

        {/* Info card & link to full sale edit */}
        <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <CurrencyInput
              label="Valor da Parcela"
              required
              value={value}
              onChange={setValue}
            />

            <DatePicker
              label="Data de Vencimento"
              required
              value={dueDate}
              onChange={setDueDate}
            />
          </div>

          {/* Origem Tributária */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Classificação Tributária
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTaxOrigin('CPF')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  taxOrigin === 'CPF'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <User className="w-4 h-4 text-emerald-600" />
                <span>CPF (Carnê-Leão)</span>
              </button>

              <button
                type="button"
                onClick={() => setTaxOrigin('CNPJ')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  taxOrigin === 'CNPJ'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Building className="w-4 h-4 text-blue-600" />
                <span>CNPJ (Clínica / NFS-e)</span>
              </button>
            </div>
          </div>

          {/* Status do Recebimento */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Status do Pagamento
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setStatus('A_RECEBER')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  status === 'A_RECEBER'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Em Aberto (A Receber)</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('RECEBIDO')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  status === 'RECEBIDO'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Liquidada (Recebido)</span>
              </button>
            </div>
          </div>

          {/* Campos condicionais quando RECEBIDO */}
          {status === 'RECEBIDO' && (
            <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <DatePicker
                  label="Data do Recebimento"
                  required
                  value={paymentDate}
                  onChange={setPaymentDate}
                />

                <CustomSelect
                  label="Forma de Pagamento"
                  options={paymentOptions}
                  value={paymentMethod}
                  onChange={(val) => setPaymentMethod(val as PaymentMethod)}
                />
              </div>

              <div>
                <CustomSelect
                  label="Conta Bancária de Destino"
                  options={bankAccountOptions}
                  value={bankAccountId}
                  onChange={setBankAccountId}
                />
              </div>
            </div>
          )}

          {/* Identificador de documento fiscal */}
          <div className="pt-2">
            {taxOrigin === 'CPF' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nº Recibo Receita Saúde (Livro Caixa PF)
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={receitaSaudeId}
                  onChange={(e) => setReceitaSaudeId(e.target.value)}
                  className="w-full text-xs font-mono rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Número da NFS-e Emitida (Simples Nacional)
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={nfseNumber}
                  onChange={(e) => setNfseNumber(e.target.value)}
                  className="w-full text-xs font-mono rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}
          </div>

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
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
