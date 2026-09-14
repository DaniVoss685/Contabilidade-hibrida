import React, { useState, useMemo } from 'react';
import {
  TrendingDown,
  Search,
  PlusCircle,
  Download,
  Check,
  Trash2,
  Edit,
  User,
  Building,
  Paperclip,
  CheckSquare,
  Square,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { Expense, ExpenseCategory, ExpenseEntity } from '../../types';
import { formatCurrency, formatDateBr, normalizeSearchText, matchDocumentSearch } from '../../lib/masks';
import { exportToCsv } from '../../lib/exportUtils';
import { db } from '../../lib/db';
import { BatchEditExpensesModal } from '../Modals/BatchEditExpensesModal';
import { NewExpenseModal } from '../Modals/NewExpenseModal';
import { CustomSelect, ConfirmDialog, useToast } from '../UI';

const MONTH_NAMES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

interface ExpensesViewProps {
  expenses: Expense[];
  categories: ExpenseCategory[];
  onOpenNewExpense: () => void;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onResetPeriod?: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  categories,
  onOpenNewExpense,
  selectedYear,
  selectedMonth,
  onResetPeriod,
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState<'ALL' | 'CPF' | 'CNPJ'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
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

  const filteredExpenses = useMemo(() => {
    const trimmed = searchTerm.trim();
    const normQuery = normalizeSearchText(trimmed);

    return expenses.filter((exp) => {
      let matchesSearch = true;
      if (trimmed) {
        matchesSearch =
          normalizeSearchText(exp.supplierName).includes(normQuery) ||
          normalizeSearchText(exp.description).includes(normQuery) ||
          normalizeSearchText(exp.categoryName).includes(normQuery) ||
          matchDocumentSearch(exp.supplierCpfCnpj, trimmed);
      }

      const matchesEntity =
        entityFilter === 'ALL' || exp.entity === entityFilter;

      const matchesStatus =
        statusFilter === 'ALL' || exp.status === statusFilter;

      const matchesCat =
        categoryFilter === 'ALL' || exp.categoryId === categoryFilter;

      return matchesSearch && matchesEntity && matchesStatus && matchesCat;
    });
  }, [expenses, searchTerm, entityFilter, statusFilter, categoryFilter]);

  // Handle single pay
  const handlePayExpense = (id: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    db.payExpense(id, todayStr, 'PIX');
  };

  // Handle single delete
  const handleDeleteExpense = (id: string, supplier: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Excluir Despesa',
      message: `Deseja realmente excluir a despesa de "${supplier}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        db.deleteExpense(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success('Despesa excluída com sucesso.');
      },
    });
  };

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map((e) => e.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk delete
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmState({
      isOpen: true,
      title: 'Excluir Despesas Selecionadas',
      message: `ATENÇÃO: Deseja realmente excluir ${count} despesa(s) selecionada(s)? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir Todas',
      variant: 'danger',
      onConfirm: () => {
        db.batchDeleteExpenses(Array.from(selectedIds));
        setSelectedIds(new Set());
        toast.success('Despesas excluídas com sucesso.');
      },
    });
  };

  // Bulk mark as paid
  const handleBatchPay = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const todayStr = new Date().toISOString().split('T')[0];
    setConfirmState({
      isOpen: true,
      title: 'Quitar Despesas Selecionadas',
      message: `Deseja marcar ${count} despesa(s) selecionada(s) como PAGAS hoje via PIX?`,
      confirmLabel: 'Confirmar Quitação',
      variant: 'primary',
      onConfirm: () => {
        db.batchUpdateExpenses(Array.from(selectedIds), {
          status: 'PAGO',
          paymentDate: todayStr,
          paymentMethod: 'PIX',
        });
        setSelectedIds(new Set());
        toast.success('Despesas quitadas com sucesso.');
      },
    });
  };

  // Bulk edit apply
  const handleApplyBatchEdit = (updates: {
    entity?: ExpenseEntity;
    category?: ExpenseCategory;
    status?: 'PAGO' | 'A_PAGAR';
    paymentMethod?: any;
    paymentDate?: string;
  }) => {
    const rawUpdates: Partial<Expense> = {};

    if (updates.entity) {
      rawUpdates.entity = updates.entity;
    }

    if (updates.category) {
      rawUpdates.categoryId = updates.category.id;
      rawUpdates.categoryCode = updates.category.code;
      rawUpdates.categoryName = updates.category.name;
      rawUpdates.dedutivelLivroCaixaPf = updates.category.dedutivelLivroCaixaPf;
      rawUpdates.impactaFatorRPj = updates.category.impactaFatorRPj;
      rawUpdates.despesaOperacionalPj = updates.category.despesaOperacionalPj;
    }

    if (updates.status) {
      rawUpdates.status = updates.status;
      if (updates.status === 'PAGO') {
        rawUpdates.paymentDate = updates.paymentDate;
        rawUpdates.paymentMethod = updates.paymentMethod;
      }
    }

    db.batchUpdateExpenses(Array.from(selectedIds), rawUpdates);
    setSelectedIds(new Set());
    toast.success('Despesas atualizadas em lote com sucesso.');
  };

  const handleExport = () => {
    const headers = [
      'Vencimento',
      'Data Pagamento',
      'Entidade (PF/PJ)',
      'Fornecedor',
      'Categoria',
      'Descrição',
      'Valor Total',
      'Dedutível Livro Caixa (PF)',
      'Impacta Fator R (PJ)',
      'Despesa Operacional (PJ)',
      'Status',
    ];
    const rows = filteredExpenses.map((e) => [
      formatDateBr(e.dueDate),
      e.paymentDate ? formatDateBr(e.paymentDate) : 'Pendente',
      e.entity === 'CPF' ? 'Pessoa Física (PF/CPF)' : 'Pessoa Jurídica (PJ/CNPJ)',
      e.supplierName,
      e.categoryName,
      e.description,
      e.value,
      e.dedutivelLivroCaixaPf,
      e.impactaFatorRPj ? 'SIM' : 'NÃO',
      e.despesaOperacionalPj ? 'SIM' : 'NÃO',
      e.status,
    ]);
    exportToCsv('despesas_odontologicas', [headers, ...rows]);
  };

  const allSelected =
    filteredExpenses.length > 0 && selectedIds.size === filteredExpenses.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-rose-600" />
            Despesas e Contas a Pagar
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Separação estrita de Pessoa Física (PF) e Pessoa Jurídica (PJ) com edição e exclusão em lote
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={onOpenNewExpense}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md active:scale-98 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ NOVA DESPESA</span>
          </button>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="bg-teal-500 text-slate-950 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              despesa(s) selecionada(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBatchEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Edit className="w-3.5 h-3.5" />
              Editar em Lote
            </button>

            <button
              onClick={handleBatchPay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              Marcar como Pagas
            </button>

            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir em Lote
            </button>

            <button
              onClick={handleClearSelection}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Desmarcar
            </button>
          </div>
        </div>
      )}

      {/* Active Global Period Banner */}
      {selectedYear && (
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-slate-600">
              Período Selecionado:{' '}
              <strong className="text-slate-900 font-bold">
                {selectedMonth === 'ALL'
                  ? `Ano Inteiro de ${selectedYear}`
                  : `${MONTH_NAMES[selectedMonth || 1]} de ${selectedYear}`}
              </strong>
            </span>
            <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
              {filteredExpenses.length} {filteredExpenses.length === 1 ? 'despesa' : 'despesas'}
            </span>
          </div>

          {selectedMonth !== 'ALL' && onResetPeriod && (
            <button
              type="button"
              onClick={onResetPeriod}
              className="text-rose-700 hover:text-rose-900 font-bold hover:underline cursor-pointer"
            >
              Exibir todo o ano de {selectedYear}
            </button>
          )}
        </div>
      )}

      {/* Filters Bar: strictly PF or PJ */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por fornecedor, descrição ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
        </div>

        {/* Entity Filter: PF / PJ only */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setEntityFilter('ALL')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              entityFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setEntityFilter('CPF')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
              entityFilter === 'CPF' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <User className="w-3 h-3" />
            Pessoa Física (CPF)
          </button>
          <button
            onClick={() => setEntityFilter('CNPJ')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
              entityFilter === 'CNPJ' ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-800 hover:bg-blue-50'
            }`}
          >
            <Building className="w-3 h-3" />
            Pessoa Jurídica (CNPJ)
          </button>
        </div>

        {/* Status Filter */}
        <div className="w-40">
          <CustomSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={[
              { value: 'ALL', label: 'Status: Todos' },
              { value: 'A_PAGAR', label: 'A Pagar' },
              { value: 'PAGO', label: 'Pagas' },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    title={allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
                    className="cursor-pointer text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-teal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Pagamento</th>
                <th className="py-3 px-4">Titularidade</th>
                <th className="py-3 px-4">Fornecedor / Descrição</th>
                <th className="py-3 px-4">Categoria do Plano</th>
                <th className="py-3 px-4 text-center">Atributos Fiscais</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4 text-center min-w-[110px] whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Nenhuma despesa encontrada.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const isPaid = exp.status === 'PAGO';
                  const isSelected = selectedIds.has(exp.id);

                  return (
                    <tr
                      key={exp.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox Column */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(exp.id)}
                          className="cursor-pointer text-slate-500 hover:text-slate-800"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-teal-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                        {formatDateBr(exp.dueDate)}
                      </td>

                      {/* Payment Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {isPaid && exp.paymentDate ? (
                          <span className="text-emerald-700 font-semibold">{formatDateBr(exp.paymentDate)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Entity Badge: strictly CPF or CNPJ */}
                      <td className="py-3.5 px-4">
                        {exp.entity === 'CPF' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <User className="w-3 h-3" /> CPF
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-blue-100 text-blue-800 border border-blue-200">
                            <Building className="w-3 h-3" /> CNPJ
                          </span>
                        )}
                      </td>

                      {/* Supplier & Description */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{exp.supplierName}</div>
                        <div className="text-[11px] text-slate-500">{exp.description}</div>
                        {exp.attachmentName && (
                          <div className="inline-flex items-center gap-1 text-[10px] text-teal-700 mt-0.5">
                            <Paperclip className="w-3 h-3" /> {exp.attachmentName}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800">{exp.categoryName}</span>
                        <div className="text-[10px] font-mono text-slate-400">{exp.categoryCode}</div>
                      </td>

                      {/* Tax Attributes */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col gap-1 items-center">
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                exp.dedutivelLivroCaixaPf === 'SIM'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : exp.dedutivelLivroCaixaPf === 'CONDICIONAL'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                              title="Dedutibilidade no Livro Caixa do Carnê-Leão (PF)"
                            >
                              Livro Caixa: {exp.dedutivelLivroCaixaPf}
                            </span>

                            {exp.impactaFatorRPj && (
                              <span
                                className="px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800"
                                title="Impacta diretamente o Fator R (Folha de Salários / Pró-labore)"
                              >
                                Fator R
                              </span>
                            )}
                          </div>

                          {exp.isOverridden && (
                            <span className="text-[9px] text-amber-700 font-semibold" title={exp.overrideJustification}>
                              (Alteração manual justificada)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Value */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatCurrency(exp.value)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[85px] whitespace-nowrap px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isPaid ? 'PAGO' : 'A PAGAR'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isPaid ? (
                            <button
                              onClick={() => handlePayExpense(exp.id)}
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                              title="Registrar Pagamento"
                            >
                              Pagar
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-semibold flex items-center justify-center gap-0.5">
                              <Check className="w-3 h-3" /> Pago
                            </span>
                          )}

                          <button
                            onClick={() => setEditingExpense(exp)}
                            className="p-1 rounded text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                            title="Editar despesa"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteExpense(exp.id, exp.supplierName)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir despesa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Edit Modal */}
      <BatchEditExpensesModal
        isOpen={isBatchEditOpen}
        selectedCount={selectedIds.size}
        categories={categories}
        onClose={() => setIsBatchEditOpen(false)}
        onApply={handleApplyBatchEdit}
      />

      {/* Single Expense Edit Modal */}
      {editingExpense && (
        <NewExpenseModal
          isOpen={Boolean(editingExpense)}
          onClose={() => setEditingExpense(null)}
          categories={categories}
          bankAccounts={db.getBankAccounts()}
          expenseToEdit={editingExpense}
        />
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
