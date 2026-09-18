-- ==============================================================================
-- MIGRATION 27: INTEGRAÇÃO WHATSAPP + PACIENTE + AGENDA (DENTAL FINANCE)
-- Adiciona suporte a mensagens transacionais de agenda, idempotência e configurações
-- Isolamento absoluto por tenant_id via is_dental_tenant_member()
-- ==============================================================================

-- 1. EVOLUÇÃO DE public.df_wa_messages:
-- Adicionar contact_id, appointment_id, origin e tornar conversation_id NULLABLE
DO 
BEGIN
    -- conversation_id agora pode ser NULL (para mensagens puramente transacionais do sistema)
    ALTER TABLE public.df_wa_messages ALTER COLUMN conversation_id DROP NOT NULL;

    -- Adicionar contact_id se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'df_wa_messages' AND column_name = 'contact_id'
    ) THEN
        ALTER TABLE public.df_wa_messages 
        ADD COLUMN contact_id TEXT REFERENCES public.df_wa_contacts(id) ON DELETE CASCADE;
    END IF;

    -- Adicionar appointment_id se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'df_wa_messages' AND column_name = 'appointment_id'
    ) THEN
        ALTER TABLE public.df_wa_messages 
        ADD COLUMN appointment_id TEXT REFERENCES public.df_appointments(id) ON DELETE SET NULL;
    END IF;

    -- Adicionar origin se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'df_wa_messages' AND column_name = 'origin'
    ) THEN
        ALTER TABLE public.df_wa_messages 
        ADD COLUMN origin TEXT NOT NULL DEFAULT 'attendant' 
        CHECK (origin IN ('attendant', 'appointment_confirmation', 'appointment_reminder', 'appointment_reschedule', 'appointment_cancellation', 'system'));
    END IF;
END ;

-- Preencher contact_id retroativamente a partir das conversas
UPDATE public.df_wa_messages m
SET contact_id = c.contact_id
FROM public.df_wa_conversations c
WHERE m.conversation_id = c.id
  AND m.contact_id IS NULL;

-- Criar índices de performance
CREATE INDEX IF NOT EXISTS idx_df_wa_messages_contact 
ON public.df_wa_messages(tenant_id, contact_id, created_at);

CREATE INDEX IF NOT EXISTS idx_df_wa_messages_appointment 
ON public.df_wa_messages(tenant_id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_df_wa_messages_origin 
ON public.df_wa_messages(tenant_id, origin);


-- 2. TABELA DE LOG E IDEMPOTÊNCIA DE LEMBRETES E CONFIRMAÇÕES (df_wa_reminders_log)
CREATE TABLE IF NOT EXISTS public.df_wa_reminders_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    appointment_id TEXT NOT NULL REFERENCES public.df_appointments(id) ON DELETE CASCADE,
    contact_id TEXT REFERENCES public.df_wa_contacts(id) ON DELETE SET NULL,
    reminder_type TEXT NOT NULL CHECK (
        reminder_type IN ('confirmation', 'reminder_24h', 'reminder_2h', 'reschedule', 'cancellation')
    ),
    scheduled_for DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped')
    ),
    evolution_msg_id TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_df_wa_reminders_idempotency UNIQUE (tenant_id, appointment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_df_wa_reminders_status 
ON public.df_wa_reminders_log(tenant_id, scheduled_for, status);


-- 3. TABELA DE CONFIGURAÇÕES DE LEMBRETES POR CLÍNICA (df_wa_reminder_settings)
CREATE TABLE IF NOT EXISTS public.df_wa_reminder_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    send_confirmation_on_create BOOLEAN NOT NULL DEFAULT true,
    reminder_24h_enabled BOOLEAN NOT NULL DEFAULT true,
    reminder_2h_enabled BOOLEAN NOT NULL DEFAULT false,
    confirmation_template TEXT NOT NULL DEFAULT 'Olá, *{{paciente}}*! Sua consulta na clínica *{{clinica}}* foi agendada para o dia *{{data}}* às *{{hora}}* com *{{profissional}}* ({{procedimento}}). Por favor, responda *1* para confirmar ou *2* se precisar reagendar.',
    reminder_template TEXT NOT NULL DEFAULT 'Olá, *{{paciente}}*! Lembramos que sua consulta na clínica *{{clinica}}* está marcada para amanhã, *{{data}}* às *{{hora}}*. Aguardamos você! Caso tenha algum imprevisto, nos avise por aqui.',
    cancellation_template TEXT NOT NULL DEFAULT 'Olá, *{{paciente}}*! Informamos que sua consulta do dia *{{data}}* às *{{hora}}* na clínica *{{clinica}}* foi cancelada. Se desejar reagendar para outra data, estamos à disposição!',
    reschedule_template TEXT NOT NULL DEFAULT 'Olá, *{{paciente}}*! Sua consulta na clínica *{{clinica}}* foi remarcada para o dia *{{data}}* às *{{hora}}* com *{{profissional}}*. Nos vemos lá!',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 4. POLICIES E RLS (Isolamento rigoroso por clínica)
ALTER TABLE public.df_wa_reminders_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_reminders_log_policy" ON public.df_wa_reminders_log;
CREATE POLICY "df_wa_reminders_log_policy" ON public.df_wa_reminders_log
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

ALTER TABLE public.df_wa_reminder_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_reminder_settings_policy" ON public.df_wa_reminder_settings;
CREATE POLICY "df_wa_reminder_settings_policy" ON public.df_wa_reminder_settings
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));


-- 5. REALTIME PUBLICATION
ALTER TABLE public.df_wa_reminders_log REPLICA IDENTITY FULL;
ALTER TABLE public.df_wa_reminder_settings REPLICA IDENTITY FULL;

DO 
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_reminders_log;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_reminder_settings;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END ;
