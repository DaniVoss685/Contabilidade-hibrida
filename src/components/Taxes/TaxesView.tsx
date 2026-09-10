import React, { useState, useMemo } from 'react';
import {
  Calculator,
  User,
  Building,
  Calendar,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  Sale,
  Expense,
  Professional,
  PayrollHistoryEntry,
  TaxRulesPf,
  TaxRulesSimples,
} from '../../types';
import {
  calculateCpfMonthlyTax,
  calculateSimplesNacionalMonthlyTax,
  DEFAULT_SIMPLES_ANNEX_III,
  DEFAULT_SIMPLES_ANNEX_V,
} from '../../lib/taxEngine';
import { formatCurrency, formatPercent } from '../../lib/masks';

interface TaxesViewProps {
  sales: Sale[];
  expenses: Expense[];
  professional: Professional;
  payrollHistory: PayrollHistoryEntry[];
  taxRulesPf: TaxRulesPf;
  taxRulesSimples: TaxRulesSimples;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onChangePeriod?: (year: number, month: number | 'ALL') => void;
}

export const TaxesView: React.FC<TaxesViewProps> = ({
  sales,
  expenses,
  professional,
  payrollHistory,
  taxRulesPf,
  taxRulesSimples,
  selectedYear: propYear,
  selectedMonth: propMonth,
  onChangePeriod,
}) => {
  const [internalYear, setInternalYear] = useState<number>(propYear || 2025);
  const [internalMonth, setInternalMonth] = useState<number | 'ALL'>(propMonth !== undefined ? propMonth : 5);

  const effectiveYear = propYear !== undefined ? propYear : internalYear;
  const effectiveMonth = propMonth !== undefined ? propMonth : internalMonth;

  const handleMonthChange = (val: number | 'ALL') => {
    setInternalMonth(val);
    if (onChangePeriod) onChangePeriod(effectiveYear, val);
  };

  const handleYearChange = (val: number) => {
    setInternalYear(val);
    if (onChangePeriod) onChangePeriod(val, effectiveMonth);
  };

  // Pro-labore simulation tool for Fator R
  const [simulatedMonthlyProLabore, setSimulatedMonthlyProLabore] = useState<number>(7500);

  const competenceStr =
    effectiveMonth === 'ALL'
      ? `${effectiveYear}`
      : `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;

  // CPF Calculation
  const cpfTax = useMemo(() => {
    return calculateCpfMonthlyTax(
      sales,
      expenses,
      competenceStr,
      effectiveYear,
      taxRulesPf,
      professional.numDependentes,
      professional.inssProprioMensal
    );
  }, [sales, expenses, competenceStr, effectiveYear, taxRulesPf, professional]);

  // CNPJ Calculation
  const cnpjTax = useMemo(() => {
    return calculateSimplesNacionalMonthlyTax(
      sales,
      competenceStr,
      effectiveYear,
      taxRulesSimples,
      payrollHistory,
      professional.rbt12Inicial,
      professional.folha12MesesInicial
    );
  }, [sales, competenceStr, effectiveYear, taxRulesSimples, payrollHistory, professional]);

  // Fator R Simulation Calculation
  const simulatedFs12 = simulatedMonthlyProLabore * 12;
  const simulatedFatorR = cnpjTax.rbt12 > 0 ? simulatedFs12 / cnpjTax.rbt12 : 0;
  const simulatedAnnex = simulatedFatorR >= 0.28 ? 'ANEXO_III' : 'ANEXO_V';

  // Find simulated effective rate
  const simulatedRanges =
    simulatedAnnex === 'ANEXO_III'
      ? (taxRulesSimples?.annexIII || taxRulesSimples?.anexoIII || DEFAULT_SIMPLES_ANNEX_III)
      : (taxRulesSimples?.annexV || taxRulesSimples?.anexoV || DEFAULT_SIMPLES_ANNEX_V);

  const simulatedBracket =
    simulatedRanges.find(
      (b) => cnpjTax.rbt12 >= b.rangeStart && cnpjTax.rbt12 <= b.rangeEnd
    ) || simulatedRanges[0] || {
      rangeNumber: 1,
      rangeStart: 0,
      rangeEnd: 180000,
      nominalRate: 0.06,
      deduction: 0,
    };

  const simulatedEffectiveRate =
    cnpjTax.rbt12 > 0
      ? Math.max(0, (cnpjTax.rbt12 * simulatedBracket.nominalRate - simulatedBracket.deduction) / cnpjTax.rbt12)
      : simulatedBracket.nominalRate;

  const simulatedDas = cnpjTax.monthlyRevenueNfse * simulatedEffectiveRate;
  const potentialSavings = cnpjTax.dasEstimated - simulatedDas;

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-5 h-5 text-teal-600" />
            Motores de Cálculo Tributário (CPF & CNPJ)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Demonstrativos analíticos de cálculo segundo a legislação brasileira e tabelas vigentes
          </p>
        </div>

        {/* Competence Selector */}
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
          <Calendar className="w-4 h-4 text-teal-600" />
          <select
            value={effectiveMonth}
            onChange={(e) => {
              const val = e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10);
              handleMonthChange(val);
            }}
            className="text-xs font-bold rounded border border-slate-300 p-1.5 bg-slate-50 cursor-pointer"
          >
            <option value="ALL">Ano Inteiro (Todos)</option>
            {months.map((m, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {String(idx + 1).padStart(2, '0')} - {m}
              </option>
            ))}
          </select>
          <select
            value={effectiveYear}
            onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
            className="text-xs font-bold rounded border border-slate-300 p-1.5 bg-slate-50 cursor-pointer"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                Ano {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid with CPF on Left, CNPJ on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ================= SECTION 9: MOTOR TRIBUTÁRIO CPF (CARNÊ-LEÃO) ================= */}
        <div className="bg-white rounded-2xl border-2 border-emerald-500/30 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Carnê-Leão (Pessoa Física)
                  </h3>
                  <span className="text-[11px] text-emerald-800 font-semibold">
                    Regime de Caixa • Ano-Calendário {effectiveYear}
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                Tabela Progressiva RFB
              </span>
            </div>

            {/* Step-by-Step Calculation Breakdown */}
            <div className="mt-4 space-y-2 text-xs divide-y divide-slate-100">
              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">Receita Bruta Recebida no Mês:</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(cpfTax.grossRevenueReceived)}
                </span>
              </div>

              <div className="flex justify-between py-2 text-emerald-700">
                <span className="font-medium">(-) Despesas Dedutíveis (Livro Caixa):</span>
                <span className="font-bold">
                  - {formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}
                </span>
              </div>

              <div className="flex justify-between py-2 text-emerald-700">
                <span className="font-medium">
                  (-) Dedução de Dependentes ({professional.numDependentes} dependente(s)):
                </span>
                <span className="font-bold">
                  - {formatCurrency(cpfTax.dependentDeductionTotal)}
                </span>
              </div>

              <div className="flex justify-between py-2 text-emerald-700">
                <span className="font-medium">(-) Previdência Oficial (INSS Pago):</span>
                <span className="font-bold">
                  - {formatCurrency(cpfTax.inssDeductionTotal)}
                </span>
              </div>

              <div className="flex justify-between py-2.5 bg-slate-50 px-3 rounded-lg font-bold text-slate-900">
                <span>(=) Base de Cálculo do IRPF:</span>
                <span className="text-sm">{formatCurrency(cpfTax.taxBase)}</span>
              </div>

              {/* Progressive Table Bracket Identification */}
              <div className="py-2.5 px-3 bg-emerald-50/60 rounded-lg text-[11px] text-emerald-950 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Faixa da Tabela Aplicada:</span>
                  <span>Faixa {cpfTax.bracketNumber} ({formatPercent(cpfTax.nominalRate * 100)})</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Parcela a Deduzir do IRPF:</span>
                  <span>{formatCurrency(cpfTax.deductionAmount)}</span>
                </div>
              </div>

              {/* Simplified Discount Comparison */}
              <div className="py-2.5 px-3 bg-blue-50/50 rounded-lg text-[11px] text-blue-950 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Comparativo: Desconto Simplificado Mensal</span>
                  <span>{formatCurrency(taxRulesPf?.simplifiedDiscountLimitMonthly ?? taxRulesPf?.descontoSimplificadoMensal ?? 564.80)}</span>
                </div>
                <div className="text-[10px] text-slate-600">
                  Opção adotada pelo motor:{' '}
                  <strong className="text-blue-900 font-bold">
                    {cpfTax.deductionOptionUsed === 'LEGAL'
                      ? 'Deduções Legais Comprovadas (Mais vantajosa)'
                      : 'Desconto Simplificado Padrão'}
                  </strong>
                </div>
              </div>

              {/* Final IRPF */}
              <div className="flex justify-between py-3 px-3 bg-emerald-600 text-white rounded-xl font-bold mt-2">
                <div>
                  <span className="block text-xs text-emerald-100">IRPF Estimado (Carnê-Leão):</span>
                  <span className="text-xs font-normal text-emerald-200">
                    Alíquota Efetiva: {formatPercent(cpfTax.effectiveTaxRate)}
                  </span>
                </div>
                <span className="text-xl font-black">{formatCurrency(cpfTax.carneLeaoEstimated)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
            <strong>Fundamentação Legal:</strong> Instrução Normativa RFB nº 1.500/2014 e alterações posteriores. O Carnê-Leão incide obrigatoriamente sobre os rendimentos de pessoas físicas recebidos no mês por profissionais liberais.
          </div>
        </div>

        {/* ================= SECTION 10: MOTOR TRIBUTÁRIO CNPJ (SIMPLES NACIONAL) ================= */}
        <div className="bg-white rounded-2xl border-2 border-blue-500/30 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-blue-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Simples Nacional (Pessoa Jurídica)
                  </h3>
                  <span className="text-[11px] text-blue-800 font-semibold">
                    Lei Complementar nº 123/2006 • Fator R
                  </span>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  cnpjTax.effectiveAnnex === 'ANEXO_III'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
              >
                {cnpjTax.effectiveAnnex === 'ANEXO_III' ? 'Enquadrado: Anexo III' : 'Enquadrado: Anexo V'}
              </span>
            </div>

            {/* Step-by-Step Breakdown Simples */}
            <div className="mt-4 space-y-2 text-xs divide-y divide-slate-100">
              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">RBT12 (Receita Bruta dos Últimos 12 Meses):</span>
                <span className="font-bold text-slate-900">{formatCurrency(cnpjTax.rbt12)}</span>
              </div>

              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">FS12 (Folha de Pagamento dos Últimos 12 Meses):</span>
                <span className="font-bold text-slate-900">{formatCurrency(cnpjTax.fs12)}</span>
              </div>

              {/* Fator R Calculation Highlight */}
              <div
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-between font-bold ${
                  cnpjTax.fatorR >= 0.28
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                <div>
                  <span className="block text-xs">Fator R = FS12 ÷ RBT12:</span>
                  <span className="text-[10px] font-normal">
                    {cnpjTax.fatorR >= 0.28 ? 'Critério ≥ 28% atingido!' : 'Abaixo de 28% (tributação pelo Anexo V)'}
                  </span>
                </div>
                <span className="text-base font-black">{formatPercent(cnpjTax.fatorRPercent)}</span>
              </div>

              {/* Formula & Calculation */}
              <div className="py-2.5 px-3 bg-slate-50 rounded-lg text-[11px] text-slate-700 space-y-1 font-mono">
                <div className="font-bold text-slate-900">
                  Fórmula Oficial: Alíq. Efetiva = (RBT12 × Alíq.Nominal - Parcela a Deduzir) ÷ RBT12
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Faixa {cnpjTax.bracketNumber}:</span>
                  <span>
                    ({formatCurrency(cnpjTax.rbt12)} × {formatPercent(cnpjTax.nominalRate * 100)} -{' '}
                    {formatCurrency(cnpjTax.deductionAmount)}) ÷ {formatCurrency(cnpjTax.rbt12)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">Alíquota Efetiva Apurada:</span>
                <span className="font-bold text-blue-900 text-sm">
                  {formatPercent(cnpjTax.effectiveTaxRate)}
                </span>
              </div>

              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">Faturamento do Mês (NFS-e):</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(cnpjTax.monthlyRevenueNfse)}
                </span>
              </div>

              {/* Final DAS */}
              <div className="flex justify-between py-3 px-3 bg-blue-600 text-white rounded-xl font-bold mt-2">
                <div>
                  <span className="block text-xs text-blue-100">DAS Estimado do Mês:</span>
                  <span className="text-xs font-normal text-blue-200">
                    {formatCurrency(cnpjTax.monthlyRevenueNfse)} × {formatPercent(cnpjTax.effectiveTaxRate)}
                  </span>
                </div>
                <span className="text-xl font-black">{formatCurrency(cnpjTax.dasEstimated)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
            <strong>Fundamentação Legal:</strong> Artigo 18, § 5º-J e 5º-M da Lei Complementar nº 123/2006. Atividades odontológicas (CNAE 8630-5/04) são tributadas originariamente pelo Anexo V, mas migram para o benéfico Anexo III caso a razão entre folha e faturamento seja igual ou superior a 28%.
          </div>
        </div>
      </div>

      {/* ================= SIMULADOR AVANÇADO DE FATOR R & PRÓ-LABORE ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">
            Simulador de Pró-labore e Otimização do Fator R
          </h3>
        </div>
        <p className="text-xs text-slate-600">
          Simule o impacto de ajustar o pró-labore mensal para manter o Fator R igual ou superior a 28%, permitindo o enquadramento no Anexo III.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
          <div>
            <label className="block text-xs font-bold text-indigo-950 mb-1">
              Pró-labore Mensal Simulado (R$):
            </label>
            <input
              type="number"
              step="500"
              min="1412"
              value={simulatedMonthlyProLabore}
              onChange={(e) => setSimulatedMonthlyProLabore(parseFloat(e.target.value) || 0)}
              className="w-full text-base font-bold text-indigo-950 rounded-lg border border-indigo-300 p-2.5 bg-white focus:outline-none"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Folha Anual Projetada: {formatCurrency(simulatedFs12)}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-600 block">Fator R Simulado:</span>
            <div className="text-2xl font-black text-indigo-900">
              {formatPercent(simulatedFatorR * 100)}
            </div>
            <span
              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                simulatedFatorR >= 0.28
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {simulatedFatorR >= 0.28 ? 'Atinge Anexo III (Economia)' : 'Permanece no Anexo V'}
            </span>
          </div>

          <div className="p-4 bg-white rounded-xl border border-indigo-200 text-xs space-y-1">
            <div className="flex justify-between text-slate-700">
              <span>Alíquota Efetiva Simulada:</span>
              <span className="font-bold text-slate-900">{formatPercent(simulatedEffectiveRate * 100)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>DAS Mensal Projetado:</span>
              <span className="font-bold text-indigo-900">{formatCurrency(simulatedDas)}</span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-between font-bold">
              <span className="text-slate-700">Diferença Mensal:</span>
              <span className={potentialSavings >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {potentialSavings >= 0 ? `Economia de ${formatCurrency(potentialSavings)}` : `Acréscimo de ${formatCurrency(Math.abs(potentialSavings))}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
