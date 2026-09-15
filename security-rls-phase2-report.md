# RELATÓRIO DE SEGURANÇA — FASE 2: RLS MULTI-TENANT DENTAL FINANCE

**Data**: 15 de Setembro de 2026  
**Branch de Execução**: `security/rls-phase-2`  
**Commit Base**: `2cfb6e11df6db7f0c13d9d769c25ca0beb86ecf0`  
**Status**: CONCLUÍDO COM 100% DE SUCESSO  

---

## 1. Contexto e Objetivo

A Fase 1 substituiu o modelo de autenticação inseguro pelo Supabase Auth oficial (`@supabase/supabase-js`). No entanto, as tabelas do Dental Finance (`df_*`) ainda continham políticas RLS permissivas herdadas, tais como:
```sql
USING (true) WITH CHECK (true);
```
O objetivo mandatário da **Fase 2** foi eliminar totalmente essa vulnerabilidade, garantindo isolamento estrito no próprio PostgreSQL via Row Level Security (RLS), de modo que:
- Usuários anônimos (`anon`) são 100% bloqueados em todas as entidades privadas do Dental Finance.
- O usuário autenticado do Tenant A acessa estritamente dados do Tenant A.
- Tentativas de IDOR, injeção de tenant arbitrário, adulteração de `localStorage` ou manipulação de `role` no frontend são rejeitadas pelo banco de dados.
- Relações cruzadas (ex: agendar paciente de outro tenant ou pagar com banco de outro tenant) são barradas por gatilhos de integridade no banco.
- Todas as regras de negócio, rotinas financeiras e a integração Contábilex continuam 100% íntegras.

---

## 2. Cadeia Canônica de Autorização

A autorização não depende de payloads enviados pelo navegador nem de variáveis no `localStorage`. Ela é derivada exclusivamente pelo PostgreSQL a partir do JWT oficial assinado emitido pelo Supabase Auth:

$$\text{auth.uid()} \longrightarrow \text{public.df\_users.auth\_user\_id} \longrightarrow \text{df\_users.clinic\_id} \longrightarrow \text{tenant\_id}$$

### Funções Auxiliares Criadas (SECURITY DEFINER)
Para evitar recursão infinita ao consultar `df_users` dentro das políticas das tabelas filhas e garantir desempenho ótimo:
1. `public.current_dental_tenant_id()`: Retorna o `clinic_id` autorizado do usuário autenticado (`auth.uid()`).
2. `public.is_dental_tenant_member(p_tenant_id text)`: Valida se o `p_tenant_id` pertence ao usuário autenticado ativo no banco.
Ambas as funções utilizam `SET search_path = public, pg_temp`, tiveram permissões revogadas para `PUBLIC` e concedidas apenas para o papel `authenticated`.

---

## 3. Migrations Executadas

As alterações de esquema e políticas foram particionadas em migrations numeradas e versionadas:

| Arquivo | Escopo | Ação Principal |
| :--- | :--- | :--- |
| `20260915_00_rls_helpers.sql` | Helpers & Índices | Criação das funções `current_dental_tenant_id`, `is_dental_tenant_member` e 9 índices de performance em `tenant_id` / `clinic_id`. |
| `20260915_01_rls_identity.sql` | Grupo 1: Identidade | RLS em `df_users` (`auth_user_id = auth.uid()`), `df_tenants` e `df_professionals`. |
| `20260915_02_rls_patients_agenda.sql` | Grupos 2 e 3: Clínico | RLS em `df_patients` e `df_appointments`. Remoção de policies permissivas. |
| `20260915_03_rls_procedures_inventory.sql` | Grupos 4 e 5: Custos & Estoque | RLS em `df_procedures` e `df_clinical_inputs`. |
| `20260915_04_rls_sales_expenses.sql` | Grupos 6, 7, 8 e 9: Financeiro | RLS em `df_sales` (vendas e contas a receber) e `df_expenses` (despesas, contas a pagar e recorrências). |
| `20260915_05_rls_banks.sql` | Grupo 10: Bancos | RLS em `df_bank_accounts`. |
| `20260915_06_rls_settings_audit_payroll.sql` | Grupos 13, 16 e 17: Ajustes & Auditoria | RLS em `df_payroll_history`, `df_system_preferences`, `df_accounting_confirmations` e `df_audit_logs` (imutabilidade: UPDATE/DELETE bloqueados). |
| `20260915_07_rls_cross_tenant_integrity.sql` | Integridade Cruzada | Trigger `fn_enforce_dental_cross_tenant_integrity` em `df_appointments`, `df_sales` e `df_expenses`. |

---

## 4. Auditoria de Políticas Permissivas Removidas

