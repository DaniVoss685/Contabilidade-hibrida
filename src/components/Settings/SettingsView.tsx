import React, { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Building,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  History,
  Shield,
  Bell,
  Eye,
  EyeOff,
  Scale,
  Calendar,
  Clock,
  Stethoscope,
  Info,
} from 'lucide-react';
import {
  Professional,
  Organization,
  BankAccount,
  PayrollHistoryEntry,
  AuditLog,
  SystemPreferences,
} from '../../types';
import {
  formatCurrency,
} from '../../lib/masks';
import { db } from '../../lib/db';
import { useToast, CurrencyInput, ConfirmDialog, Switch } from '../UI';

interface SettingsViewProps {
  professional: Professional;
  organization: Organization;
  bankAccounts: BankAccount[];
  payrollHistory: PayrollHistoryEntry[];
  auditLogs: AuditLog[];
  maskCpf?: boolean;
  onRefreshData: () => void;
  onNavigateTab?: (tab: any) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  professional,
  organization,
  auditLogs,
  onRefreshData,
}) => {
  const toast = useToast();

  // 1. Dados Profissionais & Clínica (Estritamente os 5 campos aprovados na Rodada 12)
  const [name, setName] = useState(professional.name || '');
  const [nomeClinica, setNomeClinica] = useState(
    professional.nomeFantasia || professional.razaoSocial || organization.name || ''
  );
  const [cro, setCro] = useState(professional.cro || '');
  const [croUf, setCroUf] = useState(professional.croUf || 'SP');
  const [especialidade, setEspecialidade] = useState(
    professional.especialidade || 'Cirurgião-Dentista / Clínica Geral'
  );

  // 2. Deduções do Carnê-Leão (PF) — Totalmente segregadas da PJ
  const [dependentes, setDependentes] = useState(professional.numDependentes || 0);
  const [inss, setInss] = useState(professional.inssProprioMensal || 0);

  // 3. Preferências & Privacidade com Switches
  const [preferences, setPreferences] = useState<SystemPreferences>(() => db.getPreferences());

  // Mensagem de feedback temporária
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  // Modal de confirmação para Reset Demo
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Atualizar preferências se db mudar externamente
  useEffect(() => {
    setPreferences(db.getPreferences());
  }, [professional]);

  // Handler para atualizar qualquer preferência (Switch ou campos)
  const handleUpdatePreferences = async (partial: Partial<SystemPreferences>) => {
    const updated = await db.updatePreferencesAsync(partial);
    setPreferences(updated);
    toast.success('Preferência do sistema atualizada.');
    onRefreshData();
  };

  const handleTogglePreference = (key: keyof SystemPreferences, value: boolean) => {
    handleUpdatePreferences({ [key]: value });
  };

  // Salvar formulário (apenas os 5 campos profissionais + deduções PF)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSavingProfile(true);
    const res = await db.updateProfessionalAsync({
      name: name.trim(),
      cro: cro.trim(),
      croUf: croUf.trim().toUpperCase(),
      especialidade: especialidade.trim(),
      nomeFantasia: nomeClinica.trim(),
      razaoSocial: nomeClinica.trim(),
      numDependentes: dependentes,
      inssProprioMensal: inss,
    });
    setIsSavingProfile(false);

    if (!res.success) {
      toast.error('Não foi possível salvar. Tente novamente.');
      return;
    }

    toast.success('Dados profissionais e configurações salvos com sucesso!');
    onRefreshData();
  };

  const handleRunResetDemo = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Restaurar Dados de Demonstração',
      message:
        'Deseja realmente restaurar todos os cadastros e parâmetros para os dados padrão de demonstração? Modificações recentes serão sobrescritas.',
      onConfirm: () => {
        db.resetToDemo();
        const p = db.getProfessional();
        setName(p.name);
        setNomeClinica(p.nomeFantasia || p.razaoSocial || '');
        setCro(p.cro);
        setCroUf(p.croUf);
        setEspecialidade(p.especialidade || 'Cirurgião-Dentista / Clínica Geral');
        setInss(p.inssProprioMensal);
        setDependentes(p.numDependentes);
        setPreferences(db.getPreferences());
        setScenarioMessage('Banco de dados e parâmetros restaurados para os valores padrão de demonstração.');
        toast.info('Dados restaurados com sucesso.');
        onRefreshData();
        setTimeout(() => setScenarioMessage(null), 6000);
      },
    });
  };

  // Parâmetro legal de 2026 oficial
  const officialMinWage2026 = db.getOfficialMinimumWage(2026);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            Configurações & Identidade Profissional
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dados cadastrais essenciais do cirurgião-dentista, perfil da clínica e preferências do sistema
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunResetDemo}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition-colors cursor-pointer shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Padrão (Demo)</span>
        </button>
      </div>

      {/* Scenario Alert */}
      {scenarioMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 font-semibold flex items-center gap-3 animate-in fade-in shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="flex-1">{scenarioMessage}</span>
        </div>
      )}

      {/* Main Settings Form & Grid */}
      <form onSubmit={handleSaveProfile} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Dados Profissionais (5 campos) + Regime Somente Leitura + Deduções PF (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section: Dados Profissionais & Clínica (Estritamente 5 campos) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                Dados Profissionais & Clínica
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">Identificação Operacional</span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Campo 1: Nome do Cirurgião-Dentista */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nome do Cirurgião-Dentista *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr(a). Nome Completo"
                  className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium shadow-2xs"
                  required
                />
              </div>

              {/* Campo 2: Nome da Clínica */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Nome da Clínica *
                </label>
                <input
                  type="text"
                  value={nomeClinica}
                  onChange={(e) => setNomeClinica(e.target.value)}
                  placeholder="ex: Clínica Odonto Prime"
                  className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium shadow-2xs"
                  required
                />
              </div>

              {/* Campos 3 e 4: CRO e UF do CRO */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1.5">Número do CRO *</label>
                  <input
                    type="text"
                    value={cro}
                    onChange={(e) => setCro(e.target.value)}
                    placeholder="ex: 123456"
                    className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium shadow-2xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">UF do CRO *</label>
                  <input
                    type="text"
                    value={croUf}
                    onChange={(e) => setCroUf(e.target.value.toUpperCase())}
                    placeholder="SP"
                    maxLength={2}
                    className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 uppercase font-mono text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium shadow-2xs"
                    required
                  />
                </div>
              </div>

              {/* Campo 5: Especialidade Principal */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Especialidade Principal</label>
                <div className="relative">
                  <Stethoscope className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={especialidade}
                    onChange={(e) => setEspecialidade(e.target.value)}
                    placeholder="ex: Ortodontia, Implantodontia, Clínica Geral"
                    className="w-full text-xs rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium shadow-2xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Regime Tributário & Enquadramento (SEM SELECTS - SOMENTE LEITURA) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-emerald-600" />
                Regime Tributário & Enquadramento PJ
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                100% Automático
              </span>
            </div>

            <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60">
                <span className="font-semibold text-slate-600">Regime Tributário:</span>
                <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                  Simples Nacional (Atividades Odontológicas)
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60">
                <span className="font-semibold text-slate-600">Metodologia de Enquadramento:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                  Calculado automaticamente pelo Fator R
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                  <span className="block text-[11px] font-bold text-emerald-800">Fator R ≥ 28%</span>
                  <span className="text-[10px] text-slate-600">Enquadramento no <strong>Anexo III</strong> (Alíquota a partir de 6,0%)</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                  <span className="block text-[11px] font-bold text-amber-800">Fator R &lt; 28%</span>
                  <span className="text-[10px] text-slate-600">Enquadramento no <strong>Anexo V</strong> (Alíquota a partir de 15,5%)</span>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  O Dental Finance apura o Fator R dinamicamente a cada mês com base na folha de salários e na receita bruta acumulada. Não é necessário selecionar anexos manualmente.
                </span>
              </div>
            </div>
          </div>

          {/* Section: Deduções Fixas do Carnê-Leão (Pessoa Física - Segregação Rigorosa) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                Deduções do Carnê-Leão (Pessoa Física)
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">IRPF Mensal</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Número de Dependentes Legais</label>
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={dependentes}
                  onChange={(e) => setDependentes(parseInt(e.target.value, 10) || 0)}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium shadow-2xs"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Abatimento legal de {formatCurrency(dependentes * 189.59)} na base de cálculo mensal
                </span>
              </div>

              <div>
                <CurrencyInput
                  label="INSS Próprio Mensal (Dedutível)"
                  value={inss}
                  onChange={setInss}
                  placeholder="R$ 0,00"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Previdência oficial recolhida na PF dedutível do imposto de renda
                </span>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div>
            <button
              type="submit"
              disabled={isSavingProfile}
              className={`w-full py-3 px-4 ${
                isSavingProfile
                  ? 'bg-emerald-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
              } text-white font-bold text-sm rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2`}
            >
              <CheckCircle className={`w-4 h-4 ${isSavingProfile ? 'animate-spin' : ''}`} />
              <span>{isSavingProfile ? 'Salvando dados no banco...' : 'Salvar Dados Profissionais & Fiscais'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Preferências com Switches + Parâmetros Legais + Auditoria (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Preferências do Sistema & Privacidade (SWITCHES) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                Preferências & Privacidade
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                Switches Ativos
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Switch 1: Alerta Fator R */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="space-y-0.5 pr-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-amber-500" />
                    Alerta Visual de Fator R Crítico
                  </span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Notificar proativamente quando a relação Folha ÷ Receita estiver abaixo do piso legal de 28%
                  </p>
                </div>
                <Switch
                  checked={preferences.alertFatorR}
                  onChange={(val) => handleTogglePreference('alertFatorR', val)}
                  ariaLabel="Alerta de Fator R Crítico"
                />
              </div>

              {/* Switch 3: Vencimento de Guias */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="space-y-0.5 pr-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-rose-500" />
                    Avisos de Vencimento de Guias
                  </span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Destacar guias do DAS (dia 20) e Carnê-Leão (último dia útil) próximas do vencimento
                  </p>
                </div>
                <Switch
                  checked={preferences.alertDueDates}
                  onChange={(val) => handleTogglePreference('alertDueDates', val)}
                  ariaLabel="Avisos de Vencimento de Guias Fiscais"
                />
              </div>

              {/* Switch 4: Lembretes Operacionais */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="space-y-0.5 pr-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Lembretes Contábeis & Conciliação
                  </span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Exibir lembretes operacionais para conciliação do Livro Caixa e fechamento da competência
                  </p>
                </div>
                <Switch
                  checked={preferences.operationalReminders}
                  onChange={(val) => handleTogglePreference('operationalReminders', val)}
                  ariaLabel="Lembretes Contábeis e Conciliação"
                />
              </div>

              {/* Switch 5: Horário de Almoço na Agenda */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 pr-2">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Horário de Almoço na Agenda
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Destacar o intervalo de almoço na agenda e exibir alerta ao tentar agendar consultas nesse período
                    </p>
                  </div>
                  <Switch
                    checked={preferences.lunchBreakEnabled === true}
                    onChange={(val) => {
                      if (val) {
                        handleUpdatePreferences({
                          lunchBreakEnabled: true,
                          lunchBreakStart: preferences.lunchBreakStart || undefined,
                          lunchBreakEnd: preferences.lunchBreakEnd || undefined,
                        });
                      } else {
                        handleUpdatePreferences({ lunchBreakEnabled: false });
                      }
                    }}
                    ariaLabel="Horário de Almoço na Agenda"
                  />
                </div>

                {preferences.lunchBreakEnabled === true && (
                  <div className="pt-2.5 border-t border-slate-200/70 grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Início do Almoço
                      </label>
                      <input
                        type="time"
                        value={preferences.lunchBreakStart || ''}
                        placeholder="--:--"
                        onChange={(e) => {
                          const newStart = e.target.value;
                          if (preferences.lunchBreakEnd && newStart && newStart >= preferences.lunchBreakEnd) {
                            toast.warning('O horário de início deve ser anterior ao término.');
                            return;
                          }
                          handleUpdatePreferences({ lunchBreakStart: newStart || undefined });
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Fim do Almoço
                      </label>
                      <input
                        type="time"
                        value={preferences.lunchBreakEnd || ''}
                        placeholder="--:--"
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          if (preferences.lunchBreakStart && newEnd && newEnd <= preferences.lunchBreakStart) {
                            toast.warning('O horário de término deve ser posterior ao início.');
                            return;
                          }
                          handleUpdatePreferences({ lunchBreakEnd: newEnd || undefined });
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 bg-white text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Parâmetros Legais Versionados (Governança Oficial) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3.5">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                Parâmetros Legais Oficiais
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Governança 2026
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Salário Mínimo Vigente (2026)</span>
                <span className="text-xs font-black text-slate-900 font-mono">
                  {formatCurrency(officialMinWage2026)}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Base oficial fixada pelo <strong>Decreto Federal nº 12.797/2025</strong> com vigência a partir de 01/01/2026.
              </p>
              <div className="pt-1 text-[10px] text-slate-400 border-t border-slate-200/60 flex items-center justify-between">
                <span>Piso Previdenciário / Pró-labore</span>
                <span className="text-emerald-700 font-bold">1 SM = {formatCurrency(officialMinWage2026)}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              O Dental Finance adota parâmetros legais auditados e versionados, sem projeções inflacionárias fictícias, garantindo estrita conformidade legal.
            </p>
          </div>

          {/* Card 3: Trilha de Auditoria */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" />
              Trilha de Auditoria do Sistema
            </h3>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-[11px] pr-1">
              {auditLogs && auditLogs.length > 0 ? (
                auditLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="py-2 space-y-0.5">
                    <div className="flex justify-between font-mono text-slate-400">
                      <span>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                      <span className="font-bold text-slate-700">{log.action}</span>
                    </div>
                    <div className="text-slate-600">{log.details}</div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-slate-400 text-xs">
                  Nenhum registro de auditoria no período.
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant="warning"
        confirmLabel="Restaurar"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
