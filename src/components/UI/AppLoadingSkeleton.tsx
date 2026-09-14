import React from 'react';
import { Activity, ShieldCheck } from 'lucide-react';

export const AppLoadingSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background ambient decorative glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-100/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full text-center">
        {/* Logo / Badge */}
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 animate-pulse">
            <Activity className="w-8 h-8" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-100">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        {/* Brand & Loading message */}
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Dental Finance</h2>
        <p className="text-sm font-semibold text-emerald-700 mt-1 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          Sincronizando dados da sua clínica...
        </p>
        <p className="text-xs text-slate-700 mt-1 max-w-xs">
          Carregando perfil profissional, bases fiscais seguras e movimentações contábeis.
        </p>

        {/* Skeleton Preview Cards */}
        <div className="mt-8 w-full space-y-3">
          <div className="bg-white/80 backdrop-blur-xs border border-slate-200/80 rounded-xl p-4 shadow-xs text-left animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-3.5 bg-slate-200 rounded w-28" />
              <div className="h-5 bg-emerald-100 rounded-full w-16" />
            </div>
            <div className="h-7 bg-slate-200 rounded w-36 mb-2" />
            <div className="h-2.5 bg-slate-100 rounded w-48" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/80 backdrop-blur-xs border border-slate-200/80 rounded-xl p-3.5 shadow-xs text-left animate-pulse">
              <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
              <div className="h-5 bg-slate-200 rounded w-24" />
            </div>
            <div className="bg-white/80 backdrop-blur-xs border border-slate-200/80 rounded-xl p-3.5 shadow-xs text-left animate-pulse">
              <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
              <div className="h-5 bg-slate-200 rounded w-24" />
            </div>
          </div>
        </div>

        <div className="mt-6 text-[11px] text-slate-600 font-medium">
          Conexão criptografada de alta disponibilidade
        </div>
      </div>
    </div>
  );
};
