import React, { useEffect, useState } from 'react';
import { Scale, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AccountReceivableItem, FiscalClassification } from '../../types';
import { db } from '../../lib/db';
import { useToast } from '../UI';
import { formatCurrency, formatDateBr } from '../../lib/masks';

export interface FiscalClassificationModalProps {
  isOpen: boolean;
  item: AccountReceivableItem | null;
  onClose: () => void;
  onSaved?: () => void;
}

const OPTIONS: Array<{ value: FiscalClassification; label: string; description: string }> = [
  { value: 'TRIBUTAVEL', label: 'Tributável', description: 'Entra normalmente na base do Carnê-Leão / IRPF (comportamento padrão).' },
  { value: 'NAO_TRIBUTAVEL', label: 'Não Tributável', description: 'Excluído da base tributária por não configurar fato gerador de IRPF — exige motivo e fundamento.' },
  { value: 'EXCLUIDO_DA_BASE', label: 'Excluído da Base', description: 'Excluído da base tributária por decisão administrativa explícita (ex.: estorno, erro de lançamento) — exige motivo e fundamento.' },
];

// Modal dedicado de classificação fiscal — SEMPRE separado da pergunta
// "o paciente solicitou documento?" (SettlePaymentModal). A classificação
// aqui nunca é derivada automaticamente de documentRequested; o usuário
// precisa digitar motivo e fundamento explicitamente para qualquer valor
// diferente de TRIBUTÁVEL. Rastreabilidade completa via
// db.updateFiscalClassification (snapshot inline + df_audit_logs).
export const FiscalClassificationModal: React.FC<FiscalClassificationModalProps> = ({ isOpen, item, onClose, onSaved }) => {
  const toast = useToast();
  const [classification, setClassification] = useState<FiscalClassification>('TRIBUTAVEL');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && item) {
      setClassification(item.fiscalClassification || 'TRIBUTAVEL');
      setReason(item.fiscalClassificationReason || '');
      setCategory(item.fiscalClassificationCategory || '');
      setError(null);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const requiresJustification = classification !== 'TRIBUTAVEL';

  const handleSave = async () => {
    setError(null);
    if (requiresJustification && (!reason.trim() || !category.trim())) {
      setError('Informe motivo e fundamento/categoria para classificar como diferente de Tributável.');
      return;
    }
    setIsSaving(true);
    try {
      const res = db.updateFiscalClassification(item.saleId, item.installmentId, classification, {
        reason: reason.trim(),
        category: category.trim(),
      });
      if (!res.success) {
        setError(res.error || 'Erro ao salvar classificação fiscal.');
        return;
      }
      toast.success('Classificação fiscal atualizada.');
      onSaved?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="bg-slate-900 px-5 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Classificação Fiscal</h3>
              <p className="text-[11px] text-slate-300">{item.procedureName} • {item.patientName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <span className="text-slate-500">Valor do recebimento</span>
            <span className="font-mono font-bold text-slate-900">{formatCurrency(item.value)}</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Classificação</label>
            <div className="space-y-1.5">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setClassification(opt.value)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    classification === opt.value
                      ? opt.value === 'TRIBUTAVEL'
                        ? 'border-emerald-400 bg-emerald-50/70'
                        : 'border-amber-400 bg-amber-50/70'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    {opt.value === 'TRIBUTAVEL' ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    {opt.label}
                  </div>
                  <div className="text-[10.5px] text-slate-500 mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {requiresJustification && (
            <div className="space-y-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motivo <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Explique por que este recebimento não deve compor a base tributária..."
                  className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fundamento / Categoria <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex: Estorno de venda, erro de lançamento, doação..."
                  className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <p className="text-[10px] text-amber-800 leading-relaxed">
                Nunca use "paciente não solicitou recibo" como motivo — a ausência de solicitação de documento é um dado
                separado e não é, por si só, uma justificativa fiscal válida.
              </p>
            </div>
          )}

          {item.fiscalClassificationByName && (
            <p className="text-[10px] text-slate-400">
              Última alteração: {item.fiscalClassificationByName}
              {item.fiscalClassificationAt ? ` em ${formatDateBr(item.fiscalClassificationAt.slice(0, 10))}` : ''}
            </p>
          )}

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            {isSaving ? 'Salvando...' : 'Salvar Classificação'}
          </button>
        </div>
      </div>
    </div>
  );
};
