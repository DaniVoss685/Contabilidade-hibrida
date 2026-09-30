import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Building2,
  Download,
  Loader2,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { db } from '../../../lib/db';
import { SupabaseService } from '../../../lib/supabaseClient';
import { exportToXlsxSheets } from '../../../lib/exportUtils';
import { useToast, ConfirmDialog } from '../../UI';
import {
  DryRunResult,
  runDryRun,
  createImportSession,
  saveDryRunResult,
  invalidateImportSession,
  importPatients,
  confirmProfessionalMapping,
  buildReviewSheets,
  PatientImportProgress,
  PatientImportOutcome,
  LEGACY_SOURCE_SYSTEM,
} from '../../../lib/legacyImportService';
import { ClientMatchResult, RecordResolutionResult, LegacyRowStatus } from '../../../lib/legacyImportMatching';
import { LegacyImportSession } from '../../../types';

type WizardStep = 'tenant' | 'files' | 'running' | 'preview' | 'importing' | 'report';

interface LegacyMigrationWizardProps {
  onClose: () => void;
  onBack: () => void;
  onImportSuccess: () => void;
}

const STATUS_META: Record<LegacyRowStatus, { label: string; className: string }> = {
  NOVO: { label: 'Novo', className: 'bg-teal-50 text-teal-800 border-teal-200' },
  VINCULAR: { label: 'Vincular', className: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  CONFLITO: { label: 'Conflito', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  INVALIDO: { label: 'Inválido', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  REVISAR: { label: 'Revisar', className: 'bg-orange-50 text-orange-800 border-orange-200' },
  IGNORAR: { label: 'Ignorar', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  PROVISORIO: { label: 'Provisório (revisão)', className: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200' },
};

const RESOLUTION_LABEL: Record<string, string> = {
  RESOLVED: 'Resolvidos para paciente',
  PENDING_PATIENT_IMPORT: 'Aguardando importação do paciente',
  BLOCKED_BY_PATIENT_REVIEW: 'Bloqueados (cliente em revisão)',
  ORPHAN: 'Órfãos',
  DIVERGENCE: 'Divergências de chave',
  PATIENT_DELETED: 'Paciente excluído pela clínica',
};

function StatusPill({ status }: { status: LegacyRowStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export const LegacyMigrationWizard: React.FC<LegacyMigrationWizardProps> = ({ onClose, onBack, onImportSuccess }) => {
  const toast = useToast();
  const [targetTenantId] = useState<string>(() => db.getActiveTenantId());
  const [targetTenantName, setTargetTenantName] = useState<string>('');
  const [tenantChanged, setTenantChanged] = useState(false);

  const [step, setStep] = useState<WizardStep>('tenant');
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [recordsFile, setRecordsFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [session, setSession] = useState<LegacyImportSession | null>(null);

  const [activeTable, setActiveTable] = useState<'clients' | 'records'>('clients');
  const [statusFilter, setStatusFilter] = useState<LegacyRowStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [progress, setProgress] = useState<PatientImportProgress | null>(null);
  const [outcome, setOutcome] = useState<PatientImportOutcome | null>(null);

  useEffect(() => {
    SupabaseService.getTenantInfo(targetTenantId).then((info) => setTargetTenantName(info?.name || targetTenantId));
  }, [targetTenantId]);

  // Trava de tenant na UI. O guard real é o servidor: toda ação da Edge
  // Function resolve o tenant pela sessão e revalida o acesso a cada chamada.
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      if (db.getActiveTenantId() !== targetTenantId) setTenantChanged(true);
    });
    return unsubscribe;
  }, [targetTenantId]);

  // Fechar o wizard com um dry run pendente invalida a sessão no servidor.
  // stepRef evita ler um "step" antigo capturado pelo cleanup.
  const stepRef = useRef<WizardStep>(step);
  stepRef.current = step;
  useEffect(() => {
    return () => {
      if (session && stepRef.current === 'preview') {
        invalidateImportSession(session.id).catch(() => undefined);
      }
    };
  }, [session]);

  const handleRunDryRun = async () => {
    if (tenantChanged || !clientsFile) {
      if (!clientsFile) setErrorMessage('Selecione o arquivo de Clientes antes de continuar.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStep('running');
    try {
      const result = await runDryRun({ targetTenantId, clientsFile, recordsFile });
      const sessionRes = await createImportSession({
        targetTenantId,
        sourceSystem: LEGACY_SOURCE_SYSTEM,
        clientsFileName: clientsFile.name,
        clientsFileChecksum: result.clientsFileChecksum,
        recordsFileName: recordsFile?.name,
        recordsFileChecksum: result.recordsFileChecksum,
      });
      if (!sessionRes.success || !sessionRes.session) throw new Error(sessionRes.error || 'Falha ao criar sessão de importação.');
      if (sessionRes.session.tenantId !== targetTenantId) throw new Error('A sessão foi criada para outra clínica — importação bloqueada.');

      const saved = await saveDryRunResult({
        sessionId: sessionRes.session.id,
        summary: result.summary,
        professionalMapping: {},
        procedureMapping: {},
      });
      if (!saved.success) throw new Error(saved.error || 'Falha ao registrar o dry run.');

      setSession(sessionRes.session);
      setDryRun(result);
      setStep('preview');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao validar os arquivos.');
      setStep('files');
    } finally {
      setIsBusy(false);
    }
  };

  const runImport = async () => {
    if (tenantChanged || !session || !dryRun) return;
    setShowConfirmDialog(false);
    setErrorMessage(null);
    setStep('importing');
    const result = await importPatients(session.id, dryRun, setProgress);
    setOutcome(result);
    if (!result.success) {
      setErrorMessage(`Lote ${result.failedBatch} falhou: ${result.error}. Os lotes anteriores estão gravados; retomar é seguro (não duplica).`);
      return;
    }
    setStep('report');
    onImportSuccess();
    toast.success('Pacientes importados.');
  };

  const filteredClientRows = useMemo(() => {
    if (!dryRun) return [];
    const q = searchTerm.trim().toLowerCase();
    return dryRun.clientResults.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.row.name.toLowerCase().includes(q) || r.row.cpf.cleaned.includes(q) || r.row.legacyId.includes(q) || r.row.legacyClientId === q;
    });
  }, [dryRun, statusFilter, searchTerm]);

  const filteredRecordRows = useMemo(() => {
    if (!dryRun) return [];
    const q = searchTerm.trim().toLowerCase();
    return dryRun.recordResolution.filter((r) => {
      if (!q) return true;
      return (
        r.record.descricao.toLowerCase().includes(q) ||
        r.record.codigoTuss.toLowerCase().includes(q) ||
        r.record.clienteRaw.toLowerCase().includes(q)
      );
    });
  }, [dryRun, searchTerm]);

  const handleDownloadReview = () => {
    if (!dryRun) return;
    exportToXlsxSheets(`migracao-revisao-${targetTenantId}.xlsx`, buildReviewSheets(dryRun));
  };

  const s = dryRun?.summary;
  // Habilita a importação também quando só há pendências cadastrais a sincronizar (backfill).
  const importableCount = s ? s.newPatients + s.provisionalPatients + s.linkedByCpf + s.linkedByStrong + s.reviewIssues.rows : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              Migração de sistema anterior
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              Clínica de destino: <span className="font-bold text-slate-700">{targetTenantName || '...'}</span>
            </p>
          </div>
          <button onClick={onClose} disabled={step === 'importing' && !outcome} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tenantChanged && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">A clínica ativa foi alterada durante esta sessão de importação.</p>
              <p className="mt-0.5">
                Esta validação foi feita para <strong>{targetTenantName}</strong>. Feche esta janela e inicie uma nova validação com a
                clínica correta ativa.
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {step === 'tenant' && (
            <div className="space-y-4">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl">
                <p className="text-sm font-bold text-teal-900">Importar para: {targetTenantName || '...'}</p>
                <p className="text-xs text-teal-800 mt-1">
                  Toda esta sessão — validação (dry run) e, se confirmada, a gravação — fica travada exclusivamente a esta clínica. Se a
                  clínica ativa mudar, a sessão é invalidada e uma nova validação será exigida.
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Selecione <strong>Clientes.xls</strong> (obrigatório) e <strong>Prontuarios.xls</strong> (opcional). Nesta fase só os{' '}
                <strong>pacientes</strong> (com responsáveis e contatos) são importados; os prontuários são lidos apenas para validar o
                vínculo com os pacientes — a importação clínica será uma etapa separada. Nada é gravado até você confirmar.
              </p>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep('files')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'files' && (
            <div className="space-y-5">
              <FileDropField label="Clientes.xls (obrigatório)" file={clientsFile} onChange={setClientsFile} accept=".xls,.xlsx" />
              <FileDropField
                label="Prontuarios.xls (opcional — apenas validação do vínculo nesta fase)"
                file={recordsFile}
                onChange={setRecordsFile}
                accept=".xls,.xlsx"
              />
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  type="button"
                  disabled={!clientsFile || isBusy || tenantChanged}
                  onClick={handleRunDryRun}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                >
                  Validar importação (dry run) <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'running' && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
              <p className="text-sm font-semibold">Lendo e validando os arquivos...</p>
              <p className="text-xs">Nenhum dado de paciente está sendo gravado nesta etapa.</p>
            </div>
          )}

          {step === 'preview' && dryRun && s && (
            <div className="space-y-5">
              <Section title="Clientes">
                <SummaryCard label="Total de clientes" value={s.totalClients} />
                <SummaryCard label="Novos pacientes" value={s.newPatients} tone="teal" />
                <SummaryCard label="Vincular a existente" value={s.linkedByCpf + s.linkedByStrong} tone="indigo" />
                <SummaryCard label="Já importados (mapa)" value={s.linkedByLegacyMap} tone="slate" />
                <SummaryCard label="Cadastros provisórios (revisão)" value={s.provisionalPatients} tone="orange" />
                <SummaryCard label="Conflitos (fora)" value={s.conflicts} tone="amber" />
                <SummaryCard label="Requer revisão (fora)" value={s.reviewRequired} tone="orange" />
                <SummaryCard label="Inválidos (sem identificador/nome)" value={s.invalid} tone="rose" />
                <SummaryCard label="Excluídos pela clínica (não recriar)" value={s.ignoredByClinic} tone="slate" />
              </Section>
              <Section title="Pendências cadastrais (revisão cadastral)">
                <SummaryCard label="Pacientes com pendência a gravar" value={s.reviewIssues.rows} tone="orange" />
                <SummaryCard label="Pendências (novas + backfill)" value={s.reviewIssues.planned} tone="orange" />
                <SummaryCard label="Backfill (já importados)" value={s.reviewIssues.backfillRows} tone="slate" />
                {(Object.entries(s.reviewIssues.byCode) as Array<[string, number]>).map(([code, n]) => (
                  <React.Fragment key={code}>
                    <SummaryCard label={code} value={n} tone="slate" />
                  </React.Fragment>
                ))}
              </Section>
              {dryRun.professionalProposals.length > 0 && (
                <ProfessionalMappingSection
                  sessionId={session?.id || ''}
                  proposals={dryRun.professionalProposals}
                  confirmed={dryRun.confirmedProfessionalMappings}
                  tenantChanged={tenantChanged}
                />
              )}
              <Section title="Telefones e CPF">
                <SummaryCard label="Telefone válido" value={s.phones.valid} tone="teal" />
                <SummaryCard label="Telefone placeholder" value={s.phones.placeholder} tone="amber" />
                <SummaryCard label="Telefone inválido" value={s.phones.invalid} tone="rose" />
                <SummaryCard label="Sem telefone" value={s.phones.blank} />
                <SummaryCard label="CPF válido" value={s.cpf.valid} tone="teal" />
                <SummaryCard label="CPF placeholder" value={s.cpf.placeholder} tone="amber" />
                <SummaryCard label="CPF inválido" value={s.cpf.invalid} tone="rose" />
              </Section>
              <Section title="Responsáveis (pacientes a criar)">
                <SummaryCard label="Telefone do paciente" value={s.phoneOwner.patient} />
                <SummaryCard label="Telefone do responsável" value={s.phoneOwner.responsible} tone="indigo" />
                <SummaryCard label="Pacientes com responsável" value={s.guardians.patientsLinkedToGuardian} tone="teal" />
                <SummaryCard label="Responsáveis distintos" value={s.guardians.guardiansPlanned} tone="teal" />
                <SummaryCard label="Grupos familiares (2+)" value={s.guardians.groupsWithTwoOrMore} />
                <SummaryCard label="Responsáveis p/ revisão" value={s.guardians.reviewItems} tone="orange" />
              </Section>
              {dryRun.recordResolution.length > 0 && (
                <Section title="Prontuários (somente validação — não importados nesta fase)">
                  <SummaryCard label="Total" value={s.totalRecords} />
                  {(Object.entries(s.recordResolution) as Array<[string, number]>).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <SummaryCard label={RESOLUTION_LABEL[k] || k} value={v} tone={k === 'BLOCKED_BY_PATIENT_REVIEW' || k === 'DIVERGENCE' || k === 'ORPHAN' ? 'amber' : 'slate'} />
                    </React.Fragment>
                  ))}
                  <SummaryCard label="Registro com data/status a revisar" value={s.recordsNeedingReview} tone="orange" />
                </Section>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                Endereço, sexo, profissão, RG e dados extras do responsável são preservados como dado legado (ainda não exibidos no
                cadastro principal). Placeholders e telefones inválidos nunca viram telefone do paciente nem contato de WhatsApp.
                Pacientes já existentes nunca são alterados — o vínculo só registra o mapeamento legado.
              </div>

              <div className="flex items-center gap-2 border-b border-slate-200">
                <TabButton active={activeTable === 'clients'} onClick={() => setActiveTable('clients')}>
                  Clientes ({dryRun.clientResults.length})
                </TabButton>
                {dryRun.recordResolution.length > 0 && (
                  <TabButton active={activeTable === 'records'} onClick={() => setActiveTable('records')}>
                    Prontuários ({dryRun.recordResolution.length})
                  </TabButton>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[160px]"
                />
                {activeTable === 'clients' && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as LegacyRowStatus | 'ALL')}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="ALL">Todos os status</option>
                    {(Object.keys(STATUS_META) as LegacyRowStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {activeTable === 'clients' ? <ClientResultsTable rows={filteredClientRows} /> : <RecordResolutionTable rows={filteredRecordRows} />}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleDownloadReview}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar relatório de revisão (XLSX)
                </button>
                <button
                  type="button"
                  disabled={tenantChanged || importableCount === 0}
                  onClick={() => setShowConfirmDialog(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl transition-colors"
                >
                  Importar pacientes <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && progress && (
            <div className="py-10 space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Pacientes: {progress.rowsDone} / {progress.rowsTotal} (lote {progress.batchesDone} de {progress.batchesTotal})
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all"
                    style={{ width: `${progress.rowsTotal ? (progress.rowsDone / progress.rowsTotal) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Criados {progress.created} · Vinculados {progress.linked} · Já importados {progress.alreadyImported} · Erros {progress.errors}
                </p>
              </div>
              {outcome && !outcome.success && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={tenantChanged}
                    onClick={runImport}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl"
                  >
                    <RefreshCw className="w-4 h-4" /> Retomar importação
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'report' && outcome && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto" />
                <p className="text-sm font-bold text-slate-800 mt-2">Importação de pacientes concluída — {targetTenantName}</p>
              </div>
              <Section title="Resultado">
                <SummaryCard label="Pacientes criados" value={outcome.progress.created} tone="teal" />
                <SummaryCard label="Vinculados a existentes" value={outcome.progress.linked} tone="indigo" />
                <SummaryCard label="Já importados antes" value={outcome.progress.alreadyImported} />
                <SummaryCard label="Erros por linha" value={outcome.progress.errors} tone={outcome.progress.errors ? 'rose' : 'slate'} />
                <SummaryCard label="Responsáveis criados" value={outcome.counters.guardiansCreated} tone="teal" />
                <SummaryCard label="Vínculos de responsável" value={outcome.counters.linksCreated} tone="teal" />
                <SummaryCard label="Fora (sem identificador/nome)" value={s ? s.conflicts + s.reviewRequired + s.invalid : 0} tone="orange" />
                <SummaryCard label="Pendências criadas" value={outcome.issues.created} tone="orange" />
                <SummaryCard label="Pendências já existentes" value={outcome.issues.alreadyExisting} />
                <SummaryCard label="Pendências espelhadas (paciente existente)" value={outcome.issues.mirrored} tone="slate" />
                <SummaryCard label="Pendências rejeitadas (dado já corrigido)" value={outcome.issues.skippedResolved + outcome.issues.rejected} />
              </Section>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDownloadReview}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar relatório de revisão (XLSX)
                </button>
                <button type="button" onClick={onClose} className="px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl">
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={runImport}
        variant="primary"
        title={`Confirmar importação para ${targetTenantName}?`}
        message={`Os pacientes serão importados exclusivamente para ${targetTenantName}. Prontuários não são importados nesta fase.`}
        description={
          s
            ? `Novos: ${s.newPatients} · Provisórios (revisão): ${s.provisionalPatients} · Vincular a existentes: ${s.linkedByCpf + s.linkedByStrong} · Pendências cadastrais: ${s.reviewIssues.planned} · Responsáveis: ${s.guardians.guardiansPlanned}`
            : undefined
        }
        confirmLabel={`Importar para ${targetTenantName}`}
        cancelLabel="Cancelar"
      />
    </div>
  );
};

function ProfessionalMappingSection({
  sessionId,
  proposals,
  confirmed,
  tenantChanged,
}: {
  sessionId: string;
  proposals: DryRunResult['professionalProposals'];
  confirmed: DryRunResult['confirmedProfessionalMappings'];
  tenantChanged: boolean;
}) {
  const [savedNow, setSavedNow] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const confirmedSet = new Set(confirmed.map((c) => c.legacyName));

  const confirm = async (p: DryRunResult['professionalProposals'][number]) => {
    if (!p.candidate || !sessionId) return;
    setBusy(p.legacyName);
    setError(null);
    const res = await confirmProfessionalMapping(sessionId, [{ legacyName: p.legacyName, professionalId: p.candidate.id }]);
    setBusy(null);
    if (!res.success) return setError(res.error || 'Falha ao confirmar.');
    setSavedNow((prev) => ({ ...prev, [p.legacyName]: true }));
  };

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Dentistas do sistema anterior</p>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Dentista legado</th>
              <th className="px-3 py-2 font-semibold">Prontuários</th>
              <th className="px-3 py-2 font-semibold">Profissional atual</th>
              <th className="px-3 py-2 font-semibold">Decisão</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => {
              const isConfirmed = confirmedSet.has(p.legacyName) || savedNow[p.legacyName];
              return (
                <tr key={p.legacyName} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700 font-medium">{p.legacyName}</td>
                  <td className="px-3 py-2 text-slate-500">{p.recordCount}</td>
                  <td className="px-3 py-2 text-slate-600">{p.candidate ? `${p.candidate.name} (${p.confidence})` : 'Manter nome legado'}</td>
                  <td className="px-3 py-2">
                    {isConfirmed ? (
                      <span className="text-teal-700 font-semibold">Confirmado (USER_CONFIRMED)</span>
                    ) : p.candidate ? (
                      <button
                        type="button"
                        disabled={tenantChanged || busy === p.legacyName}
                        onClick={() => confirm(p)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
                      >
                        {busy === p.legacyName ? 'Salvando...' : 'Confirmar mapeamento'}
                      </button>
                    ) : (
                      <span className="text-slate-400">nome legado preservado</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="text-[11px] text-rose-600 mt-1.5">{error}</p>}
      <p className="text-[11px] text-slate-400 mt-1.5">
        Nenhum usuário/profissional é criado. O nome original do dentista é sempre preservado nos prontuários (legacy_dentist_name).
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-bold border-b-2 ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400'}`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'teal' | 'indigo' | 'amber' | 'rose' | 'orange';
}) {
  const toneClasses: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    teal: 'bg-teal-50 border-teal-200 text-teal-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
  };
  return (
    <div className={`p-3 rounded-xl border ${toneClasses[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-extrabold mt-0.5">{value}</p>
    </div>
  );
}

function FileDropField({
  label,
  file,
  onChange,
  accept,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
      <label className="flex items-center gap-3 p-4 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
        <UploadCloud className="w-6 h-6 text-teal-600 shrink-0" />
        <span className="text-xs text-slate-600 flex-1 truncate">{file ? file.name : 'Clique para selecionar o arquivo .xls ou .xlsx'}</span>
        <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      </label>
    </div>
  );
}

function ClientResultsTable({ rows }: { rows: ClientMatchResult[] }) {
  const visible = rows.slice(0, 500);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr className="text-left text-slate-500">
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Nome</th>
            <th className="px-3 py-2 font-semibold">CPF</th>
            <th className="px-3 py-2 font-semibold">Telefone</th>
            <th className="px-3 py-2 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.row.legacyId} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <StatusPill status={r.status} />
              </td>
              <td className="px-3 py-2 text-slate-700">{r.row.name}</td>
              <td className="px-3 py-2 text-slate-500 font-mono">{r.row.cpf.classification === 'VALID' ? r.row.cpf.cleaned : r.row.cpf.classification}</td>
              <td className="px-3 py-2 text-slate-500 font-mono">{r.row.phone || r.row.phoneInfo.classification}</td>
              <td className="px-3 py-2 text-slate-500">{r.reason}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                Nenhum registro corresponde ao filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > visible.length && (
        <p className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          Mostrando {visible.length} de {rows.length} — use a busca/filtro para refinar.
        </p>
      )}
    </div>
  );
}

function RecordResolutionTable({ rows }: { rows: RecordResolutionResult[] }) {
  const visible = rows.slice(0, 500);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr className="text-left text-slate-500">
            <th className="px-3 py-2 font-semibold">Situação</th>
            <th className="px-3 py-2 font-semibold">Procedimento</th>
            <th className="px-3 py-2 font-semibold">TUSS</th>
            <th className="px-3 py-2 font-semibold">Dente/Face</th>
            <th className="px-3 py-2 font-semibold">Status legado</th>
            <th className="px-3 py-2 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.record.legacyId} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-600">
                {RESOLUTION_LABEL[r.resolution] || r.resolution}
                {r.recordNeedsReview ? ' · revisar data/status' : ''}
              </td>
              <td className="px-3 py-2 text-slate-700">{r.record.descricao}</td>
              <td className="px-3 py-2 text-slate-500 font-mono">{r.record.codigoTuss || '—'}</td>
              <td className="px-3 py-2 text-slate-500">
                {r.record.denteRegiao || '—'} {r.record.face ? `/ ${r.record.face}` : ''}
              </td>
              <td className="px-3 py-2 text-slate-500">{r.record.statusLegado}</td>
              <td className="px-3 py-2 text-slate-500">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > visible.length && (
        <p className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          Mostrando {visible.length} de {rows.length} — use a busca para refinar.
        </p>
      )}
    </div>
  );
}
