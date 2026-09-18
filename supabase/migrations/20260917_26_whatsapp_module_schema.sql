-- ==============================================================================
-- MIGRATION 26: MÓDULO DE WHATSAPP / ATENDIMENTO ODONTOLÓGICO (df_wa_*)
-- Isolamento absoluto por tenant_id, RLS estrita sem is_contabilex_operator
-- ==============================================================================

-- 0. CONFIGURAÇÃO GLOBAL DA PLATAFORMA (EVOLUTION API GLOBAL)
CREATE TABLE IF NOT EXISTS public.df_wa_global_config (
    id TEXT PRIMARY KEY DEFAULT 'global',
    api_url TEXT NOT NULL,
    has_api_key BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT REFERENCES public.df_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.df_wa_global_secrets (
    id TEXT PRIMARY KEY DEFAULT 'global',
    api_key TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. INSTÂNCIAS EVOLUTION (Mapeamento Instance -> Clínica/Tenant)
-- Contém APENAS configurações não sensíveis. NENHUM segredo administrativo é exposto ao frontend.
CREATE TABLE IF NOT EXISTS public.df_wa_instances (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qrcode')),
    api_url TEXT NOT NULL,
    webhook_url TEXT,
    has_api_key BOOLEAN NOT NULL DEFAULT false,
    has_webhook_secret BOOLEAN NOT NULL DEFAULT false,
    qrcode TEXT,
    phone_number TEXT,
    profile_name TEXT,
    profile_picture_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.1 SEGREDOS DA INSTÂNCIA (EXCLUSIVO SERVER-SIDE / SERVICE_ROLE)
-- Armazena as chaves administrativas fora do alcance de usuários autenticados.
CREATE TABLE IF NOT EXISTS public.df_wa_instance_secrets (
    instance_id TEXT PRIMARY KEY REFERENCES public.df_wa_instances(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL,
    webhook_secret TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CONTATOS WHATSAPP (Vínculo com paciente é opcional)
CREATE TABLE IF NOT EXISTS public.df_wa_contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    patient_id TEXT REFERENCES public.df_patients(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL,
    profile_pic_url TEXT,
    profile_pic_synced_at TIMESTAMPTZ,
    profile_pic_storage_path TEXT,
    lid TEXT,
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_df_wa_contacts_tenant_number UNIQUE (tenant_id, whatsapp_number)
);

-- 3. CONVERSAS / ATENDIMENTO (7 status operacionais reais)
CREATE TABLE IF NOT EXISTS public.df_wa_conversations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES public.df_wa_contacts(id) ON DELETE CASCADE,
    assigned_to TEXT REFERENCES public.df_users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'na_fila' CHECK (
        status IN (
            'na_fila',
            'em_atendimento',
            'aguardando_cliente',
            'aguardando_interno',
            'transferido',
            'finalizado',
            'arquivado'
        )
    ),
    unread_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_content TEXT,
    last_message_from_me BOOLEAN DEFAULT false,
    claimed_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,
    finalization_reason TEXT,
    finalization_notes TEXT,
    transfer_reason TEXT,
    priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    observation TEXT,
    observation_assigned_to TEXT REFERENCES public.df_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: Somente 1 conversa ativa por contato por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_df_wa_conv_single_active 
ON public.df_wa_conversations(tenant_id, contact_id) 
WHERE status NOT IN ('finalizado', 'arquivado');

-- 4. MENSAGENS (Texto, Mídia, Áudio, Reply, Reações, Idempotência)
CREATE TABLE IF NOT EXISTS public.df_wa_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES public.df_wa_conversations(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES public.df_users(id) ON DELETE SET NULL,
    evolution_msg_id TEXT,
    from_me BOOLEAN NOT NULL DEFAULT false,
    content TEXT NOT NULL DEFAULT '',
    msg_type TEXT NOT NULL DEFAULT 'text' CHECK (
        msg_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'contact', 'reaction')
    ),
    media_url TEXT,
    media_storage_path TEXT,
    media_mime_type TEXT,
    media_file_name TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    delivery_status INTEGER NOT NULL DEFAULT 1 CHECK (delivery_status IN (1, 2, 3, 4, 5)),
    reply_to_id TEXT REFERENCES public.df_wa_messages(id) ON DELETE SET NULL,
    reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
    remote_jid TEXT,
    participant_jid TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice / constraint única de idempotência por tenant e evolution_msg_id
ALTER TABLE public.df_wa_messages 
ADD CONSTRAINT uq_df_wa_messages_tenant_evolution UNIQUE (tenant_id, evolution_msg_id);


-- 5. EVENTOS DO ATENDIMENTO (Timeline: Claim, Transferência, Finalização, etc.)
CREATE TABLE IF NOT EXISTS public.df_wa_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES public.df_wa_conversations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'claimed',
            'transferred',
            'status_changed',
            'finalized',
            'reopened',
            'contact_updated',
            'call_received',
            'call_missed'
        )
    ),
    description TEXT NOT NULL,
    author_id TEXT REFERENCES public.df_users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TRANSFERÊNCIAS (Histórico operacional de transferência)
CREATE TABLE IF NOT EXISTS public.df_wa_transfers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES public.df_wa_conversations(id) ON DELETE CASCADE,
    from_user_id TEXT REFERENCES public.df_users(id) ON DELETE SET NULL,
    to_user_id TEXT NOT NULL REFERENCES public.df_users(id) ON DELETE CASCADE,
    reason TEXT,
    transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. CHAMADAS (Registro de histórico de calls WhatsApp)
CREATE TABLE IF NOT EXISTS public.df_wa_calls (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES public.df_wa_conversations(id) ON DELETE CASCADE,
    contact_id TEXT REFERENCES public.df_wa_contacts(id) ON DELETE CASCADE,
    call_id TEXT,
    call_type TEXT NOT NULL DEFAULT 'voice' CHECK (call_type IN ('voice', 'video')),
    call_status TEXT NOT NULL DEFAULT 'missed' CHECK (
        call_status IN ('offer', 'ringing', 'connected', 'missed', 'rejected')
    ),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    caller_number TEXT NOT NULL,
    caller_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. NOTAS INTERNAS (Comunicação entre equipe odontológica)
CREATE TABLE IF NOT EXISTS public.df_wa_internal_notes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES public.df_wa_conversations(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES public.df_users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. LOGS DE WEBHOOK
CREATE TABLE IF NOT EXISTS public.df_wa_webhook_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES public.df_tenants(id) ON DELETE CASCADE,
    instance_name TEXT,
    event TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'ignored', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- ÍNDICES DE PERFORMANCE E CONSULTAS FREQUENTES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_df_wa_instances_tenant ON public.df_wa_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_instance_secrets_tenant ON public.df_wa_instance_secrets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_contacts_tenant ON public.df_wa_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_contacts_patient ON public.df_wa_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_contacts_number ON public.df_wa_contacts(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_df_wa_contacts_lid ON public.df_wa_contacts(lid) WHERE lid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_df_wa_conv_tenant ON public.df_wa_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_conv_contact ON public.df_wa_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_conv_assigned ON public.df_wa_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_df_wa_conv_status ON public.df_wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_df_wa_conv_last_msg ON public.df_wa_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_df_wa_messages_tenant ON public.df_wa_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_messages_conv ON public.df_wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_messages_created ON public.df_wa_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_df_wa_messages_reply ON public.df_wa_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_df_wa_events_conv ON public.df_wa_events(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_df_wa_transfers_conv ON public.df_wa_transfers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_calls_conv ON public.df_wa_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_df_wa_notes_conv ON public.df_wa_internal_notes(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_df_wa_webhook_logs_tenant ON public.df_wa_webhook_logs(tenant_id);

-- ==============================================================================
-- TRIGGERS PARA UNREAD COUNT E LAST MESSAGE (ÚNICA FONTE DE VERDADE)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.df_wa_message_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- INSERÇÃO DE NOVA MENSAGEM
    IF TG_OP = 'INSERT' THEN
        IF NEW.from_me = false AND NEW.is_read = false AND NEW.is_internal = false THEN
            UPDATE public.df_wa_conversations
            SET unread_count = unread_count + 1,
                last_message_at = NEW.created_at,
                last_message_content = NEW.content,
                last_message_from_me = false,
                updated_at = now()
            WHERE id = NEW.conversation_id;
        ELSIF NEW.is_internal = false THEN
            UPDATE public.df_wa_conversations
            SET last_message_at = NEW.created_at,
                last_message_content = NEW.content,
                last_message_from_me = NEW.from_me,
                updated_at = now()
            WHERE id = NEW.conversation_id;
        END IF;
        RETURN NEW;

    -- ATUALIZAÇÃO DE STATUS DE LEITURA (ex: marcado como lido)
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_read = false AND NEW.is_read = true AND NEW.from_me = false AND NEW.is_internal = false THEN
            UPDATE public.df_wa_conversations
            SET unread_count = GREATEST(0, unread_count - 1),
                updated_at = now()
            WHERE id = NEW.conversation_id;
        ELSIF OLD.is_read = true AND NEW.is_read = false AND NEW.from_me = false AND NEW.is_internal = false THEN
            UPDATE public.df_wa_conversations
            SET unread_count = unread_count + 1,
                updated_at = now()
            WHERE id = NEW.conversation_id;
        END IF;
        RETURN NEW;

    -- EXCLUSÃO LOCAL DE MENSAGEM
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.is_read = false AND OLD.from_me = false AND OLD.is_internal = false THEN
            UPDATE public.df_wa_conversations
            SET unread_count = GREATEST(0, unread_count - 1),
                updated_at = now()
            WHERE id = OLD.conversation_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_df_wa_messages_stats ON public.df_wa_messages;
CREATE TRIGGER trg_df_wa_messages_stats
AFTER INSERT OR UPDATE OF is_read OR DELETE ON public.df_wa_messages
FOR EACH ROW EXECUTE FUNCTION public.df_wa_message_trigger_func();

-- ==============================================================================
-- RPC ATÔMICA: CLAIM / ASSUMIR ATENDIMENTO (Zero Race Condition)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.df_wa_claim_conversation(
    p_conversation_id TEXT,
    p_tenant_id TEXT,
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_assigned_to TEXT;
    v_assigned_user_name TEXT;
BEGIN
    -- Validar se o usuário pertence à clínica
    IF NOT public.is_dental_tenant_member(p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Acesso não autorizado.');
    END IF;

    -- Tentar assumir atomicamente apenas se estiver sem atendente ou já for o próprio atendente
    UPDATE public.df_wa_conversations
    SET assigned_to = p_user_id,
        status = 'em_atendimento',
        claimed_at = COALESCE(claimed_at, now()),
        updated_at = now()
    WHERE id = p_conversation_id
      AND tenant_id = p_tenant_id
      AND (assigned_to IS NULL OR assigned_to = p_user_id);

    IF FOUND THEN
        -- Registrar evento na timeline
        INSERT INTO public.df_wa_events (
            id,
            tenant_id,
            conversation_id,
            event_type,
            description,
            author_id,
            metadata,
            created_at
        ) VALUES (
            'evt_' || extract(epoch from now())::bigint || '_' || lower(substr(md5(random()::text), 1, 4)),
            p_tenant_id,
            p_conversation_id,
            'claimed',
            'Atendimento assumido pelo profissional.',
            p_user_id,
            jsonb_build_object('claimed_by', p_user_id),
            now()
        );

        RETURN jsonb_build_object('success', true, 'claimed_by_me', true);
    ELSE
        -- Outro atendente já assumiu
        SELECT c.assigned_to, u.name
        INTO v_current_assigned_to, v_assigned_user_name
        FROM public.df_wa_conversations c
        LEFT JOIN public.df_users u ON u.id = c.assigned_to
        WHERE c.id = p_conversation_id AND c.tenant_id = p_tenant_id;

        RETURN jsonb_build_object(
            'success', false,
            'already_claimed', true,
            'error', 'Este atendimento já foi assumido por outro atendente.',
            'assigned_to', v_current_assigned_to,
            'assigned_user_name', COALESCE(v_assigned_user_name, 'Outro atendente')
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.df_wa_claim_conversation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.df_wa_claim_conversation(TEXT, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- RPC: MARCAR CONVERSA COMO LIDA (Zera contador e marca mensagens como lidas)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.df_wa_mark_as_read(
    p_conversation_id TEXT,
    p_tenant_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_dental_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    UPDATE public.df_wa_messages
    SET is_read = true,
        updated_at = now()
    WHERE conversation_id = p_conversation_id
      AND tenant_id = p_tenant_id
      AND from_me = false
      AND is_read = false;

    UPDATE public.df_wa_conversations
    SET unread_count = 0,
        updated_at = now()
    WHERE id = p_conversation_id
      AND tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.df_wa_mark_as_read(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.df_wa_mark_as_read(TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- RLS (ROW LEVEL SECURITY) ESTRITA EM TODAS AS TABELAS df_wa_*
-- NENHUMA menção a is_contabilex_operator(). Isolamento total por clínica.
-- ==============================================================================

-- 0. df_wa_global_config (Apenas leitura para administradores globais/consultoria)
ALTER TABLE public.df_wa_global_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_global_config_select" ON public.df_wa_global_config;
CREATE POLICY "df_wa_global_config_select" ON public.df_wa_global_config
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.df_users
            WHERE auth_user_id = auth.uid()
              AND (role IN ('PLATFORM_ADMIN', 'SUPER_ADMIN') OR is_primary = true)
              AND is_active = true
        )
    );

-- 0.1 df_wa_global_secrets (Cofre server-side exclusivo para a chave global da Evolution)
ALTER TABLE public.df_wa_global_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.df_wa_global_secrets FROM anon, authenticated;
GRANT ALL ON public.df_wa_global_secrets TO service_role;

-- 1. df_wa_instances (Apenas dados não sensíveis)
ALTER TABLE public.df_wa_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_instances_policy" ON public.df_wa_instances;
CREATE POLICY "df_wa_instances_policy" ON public.df_wa_instances
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 1.1 df_wa_instance_secrets (Cofre server-side: NENHUMA policy para authenticated/anon)
-- Acesso 100% restrito a service_role (Edge Functions server-side).
ALTER TABLE public.df_wa_instance_secrets ENABLE ROW LEVEL SECURITY;

-- 2. df_wa_contacts
ALTER TABLE public.df_wa_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_contacts_policy" ON public.df_wa_contacts;
CREATE POLICY "df_wa_contacts_policy" ON public.df_wa_contacts
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 3. df_wa_conversations
ALTER TABLE public.df_wa_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_conversations_policy" ON public.df_wa_conversations;
CREATE POLICY "df_wa_conversations_policy" ON public.df_wa_conversations
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 4. df_wa_messages
ALTER TABLE public.df_wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_messages_policy" ON public.df_wa_messages;
CREATE POLICY "df_wa_messages_policy" ON public.df_wa_messages
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 5. df_wa_events
ALTER TABLE public.df_wa_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_events_policy" ON public.df_wa_events;
CREATE POLICY "df_wa_events_policy" ON public.df_wa_events
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 6. df_wa_transfers
ALTER TABLE public.df_wa_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_transfers_policy" ON public.df_wa_transfers;
CREATE POLICY "df_wa_transfers_policy" ON public.df_wa_transfers
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 7. df_wa_calls
ALTER TABLE public.df_wa_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_calls_policy" ON public.df_wa_calls;
CREATE POLICY "df_wa_calls_policy" ON public.df_wa_calls
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 8. df_wa_internal_notes
ALTER TABLE public.df_wa_internal_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_internal_notes_policy" ON public.df_wa_internal_notes;
CREATE POLICY "df_wa_internal_notes_policy" ON public.df_wa_internal_notes
    FOR ALL TO authenticated
    USING (public.is_dental_tenant_member(tenant_id))
    WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- 9. df_wa_webhook_logs
ALTER TABLE public.df_wa_webhook_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "df_wa_webhook_logs_policy" ON public.df_wa_webhook_logs;
CREATE POLICY "df_wa_webhook_logs_policy" ON public.df_wa_webhook_logs
    FOR SELECT TO authenticated
    USING (tenant_id IS NOT NULL AND public.is_dental_tenant_member(tenant_id));

-- ==============================================================================
-- STORAGE BUCKET dental-private MIME TYPES
-- Atualizar dental-private para permitir mídias de WhatsApp (áudios, vídeos, docs)
-- ==============================================================================
UPDATE storage.buckets
SET allowed_mime_types = NULL, -- Permitir todos os tipos válidos de arquivo com segurança
    file_size_limit = 52428800 -- 50MB para suportar vídeos/PDFs de exames odontológicos
WHERE id = 'dental-private';

-- Refinamento da Policy SELECT no bucket dental-private:
-- Arquivos da pasta 'whatsapp' são estritamente confidenciais da clínica odontológica (sigilo médico).
-- Operadores do Contábilex NÃO têm acesso à subpasta 'whatsapp', apenas membros da clínica (is_dental_tenant_member).
DROP POLICY IF EXISTS "storage_dental_private_select" ON storage.objects;
CREATE POLICY "storage_dental_private_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'dental-private'
    AND (
        -- Membro da clínica dona do arquivo sempre pode acessar
        public.is_dental_tenant_member((storage.foldername(name))[1])
        -- Operador Contábilex só acessa se NÃO for pasta de WhatsApp (auditoria fiscal/contábil apenas)
        OR (
            public.is_contabilex_operator()
            AND COALESCE((storage.foldername(name))[2], '') != 'whatsapp'
        )
    )
);

-- ==============================================================================
-- REALTIME REPLICA IDENTITY E PUBLICATION
-- ==============================================================================
ALTER TABLE public.df_wa_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.df_wa_messages REPLICA IDENTITY FULL;
ALTER TABLE public.df_wa_contacts REPLICA IDENTITY FULL;
ALTER TABLE public.df_wa_events REPLICA IDENTITY FULL;

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_conversations;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_messages;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_contacts;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_events;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;
