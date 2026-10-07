-- =====================================================================
-- ComptaPro — Envois de paddy aux étuveuses (traçabilité, lot 2)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq).
-- =====================================================================
--
-- compta_envois_etuveuses : un lot de production réparti entre plusieurs
--   étuveuses (n° ENV-AAAA-NNN, quantité de paddy envoyée, date).
-- compta_retours_etuveuses : retours partiels ou complets d'un envoi —
--   paddy traité, riz étuvé reçu, déchets, humidité ; lien vers le cycle
--   d'étuvage créé à partir du retour (etuvage_id).
-- Le restant et le statut d'un envoi se calculent à partir des retours :
-- ils ne sont jamais stockés.
--
-- Types des clés lus sur les tables existantes ; règles d'accès recopiées
-- de compta_etuveuses. Idempotent.
-- =====================================================================

DO $$
DECLARE
  type_lot TEXT; type_etv TEXT; type_etu TEXT;
  t TEXT; pol RECORD; rls_on BOOLEAN;
BEGIN
  IF to_regclass('public.compta_etuveuses') IS NULL THEN
    RAISE EXCEPTION 'Table compta_etuveuses introuvable : exécutez ce script dans le projet ComptaPro.';
  END IF;
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_lot FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_lots_production' AND column_name='id';
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_etv FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_etuveuses' AND column_name='id';
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_etu FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_etuvage' AND column_name='id';

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_envois_etuveuses (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id             UUID REFERENCES auth.users(id),
      numero              TEXT NOT NULL,
      lot_id              %1$s REFERENCES compta_lots_production(id) ON DELETE SET NULL,
      etuveuse_id         %2$s NOT NULL REFERENCES compta_etuveuses(id) ON DELETE RESTRICT,
      date_envoi          DATE NOT NULL,
      quantite_envoyee_kg NUMERIC NOT NULL CHECK (quantite_envoyee_kg > 0),
      vehicule            TEXT,
      convoyeur           TEXT,
      commentaire         TEXT,
      annule              BOOLEAN NOT NULL DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (company_id, numero)
    )$t$, type_lot, type_etv);

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_retours_etuveuses (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id         UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id            UUID REFERENCES auth.users(id),
      envoi_id           UUID NOT NULL REFERENCES compta_envois_etuveuses(id) ON DELETE CASCADE,
      date_retour        DATE NOT NULL,
      paddy_traite_kg    NUMERIC NOT NULL CHECK (paddy_traite_kg >= 0),
      riz_etuve_recu_kg  NUMERIC NOT NULL CHECK (riz_etuve_recu_kg >= 0),
      dechets_kg         NUMERIC NOT NULL DEFAULT 0,
      humidite           NUMERIC,
      observation        TEXT,
      etuvage_id         %1$s REFERENCES compta_etuvage(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_etu);

  CREATE INDEX IF NOT EXISTS idx_envois_etv_lot ON compta_envois_etuveuses(lot_id);
  CREATE INDEX IF NOT EXISTS idx_envois_etv_etuveuse ON compta_envois_etuveuses(etuveuse_id);
  CREATE INDEX IF NOT EXISTS idx_envois_etv_company ON compta_envois_etuveuses(company_id, date_envoi);
  CREATE INDEX IF NOT EXISTS idx_retours_etv_envoi ON compta_retours_etuveuses(envoi_id);

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_etuveuses'::regclass;
  FOREACH t IN ARRAY ARRAY['compta_envois_etuveuses','compta_retours_etuveuses'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='compta_etuveuses' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_envois_etuveuses, compta_retours_etuveuses TO authenticated;
