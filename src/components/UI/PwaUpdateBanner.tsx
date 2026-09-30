import React, { useEffect, useState } from 'react';
import { applyUpdate, isUpdateReady, subscribePwa } from '../../lib/pwa';

/** Aviso discreto de nova versão. O usuário decide quando atualizar (evita perder formulário aberto). */
export const PwaUpdateBanner: React.FC = () => {
  const [ready, setReady] = useState(isUpdateReady());
  useEffect(() => subscribePwa(() => setReady(isUpdateReady())), []);
  if (!ready) return null;
  return (
    <div className="fixed left-3 right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:max-w-sm z-[99998] bg-slate-900 text-white rounded-2xl shadow-2xl p-3 flex items-center gap-3">
      <span className="text-xs font-semibold flex-1">Nova versão do Dental Finance disponível.</span>
      <button type="button" onClick={applyUpdate} className="min-h-[40px] px-4 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer">
        Atualizar
      </button>
    </div>
  );
};
