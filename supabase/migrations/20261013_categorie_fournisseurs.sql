-- =====================================================================
-- ComptaPro — Catégorie des fournisseurs
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq).
-- =====================================================================
--
-- compta_fournisseurs.categorie : producteur | prestataire | commercant |
-- transporteur | autre (NULL = non classé).
--
-- Classement initial : un fournisseur qui a des avances, un contrat, une
-- coopérative, un mentor ou une ligne d'achat groupé est un producteur. Les
-- autres restent « non classés » et se classent depuis leur fiche.
-- Idempotent.
-- =====================================================================

ALTER TABLE compta_fournisseurs ADD COLUMN IF NOT EXISTS categorie TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compta_fournisseurs_categorie_check') THEN
    ALTER TABLE compta_fournisseurs ADD CONSTRAINT compta_fournisseurs_categorie_check
      CHECK (categorie IS NULL OR categorie IN ('producteur','prestataire','commercant','transporteur','autre'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fournisseurs_categorie ON compta_fournisseurs(company_id, categorie);

UPDATE compta_fournisseurs f SET categorie = 'producteur'
WHERE f.categorie IS NULL
  AND (
       COALESCE(f.prix_contrat, 0) > 0
    OR NULLIF(TRIM(COALESCE(f.numero_contrat, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(f.cooperative_affiliee, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(f.mentor_nom, '')), '') IS NOT NULL
    OR EXISTS (SELECT 1 FROM compta_avances_fournisseur a WHERE a.fournisseur_id = f.id)
    OR (to_regclass('public.compta_achats_groupes_lignes') IS NOT NULL
        AND EXISTS (SELECT 1 FROM compta_achats_groupes_lignes l WHERE l.fournisseur_id = f.id))
  );

NOTIFY pgrst, 'reload schema';
