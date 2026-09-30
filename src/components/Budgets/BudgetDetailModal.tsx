import React, { useMemo } from 'react';
import { X, Calendar, User, ClipboardList, ExternalLink, CalendarClock } from 'lucide-react';
import { db } from '../../lib/db';
import { Budget, BudgetStatus } from '../../types';
import { BUDGET_STATUS_LABELS, isPastValidity } from '../../lib/budgets';
import { getBudgetDisplayCode } from '../../lib/budgetPdf';
import { formatCurrency, formatDateBr } from '../../lib/masks';

interface BudgetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: Budget | null;
  onViewSale: (budget: Budget) => void;
  onAgendarTratamento: (budget: Budget) => void;
}

const STATUS_BADGE: Record<BudgetStatus, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-600 border-slate-200',
  APRESENTADO: 'bg-blue-100 text-blue-800 border-blue-200',
  APROVADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  RECUSADO: 'bg-rose-100 text-rose-800 border-rose-200',
  EXPIRADO: 'bg-amber-100 text-amber-800 border-amber-200',
  CONVERTIDO: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

/** Visualização somente-leitura de um orçamento — sem precisar entrar em modo de edição só pra
 * consultar paciente/itens/validade/vínculos. Mostra também o que já foi criado a partir dele
 * (consultas agendadas via "Agendar tratamento", venda gerada via "Converter"). */
export const BudgetDetailModal: React.FC<BudgetDetailModalProps> = ({ isOpen, onClose, budget, onViewSale, onAgendarTratamento }) => {
  const linkedAppointments = useMemo(() => {
    if (!budget) return [];
    return db.getAppointments().filter((a) => a.budgetId === budget.id);
  }, [budget, isOpen]);

  if (!isOpen || !budget) return null;

  const todayISO = new Date().toISOString().split('T')[0];
  const expired = isPastValidity(budget.validUntil, todayISO) && budget.status !== 'CONVERTIDO';
  const canAgendar = budget.status === 'APROVADO' || budget.status === 'CONVERTIDO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 truncate">{budget.patientName}</h2>
              <p className="text-[11px] text-slate-400 font-mono">{getBudgetDisplayCode(budget)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block px-2.5 py-1 rounded-full font-bold text-[11px] border ${STATUS_BADGE[budget.status]}`}>
              {BUDGET_STATUS_LABELS[budget.status]}
            </span>
            {expired && (
              <span className="inline-block px-2.5 py-1 rounded-full font-bold text-[11px] border bg-rose-50 text-rose-700 border-rose-200">
                Vencido
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Emitido em</p>
              <p className="text-slate-700 font-medium">{new Date(budget.createdAt).toLocaleDateString('pt-BR')}</p>
            </div>
            {budget.presentedAt && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Apresentado em</p>
                <p className="text-slate-700 font-medium">{new Date(budget.presentedAt).toLocaleDateString('pt-BR')}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Validade</p>
              <p className={`font-medium ${expired ? 'text-rose-600' : 'text-slate-700'}`}>
                {budget.validUntil ? formatDateBr(budget.validUntil) : '—'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Itens do orçamento ({budget.items.length})
            </p>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {budget.items.map((item) => (
                <div key={item.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.procedureName}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" />
                      {item.professionalName || 'Profissional a definir'}
                      <span className="text-slate-300 mx-1">•</span>
                      {item.quantity}x {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-800 whitespace-nowrap tabular-nums">
                    {formatCurrency(item.totalPrice)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-1">
            <div className="flex justify-between gap-3 text-xs text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono whitespace-nowrap tabular-nums">{formatCurrency(budget.subtotal)}</span>
            </div>
            {budget.discountValue > 0 && (
              <div className="flex justify-between gap-3 text-xs text-rose-600">
                <span>Desconto</span>
                <span className="font-mono whitespace-nowrap tabular-nums">- {formatCurrency(budget.subtotal - budget.total)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-sm font-bold text-slate-900 pt-1 border-t border-indigo-200/60">
              <span>Total</span>
              <span className="font-mono whitespace-nowrap tabular-nums">{formatCurrency(budget.total)}</span>
            </div>
          </div>

          {budget.notes && budget.notes.trim() && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Observações</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                {budget.notes}
              </p>
            </div>
          )}

          {/* Vínculos: venda gerada e consultas agendadas a partir deste orçamento */}
          {(budget.convertedSaleId || linkedAppointments.length > 0 || canAgendar) && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vínculos</p>

              {budget.convertedSaleId && (
                <button
                  type="button"
                  onClick={() => onViewSale(budget)}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100/70 text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                    <ExternalLink className="w-3.5 h-3.5" /> Convertido em venda
                  </span>
                  <span className="text-[11px] text-indigo-600 font-bold">Ver venda</span>
                </button>
              )}

              {linkedAppointments.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                    Consulta agendada — {formatDateBr(apt.date)} às {apt.startTime}
                    {apt.professionalName ? ` • ${apt.professionalName}` : ''}
                  </span>
                </div>
              ))}

              {canAgendar && (
                <button
                  type="button"
                  onClick={() => onAgendarTratamento(budget)}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/70 text-xs font-bold text-emerald-700 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" /> Agendar tratamento
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
