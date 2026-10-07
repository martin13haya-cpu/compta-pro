-- =====================================================================
-- Compta Pro — RH & Paie, lot 2 : congés, permissions et absences
-- ⚠️ À exécuter dans le projet Supabase RH (rducxnyxgqrmtyvqwfzw),
--    celui qui contient la table « employees » — PAS dans le projet
--    comptable principal.
-- =====================================================================
--
-- rh_conges   : demandes de congé (annuel, maladie, maternité…) et
--               ajustements du solde (congés pris avant la mise en service).
-- rh_absences : permissions et absences, avec leur effet sur la paie
--               (retenue) et sur le solde de congé.
--
-- Les types des colonnes employee_id / company_id sont lus sur la table
-- employees, et ses règles d'accès (RLS) sont recopiées telles quelles sur
-- les deux nouvelles tables : elles sont visibles par les mêmes personnes
-- que les employés. Idempotent : peut être ré-exécuté sans risque.
-- =====================================================================

DO $$
DECLARE
  type_emp  TEXT;
  type_soc  TEXT;
  t         TEXT;
  pol       RECORD;
  rls_on    BOOLEAN;
BEGIN
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_emp FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'id';
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_soc FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'company_id';
  IF type_emp IS NULL THEN
    RAISE EXCEPTION 'Table employees introuvable : exécutez ce script dans le projet Supabase RH.';
  END IF;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS rh_conges (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   %1$s,
      employee_id  %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id      UUID,
      type         TEXT NOT NULL CHECK (type IN ('annuel','maladie','maternite','paternite','exceptionnel','sans_solde','ajustement')),
      date_debut   DATE NOT NULL,
      date_fin     DATE NOT NULL,
      nb_jours     NUMERIC NOT NULL DEFAULT 0,
      motif        TEXT,
      statut       TEXT NOT NULL DEFAULT 'approuve' CHECK (statut IN ('en_attente','approuve','rejete','annule')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS rh_absences (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      %1$s,
      employee_id     %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id         UUID,
      categorie       TEXT NOT NULL CHECK (categorie IN ('permission_deductible','permission_non_deductible','absence_justifiee','absence_non_justifiee','absence_sans_solde','autorisation_speciale')),
      date_debut      DATE NOT NULL,
      date_fin        DATE NOT NULL,
      unite           TEXT NOT NULL DEFAULT 'jours' CHECK (unite IN ('jours','heures')),
      duree           NUMERIC NOT NULL DEFAULT 0,
      motif           TEXT,
      impact_paie     BOOLEAN NOT NULL DEFAULT false,
      montant_retenue NUMERIC NOT NULL DEFAULT 0,
      impact_conge    BOOLEAN NOT NULL DEFAULT false,
      statut          TEXT NOT NULL DEFAULT 'approuve' CHECK (statut IN ('en_attente','approuve','rejete','annule')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  CREATE INDEX IF NOT EXISTS idx_rh_conges_emp ON rh_conges(employee_id, date_debut);
  CREATE INDEX IF NOT EXISTS idx_rh_conges_soc ON rh_conges(company_id);
  CREATE INDEX IF NOT EXISTS idx_rh_absences_emp ON rh_absences(employee_id, date_debut);
  CREATE INDEX IF NOT EXISTS idx_rh_absences_soc ON rh_absences(company_id);

  -- Mêmes règles d'accès que la table employees.
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.employees'::regclass;
  FOREACH t IN ARRAY ARRAY['rh_conges','rh_absences'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employees' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    ELSE
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Accès des rôles de l'API Supabase (comme pour les autres tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON rh_conges, rh_absences TO anon, authenticated;
