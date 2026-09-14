# Project: Dental Finance — Auditoria Profunda de UX, Funcionalidades e Consistência Operacional

## Architecture
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide React icons.
- **Persistence & State**: Single-tenant in-memory e localStorage (`src/lib/db.ts` - `DentalFinanceDB`), sem backend remoto.
- **Tax & Financial Engines**: Regras tributárias segregadas em `src/lib/taxEngine.ts` (Simples Nacional, Fator R, Carnê-Leão) e `src/lib/financialEngine.ts` (DRE, margens).
- **Core Modules**:
  - Layout & Navegação: `Header.tsx`, `PeriodFilterBar.tsx`, `Sidebar.tsx`.
  - Financeiro: `ReceivablesView.tsx`, `ExpensesView.tsx`, `SalesView.tsx`, `FinancialDashboard.tsx`, `DreTable.tsx`, `CategoryControlTable.tsx`.
  - Operações & Cadastros: `PatientsView.tsx`, `ProceduresView.tsx`, `SuppliesView.tsx`, `ChartOfAccountsView.tsx`.
  - Fiscal & Parâmetros: `TaxesView.tsx`, `ReportsView.tsx`, `SettingsView.tsx`.
  - UI & Modais: `ConfirmDialog.tsx`, `Modal.tsx`, `CurrencyInput.tsx`, `NewExpenseModal.tsx`, `NewSaleModal.tsx`, etc.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 PeriodPicker Único | Unificar Stepper Pill e seletor em um único componente conceitual sem repetição de mês/ano | M2 | Survey 1 |
