-- Migration 7: Validação de Integridade Cruzada (Cross-Tenant Integrity Trigger)

CREATE OR REPLACE FUNCTION public.fn_enforce_dental_cross_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Validar patient_id em df_appointments
  IF TG_TABLE_NAME = 'df_appointments' THEN
    IF NEW.patient_id IS NOT NULL AND NEW.patient_id <> '' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.df_patients p 
        WHERE p.id = NEW.patient_id AND p.tenant_id = NEW.tenant_id
      ) THEN
        RAISE EXCEPTION 'Cross-tenant reference violation: patient % does not belong to tenant %', NEW.patient_id, NEW.tenant_id;
      END IF;
    END IF;
  END IF;

  -- 2. Validar patient_id em df_sales
  IF TG_TABLE_NAME = 'df_sales' THEN
    IF NEW.patient_id IS NOT NULL AND NEW.patient_id <> '' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.df_patients p 
        WHERE p.id = NEW.patient_id AND p.tenant_id = NEW.tenant_id
      ) THEN
        RAISE EXCEPTION 'Cross-tenant reference violation: patient % does not belong to tenant %', NEW.patient_id, NEW.tenant_id;
      END IF;
    END IF;
  END IF;

  -- 3. Validar bank_account_id em df_expenses
  IF TG_TABLE_NAME = 'df_expenses' THEN
    IF NEW.bank_account_id IS NOT NULL AND NEW.bank_account_id <> '' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.df_bank_accounts b 
        WHERE b.id = NEW.bank_account_id AND b.tenant_id = NEW.tenant_id
      ) THEN
        RAISE EXCEPTION 'Cross-tenant reference violation: bank_account % does not belong to tenant %', NEW.bank_account_id, NEW.tenant_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_df_appointments_cross_tenant ON public.df_appointments;
CREATE TRIGGER trg_df_appointments_cross_tenant
  BEFORE INSERT OR UPDATE ON public.df_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_dental_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_df_sales_cross_tenant ON public.df_sales;
CREATE TRIGGER trg_df_sales_cross_tenant
  BEFORE INSERT OR UPDATE ON public.df_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_dental_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_df_expenses_cross_tenant ON public.df_expenses;
CREATE TRIGGER trg_df_expenses_cross_tenant
  BEFORE INSERT OR UPDATE ON public.df_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_dental_cross_tenant_integrity();
