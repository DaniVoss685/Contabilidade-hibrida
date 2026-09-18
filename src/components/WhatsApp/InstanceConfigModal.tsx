import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ShieldCheck,
  QrCode,
  Sparkles,
  MessageSquareText,
  Users,
} from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { formatPhoneDisplay } from '../../lib/phoneUtils';
import { WhatsAppMessageTemplatesTab } from './WhatsAppMessageTemplatesTab';

interface InstanceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export const InstanceConfigModal: React.FC<InstanceConfigModalProps> = ({
  isOpen,
  onClose,
  tenantId,
}) => {
  const cleanTenantId = DentalWhatsAppService.sanitizeTenantId(tenantId);
  const [activeTab, setActiveTab] = useState<'connection' | 'templates'>('connection');

  const [status, setStatus] = useState<
    'connected' | 'disconnected' | 'connecting' | 'qrcode' | 'not_configured'
  >('disconnected');
  const [instanceName, setInstanceName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('connection');
    }
  }, [isOpen]);

  // Iniciar fluxo de conexão / gerar QR Code
  const handleConnect = async (showActionLoading = true) => {
    if (showActionLoading) setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await DentalWhatsAppService.createInstance(cleanTenantId);
      if (!res.success) {
        throw new Error(res.error || 'Falha ao iniciar conexão');
      }

      if (res.status === 'connected') {
        setStatus('connected');
        setPhoneNumber(res.phone_number || null);
        setProfileName(res.profile_name || null);
        setQrCode(null);
      } else {
        setStatus((res.status as any) || 'qrcode');
        if (res.qrcode) {
          setQrCode(res.qrcode);
        }
      }
      if (res.instance_name) {
        setInstanceName(res.instance_name);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao conectar. Tente novamente em instantes.');
    } finally {
      if (showActionLoading) setActionLoading(false);
    }
  };

  // Carregar status da conexão ao abrir
  const loadStatus = async (showLoading = true) => {
    if (!cleanTenantId) return;
    if (showLoading) setLoading(true);
    setErrorMessage(null);

    try {
      const res = await DentalWhatsAppService.getInstanceStatus(cleanTenantId);
      if (res.exists) {
        setInstanceName(res.instance_name || '');
        setPhoneNumber(res.phone_number || null);
        setProfileName(res.profile_name || null);

        if (res.status === 'connected') {
          setStatus('connected');
          setQrCode(null);
        } else {
          // Instância aguardando conexão (qrcode, connecting ou disconnected):
          // Seta status qrcode e se houver QR prévio em cache exibe imediatamente
          setStatus('qrcode');
          if (res.qrcode) {
            setQrCode(res.qrcode);
          }
          // Obtém automaticamente QR Code novo e válido da Evolution API
          // sem obrigar o usuário a clicar em 'Atualizar QR Code'
          await handleConnect(false);
        }
      } else {
        setStatus('not_configured');
        setQrCode(null);
      }
    } catch (err: any) {
      console.warn('[InstanceConfigModal] Erro ao carregar status:', err);
      setErrorMessage(err?.message || 'Não foi possível consultar o status da conexão.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus(true);
    } else {
      setJustConnected(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [isOpen, cleanTenantId]);

  // Polling automático suave quando aguardando leitura do QR Code
  useEffect(() => {
    if (isOpen && (status === 'qrcode' || status === 'connecting')) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await DentalWhatsAppService.getInstanceStatus(cleanTenantId);
          if (res.status === 'connected') {
            setStatus('connected');
            setPhoneNumber(res.phone_number || null);
            setProfileName(res.profile_name || null);
            setQrCode(null);
            setJustConnected(true);
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          } else if (res.qrcode && res.qrcode !== qrCode) {
            setQrCode(res.qrcode);
          }
        } catch (_e) {
          // Silencioso no polling
        }
      }, 4000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [isOpen, status, cleanTenantId, qrCode]);

  // Desconectar o WhatsApp
  const handleDisconnect = async () => {
    const confirm = window.confirm(
      'Tem certeza que deseja desconectar o WhatsApp desta clínica? O envio e recebimento de mensagens serão suspensos até uma nova conexão.'
    );
    if (!confirm) return;

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await DentalWhatsAppService.disconnectInstance(cleanTenantId);
      if (!res.success) {
        throw new Error(res.error || 'Erro ao desconectar');
      }
      setStatus('disconnected');
      setQrCode(null);
      setPhoneNumber(null);
      setProfileName(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao desconectar.');
    } finally {
      setActionLoading(false);
    }
  };

  // Sincronizar nomes e fotos da agenda do WhatsApp
  const handleSyncContacts = async () => {
    setSyncLoading(true);
    setSyncFeedback(null);

    try {
      const res = await DentalWhatsAppService.syncContactsNames(cleanTenantId);
      if (!res.success) {
        throw new Error(res.error || 'Falha ao sincronizar agenda');
      }

      const updated = res.updatedCount || 0;
      if (updated > 0) {
        setSyncFeedback({
          type: 'success',
          message: `${updated} contato(s) atualizados com nomes e fotos da agenda do WhatsApp!`,
        });
      } else {
        setSyncFeedback({
          type: 'success',
          message: 'Todos os contatos da clínica já estão sincronizados com nomes identificados.',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Erro ao sincronizar contatos.',
      });
    } finally {
      setSyncLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] transition-all duration-200 ${
          activeTab === 'templates' ? 'max-w-3xl' : 'max-w-md'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Configurações do WhatsApp</h2>
              <p className="text-[11px] text-slate-400">Canal de comunicação e mensagens da clínica</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50/70 px-6 gap-2 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'connection'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Conexão WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'templates'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            Mensagens Automáticas
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {activeTab === 'templates' ? (
            <WhatsAppMessageTemplatesTab tenantId={cleanTenantId} />
          ) : (
            <>
              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mb-3" />
              <p className="text-xs text-slate-500 font-medium">Verificando status do WhatsApp...</p>
            </div>
          ) : status === 'connected' ? (
            justConnected ? (
              /* NOVA EXPERIÊNCIA DE SUCESSO SIMPLES (IMEDIATAMENTE APÓS PAREAMENTO) */
              <div className="space-y-6 text-center py-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-lg font-black text-slate-900">
                    WhatsApp conectado com sucesso!
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    O WhatsApp da clínica já está conectado e pronto para receber atendimentos.
                  </p>
                </div>

                {phoneNumber && (
                  <div className="inline-flex flex-col items-center px-4 py-2.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
                    <span className="text-[11px] text-slate-400 font-medium">Número conectado:</span>
                    <span className="text-sm font-bold text-slate-800 font-mono mt-0.5">
                      {formatPhoneDisplay(phoneNumber)}
                    </span>
                    {profileName && (
                      <span className="text-xs text-emerald-700 font-semibold mt-0.5">
                        {profileName}
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={onClose}
                    className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Fechar</span>
                  </button>
                </div>
              </div>
            ) : (
              /* TELA DE GERENCIAMENTO (ABERTA POSTERIORMENTE PELO ÍCONE DE CONFIGURAÇÕES) */
              <div className="space-y-5 text-center">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
                  <Smartphone className="w-8 h-8" />
                </div>

                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    WhatsApp Conectado
                  </span>
                  <h3 className="text-base font-black text-slate-900">
                    {profileName || 'Atendimento da Clínica'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {phoneNumber ? formatPhoneDisplay(phoneNumber) : 'Número conectado'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Conectado e Operacional
                    </span>
                  </div>
                  {phoneNumber && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Número:</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {formatPhoneDisplay(phoneNumber)}
                      </span>
                    </div>
                  )}
                  {profileName && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Perfil:</span>
                      <span className="font-semibold text-slate-700">{profileName}</span>
                    </div>
                  )}
                </div>

                {/* Sincronização de Agenda com a Evolution API */}
                <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-100 text-left space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs">
                      <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Agenda do WhatsApp</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSyncContacts}
                      disabled={syncLoading || actionLoading}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncLoading ? 'animate-spin' : ''}`} />
                      <span>{syncLoading ? 'Sincronizando...' : 'Sincronizar Nomes'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Importa os nomes e fotos salvos na agenda do telefone para identificar números que aparecem sem nome.
                  </p>
                  {syncFeedback && (
                    <div
                      className={`p-2.5 rounded-xl text-xs flex items-start gap-2 animate-in fade-in duration-200 ${
                        syncFeedback.type === 'success'
                          ? 'bg-emerald-100/90 text-emerald-900'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {syncFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                      )}
                      <span className="leading-tight font-medium">{syncFeedback.message}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                  <button
                    onClick={() => handleConnect(true)}
                    disabled={actionLoading}
                    className="w-full sm:flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                    <span>Reconectar</span>
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                    className="w-full sm:flex-1 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desconectar</span>
                  </button>
                </div>
              </div>
            )
          ) : status === 'qrcode' || status === 'connecting' ? (
            /* ESTADO QR CODE */
            <div className="space-y-4 text-center">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 mb-1">
                  <QrCode className="w-3.5 h-3.5" />
                  Aguardando Leitura
                </span>
                <h3 className="text-sm font-bold text-slate-900">Escaneie o QR Code no seu celular</h3>
              </div>

              {/* QR Code Container */}
              <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-emerald-300 shadow-inner flex items-center justify-center min-h-[220px]">
                {qrCode ? (
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    className="w-56 h-56 object-contain rounded-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mb-2" />
                    <p className="text-xs text-slate-400">Carregando QR Code...</p>
                  </div>
                )}
              </div>

              {/* Instruções */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-left text-xs space-y-1.5 text-slate-600">
                <p className="font-semibold text-slate-800 mb-1">Como conectar:</p>
                <p className="flex items-start gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <span>Abra o <strong>WhatsApp</strong> no celular da clínica.</span>
                </p>
                <p className="flex items-start gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <span>Toque em <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar um aparelho</strong>.</span>
                </p>
                <p className="flex items-start gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <span>Aponte a câmera para o QR Code acima.</span>
                </p>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={handleConnect}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar QR Code</span>
                </button>
                <button
                  onClick={() => loadStatus(true)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Verificar Status
                </button>
              </div>
            </div>
          ) : (
            /* ESTADO DESCONECTADO / NÃO CONFIGURADO */
            <div className="space-y-5 text-center py-2">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
                <Sparkles className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Conectar WhatsApp da Clínica
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
                  Conecte o número de atendimento da sua clínica para centralizar mensagens, enviar lembretes e atender seus pacientes diretamente pelo Dental Finance.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Provisionamento 100% automático e isolado</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Histórico seguro e criptografado da clínica</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Sincronização em tempo real entre recepcionistas e dentistas</span>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={actionLoading}
                className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-bold rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Preparando Conexão Segura...</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4" />
                    <span>Conectar WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
