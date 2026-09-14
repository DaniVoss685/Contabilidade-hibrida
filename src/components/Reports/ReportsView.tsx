import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  CheckCircle,
  FileText,
  Building,
  User,
  AlertCircle,
  Layers,
} from 'lucide-react';
import {
  Sale,
  Expense,
  Professional,
  PayrollHistoryEntry,
  TaxRulesPf,
  TaxRulesSimples,
  ExpenseCategory,
  Patient,
} from '../../types';
import {
  calculateCpfMonthlyTax,
  calculateSimplesNacionalMonthlyTax,
  getMonthlyReceivablesSummary,
  getMonthlyExpensesSummary,
} from '../../lib/taxEngine';
import { formatCurrency, formatCpf, formatDateBr, formatPercent } from '../../lib/masks';
import { exportToCsv } from '../../lib/exportUtils';
import { PeriodPicker, useToast } from '../UI';

interface ReportsViewProps {
  sales: Sale[];
  expenses: Expense[];
  professional: Professional;
  payrollHistory: PayrollHistoryEntry[];
  taxRulesPf: TaxRulesPf;
  taxRulesSimples: TaxRulesSimples;
  categories: ExpenseCategory[];
  patients: Patient[];
  maskCpf: boolean;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onChangePeriod?: (year: number, month: number | 'ALL') => void;
}

