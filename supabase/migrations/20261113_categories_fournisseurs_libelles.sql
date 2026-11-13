-- =====================================================================
-- ComptaPro — Libellés personnalisés des catégories de fournisseurs
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261013_categorie_fournisseurs.sql.
-- =====================================================================
--
-- Les clés de catégorie (producteur | prestataire | commercant |
-- transporteur | autre) restent fixes : elles sont stockées dans
-- compta_fournisseurs.categorie et pilotent la logique (contrats, PV,
-- ouvriers réservés aux producteurs). Cette table permet seulement à
-- chaque société de renommer une catégorie et d'en changer la couleur.
-- Pas de ligne = libellé et couleur par défaut.
-- Idempotent.
-- =====================================================================

DO $$
DECLARE
  rls_on BOOLEAN;
  pol RECORD;
  t TEXT := 'compta_categories_fournisseurs';
BEGIN
  CREATE TABLE IF NOT EXISTS compta_categories_fournisseurs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id),
    cle         TEXT NOT NULL CHECK (cle IN ('producteur','prestataire','commercant','transporteur','autre')),
    libelle     TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
    couleur     TEXT CHECK (couleur IS NULL OR couleur IN ('success','info','warning','danger','secondary')),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, cle)
  );

  -- Mêmes règles d'accès que compta_fournisseurs.
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_fournisseurs'::regclass;
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
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_categories_fournisseurs TO authenticated;

NOTIFY pgrst, 'reload schema';
