-- =====================================================================
-- Compta Pro — RH & Paie, lot 3 : prêts et avances au personnel, missions
-- ⚠️ À exécuter dans le projet Supabase RH (rducxnyxgqrmtyvqwfzw),
--    celui qui contient la table « employees ».
-- =====================================================================
--
-- rh_prets                 : prêts et avances (montant, mensualités).
-- rh_pret_remboursements   : mensualités réellement remboursées — retenues
--                            sur une fiche de paie (une par mois et par prêt)
--                            ou versées à la main. Le restant dû se calcule
--                            à partir de ces lignes, jamais stocké.
-- rh_missions              : ordres de mission et frais.
--
-- Mêmes principes que le lot 2 : types lus sur employees, règles d'accès
-- recopiées de employees. Idempotent.
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
    CREATE TABLE IF NOT EXISTS rh_prets (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          %1$s,
      employee_id         %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id             UUID,
      nature              TEXT NOT NULL DEFAULT 'pret' CHECK (nature IN ('pret','avance')),
      montant_total       NUMERIC NOT NULL CHECK (montant_total > 0),
      date_octroi         DATE NOT NULL,
      premier_mois        INTEGER NOT NULL CHECK (premier_mois BETWEEN 1 AND 12),
      premiere_annee      INTEGER NOT NULL,
      nombre_mensualites  INTEGER NOT NULL CHECK (nombre_mensualites > 0),
      montant_mensualite  NUMERIC NOT NULL CHECK (montant_mensualite > 0),
      motif               TEXT,
      statut              TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','solde','annule')),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS rh_pret_remboursements (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pret_id      UUID NOT NULL REFERENCES rh_prets(id) ON DELETE CASCADE,
      company_id   %1$s,
      employee_id  %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id      UUID,
      source       TEXT NOT NULL DEFAULT 'paie' CHECK (source IN ('paie','manuel')),
      mois         INTEGER,
      annee        INTEGER,
      date_versement DATE NOT NULL DEFAULT CURRENT_DATE,
      montant      NUMERIC NOT NULL CHECK (montant > 0),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS rh_missions (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          %1$s,
      employee_id         %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id             UUID,
      numero              TEXT,
      objet               TEXT NOT NULL,
      lieu                TEXT,
      date_depart         DATE NOT NULL,
      date_retour         DATE NOT NULL,
      service_demandeur   TEXT,
      moyen_transport     TEXT,
      indemnite_journaliere NUMERIC NOT NULL DEFAULT 0,
      indemnites_mission  NUMERIC NOT NULL DEFAULT 0,
      frais_remboursables NUMERIC NOT NULL DEFAULT 0,
      avance_frais        NUMERIC NOT NULL DEFAULT 0,
      statut              TEXT NOT NULL DEFAULT 'demandee' CHECK (statut IN ('demandee','validee','en_cours','terminee','annulee')),
      compte_rendu        TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  CREATE INDEX IF NOT EXISTS idx_rh_prets_emp ON rh_prets(employee_id);
  CREATE INDEX IF NOT EXISTS idx_rh_prets_soc ON rh_prets(company_id);
  CREATE INDEX IF NOT EXISTS idx_rh_pret_remb_pret ON rh_pret_remboursements(pret_id);
  -- Une seule retenue de paie par prêt et par mois.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_pret_remb_paie ON rh_pret_remboursements(pret_id, mois, annee) WHERE source = 'paie';
  CREATE INDEX IF NOT EXISTS idx_rh_missions_emp ON rh_missions(employee_id, date_depart);
  CREATE INDEX IF NOT EXISTS idx_rh_missions_soc ON rh_missions(company_id);

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.employees'::regclass;
  FOREACH t IN ARRAY ARRAY['rh_prets','rh_pret_remboursements','rh_missions'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON rh_prets, rh_pret_remboursements, rh_missions TO anon, authenticated;
