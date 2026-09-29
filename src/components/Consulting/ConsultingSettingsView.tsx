import React, { useState, useEffect, useRef } from 'react';
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
  PenTool,
  Upload,
  X,
} from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { AccountantSignatureService } from '../../services/accountantSignatureService';
import { db } from '../../lib/db';
import { maskCpfInput } from '../../lib/masks';

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

  // Estados da Assinatura do Contador (Declaração de Faturamento — clientes com Contábilex ativo)
  const canEditSignature = Boolean(currentSession?.user?.isPrimary || currentSession?.user?.role === 'SUPER_ADMIN');
  const [accountantName, setAccountantName] = useState('');
  const [crcRegistration, setCrcRegistration] = useState('');
  const [accountantCpf, setAccountantCpf] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureUpdatedAt, setSignatureUpdatedAt] = useState<string | null>(null);
  const [signatureUpdatedByName, setSignatureUpdatedByName] = useState<string | null>(null);
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureFeedback, setSignatureFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const signatureFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadGlobalConfig();
    loadSignatureConfig();
  }, [currentTenantId]);

  const loadSignatureConfig = async () => {
    setLoadingSignature(true);
    try {
      const { config, error } = await AccountantSignatureService.getConfig();
      setAccountantName(config.accountantName);
      setCrcRegistration(config.crcRegistration);
      setAccountantCpf(config.accountantCpf);
      setSignatureDataUrl(config.signatureImageDataUrl);
      setSignatureUpdatedAt(config.updatedAt);
      setSignatureUpdatedByName(config.updatedByName);
      if (error) console.warn('[ConsultingSettingsView] Erro ao carregar assinatura do contador:', error);
    } catch (err: any) {
      console.warn('[ConsultingSettingsView] Erro ao carregar assinatura do contador:', err);
    } finally {
      setLoadingSignature(false);
    }
  };

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setSignatureFeedback({ type: 'error', message: 'Envie a assinatura como imagem PNG ou JPG.' });
      return;
    }
    if (file.size > 500 * 1024) {
      setSignatureFeedback({ type: 'error', message: 'Imagem grande demais (máx. 500 KB) — recorte só a assinatura antes de enviar.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSignatureDataUrl(typeof reader.result === 'string' ? reader.result : null);
      setSignatureFeedback(null);
    };
    reader.onerror = () => setSignatureFeedback({ type: 'error', message: 'Não foi possível ler o arquivo da assinatura.' });
    reader.readAsDataURL(file);
  };

  const handleSaveSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountantName.trim() || !crcRegistration.trim() || !accountantCpf.trim() || !signatureDataUrl) {
      setSignatureFeedback({ type: 'error', message: 'Preencha nome, CRC, CPF e envie a imagem da assinatura antes de salvar.' });
      return;
    }
    setSavingSignature(true);
    setSignatureFeedback(null);
    try {
      const res = await AccountantSignatureService.saveConfig(
        { accountantName, crcRegistration, accountantCpf, signatureImageDataUrl: signatureDataUrl },
        { userId: currentSession?.user?.id, userName: currentSession?.user?.name }
      );
      if (!res.success) throw new Error(res.error || 'Falha ao salvar a assinatura do contador.');
      setSignatureFeedback({ type: 'success', message: 'Assinatura salva — vale para todas as clínicas com Contábilex ativo.' });
      setSignatureUpdatedAt(new Date().toISOString());
      setSignatureUpdatedByName(currentSession?.user?.name || null);
    } catch (err: any) {
      setSignatureFeedback({ type: 'error', message: err?.message || 'Erro ao salvar a assinatura do contador.' });
    } finally {
      setSavingSignature(false);
    }
  };

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

      {/* ASSINATURA DO CONTADOR — usada na Declaração de Faturamento (clientes com Contábilex ativo) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Assinatura do Contador (Declaração de Faturamento)
              </h3>
              <p className="text-xs text-slate-500">
                Usada quando o cliente (com integração Contábilex ativa) emite sozinho a declaração de faturamento
                para bancos — mesmo nome/CRC/CPF/imagem em uso hoje no Contábilex.
              </p>
            </div>
          </div>
        </div>

        {signatureFeedback && (
          <div
            className={`p-3.5 rounded-xl text-xs mb-5 flex items-start gap-2.5 ${
              signatureFeedback.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {signatureFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{signatureFeedback.message}</span>
          </div>
        )}

        {loadingSignature ? (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mb-2" />
            <p className="text-xs text-slate-400">Carregando assinatura do contador...</p>
          </div>
        ) : !canEditSignature ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Só a conta primária do escritório pode cadastrar ou alterar a assinatura do contador.
            {AccountantSignatureService.isComplete({
              accountantName,
              crcRegistration,
              accountantCpf,
              signatureImageDataUrl: signatureDataUrl,
              updatedAt: signatureUpdatedAt,
              updatedByName: signatureUpdatedByName,
            }) ? (
              <>
                {' '}Hoje configurada para <strong>{accountantName}</strong> ({crcRegistration}).
              </>
            ) : (
              ' Ainda não configurada.'
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveSignature} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Nome do Contador(a):</label>
                <input
                  type="text"
                  value={accountantName}
                  onChange={(e) => setAccountantName(e.target.value)}
                  placeholder="Ex.: Priscila Souza Lima"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">CRC / Registro:</label>
                <input
                  type="text"
                  value={crcRegistration}
                  onChange={(e) => setCrcRegistration(e.target.value)}
                  placeholder="Ex.: CRC/MG 121807/O"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">CPF do Contador(a):</label>
                <input
                  type="text"
                  value={accountantCpf}
                  onChange={(e) => setAccountantCpf(maskCpfInput(e.target.value))}
                  placeholder="000.000.000-00"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Prévia da assinatura:</label>
              <input
                ref={signatureFileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleSignatureFileChange}
              />
              {signatureDataUrl ? (
                <div className="inline-flex flex-col gap-2">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl inline-block">
                    <img src={signatureDataUrl} alt="Prévia da assinatura do contador" className="h-20 object-contain" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => signatureFileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Alterar Assinatura
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureDataUrl(null)}
                      className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => signatureFileInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 py-3 border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-xl text-xs font-bold text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Enviar imagem da assinatura (PNG ou JPG, fundo transparente/branco)
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                {signatureUpdatedAt ? (
                  <>
                    Última atualização: {new Date(signatureUpdatedAt).toLocaleString('pt-BR')}
                    {signatureUpdatedByName ? ` por ${signatureUpdatedByName}` : ''}
                  </>
                ) : (
                  <>Configuração inicial pendente</>
                )}
              </span>

              <button
                type="submit"
                disabled={savingSignature}
                className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSignature ? 'Salvando...' : 'Salvar para Todas as Clínicas'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
