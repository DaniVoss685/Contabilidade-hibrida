import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, BellOff, Smartphone, Download, ExternalLink, Share, PlusSquare, X } from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import { PUSH_STATE_COPY, readPushEnvironment, type PushCapabilityState } from '../../lib/pushCapability';
import { canPromptInstall, promptInstall, subscribePwa, isInstalledStandalone } from '../../lib/pwa';

interface Props {
  tenantId: string;
  userId?: string;
  /** Versão compacta para o dropdown do sino. */
  compact?: boolean;
}

/** Guia curto de instalação no iPhone/iPad (não existe API de instalação no iOS). */
export const InstallGuideSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[100001] flex items-end sm:items-center justify-center bg-slate-950/50 p-0 sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Instale o Dental Finance"
      onClick={(e) => e.stopPropagation()}
      className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Instale o Dental Finance</h3>
          <p className="text-xs text-slate-500 mt-0.5">No iPhone, as notificações só funcionam no app instalado.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="tap-target -mr-2 -mt-1 text-slate-400 rounded-xl hover:bg-slate-100 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <ol className="mt-4 space-y-3 text-sm text-slate-700">
        <li className="flex gap-3"><Share className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /><span>1. Toque em <strong>Compartilhar</strong> (na barra do Safari).</span></li>
        <li className="flex gap-3"><PlusSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /><span>2. Escolha <strong>Adicionar à Tela de Início</strong>.</span></li>
        <li className="flex gap-3"><Smartphone className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /><span>3. Abra o Dental Finance pelo <strong>novo ícone</strong>.</span></li>
        <li className="flex gap-3"><BellRing className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /><span>4. Dentro do app, toque em <strong>Ativar notificações</strong>.</span></li>
      </ol>
      <button type="button" onClick={onClose} className="mt-5 w-full min-h-[44px] rounded-xl bg-emerald-600 text-white font-bold text-sm cursor-pointer">
        Entendi
      </button>
    </div>
  </div>
);

export const PushNotificationsPanel: React.FC<Props> = ({ tenantId, userId, compact = false }) => {
  const [state, setState] = useState<PushCapabilityState>('READY_TO_REQUEST');
  const [showGuide, setShowGuide] = useState(false);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    setState(await notificationService.getPushState());
  }, []);

  useEffect(() => {
    refresh(); // só LÊ o estado; nenhum prompt automático
    return subscribePwa(() => force((n) => n + 1));
  }, [refresh]);

  const enable = async () => {
    setState('SUBSCRIBING');
    const next = await notificationService.enablePush(tenantId, userId);
    setState(next);
    if (next === 'SUBSCRIBED') notificationService.playNotificationSound();
  };
  const disable = async () => {
    await notificationService.disablePush(tenantId);
    await refresh();
  };

  const copy = PUSH_STATE_COPY[state];
  const env = readPushEnvironment();
  const showInstall = canPromptInstall() && !isInstalledStandalone();
  const btn = 'px-3 min-h-[36px] text-[11px] font-bold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 shrink-0';

  return (
    <div className={`${compact ? 'p-3' : 'p-4 rounded-2xl border border-slate-200 bg-white'} bg-emerald-50/80 border-b border-emerald-100`}>
      <div className="flex items-start gap-2.5">
        {state === 'SUBSCRIBED' ? <BellRing className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> : state === 'DENIED' ? <BellOff className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" /> : <Smartphone className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-emerald-950 font-semibold leading-snug">{copy.title}</p>
          {copy.hint && <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{copy.hint}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {state === 'IOS_NEEDS_INSTALL' && (
              <button type="button" className={`${btn} bg-emerald-600 text-white`} onClick={() => setShowGuide(true)}>Como instalar</button>
            )}
            {state === 'READY_TO_REQUEST' && (
              <button type="button" className={`${btn} bg-emerald-600 text-white`} onClick={enable}>Ativar notificações</button>
            )}
            {state === 'SUBSCRIPTION_ERROR' && (
              <button type="button" className={`${btn} bg-emerald-600 text-white`} onClick={enable}>Tentar novamente</button>
            )}
            {state === 'SUBSCRIBING' && <span className="text-[11px] text-slate-500">Aguardando permissão...</span>}
            {state === 'SUBSCRIBED' && (
              <button type="button" className={`${btn} bg-white border border-slate-200 text-slate-700`} onClick={disable}>Desativar</button>
            )}
            {state === 'EMBEDDED_CONTEXT' && (
              <button type="button" className={`${btn} bg-emerald-600 text-white inline-flex items-center gap-1`} onClick={() => window.open(window.location.href, '_blank', 'noopener')}>
                <ExternalLink className="w-3 h-3" /> Abrir em nova aba
              </button>
            )}
            {showInstall && (
              <button type="button" className={`${btn} bg-white border border-emerald-200 text-emerald-800 inline-flex items-center gap-1`} onClick={() => promptInstall()}>
                <Download className="w-3 h-3" /> Instalar aplicativo
              </button>
            )}
            {env.isIOS && env.isStandalone === false && state !== 'IOS_NEEDS_INSTALL' && (
              <button type="button" className={`${btn} bg-white border border-emerald-200 text-emerald-800`} onClick={() => setShowGuide(true)}>Como instalar</button>
            )}
          </div>
        </div>
      </div>
      {showGuide && <InstallGuideSheet onClose={() => setShowGuide(false)} />}
    </div>
  );
};