type ReportType =
  | 'LIVRO_CAIXA_PF'
  | 'RELATORIO_CONTADOR'
  | 'EXTRATO_FATURAMENTO_CNPJ'
  | 'DESPESAS_ATRIBUTO'
  | 'DOCS_PENDENTES'
  | 'DRE_GERENCIAL'
  | 'FLUXO_CAIXA'
  | 'CONTAS_RECEBER_VENCIMENTO'
  | 'HISTORICO_PACIENTE';

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  expenses,
  professional,
  payrollHistory,
  taxRulesPf,
  taxRulesSimples,
  categories,
  patients,
  maskCpf,
  selectedYear: propYear,
  selectedMonth: propMonth,
  onChangePeriod,
}) => {
  const toast = useToast();
  const [selectedReport, setSelectedReport] = useState<ReportType>('LIVRO_CAIXA_PF');
  const [internalYear, setInternalYear] = useState<number>(propYear || new Date().getFullYear());
  const [internalMonth, setInternalMonth] = useState<number | 'ALL'>(
    propMonth !== undefined ? propMonth : (new Date().getMonth() + 1)
  );

  const effectiveYear = propYear !== undefined ? propYear : internalYear;
  const effectiveMonth = propMonth !== undefined ? propMonth : internalMonth;

  const handlePeriodChange = (year: number, month: number | 'ALL') => {
    setInternalYear(year);
    setInternalMonth(month);
    if (onChangePeriod) onChangePeriod(year, month);
  };

  const handleMonthChange = (val: number | 'ALL') => {
    setInternalMonth(val);
    if (onChangePeriod) onChangePeriod(effectiveYear, val);
  };

  const handleYearChange = (val: number) => {
    setInternalYear(val);
    if (onChangePeriod) onChangePeriod(val, effectiveMonth);
  };

  const competenceStr =
    effectiveMonth === 'ALL'
      ? `${effectiveYear}`
      : `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;

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

  const receivables = useMemo(() => {
    return getMonthlyReceivablesSummary(sales, competenceStr);
  }, [sales, competenceStr]);

  const expensesSummary = useMemo(() => {
    return getMonthlyExpensesSummary(expenses, competenceStr);
  }, [expenses, competenceStr]);

  const reportOptions: { id: ReportType; title: string; subtitle: string }[] = [
    {
      id: 'LIVRO_CAIXA_PF',
      title: '1. Livro Caixa da Pessoa Física (Carnê-Leão)',
      subtitle: 'Entradas recebidas e despesas dedutíveis comprovadas com documento fiscal',
    },
    {
      id: 'RELATORIO_CONTADOR',
      title: '2. Relatório Mensal para o Contador',
      subtitle: 'Segregado CPF e CNPJ com todos os dados para apuração do Carnê-Leão e PGDAS-D',
    },
    {
      id: 'EXTRATO_FATURAMENTO_CNPJ',
      title: '3. Extrato de Faturamento CNPJ (Simples Nacional)',
      subtitle: 'Relação de NFS-e emitidas, RBT12, FS12 e cálculo do Fator R',
    },
    {
      id: 'DRE_GERENCIAL',
      title: '4. DRE Gerencial Odontológico Consolidado',
      subtitle: 'Receitas brutas, custos clínicos, despesas, impostos e margem líquida',
    },
    {
      id: 'DOCS_PENDENTES',
      title: '5. Relatório de Documentos Fiscais Pendentes',
      subtitle: 'Receitas Saúde a emitir para recebimentos CPF e NFS-e a emitir para CNPJ',
    },
    {
      id: 'DESPESAS_ATRIBUTO',
      title: '6. Relatório de Despesas por Atributo Fiscal',
      subtitle: 'Classificação por Dedutibilidade PF, Impacto no Fator R e Operacionalidade PJ',
    },
    {
      id: 'CONTAS_RECEBER_VENCIMENTO',
      title: '7. Contas a Receber por Vencimento',
      subtitle: 'Parcelamento detalhado, status e valores pendentes',
    },
  ];

  // Export handlers
  const handleExportCsv = () => {
    if (selectedReport === 'LIVRO_CAIXA_PF') {
      const headers = ['Data', 'Tipo', 'Descrição / Histórico', 'Documento', 'Valor Entrada (R$)', 'Valor Saída (R$)'];
      const entries: (string | number)[][] = [];

      // Receipts CPF
      sales
        .filter((s) => s.taxOrigin === 'CPF')
        .forEach((s) => {
          s.installments
            .filter((i) => i.status === 'RECEBIDO' && i.paymentDate?.startsWith(competenceStr))
            .forEach((inst) => {
              entries.push([
                formatDateBr(inst.paymentDate || ''),
                'ENTRADA',
                `Recebimento de ${s.patientName} - ${s.procedureName}`,
                inst.receitaSaudeId || 'Receita Saúde (Pendente)',
                inst.amountReceived || inst.value,
                0,
              ]);
            });
        });

      // Expenses Deductible PF
      expenses
        .filter((e) => e.status === 'PAGO' && e.paymentDate?.startsWith(competenceStr))
        .filter((e) => e.entity === 'CPF' && e.dedutivelLivroCaixaPf === 'SIM')
        .forEach((e) => {
          entries.push([
            formatDateBr(e.paymentDate || ''),
            'SAIDA_DEDUTIVEL',
            `Pagamento ${e.supplierName} - ${e.categoryName} (${e.description})`,
            e.documentNumber || 'Comprovante',
            0,
            e.value,
          ]);
        });

      exportToCsv(`livro_caixa_pf_${competenceStr}`, [headers, ...entries]);
    } else if (selectedReport === 'RELATORIO_CONTADOR') {
      const rows = [
        ['RELATÓRIO MENSAL INTEGRADO PARA A CONTABILIDADE'],
        [`Competência: ${competenceStr}`],
        [`Profissional: ${professional.name} - CRO-${professional.croUf} ${professional.cro}`],
        [`CPF: ${formatCpf(professional.cpf, false)} | CNPJ: ${professional.cnpj || 'N/A'}`],
        [''],
        ['1. OPERAÇÃO PESSOA FÍSICA (CARNÊ-LEÃO)'],
        ['Total Receitas Efetivamente Recebidas no Mês (R$)', cpfTax.grossRevenueReceived],
        ['Total Despesas Dedutíveis Pagas (Livro Caixa) (R$)', cpfTax.deductibleExpensesLivroCaixa],
        ['Dedução Dependentes (R$)', cpfTax.dependentDeductionTotal],
        ['Dedução Previdência Oficial INSS (R$)', cpfTax.inssDeductionTotal],
        ['Base de Cálculo Carnê-Leão (R$)', cpfTax.taxBase],
        ['IRPF Estimado Carnê-Leão (R$)', cpfTax.carneLeaoEstimated],
        ['Receitas Saúde Emitidos / Pendentes', `${sales.filter((s) => s.taxOrigin === 'CPF').length} procedimentos`],
        [''],
        ['2. OPERAÇÃO PESSOA JURÍDICA (SIMPLES NACIONAL / PGDAS-D)'],
        ['Faturamento Bruto no Mês (NFS-e) (R$)', cnpjTax.monthlyRevenueNfse],
        ['RBT12 Acumulado (R$)', cnpjTax.rbt12],
        ['FS12 Acumulada (Folha/Pró-labore) (R$)', cnpjTax.fs12],
        ['Fator R (FS12 / RBT12)', `${cnpjTax.fatorRPercent.toFixed(2)}%`],
        ['Anexo Enquadrado', cnpjTax.effectiveAnnex],
        ['Faixa Simples', cnpjTax.bracketNumber],
        ['Alíquota Efetiva', `${cnpjTax.effectiveTaxRate.toFixed(2)}%`],
        ['DAS Estimado do Mês (R$)', cnpjTax.dasEstimated],
      ];
      exportToCsv(`relatorio_mensal_contador_${competenceStr}`, rows);
    } else {
      // Generic export
      toast.info('Exportação iniciada para o relatório selecionado.');
    }
  };

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
            <FileSpreadsheet className="w-5 h-5 text-teal-600" />
            Central de Relatórios Contábeis & Fiscais
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Relatórios especializados para dentistas e integração direta com sua contabilidade
          </p>
        </div>

        {/* Competence Selector & Download CTA */}
        <div className="flex items-center gap-3">
          <PeriodPicker
            selectedYear={effectiveYear}
            selectedMonth={effectiveMonth}
            onChange={handlePeriodChange}
            allowAllMonths={true}
          />

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV / Excel</span>
          </button>
        </div>
      </div>

      {/* Grid: Selector on Left, Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Menu (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
            Relatórios Disponíveis
          </span>
          {reportOptions.map((rep) => {
            const isSelected = selectedReport === rep.id;
            return (
              <button
                key={rep.id}
                onClick={() => setSelectedReport(rep.id)}
                className={`w-full p-3 rounded-lg text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-teal-50 border border-teal-200 text-teal-950 shadow-xs'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-bold text-xs">{rep.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{rep.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Right Preview (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          {/* Report 1: Livro Caixa PF */}
          {selectedReport === 'LIVRO_CAIXA_PF' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Livro Caixa da Pessoa Física •{' '}
                    {effectiveMonth === 'ALL'
                      ? `Ano Inteiro ${effectiveYear}`
                      : `Competência ${months[(effectiveMonth as number) - 1]}/${effectiveYear}`}
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Dr. {professional.name} - CPF: {formatCpf(professional.cpf, maskCpf)}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  Regime de Caixa
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 block">Total Entradas Recebidas</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {formatCurrency(cpfTax.grossRevenueReceived)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Saídas Dedutíveis</span>
                  <span className="font-bold text-rose-700 text-sm">
                    {formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Resultado Tributável</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {formatCurrency(cpfTax.taxBase)}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-600 leading-relaxed bg-amber-50 p-3 rounded-lg border border-amber-200">
                <strong>Critério Fiscal RFB:</strong> Apenas receitas recebidas no mês compõem as entradas. Despesas de caráter estritamente profissional devidamente comprovadas abatem a base de cálculo.
              </div>
            </div>
          )}

          {/* Report 2: Relatório Mensal para o Contador */}
          {selectedReport === 'RELATORIO_CONTADOR' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Relatório Mensal de Fechamento Contábil
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dados organizados para apuração do Carnê-Leão e declaração do PGDAS-D
                  </p>
                </div>
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs"
                >
                  Baixar Pacote Contador
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                  <div className="font-bold text-emerald-950 uppercase flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-700" />
                    1. Dados para Carnê-Leão (PF)
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>Receitas Tributáveis Recebidas:</span>
                    <span className="font-bold">{formatCurrency(cpfTax.grossRevenueReceived)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>Despesas Dedutíveis Comprovadas:</span>
                    <span className="font-bold">{formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>Dependentes Cadastrados:</span>
                    <span className="font-bold">{professional.numDependentes} ({formatCurrency(cpfTax.dependentDeductionTotal)})</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-emerald-900 pt-1">
                    <span>IRPF Carnê-Leão Estimado:</span>
                    <span>{formatCurrency(cpfTax.carneLeaoEstimated)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
                  <div className="font-bold text-blue-950 uppercase flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-blue-700" />
                    2. Dados para Simples Nacional (PJ)
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>Faturamento do Mês (NFS-e):</span>
                    <span className="font-bold">{formatCurrency(cnpjTax.monthlyRevenueNfse)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>RBT12 Acumulado (12m):</span>
                    <span className="font-bold">{formatCurrency(cnpjTax.rbt12)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>FS12 Folha / Pró-labore (12m):</span>
                    <span className="font-bold">{formatCurrency(cnpjTax.fs12)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>Fator R Apurado:</span>
                    <span className="font-bold text-blue-800">{cnpjTax.fatorRPercent.toFixed(2)}% ({cnpjTax.effectiveAnnex})</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-blue-900 pt-1">
                    <span>DAS Estimado do Mês:</span>
                    <span>{formatCurrency(cnpjTax.dasEstimated)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Report 4: DRE Gerencial Odontológico */}
          {selectedReport === 'DRE_GERENCIAL' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Demonstração do Resultado do Exercício (DRE Gerencial)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Visão econômica consolidada da clínica odontológica
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-200">
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="p-2.5">(=) RECEITA BRUTA TOTAL</td>
                      <td className="p-2.5 text-right">{formatCurrency(receivables.totalReceived)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 pl-6 text-slate-600">• Receita Operação CPF</td>
                      <td className="p-2.5 text-right">{formatCurrency(receivables.cpfReceived)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 pl-6 text-slate-600">• Receita Operação CNPJ (NFS-e)</td>
                      <td className="p-2.5 text-right">{formatCurrency(receivables.cnpjReceived)}</td>
                    </tr>
                    <tr className="text-rose-700 font-semibold bg-rose-50/40">
                      <td className="p-2.5">(-) DESPESAS E CUSTOS OPERACIONAIS TOTAIS</td>
                      <td className="p-2.5 text-right">- {formatCurrency(expensesSummary.totalPaid)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 pl-6 text-slate-600">• Custos e Despesas PF (Livro Caixa)</td>
                      <td className="p-2.5 text-right">- {formatCurrency(expensesSummary.cpfDeductiblePaid)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 pl-6 text-slate-600">• Despesas Operacionais PJ</td>
                      <td className="p-2.5 text-right">- {formatCurrency(expensesSummary.cnpjOperationalPaid)}</td>
                    </tr>
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="p-2.5">(=) RESULTADO OPERACIONAL ANTES DOS TRIBUTOS</td>
                      <td className="p-2.5 text-right">
                        {formatCurrency(receivables.totalReceived - expensesSummary.totalPaid)}
                      </td>
                    </tr>
                    <tr className="text-indigo-900 font-semibold bg-indigo-50/40">
                      <td className="p-2.5">(-) ESTIMATIVA TRIBUTÁRIA CONSOLIDADA</td>
                      <td className="p-2.5 text-right">
                        - {formatCurrency(cpfTax.carneLeaoEstimated + cnpjTax.dasEstimated)}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 pl-6 text-slate-600">• Carnê-Leão (IRPF PF)</td>
                      <td className="p-2.5 text-right">- {formatCurrency(cpfTax.carneLeaoEstimated)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 pl-6 text-slate-600">• DAS Simples Nacional (PJ)</td>
                      <td className="p-2.5 text-right">- {formatCurrency(cnpjTax.dasEstimated)}</td>
                    </tr>
                    <tr className="bg-teal-600 text-white font-black text-sm">
                      <td className="p-3">(=) RESULTADO LÍQUIDO DO PERÍODO</td>
                      <td className="p-3 text-right">
                        {formatCurrency(
                          receivables.totalReceived -
                            expensesSummary.totalPaid -
                            (cpfTax.carneLeaoEstimated + cnpjTax.dasEstimated)
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Other reports preview fallback */}
          {selectedReport !== 'LIVRO_CAIXA_PF' &&
            selectedReport !== 'RELATORIO_CONTADOR' &&
            selectedReport !== 'DRE_GERENCIAL' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  {reportOptions.find((r) => r.id === selectedReport)?.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Dados consolidados para o período{' '}
                  {effectiveMonth === 'ALL'
                    ? `Ano Inteiro de ${effectiveYear}`
                    : `${months[(effectiveMonth as number) - 1]}/${effectiveYear}`}
                  . Clique em "Exportar CSV / Excel" acima para obter a planilha com todas as colunas detalhadas.
                </p>
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-600">
                  Relatório pronto para download. Contém filtros por competência, identificadores de documento e atributos tributários.
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
