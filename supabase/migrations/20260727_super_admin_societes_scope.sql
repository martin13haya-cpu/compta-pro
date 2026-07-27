-- =====================================================================
-- ComptaPro — Restriction des sociétés visibles par un super admin
-- secondaire, définie exclusivement par martin13haya@gmail.com
-- À exécuter dans Supabase SQL Editor (projet proehigsikgqdrxjltmq)
-- =====================================================================
--
-- Comportement :
--   - martin13haya@gmail.com reste TOUJOURS illimité (maître du système).
--   - Un autre compte avec role='super_admin' reste illimité (comportement
--     actuel inchangé) TANT QUE martin13haya ne lui a assigné aucune
--     société via compta_super_admin_societes.
--   - Dès qu'AU MOINS UNE ligne existe pour ce super admin dans
--     compta_super_admin_societes, il devient restreint : il ne voit/gère
--     plus que les sociétés explicitement assignées.
--   - Aucune donnée existante n'est supprimée ; ce script ne fait
--     qu'ajouter une table et remplacer des policies (DROP + CREATE,
--     idempotent — peut être ré-exécuté sans risque).
--
-- ⚠️ Recommandé : exécuter en heures creuses et vérifier ensuite qu'un
-- compte super_admin secondaire (s'il en existe déjà un) peut toujours
-- se connecter et voir ses données avant d'assigner sa première société.
-- =====================================================================

-- ───────────────────── 1. Table des assignations ─────────────────────
CREATE TABLE IF NOT EXISTS compta_super_admin_societes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id),
  UNIQUE (super_admin_id, company_id)
);

ALTER TABLE compta_super_admin_societes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sas_master_manage" ON compta_super_admin_societes;
CREATE POLICY "sas_master_manage" ON compta_super_admin_societes
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'martin13haya@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'martin13haya@gmail.com');

DROP POLICY IF EXISTS "sas_read_own" ON compta_super_admin_societes;
CREATE POLICY "sas_read_own" ON compta_super_admin_societes
  FOR SELECT TO authenticated
  USING (super_admin_id = auth.uid());

-- ───────────────────── 2. Fonctions ───────────────────────────────────

-- is_super_admin() : conserve exactement son comportement actuel pour le
-- maître et pour tout super admin pas encore restreint. Ne devient FALSE
-- que pour un super admin auquel martin13haya a assigné au moins une
-- société (il bascule alors sur has_assigned_company_access ci-dessous).
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_is_restricted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email = 'martin13haya@gmail.com' THEN
    RETURN true;
  END IF;

  SELECT role INTO v_role FROM compta_profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM compta_super_admin_societes WHERE super_admin_id = v_uid
  ) INTO v_is_restricted;

  RETURN NOT v_is_restricted;
END;
$$;

-- has_assigned_company_access(company_id) : vrai uniquement si l'appelant
-- est un super admin restreint ET que cette société précise lui a été
-- assignée par martin13haya.
CREATE OR REPLACE FUNCTION has_assigned_company_access(target_company_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM compta_super_admin_societes
    WHERE super_admin_id = auth.uid() AND company_id = target_company_id
  );
$$;

-- ───────────────────── 3. compta_companies (policy dédiée) ───────────
DROP POLICY IF EXISTS "compta_companies_own" ON compta_companies;
CREATE POLICY "compta_companies_own" ON compta_companies
  FOR ALL USING (
    auth.uid() = user_id
    OR is_super_admin()
    OR has_assigned_company_access(id)
  );

-- ───────────────────── 4. compta_profiles (policy dédiée) ─────────────
DROP POLICY IF EXISTS "profiles_super_admin" ON compta_profiles;
CREATE POLICY "profiles_super_admin" ON compta_profiles
  FOR ALL USING (
    auth.uid() = id
    OR is_super_admin()
    OR company_id IN (
      SELECT company_id FROM compta_super_admin_societes WHERE super_admin_id = auth.uid()
    )
    OR id IN (
      SELECT user_id FROM compta_companies
      WHERE id IN (
        SELECT company_id FROM compta_super_admin_societes WHERE super_admin_id = auth.uid()
      )
    )
  );

