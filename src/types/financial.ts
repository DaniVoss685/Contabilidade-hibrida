export type FinancialViewMode = 'CASH_FLOW' | 'DRE' | 'CATEGORIES_CONTROL' | 'COMPARISON';

export type CashFlowDisplayMode = 'ALL' | 'REALIZED_ONLY' | 'PROJECTED_ONLY';

export type FinancialEntityFilter = 'ALL' | 'CPF' | 'CNPJ';

export type FinancialSubTab = 'CASH_FLOW' | 'DRE' | 'CATEGORIES_CONTROL' | 'COMPARISON';

export interface MonthlyCashFlowCol {
  monthIndex: number; // 1 to 12
  monthLabel: string; // 'Jan', 'Fev', etc.
  monthKey: string; // '2025-01'
  
  // Inflows (Entradas)
  realizedInflow: number;
  projectedInflow: number;
  totalInflow: number;
  inflowByProcedure: Record<string, { realized: number; projected: number; total: number }>;
  inflowByOrigin: {
    cpfRealized: number;
    cpfProjected: number;
    cnpjRealized: number;
    cnpjProjected: number;
  };

  // Outflows (Saídas)
  realizedOutflow: number;
  projectedOutflow: number;
  totalOutflow: number;
  outflowByGroup: Record<
    string,
    {
      groupCode: string;
      groupName: string;
      realized: number;
      projected: number;
      total: number;
    }
  >;
  outflowByCategory: Record<
    string,
    {
      categoryId: string;
      categoryCode: string;
      categoryName: string;
      groupCode: string;
      realized: number;
      projected: number;
      total: number;
    }
  >;
  outflowByItem?: Record<
    string,
    {
      itemKey: string;
      itemName: string;
      categoryId: string;
      realized: number;
      projected: number;
      total: number;
    }
  >;

  // Net Results & Balances
  netRealized: number;
  netProjected: number;
  netCashFlow: number; // totalInflow - totalOutflow
  initialBalance: number;
  finalBalance: number;
}

export interface FinancialItemDetail {
  itemKey: string;
  itemName: string;
  categoryId: string;
  categoryCode: string;
  groupCode: string;
}

export interface AnnualCashFlowSummary {
  year: number;
  months: MonthlyCashFlowCol[];
  totalRealizedInflow: number;
  totalProjectedInflow: number;
  totalInflow: number;
  totalRealizedOutflow: number;
  totalProjectedOutflow: number;
  totalOutflow: number;
  netTotalCashFlow: number;
  initialBalanceYear: number;
  finalBalanceYear: number;
  allExpenseGroups: { code: string; name: string }[];
  allExpenseCategories: { id: string; code: string; name: string; groupCode: string }[];
  allExpenseItems?: FinancialItemDetail[];
  allProcedures: string[];
}

export interface MonthlyDreCol {
  monthIndex: number; // 1 to 12
  monthLabel: string;
  monthKey: string;

  // 1. Receita Bruta Operacional (por competência)
  grossRevenue: number;
  cpfGrossRevenue: number;
  cnpjGrossRevenue: number;
  revenueByProcedure: Record<string, number>;

  // 2. (-) Tributos Diretos / Deduções da Receita
  directTaxes: number;
  cpfTaxes: number; // Carnê-Leão estimado
  cnpjTaxes: number; // Simples Nacional estimado

  // 3. (=) Receita Líquida Operacional
  netRevenue: number;

  // 4. (-) Custos Variáveis dos Procedimentos (CPV: Insumos + Prótese/Lab)
  variableCosts: number;
  variableCostsByGroup: Record<string, number>;
  variableCostsByCategory: Record<string, number>;

  // 5. (=) Margem de Contribuição (Lucro Bruto)
  contributionMargin: number;
  contributionMarginPercent: number;

  // 6. (-) Despesas Operacionais Fixas & Administrativas
  fixedExpenses: number;
  fixedExpensesByGroup: Record<string, number>;
  fixedExpensesByCategory: Record<string, number>;
  fixedExpensesByItem?: Record<string, number>;

  // 7. (=) Resultado Operacional (EBITDA)
  ebitda: number;
  ebitdaMarginPercent: number;

  // 8. (=) Resultado Líquido do Exercício (Lucro Líquido / Prejuízo)
  netResult: number;
  netMarginPercent: number;
}

export interface AnnualDreSummary {
  year: number;
  months: MonthlyDreCol[];
  totalGrossRevenue: number;
  totalCpfGrossRevenue: number;
  totalCnpjGrossRevenue: number;
  totalDirectTaxes: number;
  totalNetRevenue: number;
  totalVariableCosts: number;
  totalContributionMargin: number;
  averageContributionMarginPercent: number;
  totalFixedExpenses: number;
  totalEbitda: number;
  totalNetResult: number;
  averageNetMarginPercent: number;
  allVariableGroups: { code: string; name: string }[];
  allFixedGroups: { code: string; name: string }[];
  allExpenseCategories: { id: string; code: string; name: string; groupCode: string }[];
  allFixedItems?: FinancialItemDetail[];
  allProcedures: string[];
}

export interface CategoryAnnualControlItem {
  id: string;
  code: string;
  name: string;
  groupCode: string;
  groupName: string;
  type: 'EXPENSE' | 'REVENUE';
  isVariableCost?: boolean;
  
  // Tributary metadata
  dedutivelLivroCaixaPf?: string;
  impactaFatorRPj?: boolean;
  despesaOperacionalPj?: boolean;

  // Annual Totals
  totalCompetence: number; // Lançado (DRE)
  totalPaid: number; // Pago / Efetivado (Caixa Realizado)
  totalToPay: number; // A pagar (Previsto)
  totalOverdue: number; // Vencido
  countTransactions: number;

  // Month-by-month arrays (length 12)
  monthsCompetence: number[];
  monthsPaid: number[];
  monthsToPay: number[];
}
