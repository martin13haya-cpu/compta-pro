-- =====================================================================
-- ComptaPro — Bons d'entrée et bons de sortie de stock
-- À exécuter dans Supabase SQL Editor (projet proehigsikgqdrxjltmq)
-- =====================================================================
--
-- Un bon regroupe plusieurs articles sous un même numéro (BE-AAAAMMJJ-NNNN
-- pour une entrée, BS-AAAAMMJJ-NNNN pour une sortie). Chaque ligne passe en
-- plus un mouvement ordinaire dans compta_mouvements_stock (référence = le
-- numéro du bon) : le stock et l'historique des mouvements restent la
-- référence ; cette table garde l'en-tête et les lignes pour réimprimer le
-- bon à l'identique.
--
-- Idempotent : peut être ré-exécuté sans risque.
-- =====================================================================

CREATE TABLE IF NOT EXISTS compta_bons_stock (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id),
  numero       TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('entree', 'sortie')),
  -- Date d'entrée / de sortie saisie ; created_at reste la date
  -- d'enregistrement, posée par la base.
  date_bon     DATE NOT NULL,
  tiers        TEXT,
  motif        TEXT,
  observations TEXT,
  -- [{ article_id, designation, unite, quantite, prix_unitaire, montant, observation }]
  lignes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  total        NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_bons_stock_company ON compta_bons_stock(company_id, date_bon DESC);

-- Même règle d'accès que les autres tables de données de la société.
ALTER TABLE compta_bons_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "p_bons_stock" ON compta_bons_stock;
CREATE POLICY "p_bons_stock" ON compta_bons_stock
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR auth.uid() = user_id
    OR company_id IN (SELECT id FROM compta_companies WHERE user_id = auth.uid())
    OR company_id = get_my_company_id()
    OR has_assigned_company_access(company_id)
  );
