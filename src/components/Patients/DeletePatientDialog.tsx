import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { Patient } from '../../types';
import { db } from '../../lib/db';
import { SupabaseService } from '../../lib/supabaseClient';
import { DeletionDecision, decidePatientDeletion } from '../../lib/patientReviewIssues';

interface DeletePatientDialogProps {
  patient: Patient;
  onClose: () => void;
  onDeleted: (patientId: string) => void;
}

/**
 * Exclusão SEGURA de paciente. A verificação de referências é do servidor (RPC): paciente com
 * venda/recebível/agenda/prontuário/documento NÃO é excluído — o usuário vê o motivo e nada é
 * apagado. Sem histórico: confirmação explícita; só os vínculos de WhatsApp/responsável são
 * desfeitos, a auditoria é gravada e, se o cadastro veio de migração, o registro legado fica
 * marcado como excluído (uma nova importação não o recria).
 */
export const DeletePatientDialog: React.FC<DeletePatientDialogProps> = ({ patient, onClose, onDeleted }) => {
  const [decision, setDecision] = useState<DeletionDecision | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    SupabaseService.checkPatientDeletion(patient.id).then((check) => {
      if (!cancelled) setDecision(decidePatientDeletion(check));
    });
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await db.deletePatientAsync(patient.id, reason);
    setBusy(false);
    if (!res.success) {
      setError(res.error || 'Não foi possível excluir o paciente.');
      if (res.code === 'HAS_HISTORY') setDecision({ kind: 'BLOCKED_HISTORY', message: res.error || '', references: [] });
      return;
    }
    onDeleted(patient.id);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200/80 overflow-hidden my-auto max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-50 border border-rose-200 text-rose-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">Excluir paciente?</h3>
        </div>

        <div className="p-6 space-y-3 text-sm text-slate-700 overflow-y-auto flex-1 min-h-0">
          <p className="font-bold text-slate-900 truncate">{patient.name}</p>

          {!decision && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando vendas, agenda, prontuário e documentos...
            </p>
          )}

          {decision?.kind === 'ERROR' && <p className="text-xs text-rose-600">{decision.message}</p>}

          {decision?.kind === 'BLOCKED_HISTORY' && (
            <>
              <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                {decision.message || 'Este paciente possui histórico e não pode ser excluído diretamente.'}
              </p>
              {decision.references.length > 0 && (
                <ul className="text-xs text-slate-600 list-disc pl-5 space-y-0.5">
                  {decision.references.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-500">
                Nada foi apagado. Se este cadastro está duplicado, a consolidação preserva o histórico — não é necessário excluir.
              </p>
            </>
          )}

          {decision?.kind === 'ALLOWED' && (
            <>
              <p className="text-xs text-slate-600">
                Esta ação pode afetar vínculos e histórico. O paciente não tem vendas, agenda, prontuário nem documentos.
              </p>
              {decision.detach.length > 0 && (
                <div className="text-xs text-slate-600">
                  Serão desfeitos: <span className="font-semibold">{decision.detach.join(', ')}</span>.
                </div>
              )}
              <label className="block text-xs font-bold text-slate-700">
                Motivo (opcional)
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: cadastro criado por engano"
                  className="mt-1 w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                />
              </label>
              <p className="text-[11px] text-slate-500">
                A exclusão fica registrada na auditoria. Se este cadastro veio do sistema anterior, ele não será recriado por uma nova importação.
              </p>
            </>
          )}

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {decision?.kind === 'BLOCKED_HISTORY' ? 'Fechar' : 'Cancelar'}
          </button>
          {decision?.kind === 'ALLOWED' && (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Excluir paciente
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
