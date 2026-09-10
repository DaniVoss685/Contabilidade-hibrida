import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Receipt,
  UserCheck,
  Building,
  User,
  PlusCircle,
  FileText,
} from 'lucide-react';
import { Patient, Sale } from '../../types';
import { formatCpf, formatCurrency, formatDateBr } from '../../lib/masks';
import { db } from '../../lib/db';

interface PatientsViewProps {
  patients: Patient[];
  sales: Sale[];
  maskCpf: boolean;
  onOpenNewSaleForPatient?: (patientId: string) => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  patients,
  sales,
  maskCpf,
  onOpenNewSaleForPatient,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    patients[0]?.id || ''
  );

  // New patient modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf.includes(searchTerm.replace(/\D/g, '')) ||
        (p.phone && p.phone.includes(searchTerm))
      );
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

  const handleCreatePatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCpf.trim()) return;

    const created = db.addPatient({
      name: newName.trim(),
      cpf: newCpf.replace(/\D/g, ''),
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
    });

    setSelectedPatientId(created.id);
    setShowAddModal(false);
    setNewName('');
    setNewCpf('');
    setNewPhone('');
    setNewEmail('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            Cadastro e Prontuário Financeiro de Pacientes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Histórico consolidado por paciente com segregação de documentos emitidos em CPF e CNPJ
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-md active:scale-98 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Paciente</span>
        </button>
      </div>

      {/* Main Grid: List on Left, Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[680px]">
          <div className="p-3 border-b border-slate-200">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar paciente por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredPatients.map((p) => {
              const isSelected = p.id === activePatient?.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className={`w-full p-3.5 text-left transition-colors flex items-start justify-between cursor-pointer ${
                    isSelected ? 'bg-teal-50/80 border-l-4 border-teal-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900">{p.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      CPF: {formatCpf(p.cpf, maskCpf)}
                    </div>
                  </div>
                  {p.phone && (
                    <span className="text-[10px] text-slate-400">{p.phone}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Patient Details (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          {activePatient ? (
            <div className="space-y-6">
              {/* Profile Card Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{activePatient.name}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Paciente Ativo
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-mono">
                    <span>CPF: {formatCpf(activePatient.cpf, maskCpf)}</span>
                    {activePatient.phone && <span>Tel: {activePatient.phone}</span>}
                    {activePatient.email && <span>E-mail: {activePatient.email}</span>}
                  </div>
                </div>

                {onOpenNewSaleForPatient && (
                  <button
                    onClick={() => onOpenNewSaleForPatient(activePatient.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Lançar Procedimento</span>
                  </button>
                )}
              </div>

              {/* Patient Financial Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase flex items-center gap-1">
                    <User className="w-3 h-3" /> Faturado via CPF
                  </div>
                  <div className="text-lg font-black text-emerald-950 mt-1">
                    {formatCurrency(totalCpf)}
                  </div>
                  <span className="text-[10px] text-slate-500">Receita Saúde</span>
                </div>

                <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl">
                  <div className="text-[11px] font-bold text-blue-800 uppercase flex items-center gap-1">
                    <Building className="w-3 h-3" /> Faturado via CNPJ
                  </div>
                  <div className="text-lg font-black text-blue-950 mt-1">
                    {formatCurrency(totalCnpj)}
                  </div>
                  <span className="text-[10px] text-slate-500">NFS-e Emitidas</span>
                </div>

                <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl">
                  <div className="text-[11px] font-bold text-amber-900 uppercase flex items-center gap-1">
                    <Receipt className="w-3 h-3" /> Saldo em Aberto
                  </div>
                  <div className="text-lg font-black text-amber-950 mt-1">
                    {formatCurrency(totalBalance)}
                  </div>
                  <span className="text-[10px] text-slate-500">Parcelas a receber</span>
                </div>
              </div>

              {/* History of Procedures & Tax Documents */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  Histórico de Procedimentos e Documentos Fiscais
                </h4>

                {patientSales.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Nenhum procedimento registrado para este paciente até o momento.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Data</th>
                          <th className="p-2.5">Origem</th>
                          <th className="p-2.5">Procedimento</th>
                          <th className="p-2.5">Documento</th>
                          <th className="p-2.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {patientSales.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-600">
                              {formatDateBr(s.serviceDate)}
                            </td>
                            <td className="p-2.5">
                              {s.taxOrigin === 'CPF' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  CPF
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                  CNPJ
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-medium text-slate-800">{s.procedureName}</td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-600">
                              {s.taxOrigin === 'CPF'
                                ? s.installments[0]?.receitaSaudeId || 'Receita Saúde (Pendente)'
                                : `NFS-e #${s.nfseNumber || 'Pendente'}`}
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-900">
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

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Novo Paciente</h3>
            <form onSubmit={handleCreatePatient} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-300 p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CPF (apenas números) *</label>
                <input
                  type="text"
                  value={newCpf}
                  onChange={(e) => setNewCpf(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-300 p-2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 p-2"
                  />
                </div>
              </div>
              <div className="pt-3 flex items-center justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
