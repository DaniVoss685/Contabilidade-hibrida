import React, { useState } from 'react';
import { Patient, ImportPreviewRow, ImportReportSummary, ColumnMapping } from '../../../types';
import { db } from '../../../lib/db';
import {
  parseSpreadsheetFile,
  parseCsvContent,
  guessColumnMapping,
  generateImportPreview,
  executePatientImport,
  RawParsedTable,
} from '../../../lib/patientImportService';
import { exportToCsv, exportToXlsx } from '../../../lib/exportUtils';
import { LegacyMigrationWizard } from './LegacyMigrationWizard';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileText,
  Users,
  History,
} from 'lucide-react';

interface PatientImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

/**
 * Tela inicial de escolha entre o importador simples (CSV/Excel ad-hoc, já
 * existente) e a migração estruturada de sistema anterior (dois arquivos,
 * dry-run obrigatório, travada a um tenant). Não substitui nenhum dos dois
 * fluxos — só decide qual deles a sessão do modal vai seguir.
 */
const ImportModeChooser: React.FC<{
  onClose: () => void;
  onChooseSimple: () => void;
  onChooseLegacy: () => void;
}> = ({ onClose, onChooseSimple, onChooseLegacy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-teal-600" />
            Importar Planilha
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Escolha o tipo de importação.</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onChooseSimple}
          className="text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 transition-colors group"
        >
          <FileSpreadsheet className="w-7 h-7 text-teal-600 mb-3" />
          <h4 className="text-sm font-bold text-slate-800 group-hover:text-teal-800">Importação simples</h4>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Planilha CSV ou Excel avulsa para cadastrar pacientes rapidamente, com mapeamento manual de colunas.
          </p>
        </button>
        <button
          type="button"
          onClick={onChooseLegacy}
          className="text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 transition-colors group"
        >
          <History className="w-7 h-7 text-teal-600 mb-3" />
          <h4 className="text-sm font-bold text-slate-800 group-hover:text-teal-800">Migração de sistema anterior</h4>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Dois arquivos (Clientes + Prontuários) exportados de um sistema odontológico anterior. Inclui validação
            (dry run) obrigatória antes de gravar qualquer dado, travada à clínica ativa.
          </p>
        </button>
      </div>
    </div>
  </div>
);

