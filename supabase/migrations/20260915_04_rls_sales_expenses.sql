-- Migration 4: Grupos 6, 7, 8 e 9 — Receitas, Recebíveis, Despesas, Pagáveis e Recorrências (df_sales, df_expenses)

-- 1. df_sales
DROP POLICY IF EXISTS df_sales_policy ON public.df_sales;
DROP POLICY IF EXISTS df_sales_select_policy ON public.df_sales;
DROP POLICY IF EXISTS df_sales_insert_policy ON public.df_sales;
DROP POLICY IF EXISTS df_sales_update_policy ON public.df_sales;
DROP POLICY IF EXISTS df_sales_delete_policy ON public.df_sales;

ALTER TABLE public.df_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_sales_select_policy ON public.df_sales
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_sales_insert_policy ON public.df_sales
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_sales_update_policy ON public.df_sales
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_sales_delete_policy ON public.df_sales
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 2. df_expenses
DROP POLICY IF EXISTS df_expenses_policy ON public.df_expenses;
DROP POLICY IF EXISTS df_expenses_select_policy ON public.df_expenses;
DROP POLICY IF EXISTS df_expenses_insert_policy ON public.df_expenses;
DROP POLICY IF EXISTS df_expenses_update_policy ON public.df_expenses;
DROP POLICY IF EXISTS df_expenses_delete_policy ON public.df_expenses;

ALTER TABLE public.df_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_expenses_select_policy ON public.df_expenses
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_expenses_insert_policy ON public.df_expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_expenses_update_policy ON public.df_expenses
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_expenses_delete_policy ON public.df_expenses
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));
