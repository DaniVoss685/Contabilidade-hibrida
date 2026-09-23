import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Building2,
  Stethoscope,
  Download,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { db } from '../../../lib/db';
import { SupabaseService } from '../../../lib/supabaseClient';
import { exportToXlsx } from '../../../lib/exportUtils';
import { useToast, ConfirmDialog } from '../../UI';
import {
  DryRunResult,
  RunDryRunOptions,
  runDryRun,
  createImportSession,
  saveDryRunResult,
  invalidateImportSession,
  importAll,
  CommitProgress,
  LEGACY_SOURCE_SYSTEM,
} from '../../../lib/legacyImportService';
import { ClientMatchResult, RecordMatchResult, LegacyRowStatus } from '../../../lib/legacyImportMatching';
import { LegacyImportSession } from '../../../types';

type WizardStep = 'tenant' | 'files' | 'running' | 'mapping' | 'preview' | 'confirming' | 'importing' | 'report';

interface ProfessionalChoice {
  professionalId?: string;
  displayName: string;
  keepLegacy: boolean;
}

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

  const [wizardStep, setWizardStep] = useState<WizardStep>('tenant');
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [recordsFile, setRecordsFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [session, setSession] = useState<LegacyImportSession | null>(null);
  const [professionalMapping, setProfessionalMapping] = useState<Record<string, ProfessionalChoice>>({});
  const [procedureMapping, setProcedureMapping] = useState<Record<string, string>>({});

  const [activeTable, setActiveTable] = useState<'clients' | 'records'>('clients');
  const [statusFilter, setStatusFilter] = useState<LegacyRowStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [finalCounts, setFinalCounts] = useState<{ patients: number; records: number } | null>(null);

  const professionals = db.getProfessionals();
  const procedures = db.getProcedures();

  useEffect(() => {
    SupabaseService.getTenantInfo(targetTenantId).then((info) => setTargetTenantName(info?.name || targetTenantId));
  }, [targetTenantId]);

  // Trava de tenant: se a clínica ativa mudar enquanto o wizard está aberto,
  // a sessão fica travada na UI (o guard real e não contornável é o servidor
  // — toda ação da Edge Function revalida o tenant da sessão a cada chamada).
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      const current = db.getActiveTenantId();
      if (current !== targetTenantId) {
        setTenantChanged(true);
      }
    });
    return unsubscribe;
  }, [targetTenantId]);

  useEffect(() => {
    return () => {
      // Se o usuário fechar o wizard com uma sessão já criada mas não
      // finalizada, invalida no servidor — não é estritamente necessário
      // (toda ação revalida de qualquer forma), mas evita sessões "penduradas".
      if (session && session.status !== 'IMPORT_COMPLETE') {
        invalidateImportSession(session.id).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const handleRunDryRun = async () => {
    if (tenantChanged) return;
    if (!clientsFile) {
      setErrorMessage('Selecione o arquivo de Clientes antes de continuar.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setWizardStep('running');
    try {
      const sessionRes = await createImportSession({
        targetTenantId,
        sourceSystem: LEGACY_SOURCE_SYSTEM,
        clientsFileName: clientsFile.name,
        clientsFileChecksum: '',
        recordsFileName: recordsFile?.name,
        recordsFileChecksum: '',
      });
      if (!sessionRes.success || !sessionRes.session) {
        throw new Error(sessionRes.error || 'Falha ao criar sessão de importação.');
      }

      const result = await runDryRun({ targetTenantId, clientsFile, recordsFile });

      await saveDryRunResult({
        sessionId: sessionRes.session.id,
        summary: result.summary,
        professionalMapping: {},
        procedureMapping: {},
      });

      setSession({ ...sessionRes.session, clientsFileChecksum: result.clientsFileChecksum, recordsFileChecksum: result.recordsFileChecksum });
      setDryRun(result);

      const profMap: Record<string, ProfessionalChoice> = {};
      result.distinctLegacyDentists.forEach((name) => {
        profMap[name] = { keepLegacy: true, displayName: name };
      });
      setProfessionalMapping(profMap);

      setWizardStep(result.distinctLegacyDentists.length > 0 ? 'mapping' : 'preview');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao validar os arquivos.');
      setWizardStep('files');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (tenantChanged || !session || !dryRun) return;
    setShowConfirmDialog(false);
    setWizardStep('importing');
    setProgress({ patientsDone: 0, patientsTotal: 0, recordsDone: 0, recordsTotal: 0 });
    const result = await importAll(session.id, dryRun, professionalMapping, procedureMapping, setProgress);
    if (!result.success) {
      setErrorMessage(result.error || 'Falha durante a importação.');
      setWizardStep('preview');
      return;
    }
    const patientsCreated = dryRun.clientResults.filter((r) => r.status === 'NOVO').length;
    const recordsCreated = dryRun.recordResults.filter((r) => r.status === 'NOVO').length;
    setFinalCounts({ patients: patientsCreated, records: recordsCreated });
    setWizardStep('report');
    onImportSuccess();
    toast.success('Importação concluída.');
  };

  const filteredClientRows = useMemo(() => {
    if (!dryRun) return [];
    return dryRun.clientResults.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      return r.row.name.toLowerCase().includes(q) || r.row.cpf.cleaned.includes(q) || r.row.legacyId.includes(q);
    });
  }, [dryRun, statusFilter, searchTerm]);

  const filteredRecordRows = useMemo(() => {
    if (!dryRun) return [];
    return dryRun.recordResults.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      return (
        r.row.descricao.toLowerCase().includes(q) ||
        r.row.codigoTuss.toLowerCase().includes(q) ||
        r.row.clienteRaw.toLowerCase().includes(q)
      );
    });
  }, [dryRun, statusFilter, searchTerm]);

  const handleDownloadRejected = () => {
    if (!dryRun) return;
    const rows: (string | number)[][] = [
      ['Tipo', 'legacy_id', 'Nome/Descrição', 'Status', 'Motivo'],
      ...dryRun.clientResults
        .filter((r) => r.status !== 'NOVO' && r.status !== 'VINCULAR')
        .map((r) => ['Cliente', r.row.legacyId, r.row.name, r.status, r.reason]),
      ...dryRun.recordResults
        .filter((r) => r.status !== 'NOVO' && r.status !== 'VINCULAR')
        .map((r) => ['Prontuário', r.row.legacyId, r.row.descricao, r.status, r.reason]),
    ];
    exportToXlsx(`importacao-legado-rejeitados-${targetTenantId}.xlsx`, 'Rejeitados', rows);
  };

  const step = wizardStep;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              Migração de sistema anterior
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              Importar para: <span className="font-bold text-slate-700">{targetTenantName || '...'}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tenantChanged && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">A clínica ativa foi alterada durante esta sessão de importação.</p>
              <p className="mt-0.5">
                Esta validação foi feita para <strong>{targetTenantName}</strong>. Feche esta janela e inicie uma nova validação
                com a clínica correta ativa.
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
          {/* PASSO: confirmação de clínica de destino */}
          {step === 'tenant' && (
            <div className="space-y-4">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl">
                <p className="text-sm font-bold text-teal-900">Clínica de destino: {targetTenantName || '...'}</p>
                <p className="text-xs text-teal-800 mt-1">
                  Toda esta sessão de importação — validação (dry run) e, se confirmada, a gravação definitiva — fica
                  travada exclusivamente a esta clínica. Se a clínica ativa mudar durante o processo, a sessão é
                  invalidada e uma nova validação será exigida.
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Você vai selecionar o arquivo <strong>Clientes.xls</strong> (obrigatório) e, opcionalmente,{' '}
                <strong>Prontuarios.xls</strong> (histórico de procedimentos — exige que os clientes já tenham sido
                validados). Nenhum dado é gravado até você confirmar explicitamente ao final.
              </p>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep('files')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO: seleção de arquivos */}
          {step === 'files' && (
            <div className="space-y-5">
              <FileDropField
                label="Clientes.xls (obrigatório)"
                file={clientsFile}
                onChange={setClientsFile}
                accept=".xls,.xlsx"
              />
              <FileDropField
                label="Prontuarios.xls (opcional — histórico de procedimentos)"
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

          {/* PASSO: rodando dry run */}
          {step === 'running' && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
              <p className="text-sm font-semibold">Lendo e validando os arquivos...</p>
              <p className="text-xs">Nenhum dado está sendo gravado nesta etapa.</p>
            </div>
          )}

          {/* PASSO: mapeamento de dentistas / TUSS */}
          {step === 'mapping' && dryRun && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                  <Stethoscope className="w-4 h-4 text-teal-600" /> Dentistas do sistema anterior
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  Para cada dentista legado, escolha vincular a um profissional atual ou manter apenas como referência
                  histórica. Nenhum usuário é criado automaticamente.
                </p>
                <div className="space-y-2">
                  {dryRun.distinctLegacyDentists.map((name) => {
                    const choice = professionalMapping[name] || { keepLegacy: true, displayName: name };
                    return (
                      <div key={name} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl">
                        <span className="text-xs font-semibold text-slate-700 flex-1">{name}</span>
                        <select
                          value={choice.keepLegacy ? '__legacy__' : choice.professionalId || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__legacy__') {
                              setProfessionalMapping((prev) => ({ ...prev, [name]: { keepLegacy: true, displayName: name } }));
                            } else {
                              const prof = professionals.find((p) => p.id === val);
                              setProfessionalMapping((prev) => ({
                                ...prev,
                                [name]: { keepLegacy: false, professionalId: val, displayName: prof?.name || name },
                              }));
                            }
                          }}
                          className="text-xs border border-slate-300 rounded-lg px-2 py-1.5"
                        >
                          <option value="__legacy__">Manter apenas como profissional legado</option>
                          {professionals.map((p) => (
                            <option key={p.id} value={p.id}>
                              Vincular a: {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {dryRun.distinctTuss.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-2">Procedimentos (código TUSS legado)</h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Opcional — vincula só para exibição no prontuário. Nunca cria preço nem custo. Sem vínculo, o
                    procedimento fica preservado como histórico legado (código e descrição originais).
                  </p>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {dryRun.distinctTuss.map((t) => (
                      <div key={t.code} className="flex items-center gap-3 p-2.5 border border-slate-200 rounded-xl">
                        <span className="text-[11px] font-mono text-slate-500 w-20 shrink-0">{t.code}</span>
                        <span className="text-xs text-slate-700 flex-1">
                          {t.description} <span className="text-slate-400">({t.count}x)</span>
                        </span>
                        <select
                          value={procedureMapping[t.code] || ''}
                          onChange={(e) =>
                            setProcedureMapping((prev) => ({ ...prev, [t.code]: e.target.value || '' }))
                          }
                          className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 max-w-[220px]"
                        >
                          <option value="">Manter como legado</option>
                          {procedures.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep('files')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep('preview')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
                >
                  Ver preview <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO: preview / dry-run */}
          {step === 'preview' && dryRun && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="Total de clientes" value={dryRun.summary.totalClients} />
                <SummaryCard label="Novos pacientes" value={dryRun.summary.newPatients} tone="teal" />
                <SummaryCard label="Pacientes encontrados" value={dryRun.summary.linkedPatients} tone="indigo" />
                <SummaryCard label="Conflitos" value={dryRun.summary.conflicts} tone="amber" />
                <SummaryCard label="Dados inválidos" value={dryRun.summary.invalid} tone="rose" />
                <SummaryCard label="Requer revisão" value={dryRun.summary.reviewRequired} tone="orange" />
                <SummaryCard label="Prontuários encontrados" value={dryRun.summary.totalRecords} />
                <SummaryCard label="Prontuários válidos" value={dryRun.summary.validRecords} tone="teal" />
              </div>
              {dryRun.summary.problemRecords > 0 && (
                <SummaryCard label="Prontuários com problema" value={dryRun.summary.problemRecords} tone="amber" full />
              )}

              <LegacyFieldsPreservedNote />

              <div className="flex items-center gap-2 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTable('clients')}
                  className={`px-3 py-2 text-xs font-bold border-b-2 ${
                    activeTable === 'clients' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400'
                  }`}
                >
                  Clientes ({dryRun.clientResults.length})
                </button>
                {dryRun.recordResults.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTable('records')}
                    className={`px-3 py-2 text-xs font-bold border-b-2 ${
                      activeTable === 'records' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400'
                    }`}
                  >
                    Prontuários ({dryRun.recordResults.length})
                  </button>
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
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LegacyRowStatus | 'ALL')}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5"
                >
                  <option value="ALL">Todos os status</option>
                  {(Object.keys(STATUS_META) as LegacyRowStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>

              {activeTable === 'clients' ? (
                <ClientResultsTable rows={filteredClientRows} />
              ) : (
                <RecordResultsTable rows={filteredRecordRows} />
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleDownloadRejected}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar rejeitados/revisão (XLSX)
                </button>
                <button
                  type="button"
                  disabled={tenantChanged}
                  onClick={() => setShowConfirmDialog(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl transition-colors"
                >
                  Importar dados <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO: importando */}
          {step === 'importing' && progress && (
            <div className="py-10 space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Clientes: {progress.patientsDone} / {progress.patientsTotal}
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all"
                    style={{ width: `${progress.patientsTotal ? (progress.patientsDone / progress.patientsTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  Prontuários: {progress.recordsDone} / {progress.recordsTotal}
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${progress.recordsTotal ? (progress.recordsDone / progress.recordsTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASSO: relatório final */}
          {step === 'report' && finalCounts && (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Importação concluída para {targetTenantName}.</p>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
                <SummaryCard label="Pacientes criados" value={finalCounts.patients} tone="teal" />
                <SummaryCard label="Prontuários importados" value={finalCounts.records} tone="teal" />
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
              >
                Concluir
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmImport}
        variant="primary"
        title={`Confirmar importação para ${targetTenantName}?`}
        message="Os dados serão importados exclusivamente para esta clínica. Esta ação grava pacientes e histórico de procedimentos no banco de dados."
        description={
          dryRun
            ? `Pacientes novos: ${dryRun.summary.newPatients} · Vinculados: ${dryRun.summary.linkedPatients} · Conflitos: ${dryRun.summary.conflicts} · Inválidos: ${dryRun.summary.invalid} · Prontuários: ${dryRun.summary.validRecords}`
            : undefined
        }
        confirmLabel={`Importar para ${targetTenantName}`}
        cancelLabel="Cancelar"
      />
    </div>
  );
};

function SummaryCard({
  label,
  value,
  tone = 'slate',
  full = false,
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'teal' | 'indigo' | 'amber' | 'rose' | 'orange';
  full?: boolean;
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
    <div className={`p-3 rounded-xl border ${toneClasses[tone]} ${full ? 'col-span-full' : ''}`}>
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
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </label>
    </div>
  );
}

function LegacyFieldsPreservedNote() {
  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
      <strong>Dados preservados como legado:</strong> endereço completo, sexo, profissão, RG e dados de responsável
      legal são capturados e preservados, mas ainda não têm um campo próprio no cadastro do paciente — aparecem como{' '}
      <em>"Preservado como dado legado — ainda não exibido no cadastro principal"</em> e ficam disponíveis no
      relatório final para auditoria.
    </div>
  );
}

function ClientResultsTable({ rows }: { rows: ClientMatchResult[] }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr className="text-left text-slate-500">
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Nome</th>
            <th className="px-3 py-2 font-semibold">CPF</th>
            <th className="px-3 py-2 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row.legacyId} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <StatusPill status={r.status} />
              </td>
              <td className="px-3 py-2 text-slate-700">{r.row.name}</td>
              <td className="px-3 py-2 text-slate-500 font-mono">{r.row.cpf.cleaned || '—'}</td>
              <td className="px-3 py-2 text-slate-500">{r.reason}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                Nenhum registro corresponde ao filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RecordResultsTable({ rows }: { rows: RecordMatchResult[] }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr className="text-left text-slate-500">
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Descrição</th>
            <th className="px-3 py-2 font-semibold">TUSS</th>
            <th className="px-3 py-2 font-semibold">Dente/Face</th>
            <th className="px-3 py-2 font-semibold">Status legado</th>
            <th className="px-3 py-2 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row.legacyId} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <StatusPill status={r.status} />
              </td>
              <td className="px-3 py-2 text-slate-700">{r.row.descricao}</td>
              <td className="px-3 py-2 text-slate-500 font-mono">{r.row.codigoTuss || '—'}</td>
              <td className="px-3 py-2 text-slate-500">
                {r.row.denteRegiao || '—'} {r.row.face ? `/ ${r.row.face}` : ''}
              </td>
              <td className="px-3 py-2 text-slate-500">{r.row.statusLegado}</td>
              <td className="px-3 py-2 text-slate-500">{r.reason}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                Nenhum registro corresponde ao filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