export const PatientImportModal: React.FC<PatientImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [mode, setMode] = useState<'choose' | 'simple' | 'legacy'>('choose');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');

  const [parsedTable, setParsedTable] = useState<RawParsedTable | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'MERGE' | 'UPDATE' | 'IGNORE'>('MERGE');

  const [isProcessing, setIsProcessing] = useState(false);
  const [importReport, setImportReport] = useState<ImportReportSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  if (mode === 'choose') {
    return (
      <ImportModeChooser
        onClose={onClose}
        onChooseSimple={() => setMode('simple')}
        onChooseLegacy={() => setMode('legacy')}
      />
    );
  }

  if (mode === 'legacy') {
    return (
      <LegacyMigrationWizard
        onClose={onClose}
        onBack={() => setMode('choose')}
        onImportSuccess={onImportSuccess}
      />
    );
  }

  // Download de template modelo
  const handleDownloadTemplate = (type: 'csv' | 'xlsx') => {
    const templateRows = [
      [
        'Nome Completo',
        'CPF',
        'Telefone',
        'E-mail',
        'Data de Nascimento',
        'Cidade',
        'UF',
        'Alergias',
        'Condições Médicas',
        'Medicamentos',
        'Observações Clínicas',
        'Evolução Histórica',
      ],
      [
        'Ana Paula Ferreira',
        '123.456.789-00',
        '(11) 98765-4321',
        'ana.ferreira@email.com',
        '1992-05-14',
        'São Paulo',
        'SP',
        'Penicilina, Látex',
        'Hipertensão',
        'Losartana 50mg',
        'Prefere agendamentos matutinos',
        'Paciente em acompanhamento ortodôntico e clareamento dental prévio sem sensibilidade.',
      ],
      [
        'Lucas Silva Oliveira',
        '987.654.321-99',
        '(11) 91234-5678',
        'lucas.silva@email.com',
        '1988-11-20',
        'São Paulo',
        'SP',
        '',
        '',
        '',
        'Primeira consulta realizada',
        'Avaliação inicial de rotina. Profilaxia e aplicação tópica de flúor realizadas.',
      ],
    ];

    if (type === 'csv') {
      exportToCsv('modelo_importacao_pacientes_dental_finance.csv', templateRows);
    } else {
      exportToXlsx('modelo_importacao_pacientes_dental_finance.xlsx', 'Modelo', templateRows);
    }
  };

  // Processar arquivo / texto inicial
  const handleInitialParse = async () => {
    setErrorMessage(null);
    try {
      let table: RawParsedTable;

      if (inputMode === 'file') {
        if (!selectedFile) {
          setErrorMessage('Selecione um arquivo CSV ou Excel.');
          return;
        }
        table = await parseSpreadsheetFile(selectedFile);
      } else {
        if (!pastedText.trim()) {
          setErrorMessage('Cole os dados tabulares da sua planilha no campo de texto.');
          return;
        }
        table = parseCsvContent(pastedText);
      }

      if (table.headers.length === 0 || table.rows.length === 0) {
        setErrorMessage('Nenhum dado legível foi encontrado. Verifique se o arquivo possui cabeçalhos e linhas preenchidas.');
        return;
      }

      setParsedTable(table);
      const guessed = guessColumnMapping(table.headers);
      setMappings(guessed);
      setStep(2);
    } catch (err: any) {
      setErrorMessage(`Erro ao processar planilha: ${err?.message || 'Arquivo corrompido ou formato não suportado'}`);
    }
  };

  // Gerar Preview
  const handleGeneratePreview = () => {
    if (!parsedTable) return;
    const existingPatients = db.getPatients();
    const rows = generateImportPreview(parsedTable, mappings, existingPatients);
    setPreviewRows(rows);
    setStep(3);
  };

  // Executar Importação Final
  const handleExecuteImport = async () => {
    setIsProcessing(true);
    try {
      const summary = await executePatientImport(
        previewRows,
        duplicateStrategy,
        selectedFile?.name || 'importacao_manual'
      );
      setImportReport(summary);
      setStep(4);
      onImportSuccess();
    } catch (err: any) {
      setErrorMessage(`Falha na importação: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const availableTargetFields = [
    { value: '', label: '-- Ignorar esta coluna --' },
    { value: 'name', label: 'Nome Completo (Obrigatório)' },
    { value: 'cpf', label: 'CPF' },
    { value: 'phone', label: 'Telefone / WhatsApp' },
    { value: 'email', label: 'E-mail' },
    { value: 'birthDate', label: 'Data de Nascimento' },
    { value: 'city', label: 'Cidade' },
    { value: 'state', label: 'UF / Estado' },
    { value: 'allergies', label: 'Alergias' },
    { value: 'conditions', label: 'Condições Médicas / Anamnese' },
    { value: 'medications', label: 'Medicamentos em Uso' },
    { value: 'clinicalNotes', label: 'Observações do Paciente' },
    { value: 'evolution', label: 'Evolução / Histórico Clínico' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              Importação Estruturada de Pacientes e Prontuários
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Passo {step} de 4: {step === 1 && 'Carregar Planilha'}
              {step === 2 && 'Mapeamento de Colunas'}
              {step === 3 && 'Validação e Resolução de Duplicidades'}
              {step === 4 && 'Relatório de Importação'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Passos */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-teal-700 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px]">1</span>
            Arquivo
          </div>
          <div className="h-0.5 w-8 bg-slate-200" />
          <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-teal-700 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px]">2</span>
            Mapeamento
          </div>
          <div className="h-0.5 w-8 bg-slate-200" />
          <div className={`flex items-center gap-1.5 ${step >= 3 ? 'text-teal-700 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px]">3</span>
            Validação
          </div>
          <div className="h-0.5 w-8 bg-slate-200" />
          <div className={`flex items-center gap-1.5 ${step >= 4 ? 'text-teal-700 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px]">4</span>
            Conclusão
          </div>
        </div>

        {/* Corpo do Wizard */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* PASSO 1: CARREGAR ARQUIVO OU COLAR */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex gap-2">
                  <button
                    onClick={() => setInputMode('file')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      inputMode === 'file'
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Upload de Arquivo (CSV / Excel)
                  </button>
                  <button
                    onClick={() => setInputMode('paste')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      inputMode === 'paste'
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Colar do Google Sheets / Excel
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Baixar Modelo:</span>
                  <button
                    onClick={() => handleDownloadTemplate('xlsx')}
                    className="text-teal-600 hover:underline font-medium"
                  >
                    Excel (.xlsx)
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    onClick={() => handleDownloadTemplate('csv')}
                    className="text-teal-600 hover:underline font-medium"
                  >
                    CSV
                  </button>
                </div>
              </div>

              {inputMode === 'file' ? (
                <label className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-2xl bg-slate-50/50 hover:bg-teal-50/20 cursor-pointer transition-colors text-center">
                  <UploadCloud className="w-12 h-12 text-teal-600 mb-3" />
                  <span className="text-sm font-bold text-slate-800">
                    {selectedFile ? selectedFile.name : 'Clique para selecionar seu arquivo de pacientes'}
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    Suporta planilhas CSV, Excel (.xlsx, .xls) com detecção automática de delimitadores e UTF-8.
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                    }}
                    className="hidden"
                  />
                </label>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Copie as linhas da sua planilha (incluindo o cabeçalho) e cole aqui:
                  </label>
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Nome	CPF	Telefone	E-mail	Nascimento	Cidade...
Mariana Santos	123.456.789-00	(11) 98765-4321	mariana@email.com	1994-08-10	São Paulo..."
                    className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* PASSO 2: MAPEAMENTO DE COLUNAS */}
          {step === 2 && parsedTable && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Identificamos <strong>{parsedTable.headers.length} colunas</strong> e{' '}
                <strong>{parsedTable.rows.length} registros</strong>. Confira se as colunas da sua planilha
                correspondem aos campos do Dental Finance:
              </p>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                    <tr>
                      <th className="p-2.5">Coluna na sua Planilha</th>
                      <th className="p-2.5">Exemplo da 1ª Linha</th>
                      <th className="p-2.5">Campo no Dental Finance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedTable.headers.map((header) => {
                      const currentMapping = mappings.find((m) => m.sourceColumn === header);
                      const sampleValue = parsedTable.rows[0]?.[header] || '—';

                      return (
                        <tr key={header} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-semibold text-slate-800">{header}</td>
                          <td className="p-2.5 text-slate-500 truncate max-w-[200px]" title={sampleValue}>
                            {sampleValue}
                          </td>
                          <td className="p-2.5">
                            <select
                              value={currentMapping?.targetField || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMappings((prev) => {
                                  const filtered = prev.filter((m) => m.sourceColumn !== header);
                                  if (val) {
                                    return [...filtered, { sourceColumn: header, targetField: val }];
                                  }
                                  return filtered;
                                });
                              }}
                              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                            >
                              {availableTargetFields.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PASSO 3: PREVIEW E DUPLICIDADES */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Opções de Duplicidade */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Estratégia para Pacientes com CPF ou Nome já Cadastrados:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDuplicateStrategy('MERGE')}
                    className={`p-2.5 text-xs rounded-xl border text-left transition-all ${
                      duplicateStrategy === 'MERGE'
                        ? 'border-teal-500 bg-teal-50 text-teal-800 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div>1. Mesclar Dados (Recomendado)</div>
                    <p className="text-[11px] font-normal text-slate-500 mt-1">
                      Mantém dados existentes e complementa alergias, novas observações e evoluções.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDuplicateStrategy('UPDATE')}
                    className={`p-2.5 text-xs rounded-xl border text-left transition-all ${
                      duplicateStrategy === 'UPDATE'
                        ? 'border-teal-500 bg-teal-50 text-teal-800 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div>2. Atualizar Cadastro</div>
                    <p className="text-[11px] font-normal text-slate-500 mt-1">
                      Substitui os dados cadastrais antigos pelos novos informados na planilha.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDuplicateStrategy('IGNORE')}
                    className={`p-2.5 text-xs rounded-xl border text-left transition-all ${
                      duplicateStrategy === 'IGNORE'
                        ? 'border-teal-500 bg-teal-50 text-teal-800 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div>3. Ignorar Duplicados</div>
                    <p className="text-[11px] font-normal text-slate-500 mt-1">
                      Não altera pacientes já existentes e importa somente os novos.
                    </p>
                  </button>
                </div>
              </div>

              {/* Contadores */}
              <div className="flex gap-4 text-xs font-semibold">
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  {previewRows.filter((r) => r.status === 'VALID').length} Linhas Válidas
                </span>
                <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                  {previewRows.filter((r) => r.status === 'WARNING').length} Avisos / Duplicidades
                </span>
                {previewRows.filter((r) => r.status === 'ERROR').length > 0 && (
                  <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
                    {previewRows.filter((r) => r.status === 'ERROR').length} Erros Bloqueantes
                  </span>
                )}
              </div>

              {/* Tabela de Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">CPF</th>
                      <th className="p-2">Telefone</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((r) => (
                      <tr key={r.rowNumber} className="hover:bg-slate-50/50">
                        <td className="p-2 text-slate-400">{r.rowNumber}</td>
                        <td className="p-2 font-semibold text-slate-800">
                          {r.mappedPatient.name || 'Sem nome'}
                        </td>
                        <td className="p-2 text-slate-600">{r.mappedPatient.cpf || '—'}</td>
                        <td className="p-2 text-slate-600">{r.mappedPatient.phone || '—'}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              r.status === 'VALID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.status === 'WARNING'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {r.status === 'VALID' ? 'Válido' : r.status === 'WARNING' ? 'Aviso' : 'Erro'}
                          </span>
                        </td>
                        <td className="p-2 text-[11px] text-slate-500">
                          {r.messages.join('; ') || 'Pronto para importar'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PASSO 4: RELATÓRIO FINAL */}
          {step === 4 && importReport && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <h4 className="text-lg font-bold text-slate-800">Importação Concluída com Sucesso!</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Os dados foram validados e inseridos no banco de dados e no prontuário clínico.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto text-center pt-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Novos Pacientes</span>
                  <span className="text-xl font-bold text-teal-600">{importReport.importedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Atualizados</span>
                  <span className="text-xl font-bold text-blue-600">{importReport.updatedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Ignorados</span>
                  <span className="text-xl font-bold text-slate-500">{importReport.ignoredCount}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Erros</span>
                  <span className="text-xl font-bold text-red-600">{importReport.errorCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Navegação */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div>
            {step > 1 && step < 4 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>

                {step === 1 && (
                  <button
                    type="button"
                    onClick={handleInitialParse}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
                  >
                    Avançar
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {step === 2 && (
                  <button
                    type="button"
                    onClick={handleGeneratePreview}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
                  >
                    Visualizar Preview
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {step === 3 && (
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    {isProcessing ? 'Importando...' : 'Confirmar Importação'}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
              >
                Concluir e Ver Pacientes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
