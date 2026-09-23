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
  Repeat,
  Layers,
  X,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { Expense, ExpenseCategory, ExpenseEntity } from '../../types';
import { formatCurrency, formatDateBr, normalizeSearchText, matchDocumentSearch } from '../../lib/masks';
import { formatPaymentMethodName, formatPaymentMethodWithInstallments } from '../../lib/paymentMethodFormat';
import { exportToCsv } from '../../lib/exportUtils';
import { db } from '../../lib/db';
import { getEffectivePayableStatus } from '../../lib/statusHelper';
import { BatchEditExpensesModal } from '../Modals/BatchEditExpensesModal';
import { NewExpenseModal } from '../Modals/NewExpenseModal';
import { CustomSelect, ConfirmDialog, useToast, ReceiptViewerModal, SortableHeader } from '../UI';
import { useSortableData } from '../../hooks/useSortableData';

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
  initialFilter?: 'ALL' | 'CPF' | 'CNPJ' | 'RECORRENTE';
  viewMode?: 'all' | 'recurrent';
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  categories,
  onOpenNewExpense,
  selectedYear,
  selectedMonth,
  onResetPeriod,
  initialFilter = 'ALL',
  viewMode = 'all',
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState<'ALL' | 'CPF' | 'CNPJ'>(
    initialFilter === 'CPF' ? 'CPF' : initialFilter === 'CNPJ' ? 'CNPJ' : 'ALL'
  );
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RECORRENTE' | 'PARCELADA' | 'UNICA'>(
    initialFilter === 'RECORRENTE' || viewMode === 'recurrent' ? 'RECORRENTE' : 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');

  React.useEffect(() => {
    if (viewMode === 'recurrent' || initialFilter === 'RECORRENTE') {
      setTypeFilter('RECORRENTE');
    }
  }, [viewMode, initialFilter]);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{
    file?: any;
    name: string;
  } | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);

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

  // Series delete modal state
  const [seriesDeleteModal, setSeriesDeleteModal] = useState<{
    isOpen: boolean;
    expense: Expense | null;
  }>({
    isOpen: false,
    expense: null,
  });

  const recurrentKpis = useMemo(() => {
    const recurrentList = expenses.filter(
      (e) => e.expenseType === 'RECORRENTE' || Boolean(e.recurrenceId)
    );
    const totalRecurrentValue = recurrentList.reduce((acc, e) => acc + (e.value || 0), 0);
    const paidRecurrentValue = recurrentList
      .filter((e) => e.status === 'PAGO')
      .reduce((acc, e) => acc + (e.value || 0), 0);
    const pendingRecurrentValue = recurrentList
      .filter((e) => e.status === 'A_PAGAR')
      .reduce((acc, e) => acc + (e.value || 0), 0);
    const uniqueSeries = new Set(
      recurrentList.map((e) => e.recurrenceId || e.description.replace(/\s*\(\d+\/\d+\)$/, ''))
    ).size;

    return {
      totalRecurrentValue,
      paidRecurrentValue,
      pendingRecurrentValue,
      totalCount: recurrentList.length,
      uniqueSeries,
    };
  }, [expenses]);

  // KPIs de Despesas e Contas a Pagar (Total Pago, A Pagar, Em Atraso)
  const payableKpis = useMemo(() => {
    let totalPaid = 0;
    let countPaid = 0;
    let totalToPay = 0;
    let countToPay = 0;
    let totalOverdue = 0;
    let countOverdue = 0;

    for (const exp of expenses) {
      const effStatus = getEffectivePayableStatus(exp);
      const val = exp.value || 0;

      if (effStatus === 'PAGO') {
        totalPaid += val;
        countPaid++;
      } else if (effStatus === 'EM_ATRASO') {
        totalOverdue += val;
        countOverdue++;
      } else if (effStatus === 'A_PAGAR') {
        totalToPay += val;
        countToPay++;
      }
    }

    return {
      totalPaid,
      countPaid,
      totalToPay,
      countToPay,
      totalOverdue,
      countOverdue,
    };
  }, [expenses]);

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

      const effectiveStatus = getEffectivePayableStatus(exp);
      let matchesStatus = true;
      if (statusFilter === 'ALL') {
        matchesStatus = true;
      } else if (statusFilter === 'EM_ATRASO' || statusFilter === 'VENCIDO') {
        matchesStatus = effectiveStatus === 'EM_ATRASO';
      } else if (statusFilter === 'A_PAGAR') {
        matchesStatus = effectiveStatus === 'A_PAGAR';
      } else if (statusFilter === 'PAGO') {
        matchesStatus = effectiveStatus === 'PAGO';
      }

      const matchesCat =
        categoryFilter === 'ALL' || exp.categoryId === categoryFilter;

      const isRecurrent = exp.expenseType === 'RECORRENTE' || Boolean(exp.recurrenceId);
      const isInstallment = exp.expenseType === 'PARCELADA' || Boolean(exp.installmentGroupId);
      const isSingle = !isRecurrent && !isInstallment;

      let matchesType = true;
      if (viewMode === 'recurrent' || typeFilter === 'RECORRENTE') {
        matchesType = isRecurrent;
      } else if (typeFilter === 'PARCELADA') {
        matchesType = isInstallment;
      } else if (typeFilter === 'UNICA') {
        matchesType = isSingle;
      }

      const matchesPaymentMethod =
        paymentMethodFilter === 'ALL' || exp.paymentMethod === paymentMethodFilter;

      return matchesSearch && matchesEntity && matchesStatus && matchesCat && matchesType && matchesPaymentMethod;
    });
  }, [expenses, searchTerm, entityFilter, statusFilter, categoryFilter, typeFilter, paymentMethodFilter, viewMode]);

  const {
    sortedItems: displayExpenses,
    sortKey,
    sortDirection,
    handleSort,
  } = useSortableData(filteredExpenses, {
    customComparators: {
      category: (a, b) => (a.categoryName || a.category || '').localeCompare(b.categoryName || b.category || '', 'pt-BR'),
      description: (a, b) => (a.description || a.supplierName || '').localeCompare(b.description || b.supplierName || '', 'pt-BR'),
      paymentMethod: (a, b) =>
        formatPaymentMethodName(a.paymentMethod).localeCompare(formatPaymentMethodName(b.paymentMethod), 'pt-BR'),
    },
  });

  // Handle single pay
  const handlePayExpense = (id: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    db.payExpense(id, todayStr, 'PIX');
  };

  // Handle single delete (or open series modal if linked)
  const handleDeleteExpense = (exp: Expense) => {
    if (exp.installmentGroupId || exp.recurrenceId) {
      setSeriesDeleteModal({
        isOpen: true,
        expense: exp,
      });
      return;
    }

    setConfirmState({
      isOpen: true,
      title: 'Excluir Despesa',
      message: `Deseja realmente excluir a despesa de "${exp.supplierName}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        db.deleteExpense(exp.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(exp.id);
          return next;
        });
        toast.success('Despesa excluída com sucesso.');
      },
    });
  };

  const handleConfirmSeriesDelete = (scope: 'ONLY_THIS' | 'THIS_AND_FUTURE' | 'ALL_SERIES') => {
    if (!seriesDeleteModal.expense) return;
    const targetExp = seriesDeleteModal.expense;
    const count = db.deleteExpenseSeries(targetExp.id, scope);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(targetExp.id);
      return next;
    });
    setSeriesDeleteModal({ isOpen: false, expense: null });
    toast.success(
      scope === 'ALL_SERIES'
        ? `Todas as ${count} despesas da série foram excluídas.`
        : scope === 'THIS_AND_FUTURE'
        ? `Esta e as despesas futuras (${count}) foram excluídas.`
        : 'Despesa excluída com sucesso.'
    );
  };

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === displayExpenses.length && displayExpenses.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayExpenses.map((e) => e.id)));
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
      {viewMode === 'recurrent' ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
                <Repeat className="w-4 h-4" />
              </div>
              <span>Despesas Recorrentes</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Fixas & Contratos
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Acompanhamento centralizado de aluguéis, sistemas de gestão, assinaturas e obrigações mensais fixas
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={onOpenNewExpense}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-98 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ NOVA DESPESA RECORRENTE</span>
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {/* Payable Mode KPI Cards Strip (Despesas Já Pagas, Despesas a Pagar, Despesas em Atraso) */}
      {viewMode !== 'recurrent' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 1. Despesas Já Pagas */}
          <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
            <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold mb-1">
              <span>Despesas Já Pagas</span>
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold text-emerald-700">
              {formatCurrency(payableKpis.totalPaid)}
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-1">
              {payableKpis.countPaid > 0
                ? `${payableKpis.countPaid} ${payableKpis.countPaid === 1 ? 'despesa liquidada' : 'despesas liquidadas'}`
                : 'Nenhum pagamento liquidado no período'}
            </div>
          </div>

          {/* 2. Despesas a Pagar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Despesas a Pagar</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-slate-900">
              {formatCurrency(payableKpis.totalToPay)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {payableKpis.countToPay > 0
                ? `${payableKpis.countToPay} ${payableKpis.countToPay === 1 ? 'despesa a vencer' : 'despesas a vencer'}`
                : 'Nenhuma despesa pendente no período'}
            </div>
          </div>

          {/* 3. Despesas em Atraso */}
          <div className="bg-white p-4 rounded-xl border border-rose-100 bg-rose-50/20 shadow-xs">
            <div className="flex items-center justify-between text-rose-600 text-xs font-semibold mb-1">
              <span>Despesas em Atraso</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-bold text-rose-700">
              {formatCurrency(payableKpis.totalOverdue)}
            </div>
            <div className="text-[11px] text-rose-600/80 mt-1">
              {payableKpis.countOverdue > 0
                ? `${payableKpis.countOverdue} ${payableKpis.countOverdue === 1 ? 'pendência vencida' : 'pendências vencidas'}`
                : 'Nenhuma despesa em atraso'}
            </div>
          </div>
        </div>
      )}

      {/* Recurrent Mode KPI Cards Strip */}
      {viewMode === 'recurrent' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Contratos / Assinaturas
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-1 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-indigo-600" />
              <span>{recurrentKpis.uniqueSeries}</span>
              <span className="text-xs font-medium text-slate-500">
                {recurrentKpis.uniqueSeries === 1 ? 'série ativa' : 'séries ativas'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {recurrentKpis.totalCount} lançamentos no período
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Recorrente no Período
            </div>
            <div className="text-xl font-extrabold text-indigo-700 mt-1">
              {formatCurrency(recurrentKpis.totalRecurrentValue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Compromissos fixos cadastrados
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Recorrente Pago
            </div>
            <div className="text-xl font-extrabold text-emerald-700 mt-1">
              {formatCurrency(recurrentKpis.paidRecurrentValue)}
            </div>
            <div className="text-[11px] text-emerald-600 mt-0.5">
              Liquidados na competência
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Recorrente a Pagar
            </div>
            <div className="text-xl font-extrabold text-rose-700 mt-1">
              {formatCurrency(recurrentKpis.pendingRecurrentValue)}
            </div>
            <div className="text-[11px] text-rose-600 mt-0.5">
              Previsão de saída pendente
            </div>
          </div>
        </div>
      )}

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

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={
              viewMode === 'recurrent'
                ? 'Buscar em despesas recorrentes por fornecedor ou categoria...'
                : 'Buscar por fornecedor, descrição ou categoria...'
            }
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

        {/* Type Filter (when in all expenses) or Active Badge (when in recurrent tab) */}
        {viewMode === 'recurrent' ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold">
            <Repeat className="w-3.5 h-3.5 text-indigo-600" />
            <span>Filtro: Recorrentes</span>
          </div>
        ) : (
          <div className="w-44">
            <CustomSelect
              value={typeFilter}
              onChange={(val) => setTypeFilter(val as any)}
              options={[
                { value: 'ALL', label: 'Tipos: Todos' },
                { value: 'RECORRENTE', label: 'Recorrentes (Fixas)' },
                { value: 'PARCELADA', label: 'Parceladas' },
                { value: 'UNICA', label: 'À Vista' },
              ]}
            />
          </div>
        )}

        {/* Status Filter */}
        <div className="w-36">
          <CustomSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={[
              { value: 'ALL', label: 'Status: Todos' },
              { value: 'A_PAGAR', label: 'A Pagar' },
              { value: 'EM_ATRASO', label: 'Em Atraso' },
              { value: 'PAGO', label: 'Pagas' },
            ]}
          />
        </div>

        {/* Forma de Pagamento Filter */}
        <div className="w-44">
          <CustomSelect
            value={paymentMethodFilter}
            onChange={(val) => setPaymentMethodFilter(val)}
            options={[
              { value: 'ALL', label: 'Forma: Todas' },
              { value: 'PIX', label: 'PIX' },
              { value: 'BOLETO', label: 'Boleto' },
              { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
              { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
              { value: 'TRANSFERENCIA', label: 'Transferência' },
              { value: 'DINHEIRO', label: 'Dinheiro' },
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
                <SortableHeader
                  label="Categoria"
                  sortKey="category"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="min-w-[130px]"
                />
                <SortableHeader
                  label="Descrição"
                  sortKey="description"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="min-w-[200px] max-w-[280px]"
                />
                <SortableHeader
                  label="Valor"
                  sortKey="value"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="whitespace-nowrap min-w-[100px]"
                />
                <SortableHeader
                  label="Forma de Pagamento"
                  sortKey="paymentMethod"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="whitespace-nowrap min-w-[130px]"
                />
                <SortableHeader
                  label="Data de Pagamento"
                  sortKey="paymentDate"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="whitespace-nowrap min-w-[110px]"
                />
                <SortableHeader
                  label="Data de Vencimento"
                  sortKey="dueDate"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="whitespace-nowrap min-w-[110px]"
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="min-w-[110px] whitespace-nowrap"
                />
                <th className="py-3 px-4 text-center whitespace-nowrap min-w-[120px]">Atributos Fiscais</th>
                <th className="py-3 px-4 text-center whitespace-nowrap min-w-[130px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {displayExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    {viewMode === 'recurrent' || typeFilter === 'RECORRENTE' ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Repeat className="w-8 h-8 text-indigo-300" />
                        <span className="font-semibold text-slate-700">Nenhuma despesa recorrente encontrada neste período.</span>
                        <p className="text-xs text-slate-400 max-w-md">
                          Cadastre despesas fixas contínuas (como aluguel, software de gestão odontológica, internet ou assessoria) clicando em &quot;+ NOVA DESPESA RECORRENTE&quot;.
                        </p>
                      </div>
                    ) : (
                      <span>Nenhuma despesa encontrada.</span>
                    )}
                  </td>
                </tr>
              ) : (
                displayExpenses.map((exp) => {
                  const isPaid = exp.status === 'PAGO';
                  const isSelected = selectedIds.has(exp.id);

                  return (
                    <tr
                      key={exp.id}
                      onClick={() => setViewingExpense(exp)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setViewingExpense(exp);
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalhes de ${exp.description || exp.supplierName}`}
                      title="Clique para ver detalhes"
                      className={`transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-inset ${
                        isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox Column */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
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

                      {/* 1. Categoria */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900">{exp.categoryName}</span>
                        <div className="text-[10px] font-mono text-slate-400">{exp.categoryCode}</div>
                      </td>

                      {/* 2. Descrição */}
                      <td className="py-3.5 px-4 min-w-[200px] max-w-[280px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{exp.description || exp.supplierName}</span>
                          {/* Titularidade Badge */}
                          {exp.entity === 'CPF' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-bold text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <User className="w-2.5 h-2.5" /> CPF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-bold text-[9px] bg-blue-50 text-blue-800 border border-blue-200">
                              <Building className="w-2.5 h-2.5" /> CNPJ
                            </span>
                          )}
                          {/* Parcela Badge */}
                          {(exp.expenseType === 'PARCELADA' || (exp.installmentNumber && exp.totalInstallments)) && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                              title={`Despesa Parcelada: Parcela ${exp.installmentNumber || 1} de ${exp.totalInstallments || 1}`}
                            >
                              <Layers className="w-2.5 h-2.5 text-amber-600" />
                              {exp.installmentNumber || 1}/{exp.totalInstallments || 1}
                            </span>
                          )}
                          {/* Recorrente Badge (limpo, sem repetição da contagem de parcelas) */}
                          {(exp.expenseType === 'RECORRENTE' || exp.recurrenceId) && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-800 border border-purple-200"
                              title={`Despesa Recorrente (${exp.recurrenceFrequency || 'MENSAL'})`}
                            >
                              <Repeat className="w-2.5 h-2.5 text-purple-600" />
                              Recorrente
                            </span>
                          )}
                        </div>
                        {exp.attachmentName && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingAttachment({
                                  file: exp.attachment,
                                  name: exp.attachmentName || 'Comprovante',
                                });
                              }}
                              className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100/90 px-2 py-0.5 rounded-lg border border-teal-200/80 transition-colors cursor-pointer max-w-[210px] truncate shadow-2xs group/att"
                              title={`Clique para visualizar: ${exp.attachmentName}`}
                            >
                              <Eye className="w-3 h-3 flex-shrink-0 text-teal-600 group-hover/att:scale-110 transition-transform" />
                              <Paperclip className="w-3 h-3 flex-shrink-0 text-teal-500" />
                              <span className="truncate">{exp.attachmentName}</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* 3. Valor */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatCurrency(exp.value)}
                        </div>
                      </td>

                      {/* Forma de Pagamento */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`text-[11px] font-semibold ${exp.paymentMethod ? 'text-slate-700' : 'text-slate-400'}`}>
                          {exp.paymentMethod
                            ? formatPaymentMethodWithInstallments(exp.paymentMethod, exp.totalInstallments && exp.totalInstallments > 1 ? exp.totalInstallments : undefined)
                            : 'Não informado'}
                        </span>
                      </td>

                      {/* 4. Data de Pagamento */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 text-center">
                        {isPaid && exp.paymentDate ? (
                          <span className="text-emerald-700 font-semibold">{formatDateBr(exp.paymentDate)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 5. Data de Vencimento */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900 text-center">
                        {formatDateBr(exp.dueDate)}
                      </td>

                      {/* 6. Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {(() => {
                          const effectiveStatus = getEffectivePayableStatus(exp);
                          if (effectiveStatus === 'PAGO') {
                            return (
                              <span className="inline-flex items-center justify-center min-w-[85px] whitespace-nowrap px-2.5 py-1 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">
                                PAGO
                              </span>
                            );
                          }
                          if (effectiveStatus === 'EM_ATRASO') {
                            return (
                              <span className="inline-flex items-center justify-center min-w-[85px] whitespace-nowrap px-2.5 py-1 rounded-full font-bold text-[10px] bg-rose-100 text-rose-800 border border-rose-200/80">
                                EM ATRASO
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center justify-center min-w-[85px] whitespace-nowrap px-2.5 py-1 rounded-full font-bold text-[10px] bg-amber-100 text-amber-800">
                              A PAGAR
                            </span>
                          );
                        })()}
                      </td>

                      {/* 7. Atributos Fiscais */}
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
                              (Alteração manual)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 8. Ações */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap min-w-[130px]" onClick={(e) => e.stopPropagation()}>
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
                            onClick={() => handleDeleteExpense(exp)}
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
          onExpenseCreated={() => setEditingExpense(null)}
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

      {/* Series Delete Scope Modal */}
      {seriesDeleteModal.isOpen && seriesDeleteModal.expense && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-rose-700">
                <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Excluir Despesa da Série</h3>
                  <p className="text-xs text-slate-500">
                    {seriesDeleteModal.expense.expenseType === 'PARCELADA'
                      ? `Parcela ${seriesDeleteModal.expense.installmentNumber}/${seriesDeleteModal.expense.totalInstallments}`
                      : 'Lançamento Recorrente'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSeriesDeleteModal({ isOpen: false, expense: null })}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta despesa de <strong>"{seriesDeleteModal.expense.supplierName}"</strong> ({formatCurrency(seriesDeleteModal.expense.value)}) está vinculada a uma série de pagamentos. Como deseja proceder com a exclusão?
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmSeriesDelete('ONLY_THIS')}
                className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer"
              >
                <div className="font-bold text-xs text-slate-900">Apenas esta despesa / parcela</div>
                <div className="text-[11px] text-slate-500">
                  Exclui somente este lançamento ({formatDateBr(seriesDeleteModal.expense.dueDate)}) e mantém o restante da série.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSeriesDelete('THIS_AND_FUTURE')}
                className="w-full text-left p-3 rounded-xl border border-amber-200 hover:border-amber-300 bg-amber-50/40 hover:bg-amber-50 transition-all cursor-pointer"
              >
                <div className="font-bold text-xs text-amber-950">Esta e as seguintes da série</div>
                <div className="text-[11px] text-amber-800">
                  Exclui a partir deste lançamento em diante. Parcelas anteriores já liquidadas ou passadas serão mantidas.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSeriesDelete('ALL_SERIES')}
                className="w-full text-left p-3 rounded-xl border border-rose-200 hover:border-rose-300 bg-rose-50/40 hover:bg-rose-50 transition-all cursor-pointer"
              >
                <div className="font-bold text-xs text-rose-950">Todas as despesas da série</div>
                <div className="text-[11px] text-rose-800">
                  Exclui todas as parcelas e repetições deste grupo, removendo a série por completo.
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSeriesDeleteModal({ isOpen: false, expense: null })}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualizador de Comprovantes para a Tabela */}
      <ReceiptViewerModal
        isOpen={Boolean(viewingAttachment)}
        onClose={() => setViewingAttachment(null)}
        file={viewingAttachment?.file}
        fallbackName={viewingAttachment?.name}
      />

      {/* Expense Details Modal — aberto pelo clique na linha (consulta, não edição) */}
      {viewingExpense && (() => {
        const exp = viewingExpense;
        const effectiveStatus = getEffectivePayableStatus(exp);
        const isPaid = effectiveStatus === 'PAGO';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300 shrink-0">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-white truncate">{exp.description || exp.supplierName}</h3>
                      {exp.entity === 'CPF' ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                          <User className="w-3 h-3" /> CPF
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                          <Building className="w-3 h-3" /> CNPJ
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {exp.supplierName}{exp.supplierCpfCnpj ? ` • ${exp.supplierCpfCnpj}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingExpense(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 overflow-y-auto">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Valor</div>
                    <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(exp.value)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Forma de Pagamento</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      {exp.paymentMethod ? formatPaymentMethodName(exp.paymentMethod) : 'Não informado'}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Categoria</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">{exp.categoryName}</div>
                    <div className="text-[10px] font-mono text-slate-400">{exp.categoryCode}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Status</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        isPaid ? 'text-emerald-700' : effectiveStatus === 'EM_ATRASO' ? 'text-rose-700' : 'text-amber-700'
                      }`}
                    >
                      {isPaid ? 'Pago' : effectiveStatus === 'EM_ATRASO' ? 'Em Atraso' : 'A Pagar'}
                    </div>
                  </div>
                </div>

                {/* Parcelamento / Recorrência, só quando real */}
                {(exp.expenseType === 'PARCELADA' && exp.totalInstallments && exp.totalInstallments > 1) && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    Parcelamento: parcela {exp.installmentNumber || 1} de {exp.totalInstallments}
                  </div>
                )}
                {(exp.expenseType === 'RECORRENTE' || exp.recurrenceId) && (
                  <div className="flex items-center gap-1.5 text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2">
                    <Repeat className="w-3.5 h-3.5 text-purple-600" />
                    Despesa recorrente ({exp.recurrenceFrequency || 'MENSAL'})
                  </div>
                )}

                {/* Datas */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 font-semibold">Data de Vencimento</div>
                    <div className="font-mono text-slate-900 mt-0.5">{formatDateBr(exp.dueDate)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-semibold">Data de Pagamento (Baixa)</div>
                    <div className="font-mono text-slate-900 mt-0.5">
                      {exp.paymentDate ? formatDateBr(exp.paymentDate) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-semibold">Data de Criação</div>
                    <div className="font-mono text-slate-900 mt-0.5">{formatDateBr(exp.createdAt)}</div>
                  </div>
                </div>

                {/* Atributos fiscais */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      exp.dedutivelLivroCaixaPf === 'SIM'
                        ? 'bg-emerald-100 text-emerald-800'
                        : exp.dedutivelLivroCaixaPf === 'CONDICIONAL'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    Livro Caixa: {exp.dedutivelLivroCaixaPf}
                  </span>
                  {exp.impactaFatorRPj && (
                    <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-indigo-100 text-indigo-800">
                      Fator R
                    </span>
                  )}
                  {exp.isOverridden && (
                    <span className="text-[10px] text-amber-700 font-semibold" title={exp.overrideJustification}>
                      (Alteração manual)
                    </span>
                  )}
                </div>

                {/* Observações */}
                {exp.notes && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      Observações
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{exp.notes}</p>
                  </div>
                )}

                {/* Anexo / comprovante — reutiliza o mesmo ReceiptViewerModal da tabela */}
                {exp.attachmentName && (
                  <button
                    type="button"
                    onClick={() =>
                      setViewingAttachment({ file: exp.attachment, name: exp.attachmentName || 'Comprovante' })
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100/90 px-3 py-1.5 rounded-lg border border-teal-200/80 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {exp.attachmentName}
                  </button>
                )}
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingExpense(exp);
                    setViewingExpense(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setViewingExpense(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