| 2 | R1.2 Eliminação de Duplicidades de Período | Remover MonthYearPicker em TaxesView/ReportsView e banners redundantes em SalesView/ReceivablesView/ExpensesView | M2 | Survey 1 |
| 3 | R1.3 Hierarquia Visual do Header | Nova Receita primário teal/emerald, Nova Despesa secundário rose suave | M2 | Survey 1 |
| 4 | R1.4 Estado de Visibilidade do CPF | Pill/botão com estado acessível explícito ("CPF Visível" / "CPF Oculto") | M2 | Survey 1 |
| 5 | R1.5 Label e Contexto do Fator R | Ação no Header com rótulo "Simular Fator R" e contexto claro | M2 | Survey 1 |
| 6 | R1.6 Badge de Pendências Explicativo | Badge com texto "X pendências" e navegação contextual para itens pendentes | M2 | Survey 1 |
| 7 | R1.7 Despoluição do Header | Redução de dados estáticos para evitar compressão dos botões de ação | M2 | Survey 1 |
| 8 | R2.1 Padronização Terminológica Global | "Pessoa Física (CPF)" e "Pessoa Jurídica (CNPJ)" em contextos amplos; "CPF" e "CNPJ" em filtros/badges | M3 | Survey 1 |
| 9 | R2.2 Correção dos Filtros em Contas a Receber | KPIs e somatórios reativos ao filtro CPF/CNPJ, contadores dinâmicos nas abas e limpeza de seleção | M3 | Survey 1 |
| 10 | R2.3 Consistência de Filtros PF/PJ | Aplicar mesma regra e termos padronizados em Contas a Pagar, Receitas, Despesas e Relatórios | M3 | Survey 1 |
| 11 | R3.1 Busca de Pacientes por Nome | Busca imune a maiúsculas/minúsculas e acentos (normalize NFD) | M4 | Survey 2 |
| 12 | R3.2 Busca de Pacientes por CPF/Telefone | Busca exata com ou sem formatação de CPF e com ou sem DDD/pontuação de telefone | M4 | Survey 2 |
| 13 | R3.3 Desativação de Autofill Indesejado | autoComplete="off", autoCorrect="off" e spellCheck={false} em inputs comuns | M4 | Survey 2 |
| 14 | R4.1 Otimização Visual Modal Nova Receita | Balanceamento de espaçamentos verticais e peso visual de badges preservando as 6 etapas mentais | M4 | Survey 2 |
| 15 | R4.2 Reatividade de Documento Nova Despesa | Rótulo e máscara dinâmicos (CPF do Fornecedor vs CNPJ do Fornecedor) | M4 | Survey 2 |
| 16 | R4.3 Proteção Anti-Duplo Clique | Estado isSubmitting com botão desabilitado e indicador "Salvando..." | M4 | Survey 2 |
| 17 | R4.4 Confirmação de Dirty State | Diálogo "Descartar alterações?" em modais editados ao tentar fechar por X, Cancelar, ESC ou clique fora | M4 | Survey 2 |
| 18 | R5.1 Separação de Colunas Contas a Pagar | Colunas distintas "Vencimento" e "Pagamento" com fallback "—" se pendente | M3 | Survey 2 |
| 19 | R5.2 Separação de Colunas Contas a Receber | Colunas distintas "Vencimento" e "Recebimento" com fallback "—" e paymentDate no modelo | M3 | Survey 2 |
| 20 | R5.3 Gestão Completa de Comprovantes | Componente ReceiptUploader com upload PDF/PNG/JPG/JPEG até 5MB, metadados, preview, abertura e remoção | M1, M4 | Survey 2 |
| 21 | R6.1 Sistema Global de Toasts | ToastProvider e useToast com mensagens de sucesso/erro/aviso, substituindo todos os 17 alert() | M1 | Survey 3 |
| 22 | R6.2 Correção do ConfirmDialog | Retrocompatibilidade de props (description/message, onClose/onCancel), estilo vermelho destrutivo | M1 | Survey 3 |
| 23 | R6.3 Acessibilidade Universal de Modais | Suporte a tecla Escape, botão X, Cancelar, backdrop seguro, focus trap e z-index adequado | M1, M4 | Survey 3 |
| 24 | R7.1 CurrencyInput em Configurações | Aplicação de CurrencyInput e formatação BRL para RBT12, Folha 12M, INSS e bases tributárias | M5 | Survey 3 |
| 25 | R7.2 CRUD de Contas Bancárias | Modelo expandido e métodos no db.ts, UI de gerenciamento com separação PF vs PJ | M5 | Survey 3 |
| 26 | R7.3 Cenários Fator R com Antes/Depois | Destaque do card ativo, comparativo Antes -> Depois (Fator R, Anexo, Alíquota, DAS) e rollback seguro | M5 | Survey 3 |
| 27 | R8.1 Guardrails contra NaN/undefined/Infinity | Funções utilitárias safeMargin e safeDivide com prevenção em procedimentos, DRE e tabelas | M1, M5 | Survey 3 |
| 28 | R8.2 Fallback "Aguardando custos" | Exibição explícita de "Aguardando custos" ou "—" em procedimentos sem custos calculados | M5 | Survey 3 |
| 29 | R8.3 Empty States, Loading e Error States | Componentes EmptyState com orientações e botões de ação úteis, LoadingState e ErrorState | M1, M5 | Survey 3 |
| 30 | R-TECH Compilação e Build de Produção | npx tsc --noEmit código 0 e npm run build concluído sem falhas | M6 | Survey 1, 2, 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation: Feedback Global, Diálogos & Componentes UI Reutilizáveis | Sistema de Toasts (`Toast.tsx`, `useToast`), correção de `ConfirmDialog.tsx`, hook de acessibilidade de modais, `ReceiptUploader.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `ErrorState.tsx` e utilitários matemáticos `safeMargin` / `safeDivide` | none | PLANNED |
| M2 | Navegação, Período e Header | Unificação de `PeriodFilterBar.tsx` (cápsula única PeriodPicker), eliminação de MonthYearPicker e banners redundantes nas telas filhas, reestruturação do `Header.tsx` (Nova Receita teal, Nova Despesa rose, estado CPF Visível/Oculto, Simular Fator R, badge pendências) | M1 | PLANNED |
| M3 | Padronização PF/PJ, Filtros & Tabelas Financeiras | Inclusão de `paymentDate` em `AccountReceivableItem` e `db.ts`, correção do bug de filtros e KPIs em `ReceivablesView.tsx`, separação de colunas Vencimento/Recebimento e Vencimento/Pagamento, padronização terminológica global | M1 | PLANNED |
| M4 | Busca de Pacientes, Higienização de Inputs e Modais Operacionais | Correção da busca de pacientes (case/accent-insensitive NFD, CPF com/sem dígitos, telefone), desativação de autocomplete/spellcheck, redução de densidade no Modal Nova Receita, reatividade de documento no Modal Nova Despesa, proteção anti-duplo clique, dirty state e integração do ReceiptUploader | M1 | PLANNED |
| M5 | Configurações, Contas Bancárias e Simulação Tributária Fator R | Refatoração de `SettingsView.tsx` com `CurrencyInput` BRL, expansão do modelo e CRUD completo de Contas Bancárias no `db.ts` e UI (PF vs PJ), simulação Fator R com destaque do card ativo, comparativo Antes -> Depois e rollback seguro, guardrails de NaN e Empty States nas listagens | M1, M3 | PLANNED |
| M6 | Final Milestone: Passagem de 100% da Suíte E2E e Endurecimento | Fase 1: Validação e aprovação de 100% dos testes E2E Tiers 1-4. Fase 2: Endurecimento adversarial Tier 5 com Challengers, auditoria forense de integridade e verificação técnica (`npx tsc --noEmit` zero erros, `npm run build` sucesso) | M1, M2, M3, M4, M5, TEST_READY | PLANNED |

## Interface Contracts
### `ToastContext` ↔ Aplicação Global
- Hook: `useToast()` retornando `{ showToast(msg, type), success(msg), error(msg), warning(msg), info(msg) }`.
- Componente `<ToastProvider>` envolvendo a aplicação em `App.tsx`.
- Tipos de Toast: `'success' | 'error' | 'warning' | 'info'`. Auto-dismiss em 3500ms com botão de fechar.

### `ConfirmDialogProps` ↔ Consumidores
- Suporte unificado a props:
  - `title: string`
  - `description?: string` e alias `message?: string`
  - `confirmLabel?: string`, `cancelLabel?: string`
  - `variant?: 'danger' | 'warning' | 'primary'` (danger renderiza botão vermelho `bg-rose-600 hover:bg-rose-700 text-white`)
  - `onConfirm: () => void`
  - `onClose: () => void` e alias `onCancel?: () => void`
  - Fechamento por tecla `Escape` e clique no backdrop.

### `AccountReceivableItem` & `db.getAccountsReceivable`
- Extensão em `src/types/index.ts`:
  ```typescript
  export interface AccountReceivableItem {
    id: string;
    saleId: string;
    installmentNumber: number;
    totalInstallments: number;
    patientId: string;
    patientName: string;
    patientCpf: string;
    amount: number;
    amountReceived: number;
    balance: number;
    dueDate: string;
    paymentDate?: string; // NOVO: data de efetiva liquidação
    status: 'A_VENCER' | 'VENCIDO' | 'RECEBIDO';
    taxOrigin: 'CPF' | 'CNPJ';
    paymentMethod?: string;
    receiptStatus?: 'PENDING' | 'ISSUED' | 'EXEMPT';
    observations?: string;
  }
  ```

### `BankAccount` & `DentalFinanceDB`
- Extensão em `src/types/index.ts`:
  ```typescript
  export interface BankAccount {
    id: string;
    orgId: string;
    name: string;
    bankName: string;
    accountType: 'CORRENTE_PF' | 'CORRENTE_PJ' | 'POUPANCA' | 'INVESTIMENTO';
    agency?: string;
    accountNumber?: string;
    pixKey?: string;
    pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA';
    isActive: boolean;
    initialBalance: number;
    currentBalance: number;
  }
  ```
- Métodos no `src/lib/db.ts`:
  - `addBankAccount(account: Omit<BankAccount, 'id' | 'orgId' | 'currentBalance'>): BankAccount`
  - `updateBankAccount(id: string, updates: Partial<BankAccount>): BankAccount | null`
  - `toggleBankAccountActive(id: string): BankAccount | null`
  - `deleteBankAccount(id: string): boolean`

### `ReceiptUploader` ↔ Modais de Receita e Despesa
- Componente `src/components/UI/ReceiptUploader.tsx`:
  - Props: `file?: AttachmentMetadata | null`, `onFileChange: (file: AttachmentMetadata | null) => void`, `disabled?: boolean`.
  - Suporte a PDF, PNG, JPG, JPEG (limite 5MB).
  - Preview de imagens, abertura de PDF em nova aba e confirmação prévia via ConfirmDialog na remoção.

### Utilitários Matemáticos (`safeMargin`, `safeDivide`)
- `src/lib/mathUtils.ts`:
  - `safeDivide(numerator: number, denominator: number, fallback = 0): number`
  - `safeMargin(revenue: number, cost: number): { marginPercent: number | null, profit: number, status: 'OK' | 'WAITING_COSTS' | 'NO_PRICE' }`
  - `formatPercent(val: number | null | undefined, fallback = '—'): string`

## Code Layout
- `src/components/UI/`: Componentes base e utilitários visuais (`Toast.tsx`, `ToastContext.tsx`, `ConfirmDialog.tsx`, `Modal.tsx`, `ReceiptUploader.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `ErrorState.tsx`, `CurrencyInput.tsx`).
- `src/components/Layout/`: Navegação global (`Header.tsx`, `PeriodFilterBar.tsx`, `Sidebar.tsx`).
- `src/components/Receivables/`: Contas a Receber (`ReceivablesView.tsx`).
- `src/components/Expenses/`: Contas a Pagar e Despesas (`ExpensesView.tsx`).
- `src/components/Sales/`: Vendas e Receitas (`SalesView.tsx`).
- `src/components/Patients/`: Cadastro de Pacientes (`PatientsView.tsx`).
- `src/components/Settings/`: Configurações, Parâmetros e Bancos (`SettingsView.tsx`).
- `src/components/Modals/`: Modais operacionais (`NewExpenseModal.tsx`, `NewSaleModal.tsx`, etc.).
- `src/lib/`: Motores de cálculo e banco de dados (`db.ts`, `taxEngine.ts`, `financialEngine.ts`, `masks.ts`, `mathUtils.ts`).
- `tests/e2e/`: Testes automatizados opaque-box criados pelo E2E Testing Track.
