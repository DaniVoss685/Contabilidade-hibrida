import { AnnualCashFlowSummary, AnnualDreSummary, CategoryAnnualControlItem } from '../types/financial';

const MONTH_HEADERS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function fmtVal(num: number): string {
  return (num || 0).toFixed(2).replace('.', ',');
}

export function exportCashFlowToCsv(cashFlow: AnnualCashFlowSummary, year: number) {
  const rows: string[][] = [];

  // Header
  rows.push([`FLUXO DE CAIXA MENSAL E ANUAL - ANO ${year}`]);
  rows.push([`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`]);
  rows.push([]);
  rows.push(['Linha / Indicador', ...MONTH_HEADERS, 'Total Anual']);

  // Entradas
  rows.push([
    'TOTAL ENTRADAS DE CAIXA',
    ...cashFlow.months.map((m) => fmtVal(m.totalInflow)),
    fmtVal(cashFlow.totalInflow),
  ]);
  rows.push([
    '(+) Entradas Realizadas (Recebidas)',
    ...cashFlow.months.map((m) => fmtVal(m.realizedInflow)),
    fmtVal(cashFlow.totalRealizedInflow),
  ]);
  rows.push([
    '(+) Entradas Previstas (A Receber)',
    ...cashFlow.months.map((m) => fmtVal(m.projectedInflow)),
    fmtVal(cashFlow.totalProjectedInflow),
  ]);

  rows.push([]);

  // Saídas
  rows.push([
    'TOTAL SAÍDAS DE CAIXA',
    ...cashFlow.months.map((m) => fmtVal(m.totalOutflow)),
    fmtVal(cashFlow.totalOutflow),
  ]);
  rows.push([
    '(-) Saídas Realizadas (Pagas)',
    ...cashFlow.months.map((m) => fmtVal(m.realizedOutflow)),
    fmtVal(cashFlow.totalRealizedOutflow),
  ]);
  rows.push([
    '(-) Saídas Previstas (A Pagar)',
    ...cashFlow.months.map((m) => fmtVal(m.projectedOutflow)),
    fmtVal(cashFlow.totalProjectedOutflow),
  ]);

  // Outflow by Groups
  rows.push([]);
  rows.push(['DETALHAMENTO DE SAÍDAS POR GRUPO']);
  cashFlow.allExpenseGroups.forEach((g) => {
    const monthVals = cashFlow.months.map((m) => fmtVal(m.outflowByGroup[g.code]?.total || 0));
    const totalGroup = cashFlow.months.reduce(
      (acc, m) => acc + (m.outflowByGroup[g.code]?.total || 0),
      0
    );
    rows.push([`${g.code} - ${g.name}`, ...monthVals, fmtVal(totalGroup)]);
  });

  rows.push([]);

  // Saldo
  rows.push([
    '(=) GERAÇÃO LÍQUIDA DE CAIXA',
    ...cashFlow.months.map((m) => fmtVal(m.netCashFlow)),
    fmtVal(cashFlow.netTotalCashFlow),
  ]);
  rows.push([
    'Saldo Inicial de Caixa',
    ...cashFlow.months.map((m) => fmtVal(m.initialBalance)),
    fmtVal(cashFlow.initialBalanceYear),
  ]);
  rows.push([
    'Saldo Final de Caixa',
    ...cashFlow.months.map((m) => fmtVal(m.finalBalance)),
    fmtVal(cashFlow.finalBalanceYear),
  ]);

  const csvContent = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadCsv(csvContent, `fluxo_caixa_anual_${year}.csv`);
}

