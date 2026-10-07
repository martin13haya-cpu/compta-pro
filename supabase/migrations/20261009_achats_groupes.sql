-- =====================================================================
-- ComptaPro — Achats groupés de riz paddy (lot 1 : groupes et registre)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq).
-- =====================================================================
--
-- compta_achats_groupes        : un groupe = un registre de vente groupée
--                                (n° GRP-AAAA-NNN, commune, village, date,
--                                chef de groupe, statut).
-- compta_achats_groupes_lignes : un producteur du groupe — quantité vendue,
--                                prix, montant, fonds intrant retenu,
--                                remboursement en nature (kg), net à percevoir.
--                                Nom, téléphone, CIP, village et coopérative
--                                sont copiés de la fiche du producteur au
--                                moment de l'achat (le registre reste fidèle).
--
-- Types des clés lus sur les tables existantes ; règles d'accès recopiées
-- de compta_fournisseurs. Idempotent.
-- =====================================================================

DO $$
DECLARE
  type_frs TEXT; t TEXT; pol RECORD; rls_on BOOLEAN;
BEGIN
  IF to_regclass('public.compta_fournisseurs') IS NULL THEN
    RAISE EXCEPTION 'Table compta_fournisseurs introuvable : exécutez ce script dans le projet ComptaPro.';
  END IF;
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_frs FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_fournisseurs' AND column_name='id';

  CREATE TABLE IF NOT EXISTS compta_achats_groupes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES auth.users(id),
    numero         TEXT NOT NULL,
    date_achat     DATE NOT NULL,
    commune        TEXT,
    village        TEXT,
    lieu_collecte  TEXT,
    chef_groupe    TEXT,
    chef_telephone TEXT,
    produit        TEXT NOT NULL DEFAULT 'Riz paddy',
    variete        TEXT,
    prix_unitaire  NUMERIC NOT NULL DEFAULT 0,
    statut         TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','cloture','annule')),
    observations   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, numero)
  );

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_achats_groupes_lignes (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      groupe_id        UUID NOT NULL REFERENCES compta_achats_groupes(id) ON DELETE CASCADE,
      company_id       UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id          UUID REFERENCES auth.users(id),
      fournisseur_id   %1$s REFERENCES compta_fournisseurs(id) ON DELETE SET NULL,
      ordre            INTEGER NOT NULL DEFAULT 0,
      nom              TEXT NOT NULL,
      telephone        TEXT,
      cip              TEXT,
      village          TEXT,
      cooperative      TEXT,
      variete          TEXT,
      quantite_kg      NUMERIC NOT NULL DEFAULT 0 CHECK (quantite_kg >= 0),
      prix_unitaire    NUMERIC NOT NULL DEFAULT 0 CHECK (prix_unitaire >= 0),
      montant          NUMERIC NOT NULL DEFAULT 0,
      fonds_intrant    NUMERIC NOT NULL DEFAULT 0 CHECK (fonds_intrant >= 0),
      remboursement_kg NUMERIC NOT NULL DEFAULT 0,
      net_a_percevoir  NUMERIC NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_frs);

  CREATE INDEX IF NOT EXISTS idx_achats_groupes_company ON compta_achats_groupes(company_id, date_achat);
  CREATE INDEX IF NOT EXISTS idx_achats_groupes_lignes_groupe ON compta_achats_groupes_lignes(groupe_id);
  CREATE INDEX IF NOT EXISTS idx_achats_groupes_lignes_frs ON compta_achats_groupes_lignes(fournisseur_id);

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_fournisseurs'::regclass;
  FOREACH t IN ARRAY ARRAY['compta_achats_groupes','compta_achats_groupes_lignes'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='compta_fournisseurs' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_achats_groupes, compta_achats_groupes_lignes TO authenticated;
