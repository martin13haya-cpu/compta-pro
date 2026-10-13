-- =====================================================================
-- ComptaPro — Codification unique (société, producteurs, étuveuses,
-- groupes, lots, passages à l'étuvage)
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261013_categorie_fournisseurs.sql.
-- =====================================================================
--
-- compta_companies.code            : 2 à 5 lettres/chiffres, unique dans tout
--                                    Compta Pro (ex. KOU). Tiré du nom ici,
--                                    modifiable dans la fiche de la société.
-- code_trace (fournisseurs)        : KOU-P00042 (producteur / fournisseur)
-- code_trace (étuveuses)           : KOU-E007
-- code_trace (achats groupés)      : KOU-G26001 (= GRP-2026-001)
-- code_trace (lots de production)  : KOU-L26001
-- code_trace (envois aux étuveuses): KOU-G26001-E007-1 (société, origine,
--                                    étuveuse, n° de passage)
-- code_trace (cycles d'étuvage)    : code du passage d'origine (référence)
--
-- Unicité garantie par la base (index uniques) ; les numéros sont donnés
-- par compta_prochain_numero(), un compteur par société et par clé,
-- incrémenté de façon atomique : deux saisies simultanées ne peuvent pas
-- obtenir le même numéro. Les numéros existants (GRP-…, ENV-…) ne changent
-- pas. Idempotent.
-- =====================================================================

-- ── 1. Code société ─────────────────────────────────────────────────────
ALTER TABLE compta_companies ADD COLUMN IF NOT EXISTS code TEXT;
DO $$
DECLARE c RECORD; base TEXT; essai TEXT; n INT;
BEGIN
  FOR c IN SELECT id, raison_sociale FROM compta_companies WHERE code IS NULL ORDER BY created_at NULLS LAST, id LOOP
    -- Dernier mot significatif du nom (souvent la localité) : 3 premières lettres.
    base := upper(regexp_replace(translate(coalesce(c.raison_sociale, 'SOC'),
              'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'), '[^A-Za-z0-9 ]', ' ', 'g'));
    base := (SELECT w FROM regexp_split_to_table(trim(base), '\s+') WITH ORDINALITY AS t(w, i)
             WHERE length(w) >= 3 ORDER BY i DESC LIMIT 1);
    base := left(coalesce(base, 'SOC'), 3);
    essai := base; n := 1;
    WHILE EXISTS (SELECT 1 FROM compta_companies WHERE code = essai) LOOP
      n := n + 1; essai := left(base, 2) || n;
    END LOOP;
    UPDATE compta_companies SET code = essai WHERE id = c.id;
  END LOOP;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compta_companies_code_check') THEN
    ALTER TABLE compta_companies ADD CONSTRAINT compta_companies_code_check CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,5}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_companies_code ON compta_companies(code) WHERE code IS NOT NULL;

-- ── 2. Compteurs atomiques ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compta_compteurs (
  company_id UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  cle        TEXT NOT NULL,
  valeur     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, cle)
);
-- Accès : mêmes règles que les fournisseurs de la société.
DO $$
DECLARE pol RECORD; rls_on BOOLEAN;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='compta_compteurs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON compta_compteurs', pol.policyname);
  END LOOP;
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_fournisseurs'::regclass;
  IF rls_on THEN
    ALTER TABLE compta_compteurs ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='compta_fournisseurs' LOOP
      EXECUTE format('CREATE POLICY %I ON compta_compteurs AS %s FOR %s TO %s %s %s',
        pol.policyname, pol.permissive, pol.cmd,
        (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
        -- les règles des fournisseurs citent parfois user_id : sans objet ici
        CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || replace(pol.qual, 'user_id', 'NULL::uuid') || ')' ELSE '' END,
        CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || replace(pol.with_check, 'user_id', 'NULL::uuid') || ')' ELSE '' END);
    END LOOP;
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON compta_compteurs TO authenticated;

-- Numéro suivant pour (société, clé) : 1, 2, 3… sans trou ni doublon.
CREATE OR REPLACE FUNCTION compta_prochain_numero(p_company_id UUID, p_cle TEXT)
RETURNS INTEGER LANGUAGE sql AS $$
  INSERT INTO compta_compteurs (company_id, cle, valeur) VALUES (p_company_id, p_cle, 1)
  ON CONFLICT (company_id, cle) DO UPDATE SET valeur = compta_compteurs.valeur + 1
  RETURNING valeur;
$$;
GRANT EXECUTE ON FUNCTION compta_prochain_numero(UUID, TEXT) TO authenticated;

-- ── 3. Colonnes de code ─────────────────────────────────────────────────
ALTER TABLE compta_fournisseurs     ADD COLUMN IF NOT EXISTS code_trace TEXT;
ALTER TABLE compta_etuveuses        ADD COLUMN IF NOT EXISTS code_trace TEXT;
ALTER TABLE compta_achats_groupes   ADD COLUMN IF NOT EXISTS code_trace TEXT;
ALTER TABLE compta_lots_production  ADD COLUMN IF NOT EXISTS code_trace TEXT;
ALTER TABLE compta_envois_etuveuses ADD COLUMN IF NOT EXISTS code_trace TEXT;
ALTER TABLE compta_etuvage          ADD COLUMN IF NOT EXISTS code_trace TEXT;

-- ── 4. Attribution aux fiches existantes ────────────────────────────────
-- Producteurs / fournisseurs : KOU-P00001… par ordre de création.
WITH n AS (
  SELECT f.id, c.code, f.company_id, row_number() OVER (PARTITION BY f.company_id ORDER BY f.created_at NULLS LAST, f.id) AS rang
  FROM compta_fournisseurs f JOIN compta_companies c ON c.id = f.company_id WHERE f.code_trace IS NULL
)
UPDATE compta_fournisseurs f SET code_trace = n.code || '-P' || lpad((n.rang + coalesce((SELECT valeur FROM compta_compteurs k WHERE k.company_id = n.company_id AND k.cle = 'P'), 0))::text, 5, '0')
FROM n WHERE f.id = n.id;
INSERT INTO compta_compteurs (company_id, cle, valeur)
  SELECT company_id, 'P', max(substring(code_trace from '-P(\d+)$')::int) FROM compta_fournisseurs WHERE code_trace ~ '-P\d+$' GROUP BY company_id
ON CONFLICT (company_id, cle) DO UPDATE SET valeur = greatest(compta_compteurs.valeur, excluded.valeur);

-- Étuveuses : KOU-E001…
WITH n AS (
  SELECT e.id, c.code, e.company_id, row_number() OVER (PARTITION BY e.company_id ORDER BY e.created_at NULLS LAST, e.id) AS rang
  FROM compta_etuveuses e JOIN compta_companies c ON c.id = e.company_id WHERE e.code_trace IS NULL
)
UPDATE compta_etuveuses e SET code_trace = n.code || '-E' || lpad((n.rang + coalesce((SELECT valeur FROM compta_compteurs k WHERE k.company_id = n.company_id AND k.cle = 'E'), 0))::text, 3, '0')
FROM n WHERE e.id = n.id;
INSERT INTO compta_compteurs (company_id, cle, valeur)
  SELECT company_id, 'E', max(substring(code_trace from '-E(\d+)$')::int) FROM compta_etuveuses WHERE code_trace ~ '-E\d+$' GROUP BY company_id
ON CONFLICT (company_id, cle) DO UPDATE SET valeur = greatest(compta_compteurs.valeur, excluded.valeur);

-- Achats groupés : GRP-2026-001 → KOU-G26001 ; compteur GRP:2026 = plus grand n°.
UPDATE compta_achats_groupes g SET code_trace = c.code || '-G' || substring(g.numero from 7 for 2) || substring(g.numero from 10)
FROM compta_companies c WHERE c.id = g.company_id AND g.code_trace IS NULL AND g.numero ~ '^GRP-\d{4}-\d+$';
INSERT INTO compta_compteurs (company_id, cle, valeur)
  SELECT company_id, 'GRP:' || substring(numero from 5 for 4), max(substring(numero from 10)::int) FROM compta_achats_groupes WHERE numero ~ '^GRP-\d{4}-\d+$' GROUP BY company_id, substring(numero from 5 for 4)
ON CONFLICT (company_id, cle) DO UPDATE SET valeur = greatest(compta_compteurs.valeur, excluded.valeur);

-- Lots de production : KOU-L26001… par année de début.
WITH n AS (
  SELECT l.id, c.code, l.company_id, to_char(coalesce(l.date_debut, l.created_at::date, current_date), 'YY') AS aa,
         row_number() OVER (PARTITION BY l.company_id, to_char(coalesce(l.date_debut, l.created_at::date, current_date), 'YY') ORDER BY l.created_at NULLS LAST, l.id) AS rang
  FROM compta_lots_production l JOIN compta_companies c ON c.id = l.company_id WHERE l.code_trace IS NULL
)
UPDATE compta_lots_production l SET code_trace = n.code || '-L' || n.aa || lpad((n.rang + coalesce((SELECT valeur FROM compta_compteurs k WHERE k.company_id = n.company_id AND k.cle = 'L:' || n.aa), 0))::text, 3, '0')
FROM n WHERE l.id = n.id;
INSERT INTO compta_compteurs (company_id, cle, valeur)
  SELECT company_id, 'L:' || substring(code_trace from '-L(\d\d)\d+$'), max(substring(code_trace from '-L\d\d(\d+)$')::int) FROM compta_lots_production WHERE code_trace ~ '-L\d{5,}$' GROUP BY company_id, substring(code_trace from '-L(\d\d)\d+$')
ON CONFLICT (company_id, cle) DO UPDATE SET valeur = greatest(compta_compteurs.valeur, excluded.valeur);

-- Envois : société + origine du lot (groupe s'il n'y en a qu'un, sinon le
-- producteur unique, sinon le lot) + étuveuse + n° de passage.
WITH o AS (
  SELECT v.id, v.company_id, v.date_envoi, v.created_at, c.code AS soc,
    coalesce(
      (SELECT substring(g.code_trace from '-(G\d+)$') FROM compta_achats_groupes g WHERE g.lot_id = v.lot_id AND g.statut <> 'annule' AND g.code_trace IS NOT NULL
         AND (SELECT count(*) FROM compta_achats_groupes g2 WHERE g2.lot_id = v.lot_id AND g2.statut <> 'annule') = 1 LIMIT 1),
      (SELECT substring(f.code_trace from '-(P\d+)$') FROM compta_lot_origines lo JOIN compta_fournisseurs f ON f.id = lo.fournisseur_id
         WHERE lo.lot_id = v.lot_id AND (SELECT count(DISTINCT lo2.fournisseur_id) FROM compta_lot_origines lo2 WHERE lo2.lot_id = v.lot_id) = 1 LIMIT 1),
      (SELECT substring(l.code_trace from '-(L\d+)$') FROM compta_lots_production l WHERE l.id = v.lot_id),
      'X') AS orig,
    coalesce((SELECT substring(e.code_trace from '-(E\d+)$') FROM compta_etuveuses e WHERE e.id = v.etuveuse_id), 'E000') AS etv
  FROM compta_envois_etuveuses v JOIN compta_companies c ON c.id = v.company_id WHERE v.code_trace IS NULL
), n AS (
  SELECT o.*, o.soc || '-' || o.orig || '-' || o.etv AS prefixe,
    row_number() OVER (PARTITION BY o.company_id, o.soc || '-' || o.orig || '-' || o.etv ORDER BY o.date_envoi, o.created_at, o.id) AS rang
  FROM o
)
UPDATE compta_envois_etuveuses v SET code_trace = n.prefixe || '-' || n.rang FROM n WHERE v.id = n.id;
INSERT INTO compta_compteurs (company_id, cle, valeur)
  SELECT company_id, 'PASS:' || regexp_replace(code_trace, '-\d+$', ''), max(substring(code_trace from '-(\d+)$')::int) FROM compta_envois_etuveuses WHERE code_trace IS NOT NULL GROUP BY company_id, regexp_replace(code_trace, '-\d+$', '')
ON CONFLICT (company_id, cle) DO UPDATE SET valeur = greatest(compta_compteurs.valeur, excluded.valeur);

-- Cycles d'étuvage créés par un retour : code du passage d'origine.
UPDATE compta_etuvage t SET code_trace = v.code_trace
FROM compta_retours_etuveuses r JOIN compta_envois_etuveuses v ON v.id = r.envoi_id
WHERE r.etuvage_id = t.id AND t.code_trace IS NULL AND v.code_trace IS NOT NULL;

-- ── 5. Unicité garantie par la base ─────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_fournisseurs_code_trace ON compta_fournisseurs(code_trace) WHERE code_trace IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_etuveuses_code_trace    ON compta_etuveuses(code_trace) WHERE code_trace IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_achats_groupes_code     ON compta_achats_groupes(code_trace) WHERE code_trace IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_lots_code_trace         ON compta_lots_production(code_trace) WHERE code_trace IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_envois_code_trace       ON compta_envois_etuveuses(code_trace) WHERE code_trace IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_etuvage_code_trace ON compta_etuvage(code_trace);

NOTIFY pgrst, 'reload schema';
