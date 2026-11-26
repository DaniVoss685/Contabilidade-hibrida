import React, { useState } from 'react';
import { PiggyBank, ChevronDown } from 'lucide-react';
import { formatCurrency, formatPercent } from '../../lib/masks';
import type { HybridSavings } from '../../lib/hybridSavings';

interface HybridSavingsCardProps {
  savings: HybridSavings;
  /** Ex.: "Nov/2026" */
  monthLabel: string;
  isProjected: boolean;
}

/**
 * "Quanto o modelo híbrido está economizando?" — imposto estimado do mês se tudo fosse só no Carnê-Leão,
 * se tudo fosse só no CNPJ e como está hoje (híbrido), com a economia contra cada alternativa.
 */
export const HybridSavingsCard: React.FC<HybridSavingsCardProps> = ({ savings, monthLabel, isProjected }) => {
  const [showHow, setShowHow] = useState(false);
  const maxTax = Math.max(savings.tudoCpf.imposto, savings.tudoCnpj.imposto ?? 0, savings.hibrido.total, 0.01);
  const pct = (v: number) => `${Math.max(2, Math.min(100, (v / maxTax) * 100))}%`;
  // 1) economiza contra a melhor alternativa; 2) só contra a mais cara; 3) nenhuma economia.
  const saving = savings.economia > 0;
  const savingOnlyVsWorst = !saving && savings.economiaMaxima > 0;
  const bestLabel = savings.melhorAlternativa === 'CNPJ' ? 'tudo no CNPJ' : 'tudo no Carnê-Leão';
  const worstLabel = savings.melhorAlternativa === 'CNPJ' ? 'tudo no Carnê-Leão' : 'tudo no CNPJ';

  const rows: Array<{ key: string; label: string; hint: string; value: number | null; bar: string; strong?: boolean }> = [
    {
      key: 'cpf',
      label: 'Tudo no Carnê-Leão (só PF)',
      hint: 'Toda a receita como pessoa física',
      value: savings.tudoCpf.imposto,
      bar: 'bg-slate-400',
    },
    {
      key: 'cnpj',
      label: 'Tudo no CNPJ (só PJ)',
      hint: 'Toda a receita em nota fiscal (Simples)',
      value: savings.tudoCnpj.imposto,
      bar: 'bg-blue-400',
    },
    {
      key: 'hibrido',
      label: 'Híbrido — como você faz hoje',
      hint: `Carnê-Leão ${formatCurrency(savings.hibrido.carneLeao)} + DAS ${formatCurrency(savings.hibrido.das)}`,
      value: savings.hibrido.total,
      bar: 'bg-teal-500',
      strong: true,
    },
  ];

  return (
    <section
      data-testid="hybrid-savings-card"
      className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-xs"
      aria-labelledby="hybrid-savings-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-700">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div>
            <h3 id="hybrid-savings-title" className="text-sm font-bold text-slate-900">Economia do modelo híbrido</h3>
            <p className="text-xs text-slate-500">
              Imposto {isProjected ? 'projetado' : 'estimado'} de {monthLabel} sobre a receita de{' '}
              <strong className="font-mono text-slate-700">{formatCurrency(savings.receitaTotal)}</strong>
            </p>
          </div>
        </div>

        <div className="text-right" data-testid="hybrid-savings-headline">
          {saving ? (
            <>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-teal-800">Você economiza</span>
              <span data-testid="hybrid-savings-value" className="block whitespace-nowrap text-2xl font-black text-teal-700 font-mono tabular-nums tracking-tight">
                {formatCurrency(savings.economia)}
              </span>
              <span className="block text-[11px] text-slate-500">
                {formatPercent(savings.economiaPercentual)} a menos que a melhor alternativa
              </span>
            </>
          ) : savingOnlyVsWorst ? (
            <>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-teal-800">Você economiza</span>
              <span data-testid="hybrid-savings-value" className="block whitespace-nowrap text-2xl font-black text-teal-700 font-mono tabular-nums tracking-tight">
                {formatCurrency(savings.economiaMaxima)}
              </span>
              <span className="block text-[11px] text-slate-500">
                contra {worstLabel}; paga {formatCurrency(Math.abs(savings.economia))} a mais que {bestLabel}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Neste mês</span>
              <span data-testid="hybrid-savings-value" className="block text-sm font-bold text-slate-800">
                O híbrido não gerou economia
              </span>
              <span className="block text-[11px] text-slate-500">
                {savings.economia < 0 ? `custou ${formatCurrency(Math.abs(savings.economia))} a mais` : 'imposto igual à melhor alternativa'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.key} data-testid={`hybrid-row-${row.key}`}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className={`block text-xs ${row.strong ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>{row.label}</span>
                <span className="block text-[11px] text-slate-500">{row.hint}</span>
              </div>
              <span className={`whitespace-nowrap font-mono tabular-nums ${row.strong ? 'text-base font-black text-teal-800' : 'text-sm font-bold text-slate-800'}`}>
                {row.value === null ? 'indisponível' : formatCurrency(row.value)}
              </span>
            </div>
            {row.value !== null && (
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${row.bar}`} style={{ width: pct(row.value) }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600" data-testid="hybrid-savings-breakdown">
        <span>
          Economia contra <strong className="text-slate-800">tudo no Carnê-Leão</strong>:{' '}
          <strong data-testid="hybrid-savings-vs-cpf" className="font-mono text-teal-700">{formatCurrency(savings.economiaVsCpf)}</strong>
        </span>
        <span>
          Economia contra <strong className="text-slate-800">tudo no CNPJ</strong>:{' '}
          <strong data-testid="hybrid-savings-vs-cnpj" className="font-mono text-teal-700">
            {savings.economiaVsCnpj === null ? 'indisponível' : formatCurrency(savings.economiaVsCnpj)}
          </strong>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setShowHow((v) => !v)}
        aria-expanded={showHow}
        data-testid="hybrid-savings-how"
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
      >
        {showHow ? 'Ocultar como calculamos' : 'Como calculamos'}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHow ? 'rotate-180' : ''}`} />
      </button>
      {showHow && (
        <ul className="mt-2 space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 list-disc list-inside" data-testid="hybrid-savings-how-panel">
          <li>
            <strong>Tudo no Carnê-Leão:</strong> a receita total ({formatCurrency(savings.receitaTotal)}) entra na apuração de pessoa física,
            com as mesmas despesas de Livro Caixa, excesso trazido, INSS e dependentes do mês.
          </li>
          <li>
            <strong>Tudo no CNPJ:</strong> a alíquota efetiva atual do Simples Nacional é aplicada à receita total. Se a receita sobe,
            a alíquota real pode mudar (faixa e Fator R), então é uma estimativa.
          </li>
          <li>
            <strong>Híbrido:</strong> o imposto que o sistema já estima para você: Carnê-Leão da parte PF ({formatCurrency(savings.receitaCpf)})
            mais DAS da parte PJ ({formatCurrency(savings.receitaCnpj)}).
          </li>
          <li>É uma comparação de imposto estimado do mês; não considera pró-labore, INSS próprio nem distribuição de lucros.</li>
          {!savings.comparacaoCompleta && <li className="text-amber-700">A base fiscal do Simples está indisponível: a comparação com "tudo no CNPJ" não pôde ser calculada.</li>}
        </ul>
      )}
    </section>
  );
};
