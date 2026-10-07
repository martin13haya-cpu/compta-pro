-- =====================================================================
-- ComptaPro — Traçabilité de l'étuvage (lot 1)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq) — celui qui contient compta_etuvage.
-- =====================================================================
--
-- 1. compta_etuvage : l'étuveuse devient une référence au répertoire
--    (etuveuse_id), le lot étuvé produit est numéroté (lot_sortant), et le
--    cycle porte la cuve, les déchets, l'humidité de sortie, la perte non
--    justifiée en % et l'alerte au-delà du seuil.
-- 2. compta_seuils_production : seuils d'alerte d'écart par étape et par
--    société (étuvage, décorticage, calibrage, tri optique, conditionnement).
--
-- Les règles d'accès de la nouvelle table sont recopiées de compta_etuvage.
-- Aucune donnée existante n'est modifiée. Idempotent.
-- =====================================================================

DO $$
DECLARE
  type_etv TEXT;
  pol      RECORD;
  rls_on   BOOLEAN;
BEGIN
  IF to_regclass('public.compta_etuvage') IS NULL THEN
    RAISE EXCEPTION 'Table compta_etuvage introuvable : exécutez ce script dans le projet ComptaPro.';
  END IF;

  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_etv FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'compta_etuveuses' AND column_name = 'id';

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compta_etuvage' AND column_name = 'etuveuse_id') THEN
    EXECUTE format('ALTER TABLE compta_etuvage ADD COLUMN etuveuse_id %s REFERENCES compta_etuveuses(id) ON DELETE SET NULL', type_etv);
  END IF;

  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS lot_sortant      TEXT;
  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS cuve             TEXT;
  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS dechets_kg       NUMERIC DEFAULT 0;
  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS humidite_sortie  NUMERIC;
  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS ecart_pct        NUMERIC;
  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS seuil_alerte_pct NUMERIC;
  ALTER TABLE compta_etuvage ADD COLUMN IF NOT EXISTS alerte           BOOLEAN DEFAULT false;
  CREATE INDEX IF NOT EXISTS idx_compta_etuvage_etuveuse ON compta_etuvage(etuveuse_id);
  CREATE INDEX IF NOT EXISTS idx_compta_etuvage_lot_sortant ON compta_etuvage(company_id, lot_sortant);

  CREATE TABLE IF NOT EXISTS compta_seuils_production (
    company_id          UUID PRIMARY KEY REFERENCES compta_companies(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES auth.users(id),
    etuvage_pct         NUMERIC NOT NULL DEFAULT 5,
    decorticage_pct     NUMERIC NOT NULL DEFAULT 5,
    calibrage_pct       NUMERIC NOT NULL DEFAULT 5,
    tri_optique_pct     NUMERIC NOT NULL DEFAULT 5,
    conditionnement_pct NUMERIC NOT NULL DEFAULT 0.5,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Mêmes règles d'accès que compta_etuvage.
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_etuvage'::regclass;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compta_seuils_production' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON compta_seuils_production', pol.policyname);
  END LOOP;
  IF rls_on THEN
    ALTER TABLE compta_seuils_production ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compta_etuvage' LOOP
      EXECUTE format('CREATE POLICY %I ON compta_seuils_production AS %s FOR %s TO %s %s %s',
        pol.policyname, pol.permissive, pol.cmd,
        (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
        CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
        CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
    END LOOP;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_seuils_production TO authenticated;
