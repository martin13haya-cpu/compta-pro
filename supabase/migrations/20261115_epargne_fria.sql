-- =====================================================================
-- ComptaPro — Kit FRIA : remboursement en nature et épargne FRIA
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261114_categories_fournisseurs_4.sql.
-- =====================================================================
--
-- Principe :
--  • la remise du Kit FRIA au producteur reste HORS comptabilité (suivi
--    dans compta_avances_fournisseur, désormais par campagne agricole) ;
--  • le remboursement en nature (paddy livré) est un achat de matière
--    première : Débit 602 / Crédit 4018xxx « Épargne FRIA » du producteur
--    (dette de l'entreprise = épargne du producteur) ;
--  • l'épargne finance le kit de la campagne suivante (renouvellement du
--    contrat) ou est restituée au producteur qui quitte le projet.
--
-- Les remboursements faits par les achats groupés se lisent dans
-- compta_achats_groupes_lignes (fonds_intrant des groupes clôturés).
-- compta_fria_mouvements enregistre les autres mouvements :
--   remboursement (hors groupe) | utilisation (renouvellement) | restitution
-- Idempotent.
-- =====================================================================

-- 1. Kit FRIA rattaché à une campagne agricole (ex : 2026-2027)
ALTER TABLE compta_avances_fournisseur ADD COLUMN IF NOT EXISTS campagne TEXT;
-- Kits déjà saisis : campagne de la société, sinon campagne en cours (avril → mars).
DO $$
DECLARE
  courante TEXT := CASE WHEN extract(month FROM now()) >= 4
    THEN extract(year FROM now())::int || '-' || (extract(year FROM now())::int + 1)
    ELSE (extract(year FROM now())::int - 1) || '-' || extract(year FROM now())::int END;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_companies' AND column_name='campagne_agricole') THEN
    EXECUTE format($u$UPDATE compta_avances_fournisseur a SET campagne = COALESCE(NULLIF(trim(c.campagne_agricole), ''), %L)
      FROM compta_companies c WHERE a.campagne IS NULL AND c.id = a.company_id$u$, courante);
  END IF;
  UPDATE compta_avances_fournisseur SET campagne = courante WHERE campagne IS NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_avances_fournisseur_campagne ON compta_avances_fournisseur(fournisseur_id, campagne);

-- 2. Mouvements de l'épargne FRIA (hors achats groupés)
DO $$
DECLARE
  type_frs TEXT; rls_on BOOLEAN; pol RECORD; t TEXT := 'compta_fria_mouvements';
BEGIN
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_frs FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_fournisseurs' AND column_name='id';

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_fria_mouvements (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id          UUID REFERENCES auth.users(id),
      fournisseur_id   %1$s NOT NULL REFERENCES compta_fournisseurs(id) ON DELETE CASCADE,
      numero           TEXT NOT NULL,
      type             TEXT NOT NULL CHECK (type IN ('remboursement','utilisation','restitution')),
      date_mouvement   DATE NOT NULL,
      campagne         TEXT,
      quantite_kg      NUMERIC NOT NULL DEFAULT 0 CHECK (quantite_kg >= 0),
      prix_unitaire    NUMERIC NOT NULL DEFAULT 0 CHECK (prix_unitaire >= 0),
      montant          NUMERIC NOT NULL CHECK (montant > 0),
      -- Contrepartie d'une utilisation / restitution :
      --   caisse | banque | mobile (journal de trésorerie) | fournisseur (fournisseur d'intrants)
      mode_reglement   TEXT,
      tiers_compte     TEXT,
      tiers_nom        TEXT,
      reference        TEXT,
      observations     TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (company_id, numero)
    )$t$, type_frs);
  CREATE INDEX IF NOT EXISTS idx_fria_mouvements_frs ON compta_fria_mouvements(fournisseur_id, campagne);

  -- Mêmes règles d'accès que compta_fournisseurs
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

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_fria_mouvements TO authenticated;

NOTIFY pgrst, 'reload schema';
