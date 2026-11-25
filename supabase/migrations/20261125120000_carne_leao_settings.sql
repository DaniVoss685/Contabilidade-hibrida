-- Ajustes do Carnê-Leão por clínica (aditiva e idempotente).
--  * df_system_preferences.carne_leao_settings — meses desativados no excesso de Livro Caixa
--    ({ "excessIgnoredMonths": ["2026-09", "2026-10"] }), usado enquanto as receitas de um mês ainda não foram
--    lançadas. NULL = nenhum ajuste (todos os meses entram no excesso, comportamento anterior).
-- Aplicar ANTES de publicar o frontend que grava essa coluna.
ALTER TABLE public.df_system_preferences ADD COLUMN IF NOT EXISTS carne_leao_settings jsonb;
