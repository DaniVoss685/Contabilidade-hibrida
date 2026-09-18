import React, { useEffect } from 'react';
import {
  X,
  Calendar,
  DollarSign,
  CreditCard,
  Building,
  User,
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { EnhancedSaleHistoryItem, formatPaymentMethodName } from '../../lib/patientHistory';
import { formatCurrency, formatDateBr, formatCpf } from '../../lib/masks';

interface PatientProcedureDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: EnhancedSaleHistoryItem | null;
  patientName: string;
  patientCpf: string;
  maskCpf?: boolean;
}

export const PatientProcedureDrawer: React.FC<PatientProcedureDrawerProps> = ({
  isOpen,
  onClose,
  item,
  patientName,
  patientCpf,
  maskCpf = false,
}) => {
  // Fecha no ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const { sale } = item;
  const installments = Array.isArray(sale.installments) && sale.installments.length > 0
    ? sale.installments
    : [
        {
          id: `${sale.id}_inst_1`,
          saleId: sale.id,
          installmentNumber: 1,
          totalInstallments: 1,
          value: sale.totalValue,
          dueDate: sale.serviceDate,
          paymentDate: sale.serviceDate,
          amountReceived: sale.totalValue,
          status: 'RECEBIDO' as const,
          paymentMethod: sale.paymentMethod,
        },
      ];

  const hasCardFee = Boolean(sale.cardFeeAmount && sale.cardFeeAmount > 0);
  const netValue = sale.netValue !== undefined ? sale.netValue : sale.totalValue - (sale.cardFeeAmount || 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
      {/* Backdrop escuro */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col border-l border-slate-200/80 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-800 flex items-center justify-center shadow-2xs">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Prontuário do Atendimento
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  {formatDateBr(sale.serviceDate)} • {sale.procedureName}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Fechar detalhes"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body com Scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Resumo do Paciente e Origem Fiscal */}
            <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{patientName}</span>
                {sale.taxOrigin === 'CPF' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <User className="w-3 h-3 text-emerald-600" /> CPF (Receita Saúde)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    <Building className="w-3 h-3 text-blue-600" /> CNPJ (NFS-e)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-600 pt-1 border-t border-slate-200/60">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-sans font-semibold">
                    Documento do Paciente
                  </span>
                  {formatCpf(patientCpf, maskCpf)}
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-sans font-semibold">
                    Documento Fiscal
                  </span>
                  {item.nfseOrReceiptSummary}
                </div>
              </div>
            </div>

            {/* Cards Financeiros (Bruto, Taxa de Cartão, Líquido) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Valor Bruto
                </span>
                <span className="text-sm font-black text-slate-900 font-mono tabular-nums block mt-1">
                  {formatCurrency(sale.totalValue)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Base fiscal</span>
              </div>

              <div className="p-3 bg-rose-50/50 border border-rose-200/60 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
                  Taxa Cartão
                </span>
                <span className="text-sm font-black text-rose-900 font-mono tabular-nums block mt-1">
                  {hasCardFee ? `-${formatCurrency(sale.cardFeeAmount)}` : 'R$ 0,00'}
                </span>
                <span className="text-[10px] text-rose-600/80 block mt-0.5">
                  {sale.cardFeePercent ? `${sale.cardFeePercent}% tarifa` : 'Sem taxa'}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/50 border border-emerald-200/70 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Valor Líquido
                </span>
                <span className="text-sm font-black text-emerald-950 font-mono tabular-nums block mt-1">
                  {formatCurrency(netValue)}
                </span>
                <span className="text-[10px] text-emerald-700/80 block mt-0.5">Entrada em conta</span>
              </div>
            </div>

            {/* Metadados do Atendimento */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-slate-500" />
                Dados do Procedimento
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Procedimento
                  </span>
                  <span className="font-bold text-slate-800">{sale.procedureName}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Data de Competência
                  </span>
                  <span className="font-mono text-slate-800">{formatDateBr(sale.serviceDate)}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Forma de Pagamento
                  </span>
                  <span className="font-medium text-slate-800">
                    {formatPaymentMethodName(sale.paymentMethod)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Número de Parcelas
                  </span>
                  <span className="font-mono font-medium text-slate-800">
                    {installments.length} {installments.length === 1 ? 'parcela' : 'parcelas'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Situação Geral
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold mt-0.5 ${
                    item.aggregatedStatus === 'PAGO'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : item.aggregatedStatus === 'PARCIAL'
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : item.aggregatedStatus === 'EM_ATRASO'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}>
                    {item.statusBadgeLabel}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Pontualidade
                  </span>
                  <span className={`text-xs font-semibold block mt-0.5 ${
                    item.timelinessVariant === 'success'
                      ? 'text-emerald-700'
                      : item.timelinessVariant === 'danger'
                      ? 'text-rose-700'
                      : item.timelinessVariant === 'warning'
                      ? 'text-amber-800'
                      : 'text-slate-600'
                  }`}>
                    {item.timelinessLabel}
                  </span>
                </div>
              </div>

              {sale.notes && (
                <div className="pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                    Observações
                  </span>
                  <p className="text-slate-600 italic mt-0.5">{sale.notes}</p>
                </div>
              )}
            </div>

            {/* Detalhamento Individual das Parcelas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  Grade de Parcelas ({installments.length})
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  {installments.filter((i) => i.status === 'RECEBIDO').length} de {installments.length} quitadas
                </span>
              </div>

              <div className="space-y-2.5">
                {installments.map((inst, index) => {
                  const isSettled = inst.status === 'RECEBIDO';
                  const instNumber = inst.installmentNumber || index + 1;
                  const totalInst = inst.totalInstallments || installments.length;

                  return (
                    <div
                      key={inst.id || index}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isSettled
                          ? 'bg-emerald-50/30 border-emerald-200/70'
                          : 'bg-white border-slate-200/80 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800 font-mono">
                            Parcela {instNumber}/{totalInst}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSettled
                                ? 'bg-emerald-100 text-emerald-800'
                                : inst.dueDate < item.serviceDate
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {isSettled ? 'PAGA' : 'EM ABERTO'}
                          </span>
                        </div>

                        <span className="text-xs font-black text-slate-900 font-mono">
                          {formatCurrency(inst.value)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-600">
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-sans font-semibold">
                            Vencimento
                          </span>
                          {formatDateBr(inst.dueDate)}
                        </div>

                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-sans font-semibold">
                            Recebimento
                          </span>
                          {inst.paymentDate ? formatDateBr(inst.paymentDate) : '—'}
                        </div>

                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-sans font-semibold">
                            Forma
                          </span>
                          {formatPaymentMethodName(inst.paymentMethod || sale.paymentMethod)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              Fechar Prontuário
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
