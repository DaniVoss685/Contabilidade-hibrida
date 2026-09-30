-- Rastreabilidade Orçamento <-> Venda <-> Agenda. Nenhum ID técnico deve aparecer em telas
-- operacionais (descrição da venda, PDF, listagens) — a origem passa a ser metadata estruturada
-- (coluna própria + FK), nunca texto livre. Ver CLAUDE.md / relatório da rodada "Orçamentos:
-- polir, corrigir, integrar".
--
-- df_sales.budget_id: quando a venda nasce de "Converter em venda" num orçamento aprovado.
-- df_appointments.budget_id: quando a consulta nasce de "Agendar tratamento" num orçamento.
-- Um orçamento pode ter N consultas vinculadas — não existe (nem precisa existir) uma coluna
-- equivalente em df_budgets; a relação é sempre derivada consultando df_appointments por budget_id.
--
-- ON DELETE SET NULL: excluir um orçamento antigo nunca pode derrubar vendas/consultas reais já
-- concluídas — só perde o vínculo de rastreabilidade, preserva o registro financeiro/clínico.

ALTER TABLE public.df_sales
  ADD COLUMN IF NOT EXISTS budget_id TEXT REFERENCES public.df_budgets(id) ON DELETE SET NULL;

ALTER TABLE public.df_appointments
  ADD COLUMN IF NOT EXISTS budget_id TEXT REFERENCES public.df_budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_df_sales_budget_id ON public.df_sales(budget_id) WHERE budget_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_df_appointments_budget_id ON public.df_appointments(budget_id) WHERE budget_id IS NOT NULL;
