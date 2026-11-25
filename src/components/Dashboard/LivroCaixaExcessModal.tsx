import React from 'react';
import { BookOpenCheck, ArrowRight, AlertTriangle } from 'lucide-react';
import { Modal } from '../UI/Modal';
import { Switch } from '../UI/Switch';
import { formatCurrency } from '../../lib/masks';
import type { LivroCaixaMonthRow } from '../../lib/taxEngine';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface LivroCaixaExcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  /** Histórico de janeiro até o mês apurado (inclusive). */
  history: LivroCaixaMonthRow[];
  /** Quem pode ativar/desativar meses (gestão). */
  canManage?: boolean;
  /** ignored = true desativa o mês (não entra no excesso). */
  onToggleMonth?: (monthKey: string, ignored: boolean) => void;
}

/**
 * Mostra, mês a mês, de onde veio o excesso de Livro Caixa e por quê:
 * receita do mês × despesas dedutíveis, e o que passou para o mês seguinte.
 */
export const LivroCaixaExcessModal: React.FC<LivroCaixaExcessModalProps> = ({
  isOpen,
  onClose,
  year,
  history,
  canManage = false,
  onToggleMonth,
}) => {
  const current = history.length > 0 ? history[history.length - 1] : null;
  const previous = history.slice(0, -1);
  // Meses anteriores sem nenhum movimento não poluem a lista.
  const relevantPrevious = previous.filter(
    (row) => row.despesas > 0 || row.excessoAnterior > 0 || row.rendimentos > 0
  );
  const carried = current?.excessoAnterior ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Excesso de Livro Caixa"
      subtitle={`Como o saldo foi se formando em ${year}`}
      icon={<BookOpenCheck className="w-5 h-5 text-teal-700" />}
      maxWidth="3xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold cursor-pointer"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-5" data-testid="livro-caixa-excess-modal">
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-teal-800">
            Excesso trazido para {current ? MONTH_NAMES[current.month - 1] : 'este mês'}
          </div>
          <div className="mt-1 text-2xl font-black text-teal-950 font-mono tabular-nums">{formatCurrency(carried)}</div>
          <p className="mt-2 text-xs leading-relaxed text-teal-900">
            A Receita limita a dedução do Livro Caixa à receita do mês. O que passa da receita não se perde:
            fica guardado e pode ser deduzido nos meses seguintes, <strong>até dezembro</strong>. O saldo que
            sobrar em dezembro não vai para o ano seguinte.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-teal-900">
            Faltou lançar a receita de algum mês? <strong>Desative o mês</strong> abaixo: ele deixa de entrar no excesso
            até você regularizar as receitas e reativar.
          </p>
        </div>

        {relevantPrevious.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Não há excesso vindo de meses anteriores em {year}.
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Mês a mês</h3>
            {relevantPrevious.map((row) => (
              <section
                key={row.monthKey}
                className={`rounded-2xl border p-4 space-y-3 ${
                  row.ignorado ? 'border-slate-300 bg-slate-100/70' : 'border-slate-200 bg-white'
                }`}
                data-testid={`excess-month-${row.month}`}
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-slate-900">{MONTH_NAMES[row.month - 1]}</h4>
                  {row.ignorado ? (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                      Desativado — fora do excesso
                    </span>
                  ) : row.excessoProximoMes > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                      Sobrou {formatCurrency(row.excessoProximoMes)} <ArrowRight className="w-3 h-3" /> mês seguinte
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                      Nada sobrou
                    </span>
                  )}
                </header>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-[10px] font-bold uppercase text-slate-400">Receita recebida (PF)</dt>
                    <dd className="font-mono font-bold text-slate-900 tabular-nums">{formatCurrency(row.rendimentos)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase text-slate-400">
                      Despesas do Livro Caixa{row.despesasCount > 0 ? ` (${row.despesasCount})` : ''}
                    </dt>
                    <dd className="font-mono font-bold text-slate-900 tabular-nums">{formatCurrency(row.despesas)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase text-slate-400">Excesso de antes</dt>
                    <dd className="font-mono font-bold text-slate-900 tabular-nums">{formatCurrency(row.excessoAnterior)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase text-slate-400">Deduzido no mês</dt>
                    <dd className="font-mono font-bold text-rose-700 tabular-nums">− {formatCurrency(row.utilizado)}</dd>
                  </div>
                </dl>

                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                  <strong className="text-slate-900">Por quê: </strong>
                  {row.motivo}
                </p>

                {row.semReceitaComDespesas && !row.ignorado && (
                  <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Nenhuma receita de pessoa física lançada neste mês. Se a receita foi esquecida, desative o mês
                      até regularizar, para o excesso não ficar inflado.
                    </span>
                  </p>
                )}

                {canManage && onToggleMonth && (
                  <div className="border-t border-slate-200 pt-3">
                    <Switch
                      id={`excess-toggle-${row.monthKey}`}
                      checked={!row.ignorado}
                      onChange={(considerar) => onToggleMonth(row.monthKey, !considerar)}
                      label="Considerar este mês no excesso"
                      description={
                        row.ignorado
                          ? 'Desativado: este mês não gera nem consome excesso.'
                          : 'Ativado: receitas e despesas deste mês entram no cálculo.'
                      }
                    />
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {current && (
          <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4 space-y-2" data-testid="excess-current-month">
            <h4 className="text-sm font-black text-slate-900">{MONTH_NAMES[current.month - 1]} (mês apurado)</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Receita recebida (PF)</div>
                <div className="font-mono font-bold tabular-nums">{formatCurrency(current.rendimentos)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Despesas do mês</div>
                <div className="font-mono font-bold tabular-nums">{formatCurrency(current.despesas)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">+ Excesso de antes</div>
                <div className="font-mono font-bold tabular-nums">{formatCurrency(current.excessoAnterior)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Disponível</div>
                <div className="font-mono font-bold tabular-nums">{formatCurrency(current.disponivel)}</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">
              <strong className="text-slate-900">Por quê: </strong>
              {current.motivo}
            </p>
          </section>
        )}
      </div>
    </Modal>
  );
};
