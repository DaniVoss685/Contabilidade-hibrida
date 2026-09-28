import React from 'react';
import { Check, CheckCircle2, Target } from 'lucide-react';
import { CanonicalFiscalBase, describeFatorRProgress, fiscalBaseStatusLabel } from '../../lib/fiscalBase';
import { formatCurrency, formatPercent } from '../../lib/masks';

const points = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plain = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Barra do Fator R contra a META (28% → Anexo III). A escala da barra e o marcador da meta usam a MESMA régua:
 *  - já bateu a meta: check no marcador, trecho que passou da meta em outra cor e "N pontos acima";
 *  - ainda não bateu: preenchimento âmbar até o valor, marcador da meta adiante e "faltam N pontos" (+ folha que falta);
 *  - sem base fiscal: barra vazia com o motivo (nunca um enquadramento inventado).
 */
export const FatorRProgress: React.FC<{ base: CanonicalFiscalBase; footer?: React.ReactNode }> = ({ base, footer }) => {
  const p = describeFatorRProgress(base);
  const reached = p.state === 'REACHED';
  const below = p.state === 'BELOW';
  const unavailable = p.state === 'UNAVAILABLE';

  const shell = reached
    ? 'bg-emerald-50/60 border-emerald-200/80'
    : below
    ? 'bg-amber-50/50 border-amber-200/80'
    : 'bg-slate-50 border-slate-200/80';

  const baseSegment = Math.min(p.fillPercent, p.markerPercent);
  const excessSegment = reached ? Math.max(0, p.fillPercent - p.markerPercent) : 0;

  const badgeText = unavailable ? fiscalBaseStatusLabel(base) : reached ? (p.atLimit ? 'No limite da meta' : 'Meta atingida') : 'Abaixo da meta';
  const ariaText = unavailable
    ? 'Fator R indisponível'
    : `Fator R ${formatPercent(p.percent)}. ${reached ? 'Meta de' : 'Meta de'} ${plain(p.thresholdPercent)}% ${reached ? 'atingida' : 'não atingida'}.`;

  return (
    <div className={`p-3.5 rounded-2xl border space-y-3 ${shell}`} data-testid="pj-factor-r-card" data-state={p.state}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700">Razão Fator R (FS12 ÷ RBT12):</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span data-testid="pj-factor-r-value" className="font-black text-slate-900 font-mono tabular-nums">
            {p.percent !== null ? formatPercent(p.percent) : '—'}
          </span>
          <span
            data-testid="pj-factor-r-badge"
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              reached
                ? 'bg-emerald-600 text-white'
                : below
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {reached && <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />}
            {badgeText}
          </span>
        </div>
      </div>

      {/* Barra + marcador da meta (mesma régua) */}
      <div className="relative px-2.5">
        <div className="relative">
          <div
            role="progressbar"
            aria-label="Fator R em relação à meta"
            aria-valuemin={0}
            aria-valuemax={p.scaleMax}
            aria-valuenow={p.percent !== null ? Math.min(p.scaleMax, Math.round(p.percent * 10) / 10) : 0}
            aria-valuetext={ariaText}
            className="relative h-3 w-full rounded-full bg-slate-200 overflow-hidden"
          >
            <div
              data-testid="pj-factor-r-fill"
              className={`absolute left-0 top-0 h-full transition-[width] duration-300 motion-reduce:transition-none ${
                reached ? 'bg-emerald-600' : below ? 'bg-amber-500' : 'bg-slate-300'
              } ${excessSegment === 0 ? 'rounded-full' : 'rounded-l-full'}`}
              style={{ width: `${baseSegment}%` }}
            />
            {excessSegment > 0 && (
              <div
                data-testid="pj-factor-r-excess"
                className="absolute top-0 h-full bg-emerald-400 rounded-r-full transition-[width] duration-300 motion-reduce:transition-none"
                style={{ left: `${p.markerPercent}%`, width: `${excessSegment}%` }}
                title="Quanto passou da meta"
              />
            )}
          </div>

          {/* Marcador da meta: check quando já bateu, alvo quando ainda falta */}
          <div
            data-testid="pj-factor-r-marker"
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
            style={{ left: `${p.markerPercent}%` }}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center shadow-xs ${
                reached ? 'border-emerald-600 text-emerald-600' : below ? 'border-amber-500 text-amber-600' : 'border-slate-400 text-slate-500'
              }`}
            >
              {reached ? <Check className="w-3 h-3 stroke-[3.5]" aria-hidden="true" /> : <Target className="w-3 h-3" aria-hidden="true" />}
            </div>
          </div>
        </div>

        {/* Régua: 0 · Meta (na posição real) · fim da escala */}
        <div className="relative h-4 mt-1.5 text-[10.5px] font-mono text-slate-400">
          <span className="absolute left-0 -ml-2.5">0%</span>
          <span
            className={`absolute -translate-x-1/2 whitespace-nowrap font-bold ${reached ? 'text-emerald-700' : 'text-slate-600'}`}
            style={{ left: `${p.markerPercent}%` }}
          >
            Meta {plain(p.thresholdPercent)}%
          </span>
          <span className="absolute right-0 -mr-2.5">{p.scaleMax}%</span>
        </div>
      </div>

      {/* Leitura em português claro */}
      <div data-testid="pj-factor-r-status" className="text-[11.5px] leading-snug">
        {reached && (
          <p className="flex items-start gap-1.5 text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" aria-hidden="true" />
            <span>
              {p.atLimit ? (
                <>
                  <strong>Exatamente na meta de {plain(p.thresholdPercent)}%</strong> — enquadrado no Anexo III.
                </>
              ) : (
                <>
                  <strong>Meta atingida:</strong> {points(p.diffPoints)} pontos acima de {plain(p.thresholdPercent)}% — enquadrado no Anexo III.
                </>
              )}
            </span>
          </p>
        )}
        {below && (
          <p className="flex items-start gap-1.5 text-amber-900">
            <Target className="w-4 h-4 text-amber-600 shrink-0 mt-px" aria-hidden="true" />
            <span>
              <strong>{p.diffPoints < 0.1 ? 'Falta menos de 0,1 ponto' : <>Faltam {points(p.diffPoints)} pontos</>}</strong> para a meta de {plain(p.thresholdPercent)}% (Anexo III)
              {p.missingPayroll !== null && p.missingPayroll > 0 ? (
                <> — cerca de <strong>{formatCurrency(p.missingPayroll)}</strong> a mais de folha (FS12).</>
              ) : (
                '.'
              )}
            </span>
          </p>
        )}
        {unavailable && <p className="text-slate-500">{base.reasonMessage || 'Base fiscal indisponível.'}</p>}
      </div>

      {footer && <div className="pt-1.5 border-t border-slate-200/80">{footer}</div>}
    </div>
  );
};
