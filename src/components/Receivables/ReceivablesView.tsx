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
} from 'lucide-react';
import { AccountReceivableItem, TaxOrigin, PaymentMethod, InstallmentStatus, Sale } from '../../types';
import { formatCurrency, formatDateBr, normalizeSearchText } from '../../lib/masks';
import { exportToCsv } from '../../lib/exportUtils';
import { db } from '../../lib/db';
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

  // Batch Edit Modal State
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [batchActionType, setBatchActionType] = useState<'EDIT_FIELDS' | 'SETTLE_ALL'>('EDIT_FIELDS');
  const [batchDueDate, setBatchDueDate] = useState<string>('');
  const [batchTaxOrigin, setBatchTaxOrigin] = useState<TaxOrigin | ''>('');
  const [batchPaymentDate, setBatchPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [batchPaymentMethod, setBatchPaymentMethod] = useState<PaymentMethod>('PIX');
  const [batchBankAccountId, setBatchBankAccountId] = useState<string>('bank_01');

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

  const bankAccounts = db.getBankAccounts();

  const filteredItems = useMemo(() => {
    const trimmed = searchTerm.trim();
    const normQuery = normalizeSearchText(trimmed);

    return items.filter((item) => {
      let matchesSearch = true;
      if (trimmed) {
        matchesSearch =
          normalizeSearchText(item.patientName).includes(normQuery) ||
          normalizeSearchText(item.procedureName).includes(normQuery) ||
          normalizeSearchText(item.documentSummary).includes(normQuery);
      }

      const matchesOrigin =
        taxOriginFilter === 'ALL' || item.taxOrigin === taxOriginFilter;

      const matchesStatus =
        statusFilter === 'ALL' || item.status === statusFilter;

      return matchesSearch && matchesOrigin && matchesStatus;
    });
  }, [items, searchTerm, taxOriginFilter, statusFilter]);

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
    .filter((i) => i.status === 'A_VENCER')
    .reduce((sum, i) => sum + i.balance, 0);

  const totalOverdue = originScopedItems
    .filter((i) => i.status === 'VENCIDO')
    .reduce((sum, i) => sum + i.balance, 0);

  const totalReceived = originScopedItems
    .filter((i) => i.status === 'RECEBIDO' || i.amountReceived > 0)
    .reduce((sum, i) => sum + i.amountReceived, 0);

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>A Vencer</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formatCurrency(totalToReceive)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Fluxo previsto de caixa</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-100 bg-rose-50/20 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 text-xs font-semibold mb-1">
            <span>Vencidas / Em Atraso</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-700">{formatCurrency(totalOverdue)}</div>
          <div className="text-[11px] text-rose-600/80 mt-1">Inadimplência pendente de cobrança</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 text-xs font-semibold mb-1">
            <span>Total Recebido</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{formatCurrency(totalReceived)}</div>
          <div className="text-[11px] text-emerald-600/80 mt-1">Baixado e conciliado no período</div>
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
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por paciente, procedimento ou documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Origin Filter */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
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

        {/* Status Filter */}
        <div className="w-52">
          <CustomSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={[
              { value: 'ALL', label: 'Status: Todos' },
              { value: 'A_VENCER', label: 'A Vencer' },
              { value: 'VENCIDO', label: 'Vencidas' },
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
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Recebimento</th>
                <th className="py-3 px-4">Origem</th>
                <th className="py-3 px-4">Paciente</th>
                <th className="py-3 px-4">Procedimento / Parcela</th>
                <th className="py-3 px-4">Documento Vinculado</th>
                <th className="py-3 px-4 text-right">Valor Parcela</th>
                <th className="py-3 px-4 text-center min-w-[110px] whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Nenhuma parcela encontrada.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.has(item.installmentId);
                  const isOverdue = item.status === 'VENCIDO';
                  const isReceived = item.status === 'RECEBIDO';
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

                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                        {formatDateBr(item.dueDate)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {item.paymentDate ? (
                          <span className="text-emerald-700 font-semibold">{formatDateBr(item.paymentDate)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {item.taxOrigin === 'CPF' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">
                            <User className="w-3 h-3" /> CPF
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-blue-100 text-blue-800">
                            <Building className="w-3 h-3" /> CNPJ
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {item.patientName}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{item.procedureName}</div>
                        <div className="text-[11px] text-slate-500">
                          Parcela {item.installmentNumber} de {item.totalInstallments}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isCpfPendingReceita ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Receita Saúde Pendente
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-700">
                            {item.documentSummary}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(item.value)}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[85px] whitespace-nowrap px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            isReceived
                              ? 'bg-emerald-100 text-emerald-800'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

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
                        { value: 'PIX', label: 'PIX (Instantâneo)' },
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
                        label: `${acc.name} (${acc.accountType === 'CORRENTE_PF' ? 'PF' : 'PJ'})`,
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
