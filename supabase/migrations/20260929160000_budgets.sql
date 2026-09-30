-- Orçamentos (Fase D) — CRIAR um orçamento NUNCA gera efeito financeiro/fiscal/estoque: sem venda,
-- sem recebível, sem imposto, sem movimento bancário, sem taxa, sem baixa de insumo. Só ao converter
-- explicitamente em venda (ação separada, do usuário) é que o financeiro passa a existir — e mesmo
-- assim por um fluxo próprio (Nova Receita pré-preenchida), não escrito por este módulo diretamente.
--
-- Itens ficam em jsonb (mesmo padrão de df_sales.installments) — não há necessidade de tabela
-- filha própria para um documento de orçamento que é sempre substituído por completo ao editar.

CREATE TABLE IF NOT EXISTS public.df_budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  patient_name TEXT NOT NULL, -- snapshot — mesmo padrão de df_sales/df_appointments
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'APRESENTADO', 'APROVADO', 'RECUSADO', 'EXPIRADO', 'CONVERTIDO')),
  -- items: [{ procedureId?, procedureName, professionalId?, professionalName?, quantity, unitPrice, totalPrice }]
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  -- Idempotência de conversão: preenchido UMA vez, nunca sobrescrito — é o que impede gerar venda 2x
  -- (a UI também bloqueia o botão, mas a garantia real é este campo + o guard em db.ts).
  converted_sale_id TEXT,
  converted_at TIMESTAMPTZ,
  presented_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ, -- quando foi aprovado ou recusado
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_df_budgets_tenant ON public.df_budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_budgets_patient ON public.df_budgets(patient_id);
CREATE INDEX IF NOT EXISTS idx_df_budgets_status ON public.df_budgets(tenant_id, status);

ALTER TABLE public.df_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "df_budgets_policy" ON public.df_budgets;
CREATE POLICY "df_budgets_policy" ON public.df_budgets
  FOR ALL
  USING (is_dental_tenant_member(tenant_id))
  WITH CHECK (is_dental_tenant_member(tenant_id));
