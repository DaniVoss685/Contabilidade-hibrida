import React, { useMemo, useState } from 'react';
import { ClipboardList, Plus, Search, Printer, ArrowRightCircle, ExternalLink, MessageCircle, Trash2, Pencil, Eye, CalendarClock, User } from 'lucide-react';
import { db } from '../../lib/db';
import { Budget, BudgetStatus } from '../../types';
import { BUDGET_STATUS_LABELS, canConvertToSale, isPastValidity, summarizeBudgetItemNames } from '../../lib/budgets';
import { generateBudgetPdf, getBudgetDisplayCode } from '../../lib/budgetPdf';
import { formatCurrency, formatDateBr } from '../../lib/masks';
import { CustomSelect, ConfirmDialog, useToast } from '../UI';
import { BudgetModal } from './BudgetModal';
import { BudgetDetailModal } from './BudgetDetailModal';

interface BudgetsViewProps {
  activeTenantId?: string;
  onConvertToSale: (budget: Budget) => void;
  onViewSale: (budget: Budget) => void;
  onAgendarTratamento: (budget: Budget) => void;
  onNavigateToWhatsApp?: (patientId: string) => void;
}

const STATUS_BADGE: Record<BudgetStatus, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-600 border-slate-200',
  APRESENTADO: 'bg-blue-100 text-blue-800 border-blue-200',
  APROVADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  RECUSADO: 'bg-rose-100 text-rose-800 border-rose-200',
  EXPIRADO: 'bg-amber-100 text-amber-800 border-amber-200',
  CONVERTIDO: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onConvertToSale, onViewSale, onAgendarTratamento, onNavigateToWhatsApp }) => {
  const toast = useToast();
  const [budgets, setBudgets] = useState<Budget[]>(() => db.getBudgets());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BudgetStatus>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [viewingBudget, setViewingBudget] = useState<Budget | null>(null);

  React.useEffect(() => db.subscribe(() => setBudgets(db.getBudgets())), []);

  const todayISO = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    return budgets.filter((b) => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (searchTerm.trim() && !b.patientName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [budgets, statusFilter, searchTerm]);

  const statusOptions = [
    { value: 'ALL', label: 'Todos os status' },
    ...(Object.keys(BUDGET_STATUS_LABELS) as BudgetStatus[]).map((s) => ({ value: s, label: BUDGET_STATUS_LABELS[s] })),
  ];

  const handleStatusChange = async (budget: Budget, status: BudgetStatus) => {
    const res = await db.saveBudget({ ...budget, status });
    if (res.success) {
      toast.success(`Status atualizado para ${BUDGET_STATUS_LABELS[status]}.`);
    } else {
      toast.error(res.error || 'Erro ao atualizar status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await db.deleteBudget(deleteTarget.id);
    if (res.success) {
      toast.success('Orçamento excluído.');
    } else {
      toast.error(res.error || 'Erro ao excluir orçamento.');
    }
    setDeleteTarget(null);
  };

  const handlePrint = (budget: Budget) => {
    generateBudgetPdf(budget, db.getProfessional(), db.getOrg());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            Orçamentos
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Planos de tratamento e propostas — criar um orçamento não gera financeiro, imposto nem baixa de estoque.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingBudget(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Novo Orçamento
        </button>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por paciente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="w-full md:w-56">
          <CustomSelect value={statusFilter} onChange={(v) => setStatusFilter(v as any)} options={statusOptions} searchable={false} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4 text-left font-bold text-slate-600">Paciente</th>
              <th className="py-2.5 px-4 text-left font-bold text-slate-600">Tratamento</th>
              <th className="py-2.5 px-4 text-right font-bold text-slate-600">Total</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Validade</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Status</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  Nenhum orçamento encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((budget) => {
                const expired = isPastValidity(budget.validUntil, todayISO) && budget.status !== 'CONVERTIDO';
                return (
                  <tr key={budget.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setViewingBudget(budget)}
                        className="font-semibold text-slate-800 hover:text-indigo-700 hover:underline cursor-pointer text-left"
                        title="Ver orçamento"
                      >
                        {budget.patientName}
                      </button>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{getBudgetDisplayCode(budget)}</p>
                    </td>
                    <td className="py-3 px-4 max-w-[240px]">
                      <p className="text-slate-700 font-medium truncate" title={budget.items.map((i) => i.procedureName).join(', ')}>
                        {summarizeBudgetItemNames(budget.items)}
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                        <User className="w-3 h-3 shrink-0" />
                        {(() => {
                          const profNames = Array.from(new Set(budget.items.map((i) => i.professionalName).filter(Boolean)));
                          return profNames.length > 0 ? profNames.join(' + ') : 'Profissional a definir';
                        })()}
                        <span className="text-slate-300 mx-0.5">•</span>
                        {budget.items.length} {budget.items.length === 1 ? 'item' : 'itens'}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap tabular-nums">{formatCurrency(budget.total)}</td>
                    <td className="py-3 px-4 text-center">
                      {budget.validUntil ? (
                        <span className={expired ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                          {formatDateBr(budget.validUntil)} {expired && '(vencido)'}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${STATUS_BADGE[budget.status]}`}>
                        {BUDGET_STATUS_LABELS[budget.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button
                          onClick={() => setViewingBudget(budget)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                          title="Ver orçamento"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {budget.status === 'RASCUNHO' && (
                          <button onClick={() => handleStatusChange(budget, 'APRESENTADO')} className="px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer">
                            Apresentar
                          </button>
                        )}
                        {budget.status === 'APRESENTADO' && (
                          <>
                            <button onClick={() => handleStatusChange(budget, 'APROVADO')} className="px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer">
                              Aprovar
                            </button>
                            <button onClick={() => handleStatusChange(budget, 'RECUSADO')} className="px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer">
                              Recusar
                            </button>
                          </>
                        )}
                        {(budget.status === 'APROVADO' || budget.status === 'CONVERTIDO') && (
                          <button
                            onClick={() => onAgendarTratamento(budget)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Agendar tratamento"
                          >
                            <CalendarClock className="w-3 h-3" /> Agendar
                          </button>
                        )}
                        {canConvertToSale(budget.status, budget.convertedSaleId) && (
                          <button
                            onClick={() => onConvertToSale(budget)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                            title="Converter em venda"
                          >
                            <ArrowRightCircle className="w-3 h-3" /> Converter
                          </button>
                        )}
                        {budget.convertedSaleId && (
                          <button
                            onClick={() => onViewSale(budget)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Ver venda gerada"
                          >
                            <ExternalLink className="w-3 h-3" /> Ver venda
                          </button>
                        )}
                        <button onClick={() => handlePrint(budget)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer" title="Salvar PDF">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {onNavigateToWhatsApp && (
                          <button
                            onClick={() => onNavigateToWhatsApp(budget.patientId)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                            title="Abrir conversa no WhatsApp para enviar"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!budget.convertedSaleId && (
                          <>
                            <button
                              onClick={() => {
                                setEditingBudget(budget);
                                setIsModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(budget)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BudgetModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingBudget(null);
        }}
        budgetToEdit={editingBudget}
        onSaved={() => {}}
      />

      <BudgetDetailModal
        isOpen={!!viewingBudget}
        onClose={() => setViewingBudget(null)}
        budget={viewingBudget}
        onViewSale={(b) => {
          setViewingBudget(null);
          onViewSale(b);
        }}
        onAgendarTratamento={(b) => {
          setViewingBudget(null);
          onAgendarTratamento(b);
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Excluir orçamento?"
        message={`O orçamento de ${deleteTarget?.patientName} será excluído permanentemente.`}
        confirmText="Sim, excluir"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
