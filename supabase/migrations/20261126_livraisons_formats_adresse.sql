-- Livraisons d'un lot (traçabilité) : adresse de livraison et formats de sacs livrés.
-- Sans ce script, l'application les enregistre dans les observations de la livraison.
ALTER TABLE IF EXISTS compta_lot_destinations ADD COLUMN IF NOT EXISTS adresse_livraison TEXT;
ALTER TABLE IF EXISTS compta_lot_destinations ADD COLUMN IF NOT EXISTS formats JSONB;   -- { "25": 20, "50": 2 } = sacs par format (kg)
NOTIFY pgrst, 'reload schema';
