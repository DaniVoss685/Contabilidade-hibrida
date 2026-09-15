-- ==============================================================================
-- FASE 4 — MIGRATION: DENTAL FINANCE STORAGE BUCKET & RLS POLICIES
-- ==============================================================================

-- 1. Criar o bucket privado dental-private (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'dental-private',
    'dental-private',
    false,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

-- 2. Permitir leitura de metadados de buckets para usuários autenticados
DROP POLICY IF EXISTS "storage_buckets_authenticated_select" ON storage.buckets;
CREATE POLICY "storage_buckets_authenticated_select"
ON storage.buckets
FOR SELECT
TO authenticated
USING (true);

-- 3. Limpar policies anteriores do bucket dental-private em storage.objects
DROP POLICY IF EXISTS "storage_dental_private_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_dental_private_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_dental_private_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_dental_private_delete" ON storage.objects;

-- 4. Policy SELECT: Dentista autenticado acessa arquivos de seu próprio tenant;
--    Operadores do Contábilex têm acesso de auditoria.
CREATE POLICY "storage_dental_private_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'dental-private'
    AND (
        public.is_dental_tenant_member((storage.foldername(name))[1])
        OR public.is_contabilex_operator()
    )
);

-- 5. Policy INSERT: Apenas membros do respectivo tenant podem fazer upload
CREATE POLICY "storage_dental_private_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'dental-private'
    AND public.is_dental_tenant_member((storage.foldername(name))[1])
);

-- 6. Policy UPDATE: Apenas membros do respectivo tenant podem atualizar seus arquivos
CREATE POLICY "storage_dental_private_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'dental-private'
    AND public.is_dental_tenant_member((storage.foldername(name))[1])
)
WITH CHECK (
    bucket_id = 'dental-private'
    AND public.is_dental_tenant_member((storage.foldername(name))[1])
);

-- 7. Policy DELETE: Apenas membros do respectivo tenant podem excluir seus arquivos
CREATE POLICY "storage_dental_private_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'dental-private'
    AND public.is_dental_tenant_member((storage.foldername(name))[1])
);

-- 8. Correção de segurança: Confinar policy legada de chat_attachments ao seu próprio bucket
DROP POLICY IF EXISTS "Give users authenticated access to chat_attachments" ON storage.objects;
CREATE POLICY "Give users authenticated access to chat_attachments"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'chat_attachments' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'chat_attachments');

