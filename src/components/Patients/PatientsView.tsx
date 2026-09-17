import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Receipt,
  Building,
  User,
  PlusCircle,
  FileText,
  X,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';
import { Patient, Sale } from '../../types';
import { formatCpf, formatCurrency, formatDateBr, normalizeSearchText, matchDocumentSearch } from '../../lib/masks';
import { db } from '../../lib/db';
import { useToast } from '../UI';
import { PatientModal } from '../Modals/PatientModal';

interface PatientsViewProps {
  patients: Patient[];
  sales: Sale[];
  maskCpf: boolean;
  onOpenNewSaleForPatient?: (patientId: string) => void;
  initialOpenNewModal?: boolean;
  onClearAction?: () => void;
  initialSelectedPatientId?: string;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  patients,
  sales,
  maskCpf,
  onOpenNewSaleForPatient,
  initialOpenNewModal = false,
  onClearAction,
  initialSelectedPatientId,
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    initialSelectedPatientId || patients[0]?.id || ''
  );

  // Sync with external selection (e.g. from Ctrl+K global search)
  React.useEffect(() => {
    if (initialSelectedPatientId) {
      setSelectedPatientId(initialSelectedPatientId);
    }
  }, [initialSelectedPatientId]);

  // New patient modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(initialOpenNewModal);

  React.useEffect(() => {
    if (initialOpenNewModal) {
      setShowAddModal(true);
      if (onClearAction) onClearAction();
    }
  }, [initialOpenNewModal, onClearAction]);

  const filteredPatients = useMemo(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return patients;

    const normQuery = normalizeSearchText(trimmed);

    return patients.filter((p) => {
      const nameMatch = normalizeSearchText(p.name).includes(normQuery);
      const cpfMatch = matchDocumentSearch(p.cpf, trimmed);
      const phoneDigits = (p.phone || '').replace(/\D/g, '');
      const searchDigits = trimmed.replace(/\D/g, '');
      const phoneMatch = searchDigits.length >= 3 && phoneDigits.includes(searchDigits);

      return nameMatch || cpfMatch || phoneMatch;
    });
  }, [patients, searchTerm]);

  const activePatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  // Financial history for active patient
  const patientSales = useMemo(() => {
    if (!activePatient) return [];
    return sales.filter((s) => s.patientId === activePatient.id || s.patientName === activePatient.name);
  }, [sales, activePatient]);

  const totalCpf = patientSales
    .filter((s) => s.taxOrigin === 'CPF')
    .reduce((sum, s) => sum + s.totalValue, 0);

  const totalCnpj = patientSales
    .filter((s) => s.taxOrigin === 'CNPJ')
    .reduce((sum, s) => sum + s.totalValue, 0);

  const totalBalance = patientSales.reduce((acc, s) => {
    return (
      acc +
      s.installments
        .filter((i) => i.status !== 'RECEBIDO' && i.status !== 'CANCELADO')
        .reduce((sum, i) => sum + (i.value - (i.amountReceived || 0)), 0)
    );
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            Cadastro e Prontuário Financeiro de Pacientes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Histórico consolidado por paciente com segregação de documentos emitidos em CPF e CNPJ
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Paciente</span>
        </button>
      </div>

      {/* Main Grid: List on Left, Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[680px] overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, CPF ou tel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredPatients.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhum paciente encontrado.
              </div>
            ) : (
              filteredPatients.map((p) => {
                const isSelected = p.id === activePatient?.id;
                const initials = p.name
                  .split(' ')
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full p-3.5 text-left transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 border-l-3 border-emerald-600'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {initials}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          CPF: {formatCpf(p.cpf, maskCpf)}
                        </div>
                      </div>
                    </div>
                    {p.phone && (
                      <span className="text-[10px] text-slate-400 font-mono">{p.phone}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Patient Details (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          {activePatient ? (
            <div className="space-y-6">
              {/* Profile Card Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-5 border-b border-slate-100 gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                    {activePatient.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{activePatient.name}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Paciente Ativo
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-mono">
                      <span>CPF: {formatCpf(activePatient.cpf, maskCpf)}</span>
                      {activePatient.phone && <span>Tel: {activePatient.phone}</span>}
                      {activePatient.email && <span>Email: {activePatient.email}</span>}
                    </div>
                  </div>
                </div>

        {onOpenNewSaleForPatient && (
                  <button
                    type="button"
                    onClick={() => onOpenNewSaleForPatient(activePatient.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs hover:shadow cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nova Receita / Atendimento</span>
                  </button>
                )}
              </div>

              {/* Patient Financial Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Faturado via CPF
                  </div>
                  <div className="text-lg font-black text-emerald-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(totalCpf)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Receita Saúde (PF)</span>
                </div>

                <div className="p-4 bg-blue-50/50 border border-blue-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="w-3 h-3" /> Faturado via CNPJ
                  </div>
                  <div className="text-lg font-black text-blue-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(totalCnpj)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">NFS-e Emitidas (PJ)</span>
                </div>

                <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="w-3 h-3" /> Saldo em Aberto
                  </div>
                  <div className="text-lg font-black text-amber-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(totalBalance)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Parcelas a receber</span>
                </div>
              </div>

              {/* History of Procedures & Tax Documents */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  Histórico de Procedimentos e Documentos Fiscais
                </h4>

                {patientSales.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    Nenhum procedimento registrado para este paciente até o momento.
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200/80">
                        <tr>
                          <th className="p-3">Data</th>
                          <th className="p-3">Origem</th>
                          <th className="p-3">Procedimento</th>
                          <th className="p-3">Documento Fiscal</th>
                          <th className="p-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {patientSales.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-mono text-slate-600 text-xs">
                              {formatDateBr(s.serviceDate)}
                            </td>
                            <td className="p-3">
                              {s.taxOrigin === 'CPF' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  CPF
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  CNPJ
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-medium text-slate-800 text-xs">{s.procedureName}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-600">
                              {s.taxOrigin === 'CPF'
                                ? s.installments[0]?.receitaSaudeId || 'Receita Saúde (Pendente)'
                                : `NFS-e #${s.nfseNumber || 'Pendente'}`}
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900 font-mono tabular-nums text-xs">
                              {formatCurrency(s.totalValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400 text-xs">
              Selecione um paciente na lista ao lado para ver o histórico financeiro.
            </div>
          )}
        </div>
      </div>

      {/* Modern Patient Modal with Validation, Duplicate Check and Success Dialog */}
      <PatientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={(newPatient) => {
          setSelectedPatientId(newPatient.id);
          setSearchTerm(''); // limpa a busca para exibir o paciente recém-criado
          setShowAddModal(false);
        }}
      />
    </div>
  );
};