export function exportDreToCsv(dre: AnnualDreSummary, year: number) {
  const rows: string[][] = [];

  rows.push([`DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE GERENCIAL) - ANO ${year}`]);
  rows.push([`Regime de Competência - Gerado em: ${new Date().toLocaleDateString('pt-BR')}`]);
  rows.push([]);
  rows.push(['Conta / Rubrica', ...MONTH_HEADERS, 'Total Anual']);

  // Receita Bruta
  rows.push([
    '(=) RECEITA BRUTA OPERACIONAL',
    ...dre.months.map((m) => fmtVal(m.grossRevenue)),
    fmtVal(dre.totalGrossRevenue),
  ]);
  rows.push([
    '• Receita Operação CPF (Particular)',
    ...dre.months.map((m) => fmtVal(m.cpfGrossRevenue)),
    fmtVal(dre.totalCpfGrossRevenue),
  ]);
  rows.push([
    '• Receita Operação CNPJ (NFS-e / Convênios)',
    ...dre.months.map((m) => fmtVal(m.cnpjGrossRevenue)),
    fmtVal(dre.totalCnpjGrossRevenue),
  ]);

  // Tributos
  rows.push([
    '(-) TRIBUTOS DIRETOS SOBRE RECEITA',
    ...dre.months.map((m) => fmtVal(m.directTaxes)),
    fmtVal(dre.totalDirectTaxes),
  ]);
  rows.push([
    '• Carnê-Leão (PF)',
    ...dre.months.map((m) => fmtVal(m.cpfTaxes)),
    fmtVal(dre.months.reduce((acc, m) => acc + m.cpfTaxes, 0)),
  ]);
  rows.push([
    '• DAS Simples Nacional (PJ)',
    ...dre.months.map((m) => fmtVal(m.cnpjTaxes)),
    fmtVal(dre.months.reduce((acc, m) => acc + m.cnpjTaxes, 0)),
  ]);

  // Receita Líquida
  rows.push([
    '(=) RECEITA LÍQUIDA OPERACIONAL',
    ...dre.months.map((m) => fmtVal(m.netRevenue)),
    fmtVal(dre.totalNetRevenue),
  ]);

  // Custos Variáveis
  rows.push([
    '(-) CUSTOS VARIÁVEIS DOS PROCEDIMENTOS (CPV)',
    ...dre.months.map((m) => fmtVal(m.variableCosts)),
    fmtVal(dre.totalVariableCosts),
  ]);

  // Margem de Contribuição
  rows.push([
    '(=) MARGEM DE CONTRIBUIÇÃO / LUCRO BRUTO',
    ...dre.months.map((m) => fmtVal(m.contributionMargin)),
    fmtVal(dre.totalContributionMargin),
  ]);

  // Despesas Fixas
  rows.push([
    '(-) DESPESAS OPERACIONAIS FIXAS & ADMINISTRATIVAS',
    ...dre.months.map((m) => fmtVal(m.fixedExpenses)),
    fmtVal(dre.totalFixedExpenses),
  ]);

  // EBITDA
  rows.push([
    '(=) RESULTADO OPERACIONAL (EBITDA)',
    ...dre.months.map((m) => fmtVal(m.ebitda)),
    fmtVal(dre.totalEbitda),
  ]);

  // Resultado Líquido
  rows.push([
    '(=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO/PREJUÍZO)',
    ...dre.months.map((m) => fmtVal(m.netResult)),
    fmtVal(dre.totalNetResult),
  ]);
  rows.push([
    'Margem Líquida %',
    ...dre.months.map((m) => `${m.netMarginPercent.toFixed(1)}%`),
    `${dre.averageNetMarginPercent.toFixed(1)}%`,
  ]);

  const csvContent = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadCsv(csvContent, `dre_gerencial_anual_${year}.csv`);
}

export function exportCategoriesControlToCsv(categories: CategoryAnnualControlItem[], year: number) {
  const rows: string[][] = [];

  rows.push([`CONTROLE FINANCEIRO POR CATEGORIA - ANO ${year}`]);
  rows.push([`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`]);
  rows.push([]);
  rows.push([
    'Código',
    'Categoria',
    'Grupo',
    'Total Lançado (DRE)',
    'Total Pago (Caixa)',
    'Total A Pagar (Previsto)',
    'Total Vencido',
    'Dedutível Livro Caixa',
    'Impacta Fator R',
    'Operacional PJ',
    ...MONTH_HEADERS.map((m) => `Lançado ${m}`),
    ...MONTH_HEADERS.map((m) => `Pago ${m}`),
  ]);

  categories.forEach((c) => {
    rows.push([
      c.code,
      c.name,
      c.groupName,
      fmtVal(c.totalCompetence),
      fmtVal(c.totalPaid),
      fmtVal(c.totalToPay),
      fmtVal(c.totalOverdue),
      c.dedutivelLivroCaixaPf || '-',
      c.impactaFatorRPj ? 'SIM' : 'NÃO',
      c.despesaOperacionalPj ? 'SIM' : 'NÃO',
      ...c.monthsCompetence.map((val) => fmtVal(val)),
      ...c.monthsPaid.map((val) => fmtVal(val)),
    ]);
  });

  const csvContent = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadCsv(csvContent, `controle_categorias_anual_${year}.csv`);
}
