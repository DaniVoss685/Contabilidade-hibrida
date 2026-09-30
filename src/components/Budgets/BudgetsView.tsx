import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import { ClipboardList, Plus, Search, Printer, ArrowRightCircle, ExternalLink, MessageCircle, Trash2, Pencil } from 'lucide-react';
import { db } from '../../lib/db';
import { Budget, BudgetStatus } from '../../types';
import { BUDGET_STATUS_LABELS, canConvertToSale, isPastValidity } from '../../lib/budgets';
import { formatCurrency, formatDateBr } from '../../lib/masks';
import { CustomSelect, ConfirmDialog, useToast } from '../UI';
import { BudgetModal } from './BudgetModal';

interface BudgetsViewProps {
  activeTenantId?: string;
  onConvertToSale: (budget: Budget) => void;
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

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onConvertToSale, onNavigateToWhatsApp }) => {
  const toast = useToast();
  const [budgets, setBudgets] = useState<Budget[]>(() => db.getBudgets());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BudgetStatus>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);

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
    const professional = db.getProfessional();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 20;
    const contentWidth = pageWidth - marginX * 2;
    let y = 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('ORÇAMENTO ODONTOLÓGICO', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(professional?.nomeFantasia || professional?.razaoSocial || 'Clínica Odontológica', pageWidth / 2, y, { align: 'center' });
    y += 12;

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y, marginX + contentWidth, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Paciente: ${budget.patientName}`, marginX, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Emitido em: ${new Date(budget.createdAt).toLocaleDateString('pt-BR')}`, marginX, y);
    if (budget.validUntil) {
      doc.text(`Válido até: ${formatDateBr(budget.validUntil)}`, marginX + contentWidth, y, { align: 'right' });
    }
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('PROCEDIMENTO', marginX, y);
    doc.text('QTD', marginX + contentWidth * 0.62, y, { align: 'center' });
    doc.text('VALOR', marginX + contentWidth, y, { align: 'right' });
    y += 3;
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, y, marginX + contentWidth, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    budget.items.forEach((item) => {
      doc.setTextColor(51, 65, 85);
      doc.text(item.procedureName, marginX, y);
      if (item.professionalName) {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(item.professionalName, marginX, y + 4);
        doc.setFontSize(9.5);
      }
      doc.setTextColor(51, 65, 85);
      doc.text(String(item.quantity), marginX + contentWidth * 0.62, y, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(item.totalPrice), marginX + contentWidth, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += item.professionalName ? 10 : 7;
    });

    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y, marginX + contentWidth, y);
    y += 7;

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Subtotal', marginX + contentWidth * 0.75, y, { align: 'right' });
    doc.text(formatCurrency(budget.subtotal), marginX + contentWidth, y, { align: 'right' });
    y += 6;
    if (budget.discountValue > 0) {
      doc.text('Desconto', marginX + contentWidth * 0.75, y, { align: 'right' });
      doc.text(`- ${formatCurrency(budget.subtotal - budget.total)}`, marginX + contentWidth, y, { align: 'right' });
      y += 6;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('TOTAL', marginX + contentWidth * 0.75, y, { align: 'right' });
    doc.text(formatCurrency(budget.total), marginX + contentWidth, y, { align: 'right' });
    y += 12;

    if (budget.notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const lines = doc.splitTextToSize(budget.notes, contentWidth);
      lines.forEach((line: string, i: number) => doc.text(line, marginX, y + i * 4.2));
    }

    const safeName = budget.patientName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
    doc.save(`Orcamento-${safeName}-${budget.id.slice(-6)}.pdf`);
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
              <th className="py-2.5 px-4 text-left font-bold text-slate-600">Itens</th>
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
                    <td className="py-3 px-4 font-semibold text-slate-800">{budget.patientName}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {budget.items.length} {budget.items.length === 1 ? 'item' : 'itens'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{formatCurrency(budget.total)}</td>
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
                          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-indigo-700">
                            <ExternalLink className="w-3 h-3" /> Venda gerada
                          </span>
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
