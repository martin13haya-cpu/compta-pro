-- =====================================================================
-- ComptaPro — Traçabilité complète des lots (lot 4)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq).
-- =====================================================================
--
-- compta_lot_origines     : d'où vient le paddy d'un lot de production —
--                           producteur (fournisseur), quantité, date, n° de
--                           PV ou de bon de réception, variété.
-- compta_lot_destinations : où est parti le riz d'un lot — client,
--                           n° de facture ou de bon de livraison, quantité,
--                           nombre de sacs, date.
-- Avec les envois aux étuveuses et les étapes de production déjà reliés au
-- lot, la chaîne producteur → étuveuse → étapes → client est complète.
--
-- Types des clés lus sur les tables existantes ; règles d'accès recopiées
-- de compta_lots_production. Idempotent.
-- =====================================================================

DO $$
DECLARE
  type_lot TEXT; type_frs TEXT; type_cli TEXT;
  t TEXT; pol RECORD; rls_on BOOLEAN;
BEGIN
  IF to_regclass('public.compta_lots_production') IS NULL THEN
    RAISE EXCEPTION 'Table compta_lots_production introuvable : exécutez ce script dans le projet ComptaPro.';
  END IF;
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_lot FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_lots_production' AND column_name='id';
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_frs FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_fournisseurs' AND column_name='id';
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_cli FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_clients' AND column_name='id';

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_lot_origines (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id        UUID REFERENCES auth.users(id),
      lot_id         %1$s NOT NULL REFERENCES compta_lots_production(id) ON DELETE CASCADE,
      fournisseur_id %2$s REFERENCES compta_fournisseurs(id) ON DELETE SET NULL,
      producteur_nom TEXT,
      quantite_kg    NUMERIC NOT NULL CHECK (quantite_kg > 0),
      date_reception DATE NOT NULL,
      reference      TEXT,
      variete        TEXT,
      observations   TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_lot, type_frs);

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_lot_destinations (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id        UUID REFERENCES auth.users(id),
      lot_id         %1$s NOT NULL REFERENCES compta_lots_production(id) ON DELETE CASCADE,
      client_id      %2$s REFERENCES compta_clients(id) ON DELETE SET NULL,
      client_nom     TEXT,
      document       TEXT,
      date_livraison DATE NOT NULL,
      quantite_kg    NUMERIC NOT NULL CHECK (quantite_kg > 0),
      nb_sacs        INTEGER,
      produit        TEXT,
      observations   TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_lot, type_cli);

  CREATE INDEX IF NOT EXISTS idx_lot_origines_lot ON compta_lot_origines(lot_id);
  CREATE INDEX IF NOT EXISTS idx_lot_origines_frs ON compta_lot_origines(fournisseur_id);
  CREATE INDEX IF NOT EXISTS idx_lot_destinations_lot ON compta_lot_destinations(lot_id);
  CREATE INDEX IF NOT EXISTS idx_lot_destinations_cli ON compta_lot_destinations(client_id);

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_lots_production'::regclass;
  FOREACH t IN ARRAY ARRAY['compta_lot_origines','compta_lot_destinations'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='compta_lots_production' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_lot_origines, compta_lot_destinations TO authenticated;
