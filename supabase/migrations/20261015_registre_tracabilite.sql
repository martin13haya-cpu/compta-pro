-- =====================================================================
-- ComptaPro — Registre de traçabilité du riz parboilisé (13 fiches)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq).
-- =====================================================================
--
-- Une ligne de registre = une ligne d'une des fiches du modèle
-- « Fiches_Tracabilite_Riz_Completee » (fiche 1 à 13, fiche 10 en six
-- tableaux 10.1 à 10.6), pour une campagne (ex. 2026-2027).
--   fiche    : f1, f2, … f9, f10_1 … f10_6, f11, f12, f13
--   donnees  : les colonnes de la fiche (JSON), définies dans l'application
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS compta_tracabilite_registres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  fiche       TEXT NOT NULL CHECK (fiche ~ '^f(1[0-3]?|[2-9])(_[1-6])?$'),
  campagne    TEXT NOT NULL,
  ordre       INTEGER NOT NULL DEFAULT 0,
  donnees     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traca_registres ON compta_tracabilite_registres(company_id, campagne, fiche, ordre);

-- Accès : utilisateurs de la société (même règle que les bons de stock).
ALTER TABLE compta_tracabilite_registres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "p_traca_registres" ON compta_tracabilite_registres;
CREATE POLICY "p_traca_registres" ON compta_tracabilite_registres
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR auth.uid() = user_id
    OR company_id IN (SELECT id FROM compta_companies WHERE user_id = auth.uid())
    OR company_id = get_my_company_id()
    OR has_assigned_company_access(company_id)
  )
  WITH CHECK (
    is_super_admin()
    OR auth.uid() = user_id
    OR company_id IN (SELECT id FROM compta_companies WHERE user_id = auth.uid())
    OR company_id = get_my_company_id()
    OR has_assigned_company_access(company_id)
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON compta_tracabilite_registres TO authenticated;

NOTIFY pgrst, 'reload schema';