-- ───────────────────── 5. Tables avec user_id ET company_id ──────────
-- Même liste que fix_rls_all_tables.sql, avec la même policy + le
-- nouvel OR has_assigned_company_access(company_id).
DO $$
DECLARE tables TEXT[] := ARRAY[
  'compta_achats_semi_finis',
  'compta_articles',
  'compta_avances_etuveuses',
  'compta_bc_etuveuses',
  'compta_br_etuveuses',
  'compta_budget',
  'compta_calibrage',
  'compta_clients',
  'compta_conditionnement',
  'compta_decorticage',
  'compta_documents',
  'compta_entrees_magasin',
  'compta_epierrage',
  'compta_etuvage',
  'compta_etuveuses',
  'compta_expression_besoin',
  'compta_fournisseurs',
  'compta_journal_banque',
  'compta_journal_caisse',
  'compta_journal_mobile',
  'compta_lots_production',
  'compta_lots_semi_finis',
  'compta_mouvements_stock',
  'compta_paiements_etuvage',
  'compta_prestations',
  'compta_reglements',
  'compta_sorties_magasin',
  'compta_tri_optique'
];
t TEXT;
pname TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    pname := replace(t,'compta_','');
    EXECUTE format('DROP POLICY IF EXISTS p_%s ON %s', pname, t);
    EXECUTE format('DROP POLICY IF EXISTS "p_%s" ON %s', pname, t);
    EXECUTE format($p$
      CREATE POLICY "p_%s" ON %s
      FOR ALL TO authenticated
      USING (
        is_super_admin()
        OR auth.uid() = user_id
        OR company_id IN (SELECT id FROM compta_companies WHERE user_id = auth.uid())
        OR company_id = get_my_company_id()
        OR has_assigned_company_access(company_id)
      )
    $p$, pname, t);
    RAISE NOTICE 'OK : %', t;
  END LOOP;
END $$;

-- ───────────────────── 6. compta_signataires (pas de company_id) ─────
-- Rattaché à une société via le propriétaire (user_id = compta_companies.user_id).
DROP POLICY IF EXISTS p_signataires ON compta_signataires;
DROP POLICY IF EXISTS "p_signataires" ON compta_signataires;
CREATE POLICY "p_signataires" ON compta_signataires
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR auth.uid() = user_id
    OR user_id IN (
      SELECT id FROM compta_profiles WHERE company_id = get_my_company_id()
    )
    OR user_id IN (
      SELECT c.user_id FROM compta_companies c
      WHERE has_assigned_company_access(c.id)
    )
  );

-- ───────────────────── 7. delete_company_cascade (suppression) ───────
-- Un super admin restreint ne peut supprimer que les sociétés qui lui
-- ont été explicitement assignées.
CREATE OR REPLACE FUNCTION public.delete_company_cascade(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  is_admin boolean;
BEGIN
  is_admin := (
    (auth.jwt() ->> 'email') = 'martin13haya@gmail.com'
    OR (
      EXISTS (SELECT 1 FROM public.compta_profiles WHERE id = auth.uid() AND role = 'super_admin')
      AND (
        NOT EXISTS (SELECT 1 FROM public.compta_super_admin_societes WHERE super_admin_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.compta_super_admin_societes
          WHERE super_admin_id = auth.uid() AND company_id = p_company_id
        )
      )
    )
  );

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Action réservée au super administrateur';
  END IF;

  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name  = 'company_id'
      AND table_name LIKE 'compta_%'
      AND table_name <> 'compta_companies'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE company_id = $1', r.table_name)
      USING p_company_id;
  END LOOP;

  DELETE FROM public.compta_companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_company_cascade(uuid) TO authenticated;

-- ───────────────────── 8. Vérification ────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename LIKE 'compta_%'
ORDER BY tablename, cmd;
