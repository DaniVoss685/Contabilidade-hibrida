import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Loader2, Pencil, ExternalLink } from 'lucide-react';
import { Patient } from '../../types';
import {
  ISSUE_META,
  PatientReviewIssue,
  sortIssuesForPanel,
  summarizeReview,
} from '../../lib/patientReviewIssues';
import { markIssueReviewed } from '../../lib/patientReviewService';
import { db } from '../../lib/db';

interface PatientReviewPanelProps {
  patient: Patient;
  issues: PatientReviewIssue[];
  patients: Patient[];
  canManage: boolean;
  onClose: () => void;
  onEditPatient: () => void;
  onSelectPatient: (patientId: string) => void;
  /** Recarrega a fila de pendências (sem F5). */
  onChanged: () => void;
}

const STATUS_LABEL: Record<PatientReviewIssue['status'], string> = {
  OPEN: 'Em aberto',
  RESOLVED: 'Resolvida (dado corrigido)',
  REVIEWED: 'Revisada',
  DISMISSED: 'Encerrada',
};

/**
 * Painel de pendências cadastrais da ficha: Campo · Problema · Valor legado · Orientação.
 * Valor legado aparece completo AQUI (ficha autenticada, necessário para corrigir); em
 * badges/listas nunca. Pendência de identidade só encerra com "Marcar como revisada".
 */
export const PatientReviewPanel: React.FC<PatientReviewPanelProps> = ({
  patient,
  issues,
  patients,
  canManage,
  onClose,
  onEditPatient,
  onSelectPatient,
  onChanged,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = summarizeReview(issues);
  const sorted = sortIssuesForPanel(issues);
  // Dois blocos: REVISÃO NECESSÁRIA (inválido/ambíguo) e CADASTRO INCOMPLETO (só falta dado); o
  // histórico (resolvidas/revisadas) fica por último.
  const isIncomplete = (i: PatientReviewIssue) => ISSUE_META[i.issueCode]?.level === 'INCOMPLETE';
  const reviewOpen = sorted.filter((i) => i.status === 'OPEN' && !isIncomplete(i));
  const incompleteOpen = sorted.filter((i) => i.status === 'OPEN' && isIncomplete(i));
  const history = sorted.filter((i) => i.status !== 'OPEN');
  const nameOf = (id?: string) => (id ? patients.find((p) => p.id === id)?.name || 'outro cadastro' : '');

  const review = async (issue: PatientReviewIssue) => {
    setBusyId(issue.id);
    setError(null);
    const res = await markIssueReviewed(issue.id, issue.tenantId, db.getUser()?.name || 'Usuário');
    setBusyId(null);
    if (!res.success) {
      setError(res.error || 'Não foi possível marcar como revisada.');
      return;
    }
    onChanged();
  };

  const renderIssue = (issue: PatientReviewIssue) => {
    const meta = ISSUE_META[issue.issueCode];
      const isOpen = issue.status === 'OPEN';
      return (
        <div
          key={issue.id}
          className={`rounded-2xl border p-3.5 ${
            isOpen
              ? meta.group === 'DUPLICATE'
                ? 'border-rose-200 bg-rose-50/60'
                : meta.level === 'INCOMPLETE'
                ? 'border-slate-200 bg-slate-50/60'
                : 'border-amber-200 bg-amber-50/50'
              : 'border-slate-200 bg-slate-50/60 opacity-80'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{meta.field}</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{meta.problem}</p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isOpen ? 'bg-white text-amber-800 border-amber-200' : 'bg-white text-emerald-700 border-emerald-200'
              }`}
            >
              {STATUS_LABEL[issue.status]}
            </span>
          </div>

          {issue.legacyValue && (
            <p className="text-xs text-slate-600 mt-1.5">
              <span className="text-slate-400">Valor no sistema anterior: </span>
              <span className="font-mono">{issue.legacyValue}</span>
            </p>
          )}
          {issue.message && issue.message !== meta.problem && <p className="text-[11px] text-slate-500 mt-1">{issue.message}</p>}
          <p className="text-xs text-slate-700 mt-1.5">{meta.guidance}</p>

          {issue.relatedPatientId && (
            <button
              type="button"
              onClick={() => {
                onSelectPatient(issue.relatedPatientId!);
                onClose();
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir cadastro semelhante: {nameOf(issue.relatedPatientId)}
            </button>
          )}

          {isOpen ? (
            canManage && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {!meta.manual && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditPatient();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" /> Corrigir no cadastro
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === issue.id}
                  onClick={() => review(issue)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {busyId === issue.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Marcar como revisada
                </button>
              </div>
            )
          ) : (
            <p className="text-[11px] text-slate-400 mt-2">
              {issue.resolvedAt ? new Date(issue.resolvedAt).toLocaleDateString('pt-BR') : ''}
              {issue.resolvedBy ? ` · ${issue.resolvedBy}` : ''}
              {issue.resolutionNote ? ` · ${issue.resolutionNote}` : ''}
            </p>
          )}
        </div>
      );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900 tracking-tight">Pendências do cadastro</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {patient.name} ·{' '}
              {summary.status === 'PENDENTE'
                ? [
                    summary.reviewCount ? `${summary.reviewCount} a revisar` : '',
                    summary.incompleteCount ? `${summary.incompleteCount} campo(s) ausente(s)` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : summary.status === 'REVISADO'
                ? 'todas revisadas'
                : 'sem pendências'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          {sorted.length === 0 && <p className="text-xs text-slate-500">Nenhuma pendência registrada para este paciente.</p>}

          {reviewOpen.length > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 pt-1">Revisão necessária</p>
          )}
          {reviewOpen.map(renderIssue)}
          {incompleteOpen.length > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-2">
              Cadastro incompleto — campos não informados no sistema anterior
            </p>
          )}
          {incompleteOpen.map(renderIssue)}
          {history.length > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-2">Histórico</p>
          )}
          {history.map(renderIssue)}

          {summary.hasDuplicate && (
            <p className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Nada foi mesclado automaticamente. Alterar um campo não encerra a possível duplicidade — compare os cadastros e marque como revisada.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
