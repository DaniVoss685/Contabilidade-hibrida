import React, { useState, useMemo } from 'react';
import {
  ReceiptText,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  User,
  Building,
  Calendar,
  Download,
  Trash2,
  CheckSquare,
  Square,
  Edit3,
  CheckCircle2,
  X,
  CreditCard,
  RotateCcw,
  MessageSquareText,
  Eye,
} from 'lucide-react';
import { AccountReceivableItem, TaxOrigin, PaymentMethod, InstallmentStatus, Sale } from '../../types';
import { formatCurrency, formatDateBr, normalizeSearchText } from '../../lib/masks';
import { exportToCsv } from '../../lib/exportUtils';
import { db } from '../../lib/db';
import { getEffectiveReceivableStatus } from '../../lib/statusHelper';
import { EditReceivableModal } from '../Modals/EditReceivableModal';
import { NewSaleModal } from '../Modals/NewSaleModal';
import { CustomSelect, DatePicker, ConfirmDialog, useToast } from '../UI';

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

interface ReceivablesViewProps {
  items: AccountReceivableItem[];
  onOpenSettleModal: (item: AccountReceivableItem) => void;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onResetPeriod?: () => void;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({
  items,
  onOpenSettleModal,
  selectedYear,
  selectedMonth,
  onResetPeriod,
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [taxOriginFilter, setTaxOriginFilter] = useState<'ALL' | TaxOrigin>('ALL');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Single Item Edit State
  const [editingItem, setEditingItem] = useState<AccountReceivableItem | null>(null);
  const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
  const [viewingObservation, setViewingObservation] = useState<{
    patientName: string;
    procedureName: string;
    notes: string;
  } | null>(null);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);

  // Batch Edit Modal State
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [batchActionType, setBatchActionType] = useState<'EDIT_FIELDS' | 'SETTLE_ALL'>('EDIT_FIELDS');
  const [batchDueDate, setBatchDueDate] = useState<string>('');
  const [batchTaxOrigin, setBatchTaxOrigin] = useState<TaxOrigin | ''>('');
  const [batchPaymentDate, setBatchPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [batchPaymentMethod, setBatchPaymentMethod] = useState<PaymentMethod>('PIX');
  const [batchBankAccountId, setBatchBankAccountId] = useState<string>(() => db.getPreferredBankAccountId() || 'bank_01');

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

  const [procedureFilter, setProcedureFilter] = useState<string>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');

  const bankAccounts = db.getBankAccounts();

  const uniqueProcedures = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.procedureName))).filter(Boolean).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const trimmed = searchTerm.trim();
    const normQuery = normalizeSearchText(trimmed);

    return items.filter((item) => {
      let matchesSearch = true;
      if (trimmed) {
        matchesSearch =
          normalizeSearchText(item.patientName).includes(normQuery) ||
          normalizeSearchText(item.documentSummary).includes(normQuery);
      }

      const matchesOrigin =
        taxOriginFilter === 'ALL' || item.taxOrigin === taxOriginFilter;

      const effectiveStatus = getEffectiveReceivableStatus(item);
      let matchesStatus = true;
      if (statusFilter === 'ALL') {
        matchesStatus = true;
      } else if (statusFilter === 'EM_ATRASO' || statusFilter === 'VENCIDO') {
        matchesStatus = effectiveStatus === 'EM_ATRASO' || item.status === 'EM_ATRASO' || item.status === 'VENCIDO';
      } else if (statusFilter === 'A_VENCER') {
        matchesStatus = effectiveStatus === 'A_VENCER' || item.status === 'A_VENCER';
      } else if (statusFilter === 'RECEBIDO') {
        matchesStatus = effectiveStatus === 'RECEBIDO' || item.status === 'RECEBIDO';
      } else if (statusFilter === 'PARCIALMENTE_RECEBIDO') {
        matchesStatus = effectiveStatus === 'PARCIALMENTE_RECEBIDO' || item.status === 'PARCIALMENTE_RECEBIDO';
      } else {
        matchesStatus = item.status === statusFilter;
      }

      const matchesProcedure =
        procedureFilter === 'ALL' || item.procedureName === procedureFilter;

      let matchesPaymentMethod = true;
      if (paymentMethodFilter === 'CARD_WITH_FEE') {
        matchesPaymentMethod = Boolean(item.cardFeeAmount && item.cardFeeAmount > 0);
      } else if (paymentMethodFilter !== 'ALL') {
        matchesPaymentMethod = item.paymentMethod === paymentMethodFilter;
      }

      return (
        matchesSearch &&
        matchesOrigin &&
        matchesStatus &&
        matchesProcedure &&
        matchesPaymentMethod
      );
    });
  }, [items, searchTerm, taxOriginFilter, statusFilter, procedureFilter, paymentMethodFilter]);

  // Bulk Selection Handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.installmentId)));
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

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmState({
      isOpen: true,
      title: 'Excluir Parcelas em Lote',
      message: `Tem certeza que deseja excluir ${count} parcela(s) selecionada(s)? Esta ação cancelará os lançamentos correspondentes.`,
      confirmLabel: 'Excluir Parcelas',
      variant: 'danger',
      onConfirm: () => {
        const deleted = db.batchDeleteReceivables(Array.from(selectedIds));
        setSelectedIds(new Set());
        toast.success(`${deleted} parcela(s) excluída(s) com sucesso.`);
      },
    });
  };

  const handleDeleteSingle = (installmentId: string, patientName: string, procName: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Excluir Parcela',
      message: `Deseja realmente excluir esta parcela a receber de "${patientName}" (${procName})?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        db.deleteReceivableInstallment(installmentId);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(installmentId);
          return next;
        });
        toast.success('Parcela excluída com sucesso.');
      },
    });
  };

  const handleOpenBatchEdit = (type: 'EDIT_FIELDS' | 'SETTLE_ALL') => {
    setBatchActionType(type);
    setIsBatchEditOpen(true);
  };

  const handleSaveBatchEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) return;

    if (batchActionType === 'SETTLE_ALL') {
      db.batchUpdateReceivables(Array.from(selectedIds), {
        status: 'RECEBIDO',
        paymentDate: batchPaymentDate,
        paymentMethod: batchPaymentMethod,
        bankAccountId: batchBankAccountId,
      });
      toast.success('Parcelas liquidadas com sucesso.');
    } else {
      const updates: any = {};
      if (batchDueDate) updates.dueDate = batchDueDate;
      if (batchTaxOrigin) updates.taxOrigin = batchTaxOrigin;

      if (Object.keys(updates).length > 0) {
        db.batchUpdateReceivables(Array.from(selectedIds), updates);
        toast.success('Parcelas atualizadas com sucesso.');
      }
    }

    setIsBatchEditOpen(false);
    setSelectedIds(new Set());
  };

  const handleUnsettle = (saleId: string, installmentId: string, patientName: string) => {
    db.unsettleInstallment(saleId, installmentId);
    toast.success(`Recebimento da parcela de ${patientName} desfeito com sucesso.`);
  };

  // Totals scoped by taxOriginFilter
  const originScopedItems = useMemo(() => {
    return items.filter((i) => taxOriginFilter === 'ALL' || i.taxOrigin === taxOriginFilter);
  }, [items, taxOriginFilter]);

  const totalToReceive = originScopedItems
    .filter((i) => {
      const eff = getEffectiveReceivableStatus(i);
      return eff === 'A_VENCER' || eff === 'PARCIALMENTE_RECEBIDO';
    })
    .reduce((sum, i) => sum + i.balance, 0);

  const totalOverdue = originScopedItems
    .filter((i) => {
      const eff = getEffectiveReceivableStatus(i);
      return eff === 'EM_ATRASO' || i.status === 'EM_ATRASO' || i.status === 'VENCIDO';
    })
    .reduce((sum, i) => sum + i.balance, 0);

  const totalReceived = originScopedItems
    .filter((i) => i.status === 'RECEBIDO' || i.amountReceived > 0)
    .reduce((sum, i) => sum + i.amountReceived, 0);

  const totalCardFees = originScopedItems.reduce(
    (sum, i) => sum + (i.cardFeeAmount || 0),
    0
  );
  const totalWithCardFees = originScopedItems
    .filter((i) => i.cardFeeAmount && i.cardFeeAmount > 0)
    .reduce((sum, i) => sum + i.value, 0);
  const avgCardFeePercent = totalWithCardFees > 0
    ? ((totalCardFees / totalWithCardFees) * 100).toFixed(1)
    : '0.0';

  const pendingReceitaSaudeItems = originScopedItems.filter(
    (i) => i.taxOrigin === 'CPF' && i.status === 'RECEBIDO' && i.receitaSaudeStatus !== 'EMITIDO'
  );

  const handleExport = () => {
    const headers = [
      'Vencimento',
      'Origem',
      'Paciente',
      'Procedimento',
      'Parcela',
      'Valor Parcela',
      'Valor Recebido',
      'Saldo',
      'Status',
      'Documento',
    ];
    const rows = filteredItems.map((i) => [
      formatDateBr(i.dueDate),
      i.taxOrigin,
      i.patientName,
      i.procedureName,
      `${i.installmentNumber}/${i.totalInstallments}`,
      i.value,
      i.amountReceived,
      i.balance,
      i.status,
      i.documentSummary,
    ]);
    exportToCsv('contas_a_receber', [headers, ...rows]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-teal-600" />
            Contas a Receber
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestão segregada de recebíveis entre Pessoa Física (Livro Caixa) e Pessoa Jurídica (Simples Nacional)
          </p>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Recebido */}
        <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold mb-1">
            <span>Total Recebido</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{formatCurrency(totalReceived)}</div>
          <div className="text-[11px] text-emerald-600/80 mt-1">Baixado e conciliado no período</div>
        </div>

        {/* 2. A Vencer */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>A Vencer</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formatCurrency(totalToReceive)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Fluxo previsto de caixa</div>
        </div>

        {/* 3. Vencidas em Atraso */}
        <div className="bg-white p-4 rounded-xl border border-rose-100 bg-rose-50/20 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 text-xs font-semibold mb-1">
            <span>Vencidas em Atraso</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-700">{formatCurrency(totalOverdue)}</div>
          <div className="text-[11px] text-rose-600/80 mt-1">Inadimplência pendente de cobrança</div>
        </div>

        {/* 4. Taxas de Maquininha */}
        <div className="bg-white p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 text-xs font-semibold mb-1">
            <span>Taxas de Maquininha</span>
            <CreditCard className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-indigo-700">{formatCurrency(totalCardFees)}</div>
          <div className="text-[11px] text-indigo-600/80 mt-1">
            {totalCardFees > 0 ? `Retido por operadoras (${avgCardFeePercent}% méd.)` : 'Nenhum desconto no período'}
          </div>
        </div>
      </div>

      {/* Receita Saúde Warning Banner if any pending */}
      {pendingReceitaSaudeItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900">
                Atenção: {pendingReceitaSaudeItems.length} recebimento(s) PF pendente(s) de emissão no Receita Saúde
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Valores recebidos na Pessoa Física devem possuir comprovante de pagamento emitido para dedução do Carnê-Leão.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Global Period Banner */}
      {selectedYear && (
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="text-slate-600">
              Período Selecionado:{' '}
              <strong className="text-slate-900 font-bold">
                {selectedMonth === 'ALL'
                  ? `Ano Inteiro de ${selectedYear}`
                  : `${MONTH_NAMES[selectedMonth || 1]} de ${selectedYear}`}
              </strong>
            </span>
            <span className="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
              {filteredItems.length} {filteredItems.length === 1 ? 'parcela' : 'parcelas'}
            </span>
          </div>

          {selectedMonth !== 'ALL' && onResetPeriod && (
            <button
              type="button"
              onClick={onResetPeriod}
              className="text-teal-700 hover:text-teal-900 font-bold hover:underline cursor-pointer"
            >
              Exibir todo o ano de {selectedYear}
            </button>
          )}
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por paciente ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Origin Filter */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs shrink-0">
          <button
            onClick={() => setTaxOriginFilter('ALL')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              taxOriginFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setTaxOriginFilter('CPF')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              taxOriginFilter === 'CPF' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800'
            }`}
          >
            Pessoa Física (CPF)
          </button>
          <button
            onClick={() => setTaxOriginFilter('CNPJ')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              taxOriginFilter === 'CNPJ' ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-800'
            }`}
          >
            Pessoa Jurídica (CNPJ)
          </button>
        </div>

        {/* Procedure Filter */}
        <div className="w-44 shrink-0">
          <CustomSelect
            value={procedureFilter}
            onChange={(val) => setProcedureFilter(val)}
            options={[
              { value: 'ALL', label: 'Procedimento: Todos' },
              ...uniqueProcedures.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>

        {/* Payment Method Filter */}
        <div className="w-52 shrink-0">
          <CustomSelect
            value={paymentMethodFilter}
            onChange={(val) => setPaymentMethodFilter(val)}
            options={[
              { value: 'ALL', label: 'Forma: Todas' },
              { value: 'CARD_WITH_FEE', label: '💳 Com Taxa de Maquininha' },
              { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
              { value: 'PIX', label: 'PIX' },
              { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
              { value: 'BOLETO', label: 'Boleto Bancário' },
              { value: 'DINHEIRO', label: 'Dinheiro / Espécie' },
              { value: 'TRANSFERENCIA', label: 'Transferência Bancária' },
            ]}
          />
        </div>

        {/* Status Filter */}
        <div className="w-44 shrink-0">
          <CustomSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={[
              { value: 'ALL', label: 'Status: Todos' },
              { value: 'A_VENCER', label: 'A Vencer' },
              { value: 'EM_ATRASO', label: 'Em Atraso' },
              { value: 'RECEBIDO', label: 'Recebidas (Liquidadas)' },
            ]}
          />
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="bg-teal-500 text-slate-950 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              parcela(s) selecionada(s)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Liquidar em Lote */}
            <button
              onClick={() => handleOpenBatchEdit('SETTLE_ALL')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Liquidar em Lote
            </button>

            {/* Editar em Lote */}
            <button
              onClick={() => handleOpenBatchEdit('EDIT_FIELDS')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar em Lote
            </button>

            {/* Excluir em Lote */}
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir em Lote
            </button>

            {/* Desmarcar */}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Desmarcar
            </button>
          </div>
        </div>
      )}

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
                    className="cursor-pointer text-slate-600 hover:text-slate-900"
                    title={selectedIds.size === filteredItems.length && filteredItems.length > 0 ? "Desmarcar todas" : "Selecionar todas"}
                  >
                    {filteredItems.length > 0 && selectedIds.size === filteredItems.length ? (
                      <CheckSquare className="w-4 h-4 text-teal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 text-center">Procedimento</th>
                <th className="py-3 px-4 text-center">Paciente</th>
                <th className="py-3 px-4 text-center">Valor</th>
                <th className="py-3 px-4 text-center">Data de Pagamento</th>
                <th className="py-3 px-4 text-center">Data de Vencimento</th>
                <th className="py-3 px-4 text-center min-w-[110px] whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-center">Atributos Fiscais</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Nenhuma parcela encontrada.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.has(item.installmentId);
                  const effectiveStatus = getEffectiveReceivableStatus(item);
                  const isOverdue =
                    effectiveStatus === 'EM_ATRASO' ||
                    item.status === 'EM_ATRASO' ||
                    item.status === 'VENCIDO';
                  const isReceived = effectiveStatus === 'RECEBIDO' || item.status === 'RECEBIDO';
                  const isPartial =
                    effectiveStatus === 'PARCIALMENTE_RECEBIDO' ||
                    item.status === 'PARCIALMENTE_RECEBIDO';
                  const isCpfPendingReceita =
                    item.taxOrigin === 'CPF' &&
                    isReceived &&
                    item.receitaSaudeStatus !== 'EMITIDO';

                  return (
                    <tr
                      key={item.installmentId}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-teal-50/60'
                          : isOverdue
                          ? 'bg-rose-50/30 hover:bg-rose-50/50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(item.installmentId)}
                          className="cursor-pointer text-slate-600 hover:text-slate-900"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-teal-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </td>

                      {/* 1. Procedimento */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            const s = db.getSales().find((x) => x.id === item.saleId);
                            if (s) setViewingSale(s);
                          }}
                          className="font-semibold text-slate-900 hover:text-teal-600 transition-colors text-left flex items-center gap-1.5 cursor-pointer group"
                          title="Clique para ver detalhes completos da venda"
                        >
                          <span>{item.procedureName}</span>
                          <Eye className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100 transition-opacity text-teal-600 shrink-0" />
                        </button>
                      </td>

                      {/* 2. Paciente & Parcela */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{item.patientName}</span>

                          {/* Icon to view observation if notes exists */}
                          {(() => {
                            const note = item.notes?.trim();
                            if (!note) return null;
                            const lower = note.toLowerCase();
                            const procLower = (item.procedureName || '').trim().toLowerCase();
                            if (lower.startsWith('atendimento clínico') || lower === procLower || lower === `atendimento clínico - ${procLower}`) {
                              return null;
                            }
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingObservation({
                                    patientName: item.patientName,
                                    procedureName: item.procedureName,
                                    notes: note,
                                  })
                                }
                                title="Ver observação da venda"
                                className="inline-flex items-center justify-center p-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors cursor-pointer"
                              >
                                <MessageSquareText className="w-3.5 h-3.5" />
                              </button>
                            );
                          })()}

                          {/* Origem: Agenda vs Manual */}
                          {item.origin === 'AGENDA' ? (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold text-[9px] bg-purple-50 text-purple-700 border border-purple-200"
                              title="Receita vinculada à Agenda"
                            >
                              📅 Agenda
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold text-[9px] bg-slate-100 text-slate-600 border border-slate-200"
                              title="Lançamento manual"
                            >
                              ✍️ Manual
                            </span>
                          )}

                          {/* Titularidade badge */}
                          {item.taxOrigin === 'CPF' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-bold text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <User className="w-2.5 h-2.5" /> CPF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-bold text-[9px] bg-blue-50 text-blue-800 border border-blue-200">
                              <Building className="w-2.5 h-2.5" /> CNPJ
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Parcela {item.installmentNumber}/{item.totalInstallments}
                          </span>
                        </div>
                      </td>

                      {/* 3. Valor */}
                      <td className="py-3.5 px-4 text-right min-w-[130px]">
                        <div className="font-bold text-slate-900 text-xs font-mono">
                          {formatCurrency(item.value)}
                        </div>
                        {item.cardFeeAmount && item.cardFeeAmount > 0 ? (
                          <div className="mt-1 flex justify-end">
                            <div
                              className="group relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-[10px] font-medium transition-colors cursor-help"
                            >
                              <CreditCard className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              <span>Líq: <strong className="font-bold font-mono">{formatCurrency(item.netValue || (item.value - item.cardFeeAmount))}</strong></span>

                              {/* Tooltip on hover */}
                              <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:flex flex-col gap-1 bg-slate-900 text-white text-[10px] rounded-lg p-2.5 shadow-xl whitespace-nowrap z-30 pointer-events-none text-left">
                                <div className="font-bold text-slate-200 border-b border-slate-700 pb-1">Taxa da Maquininha</div>
                                <div className="text-slate-300">Valor Bruto: <span className="font-mono text-white">{formatCurrency(item.value)}</span></div>
                                <div className="text-rose-300">Taxa Retida ({item.cardFeePercent || 0}%): <span className="font-mono font-bold">-{formatCurrency(item.cardFeeAmount)}</span></div>
                                <div className="text-emerald-300 pt-0.5 border-t border-slate-800">Valor Líquido: <span className="font-mono font-bold">{formatCurrency(item.netValue || (item.value - item.cardFeeAmount))}</span></div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {item.originalEstimatedValue && Math.abs(item.originalEstimatedValue - (item.value * item.totalInstallments)) > 1 ? (
                          <div
                            className="text-[9.5px] font-sans font-medium text-purple-700 mt-1"
                            title={`Valor previsto na agenda: ${formatCurrency(item.originalEstimatedValue)}`}
                          >
                            Previsto: {formatCurrency(item.originalEstimatedValue)}
                          </div>
                        ) : null}
                      </td>

                      {/* 4. Data de Pagamento (Recebimento) */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 text-center">
                        {item.paymentDate ? (
                          <span className="text-emerald-700 font-semibold">{formatDateBr(item.paymentDate)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 5. Data de Vencimento */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900 text-center">
                        {formatDateBr(item.dueDate)}
                      </td>

                      {/* 6. Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[80px] whitespace-nowrap px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            isReceived
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                              : isOverdue
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                              : isPartial
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                              : 'bg-blue-50 text-blue-700 border border-blue-200/80'
                          }`}
                        >
                          {isReceived ? 'Recebida' : isOverdue ? 'Em Atraso' : isPartial ? 'Parcial' : 'A Vencer'}
                        </span>
                      </td>

                      {/* 7. Atributos Fiscais */}
                      <td className="py-3.5 px-4 text-center">
                        {isCpfPendingReceita ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Receita Saúde Pendente
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-700">
                            {item.documentSummary || '—'}
                          </span>
                        )}
                      </td>

                      {/* 8. Ações */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!isReceived ? (
                            <button
                              onClick={() => onOpenSettleModal(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                              Receber
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-emerald-700 font-semibold flex items-center justify-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Liquidada
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnsettle(item.saleId, item.installmentId, item.patientName)}
                                title="Desfazer recebimento da parcela (estorno)"
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {/* Edit single button */}
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            title="Editar parcela de conta a receber"
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Delete single button */}
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteSingle(
                                item.installmentId,
                                item.patientName,
                                item.procedureName
                              )
                            }
                            title="Excluir parcela do contas a receber"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
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
      {isBatchEditOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                {batchActionType === 'SETTLE_ALL' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Edit3 className="w-5 h-5 text-indigo-400" />
                )}
                <div>
                  <h3 className="text-sm font-bold">
                    {batchActionType === 'SETTLE_ALL'
                      ? 'Liquidar Parcelas em Lote'
                      : 'Editar Parcelas em Lote'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {selectedIds.size} parcela(s) selecionada(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchEditOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBatchEdit} className="p-6 space-y-4">
              {batchActionType === 'SETTLE_ALL' ? (
                <>
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                    Todas as {selectedIds.size} parcelas selecionadas serão marcadas como <strong>RECEBIDAS</strong>, dando baixa no saldo em aberto.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Data do Recebimento
                    </label>
                    <DatePicker
                      value={batchPaymentDate}
                      onChange={setBatchPaymentDate}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Forma de Pagamento
                    </label>
                    <CustomSelect
                      value={batchPaymentMethod}
                      onChange={(val) => setBatchPaymentMethod(val as PaymentMethod)}
                      options={[
                        { value: 'PIX', label: 'PIX' },
                        { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
                        { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
                        { value: 'DINHEIRO', label: 'Dinheiro em Espécie' },
                        { value: 'TRANSFERENCIA', label: 'Transferência / TED' },
                        { value: 'BOLETO', label: 'Boleto Bancário' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Conta Bancária de Destino
                    </label>
                    <CustomSelect
                      value={batchBankAccountId}
                      onChange={setBatchBankAccountId}
                      options={bankAccounts.map((acc) => ({
                        value: acc.id,
                        label: `${acc.isPreferred ? '⭐ ' : ''}${acc.name} (${acc.accountType === 'CORRENTE_PF' ? 'PF' : 'PJ'})${acc.isPreferred ? ' - Principal' : ''}`,
                      }))}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-xs text-indigo-900">
                    Preencha apenas os campos que deseja sobrescrever em todas as {selectedIds.size} parcelas selecionadas.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nova Data de Vencimento (Opcional)
                    </label>
                    <DatePicker
                      value={batchDueDate}
                      onChange={setBatchDueDate}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Deixe em branco se não desejar alterar o vencimento.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Alterar Origem Tributária (Opcional)
                    </label>
                    <CustomSelect
                      value={batchTaxOrigin}
                      onChange={(val) => setBatchTaxOrigin(val as TaxOrigin | '')}
                      options={[
                        { value: '', label: 'Manter origem original' },
                        { value: 'CPF', label: 'Pessoa Física (CPF / Carnê-Leão)' },
                        { value: 'CNPJ', label: 'Pessoa Jurídica (CNPJ / Simples Nacional)' },
                      ]}
                    />
                  </div>
                </>
              )}

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBatchEditOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Confirmar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Single Receivable Edit Modal */}
      {editingItem && (
        <EditReceivableModal
          isOpen={Boolean(editingItem)}
          onClose={() => setEditingItem(null)}
          item={editingItem}
          onOpenEditSale={(saleId) => {
            const sale = db.getSaleById(saleId);
            if (sale) {
              setSaleToEdit(sale);
            }
          }}
        />
      )}

      {/* Full Sale Edit Modal if triggered from Receivable */}
      {saleToEdit && (
        <NewSaleModal
          isOpen={Boolean(saleToEdit)}
          onClose={() => setSaleToEdit(null)}
          patients={db.getPatients()}
          saleToEdit={saleToEdit}
        />
      )}

      {/* Observation Modal */}
      {viewingObservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <MessageSquareText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Observação da Venda</h3>
                  <p className="text-xs text-slate-500">{viewingObservation.patientName} — {viewingObservation.procedureName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingObservation(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {viewingObservation.notes}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingObservation(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Sale Details Modal */}
      {viewingSale && (() => {
        const viewingFeeAmount =
          viewingSale.cardFeeAmount ??
          viewingSale.installments?.reduce((sum, i) => sum + (i.cardFeeAmount || 0), 0) ??
          0;
        const viewingFeePercent =
          viewingSale.cardFeePercent ??
          viewingSale.installments?.find((i) => i.cardFeePercent)?.cardFeePercent ??
          0;
        const viewingNetValue =
          viewingSale.netValue ??
          (viewingSale.totalValue - viewingFeeAmount);

        const formatPaymentMethodModal = (pm?: string) => {
          if (!pm) return 'NÃO INFORMADO';
          if (pm === 'CARTAO_CREDITO') return 'CARTÃO-DE-CRÉDITO';
          if (pm === 'CARTAO_DEBITO') return 'CARTÃO-DE-DÉBITO';
          if (pm === 'PIX') return 'PIX';
          if (pm === 'BOLETO') return 'BOLETO';
          if (pm === 'DINHEIRO') return 'DINHEIRO';
          if (pm === 'TRANSFERENCIA') return 'TRANSFERÊNCIA';
          return pm.replace(/_/g, '-').toUpperCase();
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
                    <ReceiptText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">Venda: {viewingSale.procedureName}</h3>
                      {viewingSale.taxOrigin === 'CPF' ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <User className="w-3 h-3" /> CPF (Pessoa Física)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          <Building className="w-3 h-3" /> CNPJ (Pessoa Jurídica)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Paciente: <strong className="text-white">{viewingSale.patientName}</strong> • Data: {formatDateBr(viewingSale.serviceDate)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingSale(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 overflow-y-auto">
                {/* Key Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Valor Total</div>
                    <div className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(viewingSale.totalValue)}</div>
                    {viewingSale.originalEstimatedValue && viewingSale.originalEstimatedValue !== viewingSale.totalValue && (
                      <div className="text-[10px] font-medium text-purple-700 mt-0.5">
                        Previsto: {formatCurrency(viewingSale.originalEstimatedValue)}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Forma Pagto</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">{formatPaymentMethodModal(viewingSale.paymentMethod)}</div>
                    <div className="text-[10px] text-slate-500">{viewingSale.installmentsCount}x parcela(s)</div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Taxa Maquininha</div>
                    <div className="text-sm font-bold text-rose-700 mt-0.5">
                      {viewingFeeAmount > 0
                        ? `-${formatCurrency(viewingFeeAmount)} (${viewingFeePercent}%)`
                        : 'R$ 0,00'}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-semibold">
                      Líq: {formatCurrency(viewingNetValue)}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Origem</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      {viewingSale.origin === 'AGENDA' ? '📅 Agenda' : '✍️ Lançamento Manual'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {viewingSale.taxOrigin === 'CPF' ? 'Livro Caixa / Carnê-Leão' : 'NFS-e / PJ'}
                    </div>
                  </div>
                </div>

                {/* Price Change History if exists */}
                {viewingSale.priceHistory && viewingSale.priceHistory.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 text-xs text-purple-900 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-purple-950">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      Histórico de Alterações de Valor
                    </div>
                    <div className="divide-y divide-purple-200/60">
                      {viewingSale.priceHistory.map((h, i) => (
                        <div key={i} className="py-1 flex items-center justify-between text-[11px]">
                          <span>{formatDateBr(h.date)}: {h.note || 'Valor alterado'}</span>
                          <span className="font-mono font-bold text-purple-800">
                            {formatCurrency(h.from)} &rarr; {formatCurrency(h.to)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes / Observation */}
                {viewingSale.notes && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-950">
                      <MessageSquareText className="w-3.5 h-3.5 text-amber-600" />
                      Observação da Venda
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{viewingSale.notes}</p>
                  </div>
                )}

                {/* Installments Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Parcelas da Venda ({viewingSale.installments.length})
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center">Nº</th>
                          <th className="py-2.5 px-3">Vencimento</th>
                          <th className="py-2.5 px-3">Pagamento</th>
                          <th className="py-2.5 px-3 text-right">Valor</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-center">Documento Fiscal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {viewingSale.installments.map((inst) => {
                          const isPaid = inst.status === 'RECEBIDO';
                          const effectiveInstStatus = getEffectiveReceivableStatus(inst);
                          const isInstOverdue = !isPaid && (effectiveInstStatus === 'EM_ATRASO' || inst.status === 'VENCIDO');
                          return (
                            <tr key={inst.id} className={isPaid ? 'bg-emerald-50/20' : isInstOverdue ? 'bg-rose-50/30' : 'hover:bg-slate-50'}>
                              <td className="py-2 px-3 text-center font-bold text-slate-600">
                                {inst.installmentNumber}/{viewingSale.installmentsCount}
                              </td>
                              <td className="py-2 px-3 font-mono">{formatDateBr(inst.dueDate)}</td>
                              <td className="py-2 px-3 font-mono">
                                {inst.paymentDate ? (
                                  <span className="text-emerald-700 font-semibold">{formatDateBr(inst.paymentDate)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {formatCurrency(inst.value)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[9.5px] ${
                                    isPaid
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                      : isInstOverdue
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200/80'
                                  }`}
                                >
                                  {isPaid ? 'Recebida' : isInstOverdue ? 'Em Atraso' : 'A Receber'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center text-[10px]">
                                {inst.receitaSaudeStatus === 'EMITIDO' ? (
                                  <span className="text-emerald-700 font-semibold">
                                    Receita Saúde {inst.receitaSaudeNumber ? `#${inst.receitaSaudeNumber}` : 'Emitido'}
                                  </span>
                                ) : viewingSale.taxOrigin === 'CPF' ? (
                                  <span className="text-slate-400">
                                    {isPaid ? 'Receita Saúde Pendente' : 'Aguardando Recebimento'}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">
                                    {viewingSale.nfseStatus === 'EMITIDA'
                                      ? `NFS-e #${viewingSale.nfseNumber || ''}`
                                      : 'NFS-e Pendente'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSaleToEdit(viewingSale);
                    setViewingSale(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar Venda Completa
                </button>
                <button
                  type="button"
                  onClick={() => setViewingSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
