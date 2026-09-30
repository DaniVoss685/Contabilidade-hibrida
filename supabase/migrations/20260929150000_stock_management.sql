-- Estoque REAL sobre os Insumos existentes (df_clinical_inputs) — não substitui o catálogo de
-- custos (unit_cost/package_*  continuam intactos), só adiciona quantidade física e mínimo.
-- Aditivo: colunas novas com DEFAULT 0, nenhuma linha existente muda de comportamento até a
-- clínica configurar um mínimo > 0 (ver computeStockStatus em src/lib/stockMovements.ts — mínimo
-- 0 = "não configurado", nunca alerta sozinho).

ALTER TABLE public.df_clinical_inputs
  ADD COLUMN IF NOT EXISTS quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_quantity NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Histórico de movimentações — NUNCA altera quantity_on_hand diretamente por fora daqui (ver
-- trigger fn_apply_stock_movement abaixo). "Não alterar saldo sem histórico" é garantido em
-- banco, não só por convenção de código.
CREATE TABLE IF NOT EXISTS public.df_stock_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  input_id TEXT NOT NULL REFERENCES public.df_clinical_inputs(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('ENTRY', 'PROCEDURE_CONSUMPTION', 'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS', 'REVERSAL')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  balance_after NUMERIC, -- preenchido pelo trigger (nunca pelo cliente) para não haver divergência
  -- Ligação SOMENTE informativa ao atendimento que originou o consumo (PROCEDURE_CONSUMPTION) ou à
  -- consulta que motivou a reversão (REVERSAL) — sem FK: df_clinical_records não usa FK em nenhum
  -- outro lugar deste projeto (permite registros legados/importados com chaves sintéticas).
  clinical_record_id TEXT,
  reason TEXT, -- motivo obrigatório na UI para ADJUSTMENT_PLUS/ADJUSTMENT_MINUS manuais
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotência real: no máximo 1 linha de CADA TIPO por (tenant, prontuário, insumo). Finalizar o
  -- mesmo atendimento duas vezes nunca gera uma segunda PROCEDURE_CONSUMPTION para o mesmo insumo
  -- (NULLs em clinical_record_id — movimentos manuais — nunca colidem entre si no Postgres).
  UNIQUE (tenant_id, clinical_record_id, input_id, movement_type)
);

CREATE INDEX IF NOT EXISTS idx_df_stock_movements_tenant ON public.df_stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_stock_movements_input ON public.df_stock_movements(input_id);
CREATE INDEX IF NOT EXISTS idx_df_stock_movements_record ON public.df_stock_movements(clinical_record_id);

-- Aplica a movimentação ao saldo do insumo de forma ATÔMICA (lock de linha via FOR UPDATE dentro da
-- mesma transação do INSERT) — elimina a corrida de duas movimentações concorrentes no mesmo insumo
-- lendo o mesmo saldo "antes" e uma pisar na outra. balance_after é calculado aqui, nunca enviado
-- pelo cliente.
--
-- IMPORTANTE — precisa ser AFTER INSERT, não BEFORE: um upsert com
-- ON CONFLICT (...) DO NOTHING (é assim que a idempotência de PROCEDURE_CONSUMPTION é aplicada pelo
-- cliente) ainda dispara triggers BEFORE INSERT para a linha que acaba sendo descartada pelo
-- conflito — um BEFORE INSERT aqui aplicaria o delta no estoque MESMO quando nenhuma linha nova é
-- gravada, corrompendo o saldo sem nenhum histórico correspondente (bug real encontrado e corrigido
-- nesta migração antes de ir para produção: ver validação com dados sintéticos no relatório da
-- rodada). AFTER INSERT só dispara para linhas realmente inseridas.
CREATE OR REPLACE FUNCTION fn_apply_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
  current_qty NUMERIC;
  delta NUMERIC;
  new_qty NUMERIC;
BEGIN
  SELECT quantity_on_hand INTO current_qty
  FROM public.df_clinical_inputs
  WHERE id = NEW.input_id AND tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF current_qty IS NULL THEN
    RAISE EXCEPTION 'Insumo % não encontrado no tenant %', NEW.input_id, NEW.tenant_id;
  END IF;

  IF NEW.movement_type IN ('ENTRY', 'ADJUSTMENT_PLUS', 'REVERSAL') THEN
    delta := NEW.quantity;
  ELSE
    delta := -NEW.quantity;
  END IF;
  new_qty := current_qty + delta;

  UPDATE public.df_clinical_inputs
  SET quantity_on_hand = new_qty, updated_at = now()
  WHERE id = NEW.input_id AND tenant_id = NEW.tenant_id;

  UPDATE public.df_stock_movements SET balance_after = new_qty WHERE id = NEW.id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.df_stock_movements;
CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON public.df_stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_apply_stock_movement();

ALTER TABLE public.df_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "df_stock_movements_policy" ON public.df_stock_movements;
CREATE POLICY "df_stock_movements_policy" ON public.df_stock_movements
  FOR ALL
  USING (is_dental_tenant_member(tenant_id))
  WITH CHECK (is_dental_tenant_member(tenant_id));