Todas as políticas legadas permissivas foram completamente eliminadas:
* `df_users_policy` (removida)
* `df_tenants_policy` (removida)
* `df_professionals_policy` (removida)
* `df_patients_policy` (removida)
* `df_appointments_policy` (removida)
* `df_procedures_policy` (removida)
* `df_clinical_inputs_policy` (removida)
* `df_sales_policy` (removida)
* `df_expenses_policy` (removida)
* `df_bank_accounts_policy` (removida)
* `df_payroll_history_policy` (removida)
* `df_system_preferences_policy` (removida)
* `df_audit_logs_policy` (removida)
* `Allow all for df_accounting_confirmations` (removida)

Consulta a `pg_policies` confirmou que **zero** políticas permissivas `USING (true)` permanecem em tabelas `df_*`.

---

## 5. Matriz de Resultados dos Testes de Autorização (AUTHZ-01 a AUTHZ-18)

A suíte automatizada `tests/security/rlsPhase2.test.ts` foi executada contra o banco real, produzindo aprovação unânime (18/18):

| Teste | Descrição | Resultado | Detalhe |
| :--- | :--- | :--- | :--- |
| **AUTHZ-01** | Anon $\to$ `df_users` | ✅ **PASS** | 0 rows retornadas / acesso negado |
| **AUTHZ-02** | Anon $\to$ `df_patients` | ✅ **PASS** | 0 rows retornadas / acesso negado |
| **AUTHZ-03** | Anon $\to$ `df_sales` | ✅ **PASS** | 0 rows retornadas / acesso negado |
| **AUTHZ-04** | Anon $\to$ `df_expenses` | ✅ **PASS** | 0 rows retornadas / acesso negado |
| **AUTHZ-05** | Daniel $\to$ Pacientes Daniel | ✅ **PASS** | 2 pacientes retornados com sucesso |
| **AUTHZ-06** | Daniel $\to$ Pacientes Leonardo | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-07** | Daniel INSERT tenant Leonardo | ✅ **PASS** | Bloqueado por violação de RLS |
| **AUTHZ-08** | Daniel UPDATE registro Leonardo | ✅ **PASS** | 0 rows afetadas |
| **AUTHZ-09** | Daniel $\to$ Vendas Leonardo | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-10** | Daniel $\to$ Despesas Leonardo | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-11** | Daniel $\to$ Banco Leonardo | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-12** | Daniel $\to$ Agenda Leonardo | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-13** | Daniel $\to$ Procedimentos Leonardo | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-14** | Leonardo $\to$ Leonardo | ✅ **PASS** | Dados próprios acessados com sucesso |
| **AUTHZ-15** | Leonardo $\to$ Daniel | ✅ **PASS** | 0 rows retornadas |
| **AUTHZ-16** | SELECT sem filtro de tenant | ✅ **PASS** | 100% dos dados restritos ao tenant autenticado |
| **AUTHZ-17** | Tampering de LocalStorage | ✅ **PASS** | Banco ignora storage e resolve tenant via `auth.uid()` |
| **AUTHZ-18** | Tampering de Role / Tenant | ✅ **PASS** | Bloqueado por WITH CHECK na `df_users` |
| **CROSS-01** | Integridade Cruzada (FK Fake) | ✅ **PASS** | Trigger barrou agendamento com paciente de outro tenant |

---

## 6. Validação de Não-Regressão Funcional

* **Autenticação (`tests/verify_phase0_phase1.ts`)**: **15/15 PASS**
* **Módulos Funcionais (`tests/verify_13_modules.ts`)**: **13/13 PASS**
  * Pacientes (2), Agenda (1), Procedimentos (2), Insumos (0), Vendas (2), Recebíveis (ativos), Despesas (13), Pagáveis (ativos), Recorrências (série de 12 meses ativa), Contas Bancárias (3), Impostos/Fator R e Integração Contábilex.
* **Integração Contábilex**:
  * 11 Snapshots contábeis carregados com sucesso via RPC `get_dental_tenant_snapshots`.
  * Fator R calculado com precisão em tempo real (RBT12: R$ 340.533,20 | FS12: R$ 60.118,27 | Fator R: 17,65% - Anexo V).
* **Compilação e Tipagem**:
  * `npm run lint` (`tsc --noEmit`): 0 erros.
  * `npm run build`: Build de produção concluído com sucesso em 7.32s.

---

## 7. Pendências para Fases Futuras

* **Fase 3 — Isolamento Contábilex & Integração**:
  * `public.clients`
  * `public.fiscal_history`
  * `public.payroll_history`
  * `integration_client_links`
  * `accounting_monthly_snapshots`
  * RPC `get_dental_tenant_snapshots`
* **Fase 4 — Endurecimento de Infraestrutura e Frontend**:
  * Headers de segurança HTTP (CSP, HSTS, X-Frame-Options, Referrer-Policy).
  * Storage privado para anexos e descontinuação de Base64.
  * Otimização de bundle e source maps em produção.
