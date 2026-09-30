-- ============================================================================
-- MIGRATION: 20260929150000_expense_recurrence_series.sql
-- DESCRIÇÃO: Modelo de despesa RECORRENTE como SÉRIE ABERTA (sem quantidade total de ocorrências),
-- separado de PARCELADA (finita, installment_group_id/total_installments — inalterada aqui).
--
-- Antes: uma despesa "Recorrente" era criada como N despesas finitas (2 a 60, escolhidas na tela),
-- cada uma com "(i/N)" na descrição — visualmente idêntica a um parcelamento. Depois desta migration:
-- 1) nova tabela df_expense_recurrences guarda o TEMPLATE da série (valor/categoria/conta/atributos
--    fiscais padrão, data de início, intervalo em meses, status ACTIVE/ENDED);
-- 2) df_expenses ganha interval_months (denormalizado por ocorrência, para exibir a periodicidade
--    sem precisar de join — cada ocorrência guarda o intervalo vigente no momento em que foi gerada);
-- 3) as 9 séries recorrentes reais já existentes (2 tenants: Bizone Odontologia LTDA e a clínica
--    clinic_1789405023533_phq5) são retroativamente convertidas em templates ACTIVE — NENHUMA linha
--    de df_expenses é apagada ou recriada, só a coluna `description` tem o sufixo cosmético "(i/j)"
--    removido (dado sempre foi só texto de exibição, nunca chave). Ver relatório da sessão: decisão
--    de manter as séries ACTIVE (continuam gerando) documentada lá — o "recurrence_count" antigo
--    (2 a 60) era só um teto arbitrário de projeção, nunca um fim de contrato real.
-- PARCELADA não é tocada por esta migration em nenhum ponto.
--
-- Aplicar via: npx supabase db query --linked -f supabase/migrations/20260929150000_expense_recurrence_series.sql
-- NUNCA usar supabase db push/migration repair neste projeto (ver CLAUDE.md).
-- ============================================================================

