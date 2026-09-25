-- Simplificação de Insumos, Precificação e Simulação de cartão.
-- 100% ADITIVA e idempotente (ADD COLUMN IF NOT EXISTS): nenhuma linha existente muda, nenhum valor é reescrito.
--  * df_system_preferences.pricing_settings — parâmetros de precificação da clínica (hora clínica, custo/hora da
--    estrutura, margem-alvo). NULL = clínica ainda não configurou (a UI usa os padrões históricos, sem julgamento).
--  * df_clinical_inputs.package_type — tipo de embalagem de compra ("Caixa", "Frasco"...). NULL em cadastros antigos.
--  * df_procedures.structure_cost_per_hour — custo/hora da estrutura usado no procedimento (snapshot). NULL = 0.
ALTER TABLE public.df_system_preferences ADD COLUMN IF NOT EXISTS pricing_settings jsonb;
ALTER TABLE public.df_clinical_inputs   ADD COLUMN IF NOT EXISTS package_type text;
ALTER TABLE public.df_procedures        ADD COLUMN IF NOT EXISTS structure_cost_per_hour numeric;
