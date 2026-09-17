-- Adição do campo is_preferred na tabela df_bank_accounts para suportar banco padrão/preferido
ALTER TABLE df_bank_accounts ADD COLUMN IF NOT EXISTS is_preferred boolean DEFAULT false;
