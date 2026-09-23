-- ==============================================================================
-- MIGRATION: PACIENTE PESSOA JURÍDICA (CNPJ)
--
-- Permite cadastrar um "paciente" (na prática, cliente/beneficiário) como
-- Pessoa Jurídica — ex.: uma empresa/convênio que paga a clínica. Coluna
-- nova, default 'CPF' (comportamento idêntico a antes deste campo existir,
-- todo paciente já cadastrado continua Pessoa Física). Quando 'CNPJ':
-- df_patients.cpf passa a guardar o CNPJ (14 dígitos), e birth_date não é
-- mais obrigatória no formulário (não é um campo aplicável a empresa) — a
-- coluna já era nullable, então não precisa de alteração de constraint.
--
-- Este campo é independente de Sale.taxOrigin/df_sales.tax_origin (que já
-- existia antes e é escolhido por venda, não derivado do paciente).
-- ==============================================================================

ALTER TABLE public.df_patients
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'CPF'
  CHECK (document_type IN ('CPF', 'CNPJ'));

COMMENT ON COLUMN public.df_patients.document_type IS
  'CPF (default, pessoa física) ou CNPJ (pessoa jurídica). Quando CNPJ, df_patients.cpf guarda o CNPJ (14 dígitos) e birth_date não é obrigatória.';

NOTIFY pgrst, 'reload schema';
