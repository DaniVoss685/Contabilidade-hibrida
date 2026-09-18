import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Mail,
  Phone,
  Users,
  CheckCircle2,
  Server,
  Key,
  Lock,
  Save,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Wifi,
} from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { db } from '../../lib/db';

export const ConsultingSettingsView: React.FC = () => {
  const currentSession = db.getCurrentSession();
  const currentTenantId =
    currentSession?.supportSession?.targetTenantId ||
    currentSession?.user?.orgId ||
    'clinic_1789153962617_gpw1';

  // Estados da Configuração Global da Evolution API
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    loadGlobalConfig();
  }, [currentTenantId]);

  const loadGlobalConfig = async () => {
    setLoadingConfig(true);
    setFeedback(null);
    try {
      const config = await DentalWhatsAppService.getGlobalConfig(currentTenantId);
      if (config) {
        setApiUrl(config.api_url || '');
        setHasApiKey(Boolean(config.has_api_key));
        setLastUpdated(config.updated_at || null);
      }
    } catch (err: any) {
      console.warn('[ConsultingSettingsView] Erro ao carregar config global:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleTestGlobalConfig = async () => {
    if (!apiUrl.trim()) {
      setFeedback({ type: 'error', message: 'Informe a URL da Evolution API para testar a conexão.' });
      return;
    }

    if (!hasApiKey && !apiKey.trim()) {
      setFeedback({ type: 'error', message: 'Informe a API Key Global para testar a conexão.' });
      return;
    }

    setTestingConfig(true);
    setFeedback(null);

    try {
      const res = await DentalWhatsAppService.testGlobalConfig({
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Conexão com a Evolution API realizada com sucesso!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Falha ao conectar com a Evolution API.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao testar conexão com a Evolution API.',
      });
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveGlobalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiUrl.trim()) {
      setFeedback({ type: 'error', message: 'A URL da Evolution API é obrigatória.' });
      return;
    }

    if (!hasApiKey && !apiKey.trim()) {
      setFeedback({
        type: 'error',
        message: 'A Global API Key é obrigatória para a primeira configuração.',
      });
      return;
    }

    setSavingConfig(true);
    setFeedback(null);

    try {
      const res = await DentalWhatsAppService.saveGlobalConfig({
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        tenantId: currentTenantId,
      });

      if (!res.success) {
        throw new Error(res.error || 'Falha ao salvar configuração global.');
      }

      setFeedback({
        type: 'success',
        message: 'Configuração global da Evolution API salva com sucesso!',
      });
      setHasApiKey(true);
      setApiKey('');
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao salvar configuração global.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Configurações do Escritório de Consultoria
        </h2>
        <p className="text-xs text-slate-500">
          Parâmetros operacionais, infraestrutura e perfil de supervisão contábil do Escritório Contaju.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Perfil do Escritório */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Perfil da Assessoria Contábil
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Nome da Organização:</label>
              <input
                type="text"
                readOnly
                value="Escritório Contaju / Assessoria Contábil"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">E-mail de Notificações Fiscais:</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  readOnly
                  value="contato@contaju.com.br"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Telefone / WhatsApp Suporte:</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  readOnly
                  value="(11) 99999-8888"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Políticas Globais de Supervisão */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Parâmetros de Auditoria Automática
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <strong className="text-emerald-950 block">Gatilho do Fator R: 28,00%</strong>
                <span className="text-emerald-800">
                  Alerta disparado imediatamente quando o cliente projeta índice inferior a 28%.
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-slate-600 shrink-0" />
              <div>
                <strong className="text-slate-900 block">Sincronização Contábilex / Contaju</strong>
                <span className="text-slate-600">
                  Transmissão contínua de DRE, fluxo de caixa e fechamentos fiscais.
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
              <Users className="w-4 h-4 text-slate-600 shrink-0" />
              <div>
                <strong className="text-slate-900 block">Isolamento Multi-Tenant</strong>
                <span className="text-slate-600">
                  Dados de cada clínica cliente permanecem segregados e auditados em tempo real.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* INTEGRAÇÃO EVOLUTION API - GLOBAL DA PLATAFORMA */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Integração Evolution API (Global da Plataforma)
              </h3>
              <p className="text-xs text-slate-500">
                Servidor central de WhatsApp utilizado para provisionar instâncias de todas as clínicas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Lock className="w-3.5 h-3.5" />
              Cofre Server-Side Ativo
            </span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs mb-5 flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {loadingConfig ? (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mb-2" />
            <p className="text-xs text-slate-400">Carregando parâmetros globais...</p>
          </div>
        ) : (
          <form onSubmit={handleSaveGlobalConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* URL da API */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  URL da Evolution API:
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://sua-evolution-api.dominio.com"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Endereço base do cluster Evolution API compartilhado.
                </p>
              </div>

              {/* API Key Global */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>API Key Global da Evolution:</span>
                  {hasApiKey && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      API Key configurada e protegida
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasApiKey
                        ? '•••••••••••••••••••••••••••••••• (Inalterada)'
                        : 'Cole a API Key Global aqui'
                    }
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Armazenada exclusivamente no cofre <code>df_wa_global_secrets</code> do Supabase. O frontend nunca a recebe de volta.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                {lastUpdated ? (
                  <>Última atualização: {new Date(lastUpdated).toLocaleString('pt-BR')}</>
                ) : (
                  <>Configuração inicial pendente</>
                )}
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleTestGlobalConfig}
                  disabled={testingConfig || savingConfig}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingConfig ? 'animate-spin' : ''}`} />
                  <span>{testingConfig ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                <button
                  type="submit"
                  disabled={savingConfig || testingConfig}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingConfig ? 'Salvando...' : 'Salvar Configuração Global'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
