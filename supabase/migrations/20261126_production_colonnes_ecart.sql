-- Colonnes calculées des étapes de production (écart), absentes de certaines bases.
-- L'application enregistre quand même sans elles ; ce script permet de les conserver.
ALTER TABLE IF EXISTS compta_decorticage     ADD COLUMN IF NOT EXISTS ecart NUMERIC;
ALTER TABLE IF EXISTS compta_calibrage       ADD COLUMN IF NOT EXISTS ecart NUMERIC;
ALTER TABLE IF EXISTS compta_tri_optique     ADD COLUMN IF NOT EXISTS ecart NUMERIC;
ALTER TABLE IF EXISTS compta_conditionnement ADD COLUMN IF NOT EXISTS ecart NUMERIC;
ALTER TABLE IF EXISTS compta_conditionnement ADD COLUMN IF NOT EXISTS poids_total_conditionne NUMERIC;
NOTIFY pgrst, 'reload schema';