-- 1. Tabela de séries recorrentes (o TEMPLATE — não é uma despesa em si)
CREATE TABLE IF NOT EXISTS public.df_expense_recurrences (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  description text NOT NULL,
  supplier_name text,
  supplier_cpf_cnpj text,
  category_id text NOT NULL,
  category_code text,
  category_name text,
  group_code text,
  group_name text,
  sub_category text,
  value numeric NOT NULL,
  entity text NOT NULL DEFAULT 'CPF',
  split_percentage_cpf numeric,
  split_percentage_cnpj numeric,
  payment_method text,
  bank_account_id text,
  document_number text,
  notes text,
  dedutivel_livro_caixa_pf text DEFAULT 'SIM',
  impacta_fator_r_pj boolean DEFAULT false,
  despesa_operacional_pj boolean DEFAULT true,
  is_overridden boolean DEFAULT false,
  override_justification text,
  start_date text NOT NULL, -- ISO yyyy-mm-dd como texto, mesmo padrão de df_expenses.due_date/competence_date
  interval_months integer NOT NULL DEFAULT 1 CHECK (interval_months BETWEEN 1 AND 36),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
  ended_at timestamptz,
  ended_by text,
  ended_by_name text,
  last_generated_due_date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_df_expense_recurrences_tenant_status
  ON public.df_expense_recurrences (tenant_id, status);

-- RLS — mesmo padrão exato de df_expenses (20260915_04_rls_sales_expenses.sql)
ALTER TABLE public.df_expense_recurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_expense_recurrences_select_policy ON public.df_expense_recurrences;
DROP POLICY IF EXISTS df_expense_recurrences_insert_policy ON public.df_expense_recurrences;
DROP POLICY IF EXISTS df_expense_recurrences_update_policy ON public.df_expense_recurrences;
DROP POLICY IF EXISTS df_expense_recurrences_delete_policy ON public.df_expense_recurrences;

CREATE POLICY df_expense_recurrences_select_policy ON public.df_expense_recurrences
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_expense_recurrences_insert_policy ON public.df_expense_recurrences
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_expense_recurrences_update_policy ON public.df_expense_recurrences
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_expense_recurrences_delete_policy ON public.df_expense_recurrences
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 2. df_expenses: intervalo denormalizado por ocorrência (exibição sem join; cada ocorrência guarda
--    o intervalo vigente quando foi gerada — editar a série só afeta ocorrências futuras).
ALTER TABLE public.df_expenses
  ADD COLUMN IF NOT EXISTS interval_months integer;

-- Idempotência da geração: nunca duas ocorrências da mesma série no mesmo vencimento.
-- (Auditoria confirmou zero duplicatas existentes antes de criar a constraint.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_expenses_recurrence_due
  ON public.df_expenses (recurrence_id, due_date)
  WHERE recurrence_id IS NOT NULL;

-- 3. Backfill das 9 séries recorrentes reais já existentes (agrupadas por tenant_id + recurrence_id;
--    template = a ocorrência de MENOR due_date do grupo, description sem o sufixo "(i/j)").
INSERT INTO public.df_expense_recurrences (
  id, tenant_id, description, supplier_name, supplier_cpf_cnpj, category_id, category_code,
  category_name, group_code, group_name, sub_category, value, entity, split_percentage_cpf,
  split_percentage_cnpj, bank_account_id, document_number, notes, dedutivel_livro_caixa_pf,
  impacta_fator_r_pj, despesa_operacional_pj, is_overridden, override_justification,
  start_date, interval_months, status, last_generated_due_date, created_at, updated_at
)
SELECT DISTINCT ON (tenant_id, recurrence_id)
  recurrence_id,
  tenant_id,
  regexp_replace(description, '\s*\(\d+/\d+\)\s*$', ''),
  supplier_name,
  supplier_cpf_cnpj,
  category_id,
  category_code,
  category_name,
  group_code,
  group_name,
  sub_category,
  value,
  entity,
  split_percentage_cpf,
  split_percentage_cnpj,
  bank_account_id,
  document_number,
  notes,
  COALESCE(dedutivel_livro_caixa_pf, 'SIM'),
  COALESCE(impacta_fator_r_pj, false),
  COALESCE(despesa_operacional_pj, true),
  COALESCE(is_overridden, false),
  override_justification,
  due_date,                                                 -- start_date = 1ª ocorrência do grupo
  1,                                                          -- única frequência em uso hoje é MENSAL
  'ACTIVE',
  (SELECT max(e2.due_date) FROM public.df_expenses e2
     WHERE e2.recurrence_id = e1.recurrence_id AND e2.tenant_id = e1.tenant_id),
  now(),
  now()
FROM public.df_expenses e1
WHERE recurrence_id IS NOT NULL
ORDER BY tenant_id, recurrence_id, due_date ASC
ON CONFLICT (id) DO NOTHING;

-- 4. Preenche interval_months = 1 em todas as ocorrências legadas (todas MENSAL na auditoria) e
--    limpa o sufixo cosmético "(i/j)" da descrição (o dado real — valor, datas, status, pagamento,
--    conta, atributos fiscais — não muda em nenhuma linha).
UPDATE public.df_expenses
   SET interval_months = 1
 WHERE recurrence_id IS NOT NULL
   AND interval_months IS NULL;

UPDATE public.df_expenses
   SET description = regexp_replace(description, '\s*\(\d+/\d+\)\s*$', '')
 WHERE recurrence_id IS NOT NULL
   AND description ~ '\(\d+/\d+\)\s*$';

-- recurrence_count/recurrence_index não representam mais nada no modelo aberto (não há "total");
-- mantidos como colunas (histórico/compat), só zerados para não confundir leitura direta do banco.
UPDATE public.df_expenses
   SET recurrence_count = NULL,
       recurrence_index = NULL
 WHERE recurrence_id IS NOT NULL;
