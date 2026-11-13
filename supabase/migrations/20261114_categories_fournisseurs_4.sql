-- =====================================================================
-- ComptaPro — 4 catégories de fournisseurs, chacune avec sa table
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261113_categories_fournisseurs_libelles.sql.
-- =====================================================================
--
-- Catégories : producteur | etuveuse | intermediaire | transporteur
-- (prestataire, commercant et autre sont supprimées ; aucune fiche ne les
-- utilisait — par sécurité, une fiche restante repasse en « non classé »).
--
-- L'identité (nom, téléphone, NPI = colonne cip, IFU, commune…) reste dans
-- compta_fournisseurs, pour que règlements, achats et exports continuent de
-- fonctionner. Chaque catégorie a sa table, reliée par fournisseur_id :
--   - étuveuses     : compta_etuveuses (existante) + compta_etuveuses_mentores
--   - intermédiaires: compta_intermediaires
--   - transporteurs : compta_transporteurs
-- Idempotent.
-- =====================================================================

-- 1. Nouvelles valeurs de catégorie
UPDATE compta_fournisseurs SET categorie = NULL
WHERE categorie IS NOT NULL AND categorie NOT IN ('producteur','etuveuse','intermediaire','transporteur');
ALTER TABLE compta_fournisseurs DROP CONSTRAINT IF EXISTS compta_fournisseurs_categorie_check;
ALTER TABLE compta_fournisseurs ADD CONSTRAINT compta_fournisseurs_categorie_check
  CHECK (categorie IS NULL OR categorie IN ('producteur','etuveuse','intermediaire','transporteur'));

DO $$
BEGIN
  IF to_regclass('public.compta_categories_fournisseurs') IS NOT NULL THEN
    DELETE FROM compta_categories_fournisseurs WHERE cle NOT IN ('producteur','etuveuse','intermediaire','transporteur');
    ALTER TABLE compta_categories_fournisseurs DROP CONSTRAINT IF EXISTS compta_categories_fournisseurs_cle_check;
    ALTER TABLE compta_categories_fournisseurs ADD CONSTRAINT compta_categories_fournisseurs_cle_check
      CHECK (cle IN ('producteur','etuveuse','intermediaire','transporteur'));
  END IF;
END $$;

-- 2. Étuveuses : lien vers la fiche fournisseur (le mentor) ; le code devient
--    automatique (peut être vide sans NPI/IFU), la date de contrat facultative.
ALTER TABLE compta_etuveuses ADD COLUMN IF NOT EXISTS fournisseur_id UUID REFERENCES compta_fournisseurs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_etuveuses_fournisseur ON compta_etuveuses(fournisseur_id) WHERE fournisseur_id IS NOT NULL;
ALTER TABLE compta_etuveuses ALTER COLUMN code_etuveuse DROP NOT NULL;
ALTER TABLE compta_etuveuses ALTER COLUMN date_contrat DROP NOT NULL;

-- 3. Tables propres à chaque catégorie
CREATE TABLE IF NOT EXISTS compta_etuveuses_mentores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  fournisseur_id  UUID NOT NULL REFERENCES compta_fournisseurs(id) ON DELETE CASCADE,
  nom_prenoms     TEXT NOT NULL,
  village         TEXT,
  genre           TEXT,
  handicap        BOOLEAN NOT NULL DEFAULT false,
  npi             TEXT,
  date_naissance  DATE,
  contact         TEXT,
  ordre           INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_etuveuses_mentores_frs ON compta_etuveuses_mentores(fournisseur_id);

CREATE TABLE IF NOT EXISTS compta_intermediaires (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  fournisseur_id  UUID NOT NULL UNIQUE REFERENCES compta_fournisseurs(id) ON DELETE CASCADE,
  observations    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compta_transporteurs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  fournisseur_id  UUID NOT NULL UNIQUE REFERENCES compta_fournisseurs(id) ON DELETE CASCADE,
  observations    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Mêmes règles d'accès que compta_fournisseurs
DO $$
DECLARE
  rls_on BOOLEAN;
  pol RECORD;
  t TEXT;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_fournisseurs'::regclass;
  FOREACH t IN ARRAY ARRAY['compta_etuveuses_mentores','compta_intermediaires','compta_transporteurs'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_etuveuses_mentores, compta_intermediaires, compta_transporteurs TO authenticated;

NOTIFY pgrst, 'reload schema';
