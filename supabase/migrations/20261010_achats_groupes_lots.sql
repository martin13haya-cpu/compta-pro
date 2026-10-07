-- =====================================================================
-- ComptaPro — Achats groupés de riz paddy (lot 3 : lots de production)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261009_achats_groupes.sql et
-- 20261008_tracabilite_lots.sql.
-- =====================================================================
--
-- compta_achats_groupes.lot_id           : lot de production où le paddy du
--                                          groupe a été versé.
-- compta_achats_groupes.lot_qte_ajoutee  : quantité ajoutée au « paddy
--                                          entrée » du lot (retirée si le
--                                          groupe est détaché du lot).
-- compta_lot_origines.achat_groupe_id    : origine créée depuis un groupe
--                                          (une ligne par producteur), pour
--                                          la traçabilité et le détachement.
-- Idempotent.
-- =====================================================================

DO $$
DECLARE type_lot TEXT;
BEGIN
  IF to_regclass('public.compta_achats_groupes') IS NULL THEN
    RAISE EXCEPTION 'Table compta_achats_groupes introuvable : exécutez d''abord 20261009_achats_groupes.sql dans le projet ComptaPro.';
  END IF;
  IF to_regclass('public.compta_lot_origines') IS NULL THEN
    RAISE EXCEPTION 'Table compta_lot_origines introuvable : exécutez d''abord 20261008_tracabilite_lots.sql dans le projet ComptaPro.';
  END IF;
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_lot FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_lots_production' AND column_name='id';

  EXECUTE format('ALTER TABLE compta_achats_groupes ADD COLUMN IF NOT EXISTS lot_id %s REFERENCES compta_lots_production(id) ON DELETE SET NULL', type_lot);
  ALTER TABLE compta_achats_groupes ADD COLUMN IF NOT EXISTS lot_qte_ajoutee NUMERIC NOT NULL DEFAULT 0;
  ALTER TABLE compta_lot_origines ADD COLUMN IF NOT EXISTS achat_groupe_id UUID REFERENCES compta_achats_groupes(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_lot_origines_groupe ON compta_lot_origines(achat_groupe_id);
END $$;

NOTIFY pgrst, 'reload schema';
