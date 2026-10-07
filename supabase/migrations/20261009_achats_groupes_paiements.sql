-- =====================================================================
-- ComptaPro — Achats groupés de riz paddy (lot 2 : paiements par groupe)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261009_achats_groupes.sql.
-- =====================================================================
--
-- compta_achats_groupes_paiements    : un versement fait au groupe
--                                      (n° PAG-AAAA-NNN, date, montant,
--                                      caisse / banque / mobile money,
--                                      remis au chef de groupe ou payé
--                                      individuellement).
-- compta_achats_groupes_repartitions : la part de chaque producteur dans
--                                      ce versement, au prorata de ce qui
--                                      lui reste dû ; émargement (signé ou
--                                      non, date).
--
-- Règles d'accès recopiées de compta_achats_groupes. Idempotent.
-- =====================================================================

DO $$
DECLARE
  type_frs TEXT; t TEXT; pol RECORD; rls_on BOOLEAN;
BEGIN
  IF to_regclass('public.compta_achats_groupes_lignes') IS NULL THEN
    RAISE EXCEPTION 'Table compta_achats_groupes_lignes introuvable : exécutez d''abord 20261009_achats_groupes.sql dans le projet ComptaPro.';
  END IF;
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_frs FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_fournisseurs' AND column_name='id';

  CREATE TABLE IF NOT EXISTS compta_achats_groupes_paiements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES auth.users(id),
    groupe_id      UUID NOT NULL REFERENCES compta_achats_groupes(id) ON DELETE CASCADE,
    numero         TEXT NOT NULL,
    date_paiement  DATE NOT NULL,
    montant        NUMERIC NOT NULL CHECK (montant > 0),
    mode_paiement  TEXT NOT NULL CHECK (mode_paiement IN ('caisse','banque','mobile')),
    reference      TEXT,
    remis_a        TEXT,
    observations   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, numero)
  );

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_achats_groupes_repartitions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id         UUID REFERENCES auth.users(id),
      paiement_id     UUID NOT NULL REFERENCES compta_achats_groupes_paiements(id) ON DELETE CASCADE,
      groupe_id       UUID NOT NULL REFERENCES compta_achats_groupes(id) ON DELETE CASCADE,
      ligne_id        UUID NOT NULL REFERENCES compta_achats_groupes_lignes(id) ON DELETE CASCADE,
      fournisseur_id  %1$s REFERENCES compta_fournisseurs(id) ON DELETE SET NULL,
      nom             TEXT NOT NULL,
      montant         NUMERIC NOT NULL CHECK (montant >= 0),
      emarge          BOOLEAN NOT NULL DEFAULT false,
      date_emargement DATE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_frs);

  CREATE INDEX IF NOT EXISTS idx_ag_paiements_groupe ON compta_achats_groupes_paiements(groupe_id);
  CREATE INDEX IF NOT EXISTS idx_ag_repartitions_paiement ON compta_achats_groupes_repartitions(paiement_id);
  CREATE INDEX IF NOT EXISTS idx_ag_repartitions_ligne ON compta_achats_groupes_repartitions(ligne_id);

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_achats_groupes'::regclass;
  FOREACH t IN ARRAY ARRAY['compta_achats_groupes_paiements','compta_achats_groupes_repartitions'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='compta_achats_groupes' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_achats_groupes_paiements, compta_achats_groupes_repartitions TO authenticated;
