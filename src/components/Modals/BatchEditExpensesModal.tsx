import React, { useState } from 'react';
import { X, Edit3, CheckCircle2, User, Building, Layers } from 'lucide-react';
import { ExpenseCategory, ExpenseEntity, PaymentMethod } from '../../types';

interface BatchEditExpensesModalProps {
  isOpen: boolean;
  selectedCount: number;
  categories: ExpenseCategory[];
  onClose: () => void;
  onApply: (updates: {
    entity?: ExpenseEntity;
    category?: ExpenseCategory;
    status?: 'PAGO' | 'A_PAGAR';
    paymentMethod?: PaymentMethod;
    paymentDate?: string;
  }) => void;
}

export const BatchEditExpensesModal: React.FC<BatchEditExpensesModalProps> = ({
  isOpen,
  selectedCount,
  categories,
  onClose,
  onApply,
}) => {
  const [changeEntity, setChangeEntity] = useState(false);
  const [entity, setEntity] = useState<ExpenseEntity>('CPF');

  const [changeCategory, setChangeCategory] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || '');

  const [changeStatus, setChangeStatus] = useState(false);
  const [status, setStatus] = useState<'PAGO' | 'A_PAGAR'>('PAGO');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!changeEntity && !changeCategory && !changeStatus) {
      alert('Selecione ao menos um campo para atualizar em lote.');
      return;
    }

    const updates: {
      entity?: ExpenseEntity;
      category?: ExpenseCategory;
      status?: 'PAGO' | 'A_PAGAR';
      paymentMethod?: PaymentMethod;
      paymentDate?: string;
    } = {};

    if (changeEntity) {
      updates.entity = entity;
    }

    if (changeCategory) {
      const cat = categories.find((c) => c.id === categoryId);
      if (cat) updates.category = cat;
    }

    if (changeStatus) {
      updates.status = status;
      if (status === 'PAGO') {
        updates.paymentMethod = paymentMethod;
        updates.paymentDate = paymentDate;
      }
    }

    onApply(updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Edição em Lote de Despesas</h2>
              <p className="text-xs text-slate-400">
                Aplicar alterações para <span className="text-teal-300 font-semibold">{selectedCount}</span> despesa(s) selecionada(s)
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
          <p className="text-xs text-slate-600">
            Marque as opções que deseja alterar nas despesas selecionadas. Os campos desmarcados não sofrerão alterações.
          </p>

          {/* Option 1: Titularidade (PF / PJ) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={changeEntity}
                onChange={(e) => setChangeEntity(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs font-bold text-slate-800">
                Alterar Titularidade Fiscal (PF ou PJ)
              </span>
            </label>

            {changeEntity && (
              <div className="pl-6 grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setEntity('CPF')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                    entity === 'CPF'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  Pessoa Física (PF)
                </button>
                <button
                  type="button"
                  onClick={() => setEntity('CNPJ')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                    entity === 'CNPJ'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  Pessoa Jurídica (PJ)
                </button>
              </div>
            )}
          </div>

          {/* Option 2: Categoria do Plano de Contas */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={changeCategory}
                onChange={(e) => setChangeCategory(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs font-bold text-slate-800">
                Reclassificar Categoria do Plano de Contas
              </span>
            </label>

            {changeCategory && (
              <div className="pl-6 pt-1">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Atualizará os atributos de dedutibilidade (Livro Caixa PF) e impacto no Fator R (PJ) automaticamente com base na categoria escolhida.
                </p>
              </div>
            )}
          </div>

          {/* Option 3: Status de Pagamento */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={changeStatus}
                onChange={(e) => setChangeStatus(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs font-bold text-slate-800">
                Alterar Status de Pagamento
              </span>
            </label>

            {changeStatus && (
              <div className="pl-6 space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStatus('PAGO')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                      status === 'PAGO'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Marcar como PAGO
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('A_PAGAR')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                      status === 'A_PAGAR'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20 shadow-xs'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Marcar como A PAGAR
                  </button>
                </div>

                {status === 'PAGO' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Forma de Pagamento
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
                      >
                        <option value="PIX">PIX</option>
                        <option value="BOLETO">Boleto Bancário</option>
                        <option value="TRANSFERENCIA">Transferência / TED</option>
                        <option value="CARTAO_DEBITO">Cartão de Débito</option>
                        <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                        <option value="DINHEIRO">Dinheiro Espécie</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Data de Quitação
                      </label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aplicar em {selectedCount} Despesa(s)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
