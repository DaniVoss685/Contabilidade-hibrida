import React, { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

interface MobileFiltersProps {
  /** Quantidade de filtros ativos (mostrada no botão). */
  activeCount?: number;
  children: React.ReactNode;
  label?: string;
  className?: string;
}

/**
 * Filtros recolhíveis no mobile: abaixo de `md` mostra um botão "Filtros • N ativo(s)" que abre/fecha
 * os controles; de `md` para cima os filhos aparecem sempre, sem wrapper (`display: contents`),
 * preservando exatamente o layout desktop atual.
 */
export const MobileFilters: React.FC<MobileFiltersProps> = ({
  activeCount = 0,
  children,
  label = 'Filtros',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`md:hidden w-full min-h-[44px] flex items-center justify-between gap-2 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer ${className}`}
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          {label}
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
              {activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}
            </span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? 'flex' : 'hidden'} flex-col gap-3 md:contents`}>{children}</div>
    </>
  );
};
