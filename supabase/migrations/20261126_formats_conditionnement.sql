-- Formats de conditionnement : quantité (kg) contenue dans chaque format de sac, par société.
ALTER TABLE IF EXISTS compta_seuils_production ADD COLUMN IF NOT EXISTS format_5kg   NUMERIC DEFAULT 5;
ALTER TABLE IF EXISTS compta_seuils_production ADD COLUMN IF NOT EXISTS format_25kg  NUMERIC DEFAULT 25;
ALTER TABLE IF EXISTS compta_seuils_production ADD COLUMN IF NOT EXISTS format_50kg  NUMERIC DEFAULT 50;
ALTER TABLE IF EXISTS compta_seuils_production ADD COLUMN IF NOT EXISTS format_5x5kg NUMERIC DEFAULT 25;
NOTIFY pgrst, 'reload schema';
