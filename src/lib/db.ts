import {
  Organization,
  User,
  Professional,
  Patient,
  Sale,
  Expense,
  ExpenseCategory,
  BankAccount,
  PayrollHistoryEntry,
  AuditLog,
  TaxRulesPf,
  TaxRulesSimples,
  InstallmentStatus,
  ReceitaSaudeStatus,
  PaymentMethod,
  AccountReceivableItem,
  DentalProcedure,
  ClinicalInput,
  TaxOrigin,
} from '../types';
import {
  DEMO_ORGANIZATION,
  DEMO_USER,
  DEMO_PROFESSIONAL,
  DEMO_BANK_ACCOUNTS,
  DEMO_PATIENTS,
  DEMO_SALES,
  DEMO_EXPENSES,
  DEMO_PAYROLL_HISTORY,
  DEMO_PROCEDURES,
  DEMO_CLINICAL_INPUTS,
} from './demoData';
import { INITIAL_CHART_OF_ACCOUNTS } from './chartOfAccountsData';
import {
  DEFAULT_TAX_RULES_PF,
  DEFAULT_TAX_RULES_SIMPLES,
} from './taxEngine';
import { augmentYearlyDataset } from './annualFinanceData';

const STORAGE_KEYS = {
  ORGANIZATION: 'df_org_v1',
  USER: 'df_user_v1',
  PROFESSIONAL: 'df_prof_v1',
  PATIENTS: 'df_patients_v1',
  SALES: 'df_sales_v1',
  EXPENSES: 'df_expenses_v1',
  CATEGORIES: 'df_categories_v1',
  BANK_ACCOUNTS: 'df_banks_v1',
  PAYROLL_HISTORY: 'df_payroll_v1',
  AUDIT_LOGS: 'df_audit_v1',
  TAX_RULES_PF: 'df_tax_pf_v1',
  TAX_RULES_SIMPLES: 'df_tax_simples_v1',
  PROCEDURES: 'df_procedures_v2',
  CLINICAL_INPUTS: 'df_clinical_inputs_v1',
};

// Safe storage accessors
function loadItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

function saveItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to save ${key} to storage:`, e);
  }
}

export class DentalFinanceDB {
  private static instance: DentalFinanceDB;

  private org: Organization;
  private user: User;
  private professional: Professional;
  private patients: Patient[];
  private sales: Sale[];
  private expenses: Expense[];
  private categories: ExpenseCategory[];
  private bankAccounts: BankAccount[];
  private payrollHistory: PayrollHistoryEntry[];
  private auditLogs: AuditLog[];
  private taxRulesPf: Record<number, TaxRulesPf>;
  private taxRulesSimples: Record<number, TaxRulesSimples>;
  private procedures: DentalProcedure[];
  private clinicalInputs: ClinicalInput[];
  private listeners: (() => void)[] = [];

  private constructor() {
    this.org = loadItem<Organization>(STORAGE_KEYS.ORGANIZATION, DEMO_ORGANIZATION);
    this.user = loadItem<User>(STORAGE_KEYS.USER, DEMO_USER);
    this.professional = loadItem<Professional>(STORAGE_KEYS.PROFESSIONAL, DEMO_PROFESSIONAL);
    this.patients = loadItem<Patient[]>(STORAGE_KEYS.PATIENTS, DEMO_PATIENTS);
    const loadedSales = loadItem<Sale[]>(STORAGE_KEYS.SALES, DEMO_SALES);
    const loadedExpenses = loadItem<Expense[]>(STORAGE_KEYS.EXPENSES, DEMO_EXPENSES);
    const augmented = augmentYearlyDataset(loadedSales, loadedExpenses, 2025);
    this.sales = augmented.sales;
    this.expenses = augmented.expenses;
    const loadedCategories = loadItem<ExpenseCategory[]>(STORAGE_KEYS.CATEGORIES, INITIAL_CHART_OF_ACCOUNTS);
    // Ensure all categories (even if previously cached in localStorage) use standardized group names
    const catMap = new Map<string, ExpenseCategory>();
    INITIAL_CHART_OF_ACCOUNTS.forEach((c) => catMap.set(c.id, c));
    loadedCategories.forEach((c) => {
      const standard = catMap.get(c.id);
      if (standard) {
        catMap.set(c.id, {
          ...standard,
          ...c,
          groupName: standard.groupName, // Always prefer official descriptive group name
          groupCode: standard.groupCode,
        });
      } else {
        catMap.set(c.id, c);
      }
    });
    this.categories = Array.from(catMap.values());
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);

    this.bankAccounts = loadItem<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, DEMO_BANK_ACCOUNTS);
    this.payrollHistory = loadItem<PayrollHistoryEntry[]>(STORAGE_KEYS.PAYROLL_HISTORY, DEMO_PAYROLL_HISTORY);
    this.procedures = loadItem<DentalProcedure[]>(STORAGE_KEYS.PROCEDURES, DEMO_PROCEDURES);
    this.clinicalInputs = loadItem<ClinicalInput[]>(STORAGE_KEYS.CLINICAL_INPUTS, DEMO_CLINICAL_INPUTS);
    this.auditLogs = loadItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, [
      {
        id: 'log_01',
        timestamp: new Date().toISOString(),
        userId: 'usr_carlos_01',
        userName: 'Dr. Carlos Eduardo Mendes',
        action: 'SISTEMA_INICIALIZADO',
        entityType: 'ORGANIZATION',
        entityId: 'org_mendes_01',
        details: 'Banco de dados híbrido inicializado com plano de contas odontológico e dados demonstrativos.',
      },
    ]);
    this.taxRulesPf = loadItem<Record<number, TaxRulesPf>>(STORAGE_KEYS.TAX_RULES_PF, DEFAULT_TAX_RULES_PF);
    this.taxRulesSimples = loadItem<Record<number, TaxRulesSimples>>(STORAGE_KEYS.TAX_RULES_SIMPLES, DEFAULT_TAX_RULES_SIMPLES);
  }

  public static getInstance(): DentalFinanceDB {
    if (!DentalFinanceDB.instance) {
      DentalFinanceDB.instance = new DentalFinanceDB();
    }
    return DentalFinanceDB.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // Audit Logging
  public log(action: string, entityType: string, entityId: string, details: string) {
    const newLog: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId: this.user.id,
      userName: this.user.name,
      action,
      entityType,
      entityId,
      details,
    };
    this.auditLogs = [newLog, ...this.auditLogs.slice(0, 99)];
    saveItem(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs);
  }

  // Getters
  public getOrg(): Organization {
    return this.org;
  }

  public getUser(): User {
    return this.user;
  }

  public getProfessional(): Professional {
    return this.professional;
  }

  public getPatients(): Patient[] {
    return this.patients;
  }

  public getSales(): Sale[] {
    return this.sales;
  }

  public getExpenses(): Expense[] {
    return this.expenses;
  }

  public getCategories(): ExpenseCategory[] {
    return this.categories;
  }

  public getBankAccounts(): BankAccount[] {
    return this.bankAccounts;
  }

  public getPayrollHistory(): PayrollHistoryEntry[] {
    return this.payrollHistory;
  }

  public getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }

  public getTaxRulesPf(year: number): TaxRulesPf {
    const candidate = this.taxRulesPf && this.taxRulesPf[year];
    if (candidate && Array.isArray(candidate.brackets) && candidate.brackets.length > 0) {
      return candidate;
    }
    return DEFAULT_TAX_RULES_PF[year] || DEFAULT_TAX_RULES_PF[2025];
  }

  public getTaxRulesSimples(year: number): TaxRulesSimples {
    const candidate = this.taxRulesSimples && this.taxRulesSimples[year];
    if (candidate && (Array.isArray(candidate.annexIII) || Array.isArray(candidate.anexoIII))) {
      return candidate;
    }
    return DEFAULT_TAX_RULES_SIMPLES[year] || DEFAULT_TAX_RULES_SIMPLES[2025];
  }

  // Accounts Receivable View Derived
  public getAccountsReceivable(): AccountReceivableItem[] {
    const items: AccountReceivableItem[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const sale of this.sales) {
      for (const inst of sale.installments) {
        const received = inst.amountReceived || (inst.status === 'RECEBIDO' ? inst.value : 0);
        const balance = Math.max(0, inst.value - received);

        let overallStatus: AccountReceivableItem['status'] = 'A_VENCER';
        if (inst.status === 'CANCELADO') {
          overallStatus = 'CANCELADO';
        } else if (inst.status === 'RECEBIDO' || balance === 0) {
          overallStatus = 'RECEBIDO';
        } else if (received > 0 && balance > 0) {
          overallStatus = 'PARCIALMENTE_RECEBIDO';
        } else if (inst.dueDate < todayStr) {
          overallStatus = 'VENCIDO';
        }

        const docSummary =
          sale.taxOrigin === 'CPF'
            ? inst.receitaSaudeId
              ? `Receita Saúde #${inst.receitaSaudeId}`
              : `Receita Saúde (Pendente)`
            : sale.nfseNumber
            ? `NFS-e #${sale.nfseNumber}`
            : `NFS-e (Pendente)`;

        items.push({
          installmentId: inst.id,
          saleId: sale.id,
          patientName: sale.patientName,
          taxOrigin: sale.taxOrigin,
          documentSummary: docSummary,
          procedureName: sale.procedureName,
          competenceDate: sale.serviceDate,
          dueDate: inst.dueDate,
          value: inst.value,
          amountReceived: received,
          balance,
          status: overallStatus,
          receitaSaudeStatus: inst.receitaSaudeStatus,
          receitaSaudeId: inst.receitaSaudeId,
          installmentNumber: inst.installmentNumber,
          totalInstallments: inst.totalInstallments,
        });
      }
    }

    // Sort by dueDate asc
    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  // Setters & Actions
  public updateProfessional(updates: Partial<Professional>) {
    this.professional = { ...this.professional, ...updates };
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional);
    this.log('ATUALIZACAO_PERFIL', 'PROFESSIONAL', this.professional.id, 'Dados cadastrais ou tributários atualizados.');
    this.notify();
  }

  public addPatient(patientData: Omit<Patient, 'id' | 'orgId' | 'createdAt'>): Patient {
    const newPatient: Patient = {
      ...patientData,
      id: `pat_${Date.now()}`,
      orgId: this.org.id,
      createdAt: new Date().toISOString(),
    };
    this.patients = [newPatient, ...this.patients];
    saveItem(STORAGE_KEYS.PATIENTS, this.patients);
    this.log('CRIACAO_PACIENTE', 'PATIENT', newPatient.id, `Paciente ${newPatient.name} cadastrado.`);
    this.notify();
    return newPatient;
  }

  public updatePatient(id: string, updates: Partial<Patient>) {
    this.patients = this.patients.map((p) => (p.id === id ? { ...p, ...updates } : p));
    saveItem(STORAGE_KEYS.PATIENTS, this.patients);
    this.log('ATUALIZACAO_PACIENTE', 'PATIENT', id, `Cadastro do paciente atualizado.`);
    this.notify();
  }

  public addSale(saleData: Omit<Sale, 'id' | 'orgId' | 'createdAt'>): Sale {
    const newSale: Sale = {
      ...saleData,
      id: `sale_${Date.now()}`,
      orgId: this.org.id,
      createdAt: new Date().toISOString(),
    };
    this.sales = [newSale, ...this.sales];
    saveItem(STORAGE_KEYS.SALES, this.sales);
    this.log(
      'CRIACAO_RECEITA',
      'SALE',
      newSale.id,
      `Receita ${newSale.taxOrigin} de ${newSale.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada para ${newSale.patientName}.`
    );
    this.notify();
    return newSale;
  }

  public updateSale(id: string, updates: Partial<Sale>) {
    this.sales = this.sales.map((s) => (s.id === id ? { ...s, ...updates } : s));
    saveItem(STORAGE_KEYS.SALES, this.sales);
    this.log('ATUALIZACAO_RECEITA', 'SALE', id, `Dados da receita foram atualizados.`);
    this.notify();
  }

  public deleteSale(id: string): boolean {
    const prevLen = this.sales.length;
    this.sales = this.sales.filter((s) => s.id !== id);
    if (this.sales.length !== prevLen) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log('EXCLUSAO_RECEITA', 'SALE', id, `Receita excluída.`);
      this.notify();
      return true;
    }
    return false;
  }

  public batchDeleteSales(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.sales.length;
    this.sales = this.sales.filter((s) => !idSet.has(s.id));
    const deletedCount = prevLen - this.sales.length;
    if (deletedCount > 0) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log('EXCLUSAO_RECEITA_LOTE', 'SALE', 'batch', `${deletedCount} receitas excluídas em lote.`);
      this.notify();
    }
    return deletedCount;
  }

  public batchUpdateSales(ids: string[], updates: Partial<Sale>): number {
    const idSet = new Set(ids);
    let updatedCount = 0;
    this.sales = this.sales.map((s) => {
      if (idSet.has(s.id)) {
        updatedCount++;
        return { ...s, ...updates };
      }
      return s;
    });
    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log('ATUALIZACAO_RECEITA_LOTE', 'SALE', 'batch', `${updatedCount} receitas atualizadas em lote.`);
      this.notify();
    }
    return updatedCount;
  }

  public settleInstallment(
    saleId: string,
    installmentId: string,
    paymentDate: string,
    amountReceived: number,
    paymentMethod: PaymentMethod,
    bankAccountId?: string,
    receitaSaudeId?: string,
    receitaSaudeStatus?: ReceitaSaudeStatus
  ) {
    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;

      const updatedInstallments = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;

        const isCpf = sale.taxOrigin === 'CPF';
        const finalReceitaStatus = isCpf
          ? receitaSaudeStatus || (receitaSaudeId ? 'EMITIDO' : 'A_EMITIR')
          : undefined;

        return {
          ...inst,
          status: 'RECEBIDO' as InstallmentStatus,
          paymentDate,
          amountReceived,
          paymentMethod,
          bankAccountId: bankAccountId || inst.bankAccountId,
          receitaSaudeId: receitaSaudeId || inst.receitaSaudeId,
          receitaSaudeStatus: finalReceitaStatus,
          receitaSaudeEmittedAt: receitaSaudeId ? new Date().toISOString() : inst.receitaSaudeEmittedAt,
        };
      });

      return {
        ...sale,
        installments: updatedInstallments,
      };
    });

    saveItem(STORAGE_KEYS.SALES, this.sales);
    this.log(
      'RECEBIMENTO_PARCELA',
      'INSTALLMENT',
      installmentId,
      `Recebimento de parcela registrado no valor de R$ ${amountReceived.toFixed(2)}. Data: ${paymentDate}.`
    );
    this.notify();
  }

  public updateReceitaSaude(saleId: string, installmentId: string, status: ReceitaSaudeStatus, identifier: string) {
    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;
      const updated = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;
        return {
          ...inst,
          receitaSaudeStatus: status,
          receitaSaudeId: identifier,
          receitaSaudeEmittedAt: status === 'EMITIDO' ? new Date().toISOString() : undefined,
        };
      });
      return { ...sale, installments: updated };
    });
    saveItem(STORAGE_KEYS.SALES, this.sales);
    this.log('EMISSAO_RECEITA_SAUDE', 'INSTALLMENT', installmentId, `Status Receita Saúde atualizado para ${status} (ID: ${identifier}).`);
    this.notify();
  }

  public updateNfse(saleId: string, status: Sale['nfseStatus'], number: string, code?: string) {
    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;
      return {
        ...sale,
        nfseStatus: status,
        nfseNumber: number,
        nfseVerificationCode: code,
        nfseEmittedAt: status === 'EMITIDA' ? new Date().toISOString() : undefined,
      };
    });
    saveItem(STORAGE_KEYS.SALES, this.sales);
    this.log('EMISSAO_NFSE', 'SALE', saleId, `NFS-e atualizada para ${status} (Número: ${number}).`);
    this.notify();
  }

  // Receivables Actions (Exclusão e Edição de Parcelas / Contas a Receber)
  public deleteReceivableInstallment(installmentId: string): boolean {
    let affected = false;
    const updatedSales: Sale[] = [];

    for (const sale of this.sales) {
      const hasInst = sale.installments.some((inst) => inst.id === installmentId);
      if (!hasInst) {
        updatedSales.push(sale);
        continue;
      }

      affected = true;
      const remainingInstallments = sale.installments.filter((inst) => inst.id !== installmentId);

      // Se a venda não tem mais nenhuma parcela, exclui a venda
      if (remainingInstallments.length === 0) {
        this.log('EXCLUSAO_RECEIVABLE', 'INSTALLMENT', installmentId, `Última parcela da venda "${sale.procedureName}" excluída. Venda removida.`);
        continue;
      }

      // Se restam parcelas, renumera e recalcula valor total
      const renumbered = remainingInstallments.map((inst, idx) => ({
        ...inst,
        installmentNumber: idx + 1,
        totalInstallments: remainingInstallments.length,
      }));

      const newTotalValue = renumbered.reduce((sum, inst) => sum + inst.value, 0);

      updatedSales.push({
        ...sale,
        totalValue: newTotalValue,
        installmentsCount: renumbered.length,
        installments: renumbered,
      });

      this.log(
        'EXCLUSAO_RECEIVABLE',
        'INSTALLMENT',
        installmentId,
        `Parcela excluída do contas a receber da venda "${sale.procedureName}". Restam ${renumbered.length} parcela(s).`
      );
    }

    if (affected) {
      this.sales = updatedSales;
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.notify();
      return true;
    }
    return false;
  }

  public batchDeleteReceivables(installmentIds: string[]): number {
    const idSet = new Set(installmentIds);
    let deletedCount = 0;
    const updatedSales: Sale[] = [];

    for (const sale of this.sales) {
      const matched = sale.installments.filter((inst) => idSet.has(inst.id));
      if (matched.length === 0) {
        updatedSales.push(sale);
        continue;
      }

      deletedCount += matched.length;
      const remaining = sale.installments.filter((inst) => !idSet.has(inst.id));

      if (remaining.length === 0) {
        continue; // Venda inteira removida
      }

      const renumbered = remaining.map((inst, idx) => ({
        ...inst,
        installmentNumber: idx + 1,
        totalInstallments: remaining.length,
      }));

      const newTotal = renumbered.reduce((sum, inst) => sum + inst.value, 0);

      updatedSales.push({
        ...sale,
        totalValue: newTotal,
        installmentsCount: renumbered.length,
        installments: renumbered,
      });
    }

    if (deletedCount > 0) {
      this.sales = updatedSales;
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log(
        'EXCLUSAO_RECEIVABLE_LOTE',
        'INSTALLMENT',
        'batch',
        `${deletedCount} parcelas de contas a receber excluídas em lote.`
      );
      this.notify();
    }

    return deletedCount;
  }

  public batchUpdateReceivables(
    installmentIds: string[],
    updates: {
      dueDate?: string;
      taxOrigin?: TaxOrigin;
      status?: InstallmentStatus;
      paymentDate?: string;
      paymentMethod?: PaymentMethod;
      bankAccountId?: string;
    }
  ): number {
    const idSet = new Set(installmentIds);
    let updatedCount = 0;

    this.sales = this.sales.map((sale) => {
      let saleHasMatch = false;
      const updatedInstallments = sale.installments.map((inst) => {
        if (!idSet.has(inst.id)) return inst;

        saleHasMatch = true;
        updatedCount++;

        const isSettling = updates.status === 'RECEBIDO';
        const receivedValue = isSettling ? inst.value : inst.amountReceived;
        const pDate = isSettling
          ? updates.paymentDate || new Date().toISOString().split('T')[0]
          : inst.paymentDate;
        const pMethod = updates.paymentMethod || inst.paymentMethod || sale.paymentMethod;
        const bAccount = updates.bankAccountId || inst.bankAccountId;

        return {
          ...inst,
          dueDate: updates.dueDate || inst.dueDate,
          status: updates.status || inst.status,
          paymentDate: pDate,
          paymentMethod: pMethod,
          bankAccountId: bAccount,
          amountReceived: receivedValue,
        };
      });

      if (!saleHasMatch) return sale;

      return {
        ...sale,
        taxOrigin: updates.taxOrigin || sale.taxOrigin,
        installments: updatedInstallments,
      };
    });

    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log(
        'ATUALIZACAO_RECEIVABLE_LOTE',
        'INSTALLMENT',
        'batch',
        `${updatedCount} parcelas de contas a receber atualizadas em lote.`
      );
      this.notify();
    }

    return updatedCount;
  }

  public getSaleById(saleId: string): Sale | undefined {
    return this.sales.find((s) => s.id === saleId);
  }

  public updateReceivableInstallment(
    installmentId: string,
    updates: {
      dueDate?: string;
      value?: number;
      taxOrigin?: TaxOrigin;
      status?: InstallmentStatus;
      paymentDate?: string;
      paymentMethod?: PaymentMethod;
      bankAccountId?: string;
      receitaSaudeId?: string;
      receitaSaudeStatus?: ReceitaSaudeStatus;
      nfseNumber?: string;
    }
  ): boolean {
    let affected = false;
    this.sales = this.sales.map((sale) => {
      const hasInst = sale.installments.some((i) => i.id === installmentId);
      if (!hasInst) return sale;

      affected = true;
      const updatedInstallments = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;

        const isSettled = updates.status === 'RECEBIDO';
        const newVal = updates.value !== undefined ? updates.value : inst.value;
        const newReceived = isSettled ? newVal : (updates.status === 'A_RECEBER' ? 0 : inst.amountReceived);

        return {
          ...inst,
          dueDate: updates.dueDate || inst.dueDate,
          value: newVal,
          status: updates.status || inst.status,
          paymentDate: updates.paymentDate !== undefined ? updates.paymentDate : inst.paymentDate,
          paymentMethod: updates.paymentMethod || inst.paymentMethod,
          bankAccountId: updates.bankAccountId || inst.bankAccountId,
          amountReceived: newReceived,
          receitaSaudeId: updates.receitaSaudeId !== undefined ? updates.receitaSaudeId : inst.receitaSaudeId,
          receitaSaudeStatus: updates.receitaSaudeStatus || inst.receitaSaudeStatus,
        };
      });

      const newTotal = updatedInstallments.reduce((acc, curr) => acc + curr.value, 0);

      return {
        ...sale,
        totalValue: newTotal,
        taxOrigin: updates.taxOrigin || sale.taxOrigin,
        nfseNumber: updates.nfseNumber !== undefined ? updates.nfseNumber : sale.nfseNumber,
        installments: updatedInstallments,
      };
    });

    if (affected) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log('ATUALIZACAO_RECEIVABLE', 'INSTALLMENT', installmentId, 'Parcela de conta a receber atualizada com sucesso.');
      this.notify();
      return true;
    }
    return false;
  }

  // Expense Actions
  public addExpense(expenseData: Omit<Expense, 'id' | 'orgId' | 'createdAt'>): Expense {
    const newExpense: Expense = {
      ...expenseData,
      id: `exp_${Date.now()}`,
      orgId: this.org.id,
      createdAt: new Date().toISOString(),
    };
    this.expenses = [newExpense, ...this.expenses];
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
    this.log(
      'CRIACAO_DESPESA',
      'EXPENSE',
      newExpense.id,
      `Despesa ${newExpense.categoryName} no valor de R$ ${newExpense.value.toFixed(2)} cadastrada.`
    );
    this.notify();
    return newExpense;
  }

  public payExpense(id: string, paymentDate: string, paymentMethod: PaymentMethod, bankAccountId?: string) {
    this.expenses = this.expenses.map((exp) => {
      if (exp.id !== id) return exp;
      return {
        ...exp,
        status: 'PAGO',
        paymentDate,
        paymentMethod,
        bankAccountId,
      };
    });
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
    this.log('PAGAMENTO_DESPESA', 'EXPENSE', id, `Despesa marcada como paga em ${paymentDate}.`);
    this.notify();
  }

  public updateExpense(id: string, updates: Partial<Expense>) {
    this.expenses = this.expenses.map((exp) => (exp.id === id ? { ...exp, ...updates } : exp));
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
    this.log('ATUALIZACAO_DESPESA', 'EXPENSE', id, `Dados da despesa atualizados.`);
    this.notify();
  }

  public deleteExpense(id: string) {
    this.expenses = this.expenses.filter((e) => e.id !== id);
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
    this.log('EXCLUSAO_DESPESA', 'EXPENSE', id, `Despesa excluída.`);
    this.notify();
  }

  public batchDeleteExpenses(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.expenses.length;
    this.expenses = this.expenses.filter((e) => !idSet.has(e.id));
    const deletedCount = prevLen - this.expenses.length;
    if (deletedCount > 0) {
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
      this.log('EXCLUSAO_DESPESA_LOTE', 'EXPENSE', 'batch', `${deletedCount} despesas excluídas em lote.`);
      this.notify();
    }
    return deletedCount;
  }

  public batchUpdateExpenses(ids: string[], updates: Partial<Expense>): number {
    const idSet = new Set(ids);
    let updatedCount = 0;
    this.expenses = this.expenses.map((e) => {
      if (idSet.has(e.id)) {
        updatedCount++;
        return { ...e, ...updates };
      }
      return e;
    });
    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
      this.log('ATUALIZACAO_DESPESA_LOTE', 'EXPENSE', 'batch', `${updatedCount} despesas atualizadas em lote.`);
      this.notify();
    }
    return updatedCount;
  }

  // Procedure Actions (Tabela de Procedimentos e Precificação)
  public getProcedures(): DentalProcedure[] {
    return this.procedures;
  }

  public addProcedure(procData: Omit<DentalProcedure, 'id'>): DentalProcedure {
    const newProc: DentalProcedure = {
      ...procData,
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.procedures = [newProc, ...this.procedures];
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
    this.log(
      'CRIACAO_PROCEDIMENTO',
      'PROCEDURE',
      newProc.id,
      `Procedimento "${newProc.name}" (${newProc.category}) cadastrado com preço de tabela R$ ${newProc.defaultPrice.toFixed(2)}.`
    );
    this.notify();
    return newProc;
  }

  public updateProcedure(id: string, updates: Partial<DentalProcedure>): DentalProcedure | null {
    let updated: DentalProcedure | null = null;
    this.procedures = this.procedures.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...updates };
        return updated;
      }
      return p;
    });
    if (updated) {
      saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
      this.log('ATUALIZACAO_PROCEDIMENTO', 'PROCEDURE', id, `Procedimento "${(updated as DentalProcedure).name}" atualizado.`);
      this.notify();
    }
    return updated;
  }

  public deleteProcedure(id: string): boolean {
    const prevLen = this.procedures.length;
    this.procedures = this.procedures.filter((p) => p.id !== id);
    if (this.procedures.length !== prevLen) {
      saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
      this.log('EXCLUSAO_PROCEDIMENTO', 'PROCEDURE', id, `Procedimento excluído do catálogo.`);
      this.notify();
      return true;
    }
    return false;
  }

  public batchDeleteProcedures(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.procedures.length;
    this.procedures = this.procedures.filter((p) => !idSet.has(p.id));
    const count = prevLen - this.procedures.length;
    if (count > 0) {
      saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
      this.log('EXCLUSAO_PROCEDIMENTO_LOTE', 'PROCEDURE', 'batch', `${count} procedimentos excluídos em lote.`);
      this.notify();
    }
    return count;
  }

  public resetProceduresToDemo() {
    this.procedures = DEMO_PROCEDURES;
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
    this.log('RESET_PROCEDIMENTOS', 'PROCEDURE', 'all', `Catálogo de procedimentos restaurado para os padrões clínicos.`);
    this.notify();
  }

  // Clinical Inputs Actions (Catálogo de Insumos & Materiais Clínicos)
  public getClinicalInputs(): ClinicalInput[] {
    return this.clinicalInputs;
  }

  public addClinicalInput(data: Omit<ClinicalInput, 'id'>): ClinicalInput {
    const newInput: ClinicalInput = {
      ...data,
      id: `inp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.clinicalInputs = [newInput, ...this.clinicalInputs];
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
    this.log(
      'CRIACAO_INSUMO',
      'EXPENSE',
      newInput.id,
      `Insumo "${newInput.name}" (${newInput.usageUnit}) cadastrado. Custo: R$ ${newInput.unitCost.toFixed(3)}/${newInput.usageUnit}.`
    );
    this.notify();
    return newInput;
  }

  public updateClinicalInput(id: string, updates: Partial<ClinicalInput>): ClinicalInput | null {
    let updated: ClinicalInput | null = null;
    this.clinicalInputs = this.clinicalInputs.map((item) => {
      if (item.id === id) {
        updated = { ...item, ...updates };
        return updated;
      }
      return item;
    });

    if (updated) {
      saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
      this.log('ATUALIZACAO_INSUMO', 'EXPENSE', id, `Insumo "${(updated as ClinicalInput).name}" atualizado.`);
      this.notify();
    }
    return updated;
  }

  public deleteClinicalInput(id: string): boolean {
    const prevLen = this.clinicalInputs.length;
    this.clinicalInputs = this.clinicalInputs.filter((item) => item.id !== id);
    if (this.clinicalInputs.length !== prevLen) {
      saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
      this.log('EXCLUSAO_INSUMO', 'EXPENSE', id, `Insumo excluído do catálogo.`);
      this.notify();
      return true;
    }
    return false;
  }

  public batchDeleteClinicalInputs(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.clinicalInputs.length;
    this.clinicalInputs = this.clinicalInputs.filter((item) => !idSet.has(item.id));
    const count = prevLen - this.clinicalInputs.length;
    if (count > 0) {
      saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
      this.log('EXCLUSAO_INSUMO_LOTE', 'EXPENSE', 'batch', `${count} insumos excluídos em lote.`);
      this.notify();
    }
    return count;
  }

  public resetClinicalInputsToDemo() {
    this.clinicalInputs = DEMO_CLINICAL_INPUTS;
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
    this.log('RESET_INSUMOS', 'EXPENSE', 'all', `Catálogo de insumos restaurado para a tabela padrão.`);
    this.notify();
  }

  // Category Actions
  public addCategory(cat: Omit<ExpenseCategory, 'id'>): ExpenseCategory {
    const newCat: ExpenseCategory = {
      ...cat,
      id: `cat_${Date.now()}`,
    };
    this.categories = [...this.categories, newCat];
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    this.log('CRIACAO_CATEGORIA', 'CATEGORY', newCat.id, `Categoria ${newCat.name} adicionada ao Plano de Contas.`);
    this.notify();
    return newCat;
  }

  public updateCategory(id: string, updates: Partial<ExpenseCategory>) {
    this.categories = this.categories.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    this.log('ATUALIZACAO_CATEGORIA', 'CATEGORY', id, `Classificação ou atributos da categoria alterados.`);
    this.notify();
  }

  public resetChartOfAccounts(): ExpenseCategory[] {
    this.categories = [...INITIAL_CHART_OF_ACCOUNTS];
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    this.log(
      'RESET_PLANO_CONTAS',
      'CATEGORY',
      'all',
      'Plano de contas padronizado restaurado com todas as categorias e grupos operacionais descritivos.'
    );
    this.notify();
    return this.categories;
  }

  // Payroll Actions
  public updatePayrollHistory(entries: PayrollHistoryEntry[]) {
    this.payrollHistory = entries;
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory);
    this.log('ATUALIZACAO_FOLHA', 'PAYROLL', 'all', `Histórico de folha de salários atualizado.`);
    this.notify();
  }

  // Test Runner / Reset to Demo
  public resetToDemo() {
    this.org = DEMO_ORGANIZATION;
    this.user = DEMO_USER;
    this.professional = DEMO_PROFESSIONAL;
    this.patients = DEMO_PATIENTS;
    const augmented = augmentYearlyDataset(DEMO_SALES, DEMO_EXPENSES, 2025);
    this.sales = augmented.sales;
    this.expenses = augmented.expenses;
    this.categories = INITIAL_CHART_OF_ACCOUNTS;
    this.bankAccounts = DEMO_BANK_ACCOUNTS;
    this.payrollHistory = DEMO_PAYROLL_HISTORY;
    this.taxRulesPf = DEFAULT_TAX_RULES_PF;
    this.taxRulesSimples = DEFAULT_TAX_RULES_SIMPLES;
    this.procedures = DEMO_PROCEDURES;
    this.clinicalInputs = DEMO_CLINICAL_INPUTS;

    saveItem(STORAGE_KEYS.ORGANIZATION, this.org);
    saveItem(STORAGE_KEYS.USER, this.user);
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional);
    saveItem(STORAGE_KEYS.PATIENTS, this.patients);
    saveItem(STORAGE_KEYS.SALES, this.sales);
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts);
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory);
    saveItem(STORAGE_KEYS.TAX_RULES_PF, this.taxRulesPf);
    saveItem(STORAGE_KEYS.TAX_RULES_SIMPLES, this.taxRulesSimples);
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);

    this.log('RESET_DEMO', 'SYSTEM', 'all', 'Dados de demonstração restaurados para estado padrão.');
    this.notify();
  }

  // Scenario quick toggles for section 18 mandatory testing:
  public setFatorRScenario(above28: boolean) {
    if (above28) {
      // Set folha to 84k with RBT12 280k -> 30% (Anexo III)
      this.professional.folha12MesesInicial = 84000;
      this.professional.rbt12Inicial = 280000;
      this.payrollHistory = this.payrollHistory.map((p) => ({
        ...p,
        totalPayroll: 7000,
      }));
    } else {
      // Set folha to 42k with RBT12 280k -> 15% (Anexo V)
      this.professional.folha12MesesInicial = 42000;
      this.professional.rbt12Inicial = 280000;
      this.payrollHistory = this.payrollHistory.map((p) => ({
        ...p,
        totalPayroll: 3500,
        proLabore: 2000,
      }));
    }
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional);
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory);
    this.log(
      'CENARIO_TESTE_FATOR_R',
      'SIMPLES',
      above28 ? 'ANEXO_III' : 'ANEXO_V',
      `Cenário alterado para Fator R ${above28 ? '>= 28% (Anexo III)' : '< 28% (Anexo V)'}.`
    );
    this.notify();
  }
}

export const db = DentalFinanceDB.getInstance();
