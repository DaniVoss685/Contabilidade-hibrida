import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  Filter,
  PlusCircle,
  FileCheck,
  Building,
  User,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  Trash2,
  CheckSquare,
  Square,
  Edit,
  Calendar,
  RotateCcw,
  X,
  MessageSquareText,
} from 'lucide-react';
import { Sale, TaxOrigin, ReceitaSaudeStatus, NfseStatus } from '../../types';
import { formatCurrency, formatCpf, formatDateBr, normalizeSearchText, matchDocumentSearch } from '../../lib/masks';
import { exportToCsv } from '../../lib/exportUtils';
import { db, getSalePaymentSummary } from '../../lib/db';
import { NewSaleModal } from '../Modals/NewSaleModal';
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

interface SalesViewProps {
  sales: Sale[];
  maskCpf: boolean;
  onOpenNewSale: () => void;
  onOpenSettleModal: (item: any) => void;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onResetPeriod?: () => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  sales,
  maskCpf,
  onOpenNewSale,
  onOpenSettleModal,
  selectedYear,
  selectedMonth,
  onResetPeriod,
}) => {
  const toast = useToast();
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [taxOriginFilter, setTaxOriginFilter] = useState<'ALL' | TaxOrigin>('ALL');
  const [procedureFilter, setProcedureFilter] = useState<string>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [docFilter, setDocFilter] = useState<string>('ALL');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const uniqueProcedures = useMemo(() => {
    return Array.from(new Set(sales.map((s) => s.procedureName))).filter(Boolean).sort();
  }, [sales]);

  // Quick edit doc state
  const [editingSaleDocId, setEditingSaleDocId] = useState<string | null>(null);
  const [docInputNumber, setDocInputNumber] = useState<string>('');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [viewingObservation, setViewingObservation] = useState<{
    patientName: string;
    procedureName: string;
    notes: string;
  } | null>(null);

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

  const handleSelectAll = (allList: Sale[]) => {
    if (selectedIds.size === allList.length && allList.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allList.map((s) => s.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmState({
      isOpen: true,
      title: 'Excluir Receitas Selecionadas',
      message: `ATENÇÃO: Deseja realmente excluir ${count} receita(s) selecionada(s)? Esta ação cancelará os recebimentos vinculados.`,
      confirmLabel: 'Excluir Todas',
      variant: 'danger',
      onConfirm: () => {
        db.batchDeleteSales(Array.from(selectedIds));
        setSelectedIds(new Set());
        toast.success('Receitas excluídas com sucesso.');
      },
    });
  };

  const handleDeleteSingleSale = (id: string, patient: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Excluir Receita',
      message: `Deseja realmente excluir a receita de ${patient}? Os recebimentos em aberto serão cancelados.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        db.deleteSale(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success('Receita excluída com sucesso.');
      },
    });
  };

  const handleUnsettleInstallment = (saleId: string, installmentId: string) => {
    db.unsettleInstallment(saleId, installmentId);
    toast.success('Recebimento desfeito com sucesso.');
  };

  const filteredSales = useMemo(() => {
    const trimmed = searchTerm.trim();
    const normQuery = normalizeSearchText(trimmed);

    return sales.filter((sale) => {
      let matchesSearch = true;
      if (trimmed) {
        const patientMatch = normalizeSearchText(sale.patientName).includes(normQuery);
        const cpfMatch = matchDocumentSearch(sale.patientCpf, trimmed);
        const nfseMatch = sale.nfseNumber ? sale.nfseNumber.includes(trimmed) : false;
        matchesSearch = patientMatch || cpfMatch || nfseMatch;
      }

      const matchesOrigin =
        taxOriginFilter === 'ALL' || sale.taxOrigin === taxOriginFilter;

      const matchesProcedure =
        procedureFilter === 'ALL' || sale.procedureName === procedureFilter;

      let matchesPaymentMethod = true;
      if (paymentMethodFilter === 'CARD_WITH_FEE') {
        const fee = sale.cardFeeAmount || sale.installments.reduce((acc, i) => acc + (i.cardFeeAmount || 0), 0);
        matchesPaymentMethod = fee > 0;
      } else if (paymentMethodFilter !== 'ALL') {
        matchesPaymentMethod = sale.paymentMethod === paymentMethodFilter;
      }

      let matchesDoc = true;
      if (docFilter === 'PENDING') {
        if (sale.taxOrigin === 'CPF') {
          matchesDoc = sale.installments.some(
            (i) => i.status === 'RECEBIDO' && i.receitaSaudeStatus !== 'EMITIDO'
          );
        } else {
          matchesDoc = sale.nfseStatus !== 'EMITIDA';
        }
      } else if (docFilter === 'EMITTED') {
        if (sale.taxOrigin === 'CPF') {
          matchesDoc = sale.installments.every(
            (i) => i.status !== 'RECEBIDO' || i.receitaSaudeStatus === 'EMITIDO'
          );
        } else {
          matchesDoc = sale.nfseStatus === 'EMITIDA';
        }
      }

      return matchesSearch && matchesOrigin && matchesProcedure && matchesPaymentMethod && matchesDoc;
    });
  }, [sales, searchTerm, taxOriginFilter, procedureFilter, paymentMethodFilter, docFilter]);

  const handleExportCsv = () => {
    const headers = [
      'Data Competência',
      'Origem Tributária',
      'Paciente',
      'CPF Paciente',
      'Pagador Responsável',
      'Procedimento',
      'Valor Total',
      'Parcelas',
      'Documento Fiscal',
      'Status Documento',
    ];

    const rows = filteredSales.map((s) => [
      formatDateBr(s.serviceDate),
      s.taxOrigin,
      s.patientName,
      formatCpf(s.patientCpf, false),
      s.payerIsBeneficiary ? 'O próprio' : s.payerName || 'Não informado',
      s.procedureName,
      s.totalValue,
      s.installmentsCount,
      s.taxOrigin === 'CPF' ? 'Receita Saúde' : `NFS-e ${s.nfseNumber || ''}`,
      s.taxOrigin === 'CPF'
        ? s.installments.some((i) => i.receitaSaudeStatus === 'A_EMITIR')
          ? 'Pendente'
          : 'Emitido'
        : s.nfseStatus || 'A_EMITIR',
    ]);

    exportToCsv('receitas_odontologicas', [headers, ...rows]);
  };

  const handleSaveDocIdentifier = (sale: Sale) => {
    if (sale.taxOrigin === 'CNPJ') {
      db.updateNfse(sale.id, 'EMITIDA', docInputNumber.trim());
    } else {
      // update all received installments with this doc number if empty
      sale.installments.forEach((inst) => {
        if (inst.status === 'RECEBIDO' && !inst.receitaSaudeId) {
          db.updateReceitaSaude(sale.id, inst.id, 'EMITIDO', docInputNumber.trim());
        }
      });
    }
    setEditingSaleDocId(null);
    setDocInputNumber('');
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Prominent CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            Receitas e Procedimentos Clínicos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro de tratamentos com segregação fiscal imediata entre Receita Saúde (CPF) e NFS-e (CNPJ)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={onOpenNewSale}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 shadow-xs hover:shadow-sm transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Nova Receita</span>
          </button>
        </div>
      </div>

      {/* Active Global Period Banner */}
      {selectedYear && (
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="text-slate-600">
              Período Ativo:{' '}
              <strong className="text-slate-900 font-bold">
                {selectedMonth === 'ALL'
                  ? `Ano Inteiro de ${selectedYear}`
                  : `${MONTH_NAMES[selectedMonth || 1]} de ${selectedYear}`}
              </strong>
            </span>
            <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md text-[10px] border border-slate-200">
              {filteredSales.length} {filteredSales.length === 1 ? 'lançamento' : 'lançamentos'}
            </span>
          </div>

          {selectedMonth !== 'ALL' && onResetPeriod && (
            <button
              type="button"
              onClick={onResetPeriod}
              className="text-teal-700 hover:text-teal-900 font-semibold hover:underline cursor-pointer"
            >
              Exibir todo o ano de {selectedYear} →
            </button>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por paciente ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
          />
        </div>

        {/* Origin Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70 text-xs shrink-0">
          <button
            onClick={() => setTaxOriginFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              taxOriginFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({sales.length})
          </button>
          <button
            onClick={() => setTaxOriginFilter('CPF')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              taxOriginFilter === 'CPF'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CPF ({sales.filter((s) => s.taxOrigin === 'CPF').length})
          </button>
          <button
            onClick={() => setTaxOriginFilter('CNPJ')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              taxOriginFilter === 'CNPJ'
                ? 'bg-blue-50 text-blue-800 border border-blue-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CNPJ ({sales.filter((s) => s.taxOrigin === 'CNPJ').length})
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

        {/* Document Status Filter */}
        <div className="w-48 shrink-0">
          <CustomSelect
            value={docFilter}
            onChange={(val) => setDocFilter(val)}
            options={[
              { value: 'ALL', label: 'Status Fiscal: Todos' },
              { value: 'PENDING', label: 'Docs Pendentes' },
              { value: 'EMITTED', label: 'Docs Emitidos' },
            ]}
          />
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-lg border border-slate-800 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="bg-teal-500 text-slate-950 text-xs font-black px-2 py-0.5 rounded-full font-mono">
              {selectedIds.size}
            </span>
            <span className="text-xs font-medium text-slate-200">
              receita(s) selecionada(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir em Lote
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Desmarcar
            </button>
          </div>
        </div>
      )}

      {/* Table of Sales */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(filteredSales)}
                    className="cursor-pointer text-slate-400 hover:text-slate-700"
                  >
                    {filteredSales.length > 0 && selectedIds.size === filteredSales.length ? (
                      <CheckSquare className="w-4 h-4 text-teal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 text-center">Data da Venda</th>
                <th className="py-3 px-4 text-center">Origem</th>
                <th className="py-3 px-4 text-center">Paciente (Beneficiário)</th>
                <th className="py-3 px-4 text-center">Procedimento</th>
                <th className="py-3 px-4 text-center">Documento Fiscal</th>
                <th className="py-3 px-4 text-center">Valor Total</th>
                <th className="py-3 px-4 text-center">Parcelas</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Nenhuma receita encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isExpanded = expandedSaleId === sale.id;
                  const isSelected = selectedIds.has(sale.id);
                  const summary = getSalePaymentSummary(sale);
                  const receivedInstallments = sale.installments.filter((i) => i.status === 'RECEBIDO');
                  const isTotallyUnreceived = receivedInstallments.length === 0;
                  const hasPendingReceitaSaude =
                    sale.taxOrigin === 'CPF' &&
                    receivedInstallments.some((i) => i.receitaSaudeStatus !== 'EMITIDO');

                  return (
                    <React.Fragment key={sale.id}>
                      <tr className={`transition-colors ${isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50/80'}`}>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelect(sale.id)}
                            className="cursor-pointer text-slate-500 hover:text-slate-800"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-teal-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600 text-center">
                          {formatDateBr(sale.serviceDate)}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {sale.origin === 'AGENDA' || sale.appointmentId ? (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold text-[9px] bg-purple-50 text-purple-700 border border-purple-200"
                                title="Venda gerada automaticamente via Agenda"
                              >
                                📅 Via Agenda
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold text-[9px] bg-slate-100 text-slate-600 border border-slate-200"
                                title="Lançamento manual"
                              >
                                ✍️ Manual
                              </span>
                            )}
                            {sale.taxOrigin === 'CPF' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-semibold text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                                <User className="w-2.5 h-2.5 text-emerald-600" />
                                CPF
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-semibold text-[9px] bg-blue-50 text-blue-800 border border-blue-200/80">
                                <Building className="w-2.5 h-2.5 text-blue-600" />
                                CNPJ
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 text-xs">{sale.patientName}</span>
                            {(() => {
                              const note = sale.notes?.trim();
                              if (!note) return null;
                              const lower = note.toLowerCase();
                              const procLower = (sale.procedureName || '').trim().toLowerCase();
                              if (lower.startsWith('atendimento clínico') || lower === procLower || lower === `atendimento clínico - ${procLower}`) {
                                return null;
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingObservation({
                                      patientName: sale.patientName,
                                      procedureName: sale.procedureName,
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
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            CPF: {formatCpf(sale.patientCpf, maskCpf)}
                          </div>
                          {!sale.payerIsBeneficiary && sale.payerName && (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Pagador: {sale.payerName}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-medium text-slate-700 max-w-[200px] truncate text-xs">
                          {sale.procedureName}
                        </td>

                        {/* Documento Fiscal Column */}
                        <td className="py-3.5 px-4 text-center">
                          {sale.taxOrigin === 'CPF' ? (
                            <div>
                              {isTotallyUnreceived ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
                                  title="O comprovante da Receita Saúde só é emitido após o recebimento financeiro da parcela."
                                >
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  A Emitir (Aguardando Recebimento)
                                </span>
                              ) : hasPendingReceitaSaude ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200/80">
                                  <FileText className="w-3 h-3 text-amber-600" />
                                  Receita Saúde Pendente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 font-semibold">
                                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  {sale.installments.find((i) => i.receitaSaudeId)?.receitaSaudeId
                                    ? `Receita Saúde #${sale.installments.find((i) => i.receitaSaudeId)?.receitaSaudeId}`
                                    : 'Receita Saúde Emitido'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div>
                              {sale.nfseStatus === 'EMITIDA' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 font-semibold">
                                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                                  NFS-e #{sale.nfseNumber || 'Emitida'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200/80">
                                  NFS-e a Emitir
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-bold text-slate-900 text-xs font-mono">
                          <div>{formatCurrency(sale.totalValue)}</div>
                          {sale.originalEstimatedValue && sale.originalEstimatedValue !== sale.totalValue && (
                            <div
                              className="text-[10px] font-sans font-medium text-purple-700 mt-0.5"
                              title={`Valor previsto na agenda: ${formatCurrency(sale.originalEstimatedValue)}`}
                            >
                              Previsto: {formatCurrency(sale.originalEstimatedValue)}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {sale.installmentsCount}x
                            </span>
                            {summary.overallStatus === 'TOTALMENTE_RECEBIDA' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                Totalmente Recebida
                              </span>
                            )}
                            {summary.overallStatus === 'PARCIALMENTE_RECEBIDA' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80">
                                Parcial ({summary.receivedCount}/{summary.totalInstallments})
                              </span>
                            )}
                            {summary.overallStatus === 'VENCIDA' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
                                Vencida
                              </span>
                            )}
                            {summary.overallStatus === 'PENDENTE' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                                A Receber
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() =>
                                setExpandedSaleId(isExpanded ? null : sale.id)
                              }
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors inline-flex items-center gap-1 text-xs cursor-pointer font-medium"
                              title="Ver parcelas"
                            >
                              <span>Parcelas</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => setEditingSale(sale)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                              title="Editar receita"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteSingleSale(sale.id, sale.patientName)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Excluir receita"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Installments Details */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={9} className="p-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                  Detalhamento das Parcelas & Vínculos Tributários
                                </h4>
                                <span className="text-[11px] text-slate-500">
                                  Forma de Pagamento: {sale.paymentMethod}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sale.installments.map((inst) => {
                                  const isReceived = inst.status === 'RECEBIDO';
                                  return (
                                    <div
                                      key={inst.id}
                                      className={`p-3 rounded-xl border text-xs space-y-2 ${
                                        isReceived
                                          ? 'border-emerald-200 bg-emerald-50/40'
                                          : 'border-slate-200 bg-white'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-slate-800">
                                          Parcela {inst.installmentNumber}/{inst.totalInstallments}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                            isReceived
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                              : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                                          }`}
                                        >
                                          {isReceived ? 'Recebida' : 'A Receber'}
                                        </span>
                                      </div>

                                      <div className="flex justify-between font-semibold">
                                        <span className="text-slate-500">Valor:</span>
                                        <span className="text-slate-900">
                                          {formatCurrency(inst.value)}
                                        </span>
                                      </div>

                                      <div className="flex justify-between text-[11px] text-slate-500">
                                        <span>Vencimento:</span>
                                        <span>{formatDateBr(inst.dueDate)}</span>
                                      </div>

                                      {isReceived ? (
                                        <div className="pt-2 border-t border-emerald-200 text-[11px] text-emerald-900 space-y-1">
                                          <div className="flex justify-between">
                                            <span>Recebido em:</span>
                                            <span className="font-semibold">
                                              {formatDateBr(inst.paymentDate || '')}
                                            </span>
                                          </div>
                                          {sale.taxOrigin === 'CPF' && (
                                            <div className="flex justify-between items-center pt-1 font-mono">
                                              <span>Receita Saúde:</span>
                                              <span className="font-bold text-emerald-700">
                                                {inst.receitaSaudeId || 'A Emitir'}
                                              </span>
                                            </div>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleUnsettleInstallment(sale.id, inst.id)}
                                            className="w-full mt-2 py-1 px-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                          >
                                            <RotateCcw className="w-3 h-3" />
                                            Desfazer Recebimento
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="pt-2">
                                          <button
                                            onClick={() =>
                                              onOpenSettleModal({
                                                installmentId: inst.id,
                                                saleId: sale.id,
                                                patientName: sale.patientName,
                                                procedureName: sale.procedureName,
                                                taxOrigin: sale.taxOrigin,
                                                dueDate: inst.dueDate,
                                                value: inst.value,
                                                balance: inst.value,
                                                installmentNumber: inst.installmentNumber,
                                                totalInstallments: inst.totalInstallments,
                                              })
                                            }
                                            className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                                          >
                                            Confirmar Recebimento
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Sale Modal */}
      {editingSale && (
        <NewSaleModal
          isOpen={Boolean(editingSale)}
          onClose={() => setEditingSale(null)}
          patients={db.getPatients()}
          saleToEdit={editingSale}
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
