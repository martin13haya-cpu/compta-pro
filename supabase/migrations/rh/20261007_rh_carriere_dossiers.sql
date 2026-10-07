-- =====================================================================
-- Compta Pro — RH & Paie, lot 4 : carrière et dossier du personnel
-- ⚠️ À exécuter dans le projet Supabase RH (rducxnyxgqrmtyvqwfzw),
--    celui qui contient la table « employees ».
-- =====================================================================
--
-- rh_carriere  : événements de carrière (promotion, changement de poste,
--                augmentation, sanction, fin de contrat…) avec la situation
--                avant / après (emploi, catégorie, salaire de base).
-- rh_documents : pièces du dossier du personnel. Les fichiers sont dans
--                l'espace de stockage PRIVÉ « dossiers-personnel » : ils ne
--                s'ouvrent que par un lien temporaire, jamais par une adresse
--                publique.
--
-- Mêmes principes que les lots 2 et 3. Idempotent.
-- =====================================================================

DO $$
DECLARE
  type_emp  TEXT;
  type_soc  TEXT;
  t         TEXT;
  pol       RECORD;
  rls_on    BOOLEAN;
BEGIN
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_emp FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'id';
  SELECT CASE WHEN data_type = 'uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_soc FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'company_id';
  IF type_emp IS NULL THEN
    RAISE EXCEPTION 'Table employees introuvable : exécutez ce script dans le projet Supabase RH.';
  END IF;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS rh_carriere (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id         %1$s,
      employee_id        %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id            UUID,
      type               TEXT NOT NULL CHECK (type IN ('embauche','fin_essai','titularisation','promotion','avancement','augmentation',
                           'changement_poste','mutation','recompense','avertissement','blame','mise_a_pied','suspension',
                           'fin_contrat','demission','retraite','licenciement','deces','autre')),
      date_effet         DATE NOT NULL,
      reference_decision TEXT,
      motif              TEXT,
      emploi_avant       TEXT,
      emploi_apres       TEXT,
      categorie_avant    TEXT,
      categorie_apres    TEXT,
      salaire_avant      NUMERIC,
      salaire_apres      NUMERIC,
      applique           BOOLEAN NOT NULL DEFAULT false,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS rh_documents (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       %1$s,
      employee_id      %2$s NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id          UUID,
      categorie        TEXT NOT NULL CHECK (categorie IN ('contrat','avenant','piece_identite','diplome','cv','attestation',
                         'certificat_medical','decision','acte_civil','rib','autre')),
      libelle          TEXT NOT NULL,
      chemin           TEXT NOT NULL,
      nom_fichier      TEXT,
      type_mime        TEXT,
      taille           BIGINT,
      date_expiration  DATE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_soc, type_emp);

  CREATE INDEX IF NOT EXISTS idx_rh_carriere_emp ON rh_carriere(employee_id, date_effet);
  CREATE INDEX IF NOT EXISTS idx_rh_carriere_soc ON rh_carriere(company_id);
  CREATE INDEX IF NOT EXISTS idx_rh_documents_emp ON rh_documents(employee_id);
  CREATE INDEX IF NOT EXISTS idx_rh_documents_soc ON rh_documents(company_id);

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.employees'::regclass;
  FOREACH t IN ARRAY ARRAY['rh_carriere','rh_documents'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employees' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    ELSE
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON rh_carriere, rh_documents TO anon, authenticated;

-- Espace de stockage privé des pièces (10 Mo maximum par fichier).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dossiers-personnel', 'dossiers-personnel', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "dossiers_personnel_acces" ON storage.objects;
CREATE POLICY "dossiers_personnel_acces" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id = 'dossiers-personnel')
  WITH CHECK (bucket_id = 'dossiers-personnel');
