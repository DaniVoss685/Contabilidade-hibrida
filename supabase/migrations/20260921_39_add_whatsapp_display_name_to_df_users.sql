-- ==============================================================================
-- MIGRAÇÃO: IDENTIDADE CONFIGURÁVEL DO ATENDENTE NO WHATSAPP (whatsapp_display_name)
-- Data: 2026-09-21
-- Descrição: Adiciona coluna whatsapp_display_name em df_users e saneia dados legados.
-- ==============================================================================

-- 1. Adicionar coluna canônica whatsapp_display_name
ALTER TABLE df_users 
ADD COLUMN IF NOT EXISTS whatsapp_display_name text NULL;

-- 2. Índice para buscas de membros por tenant e nome de exibição
CREATE INDEX IF NOT EXISTS idx_df_users_whatsapp_display_name 
ON df_users (clinic_id, whatsapp_display_name) 
WHERE is_active = true;

-- 3. Atualizar dados conhecidos e confiáveis de usuários legados
-- Leonardo Ricardo Arantes
UPDATE df_users
SET 
  name = 'Leonardo Ricardo Arantes',
  whatsapp_display_name = 'Leonardo Ricardo'
WHERE email = 'leonardoricardoarantes@gmail.com';

-- Handrel
UPDATE df_users
SET 
  whatsapp_display_name = 'Handrel'
WHERE email = 'econtajuridico@gmail.com';

-- Dra. Camila
UPDATE df_users
SET 
  whatsapp_display_name = 'Dra. Camila'
WHERE email = 'camila.atendimento@bizone.com.br';

-- Daniel Ricardo Arantes
UPDATE df_users
SET 
  whatsapp_display_name = 'Daniel Ricardo'
WHERE email = 'danielricardoarantes@gmail.com';

-- Suporte
UPDATE df_users
SET 
  name = 'Suporte ContaJu',
  whatsapp_display_name = 'Suporte'
WHERE email = 'suportecontaju@gmail.com';

-- 4. Para outros usuários cujo name seja estritamente igual à parte local do e-mail,
-- manter whatsapp_display_name como NULL para que o fallback neutro 'Atendente' seja utilizado com segurança.
