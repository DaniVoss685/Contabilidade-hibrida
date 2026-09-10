import React, { useState } from 'react';
import {
  Settings,
  User,
  Building,
  ShieldCheck,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Play,
  History,
  Lock,
  Wallet,
} from 'lucide-react';
import {
  Professional,
  Organization,
  BankAccount,
  PayrollHistoryEntry,
  AuditLog,
} from '../../types';
import { formatCurrency, formatCpf, formatCnpj } from '../../lib/masks';
import { db } from '../../lib/db';

interface SettingsViewProps {
  professional: Professional;
  organization: Organization;
  bankAccounts: BankAccount[];
  payrollHistory: PayrollHistoryEntry[];
  auditLogs: AuditLog[];
  maskCpf: boolean;
  onRefreshData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  professional,
  organization,
  bankAccounts,
  payrollHistory,
  auditLogs,
  maskCpf,
  onRefreshData,
}) => {
  // Local state for editing professional
  const [name, setName] = useState(professional.name);
  const [cro, setCro] = useState(professional.cro);
  const [croUf, setCroUf] = useState(professional.croUf);
  const [dependentes, setDependentes] = useState(professional.numDependentes);
  const [inss, setInss] = useState(professional.inssProprioMensal);
  const [rbt12, setRbt12] = useState(professional.rbt12Inicial);
  const [folha12, setFolha12] = useState(professional.folha12MesesInicial);

  // Scenario test feedback
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    db.updateProfessional({
      name,
      cro,
      croUf,
      numDependentes: dependentes,
      inssProprioMensal: inss,
      rbt12Inicial: rbt12,
      folha12MesesInicial: folha12,
    });
    alert('Configurações profissionais e tributárias salvas com sucesso.');
    onRefreshData();
  };

  const handleRunScenario = (type: 'FATOR_R_III' | 'FATOR_R_V' | 'RESET') => {
    if (type === 'FATOR_R_III') {
      db.setFatorRScenario(true);
      setScenarioMessage('Cenário ativado: Fator R ajustado para ~30% (Anexo III). Folha aumentada para manter enquadramento econômico.');
    } else if (type === 'FATOR_R_V') {
      db.setFatorRScenario(false);
      setScenarioMessage('Cenário ativado: Fator R ajustado para ~15% (Anexo V). Folha reduzida para demonstrar alíquota superior.');
    } else if (type === 'RESET') {
      db.resetToDemo();
      setScenarioMessage('Banco de dados restaurado para os dados originais de demonstração.');
    }
    onRefreshData();
    setTimeout(() => setScenarioMessage(null), 6000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-teal-600" />
            Configurações e Parâmetros Tributários
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dados cadastrais, parametrização do Simples e Carnê-Leão, contas bancárias e auditoria
          </p>
        </div>

        <button
          onClick={() => handleRunScenario('RESET')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Dados Padrão (Demo)</span>
        </button>
      </div>

      {/* Scenario Alert */}
      {scenarioMessage && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{scenarioMessage}</span>
        </div>
      )}

      {/* ================= TEST SCENARIO RUNNER (SECTION 18) ================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl border border-indigo-900/50 shadow-md">
        <div className="flex items-center gap-2 font-bold text-sm text-indigo-200 mb-1">
          <Play className="w-4 h-4 text-indigo-400" />
          <span>Bateria de Testes Rápidos dos Cenários Obrigatórios (Seção 18)</span>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Alterne instantaneamente o banco de dados para validar os cenários mandatórios solicitados na especificação técnica:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => handleRunScenario('FATOR_R_III')}
            className="p-3 bg-white/10 hover:bg-white/15 border border-emerald-400/30 rounded-xl text-left transition-all cursor-pointer"
          >
            <div className="font-bold text-xs text-emerald-300">
              Cenário 1: Fator R &ge; 28% (Anexo III)
            </div>
            <div className="text-[11px] text-slate-300 mt-1">
              Simula Folha/Pró-labore em R$ 84.000 / RBT12 R$ 280.000 (30%). Alíquota inicial de ~6%.
            </div>
          </button>

          <button
            onClick={() => handleRunScenario('FATOR_R_V')}
            className="p-3 bg-white/10 hover:bg-white/15 border border-amber-400/30 rounded-xl text-left transition-all cursor-pointer"
          >
            <div className="font-bold text-xs text-amber-300">
              Cenário 2: Fator R &lt; 28% (Anexo V)
            </div>
            <div className="text-[11px] text-slate-300 mt-1">
              Simula Folha/Pró-labore em R$ 42.000 / RBT12 R$ 280.000 (15%). Alíquota de ~15,5%.
            </div>
          </button>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile and Professional Details */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200 flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600" />
            Dados do Cirurgião-Dentista & Clínica
          </h3>

          <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 p-2"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Número do CRO</label>
                <input
                  type="text"
                  value={cro}
                  onChange={(e) => setCro(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">UF do CRO</label>
                <input
                  type="text"
                  value={croUf}
                  onChange={(e) => setCroUf(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 uppercase"
                  maxLength={2}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">CPF (Pessoa Física)</label>
                <input
                  type="text"
                  value={formatCpf(professional.cpf, maskCpf)}
                  disabled
                  className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-slate-100 font-mono text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">CNPJ da Clínica (PJ)</label>
                <input
                  type="text"
                  value={professional.cnpj ? formatCnpj(professional.cnpj) : 'Não informado'}
                  disabled
                  className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-slate-100 font-mono text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-3">
              <span className="font-bold text-slate-900 block">Deduções Oficiais do Carnê-Leão:</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Número de Dependentes</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={dependentes}
                    onChange={(e) => setDependentes(parseInt(e.target.value, 10) || 0)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Abate {formatCurrency(dependentes * 189.59)} na base
                  </span>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 mb-1">INSS Oficial Recolhido (R$)</label>
                  <input
                    type="number"
                    step="50"
                    min="0"
                    value={inss}
                    onChange={(e) => setInss(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Previdência oficial dedutível
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-3">
              <span className="font-bold text-slate-900 block">Bases Acumuladas do Simples Nacional:</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">RBT12 Acumulado (R$)</label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={rbt12}
                    onChange={(e) => setRbt12(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-600 mb-1">FS12 Folha Acumulada (R$)</label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={folha12}
                    onChange={(e) => setFolha12(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Salvar Parâmetros
              </button>
            </div>
          </form>
        </div>

        {/* Bank Accounts and Patrimonial Separation (Princípio da Entidade) */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-600" />
              Contas Bancárias & Separação Patrimonial
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              O sistema reforça o <strong>Princípio Contábil da Entidade</strong>, mantendo as contas correntes de Pessoa Física e Pessoa Jurídica rigidamente segregadas para evitar confusão patrimonial perante a Receita Federal.
            </p>

            <div className="space-y-2">
              {bankAccounts.map((b) => (
                <div
                  key={b.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{b.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Agência: {b.agency} | Conta: {b.accountNumber}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      b.accountType === 'CORRENTE_PF'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {b.accountType === 'CORRENTE_PF' ? 'Conta PF' : 'Conta PJ'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Logs */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              Registro de Auditoria do Sistema
            </h3>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-[11px]">
              {auditLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="py-2 space-y-0.5">
                  <div className="flex justify-between font-mono text-slate-400">
                    <span>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                    <span className="font-bold text-slate-700">{log.action}</span>
                  </div>
                  <div className="text-slate-600">{log.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
