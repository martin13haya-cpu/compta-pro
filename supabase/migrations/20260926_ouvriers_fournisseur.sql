-- =====================================================================
-- ComptaPro — Ouvriers engagés par chaque producteur (fournisseur)
-- À exécuter dans Supabase SQL Editor (projet proehigsikgqdrxjltmq)
-- =====================================================================
--
-- Remplace les deux compteurs « Nombre de jeunes femmes / hommes à
-- engager » de la fiche fournisseur par une vraie liste nominative :
-- nom et prénom, contact, sexe, situation de handicap, âge, village.
-- Les anciennes colonnes nombre_jeunes_* ne sont pas supprimées (aucune
-- donnée perdue), elles ne sont simplement plus affichées.
--
-- Idempotent : peut être ré-exécuté sans risque.
-- =====================================================================

-- Le type de compta_fournisseurs.id est lu dans le schéma, pour que la
-- clé étrangère lui corresponde quel qu'il soit (uuid ou bigint).
DO $$
DECLARE
  type_id TEXT;
BEGIN
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' ELSE 'bigint' END INTO type_id
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'compta_fournisseurs' AND column_name = 'id';

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_ouvriers_fournisseur (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fournisseur_id %s NOT NULL REFERENCES compta_fournisseurs(id) ON DELETE CASCADE,
      company_id     UUID REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id        UUID REFERENCES auth.users(id),
      nom_prenom     TEXT NOT NULL,
      contact        TEXT,
      sexe           TEXT CHECK (sexe IN ('Homme', 'Femme')),
      handicap       BOOLEAN NOT NULL DEFAULT false,
      age            INTEGER,
      village        TEXT,
      ordre          INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $t$, type_id);
END $$;

CREATE INDEX IF NOT EXISTS idx_ouvriers_fournisseur ON compta_ouvriers_fournisseur(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_ouvriers_company ON compta_ouvriers_fournisseur(company_id);

-- Même règle d'accès que les autres tables de données de la société.
ALTER TABLE compta_ouvriers_fournisseur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "p_ouvriers_fournisseur" ON compta_ouvriers_fournisseur;
CREATE POLICY "p_ouvriers_fournisseur" ON compta_ouvriers_fournisseur
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR auth.uid() = user_id
    OR company_id IN (SELECT id FROM compta_companies WHERE user_id = auth.uid())
    OR company_id = get_my_company_id()
    OR has_assigned_company_access(company_id)
  );
