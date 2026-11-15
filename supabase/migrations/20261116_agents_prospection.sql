-- =====================================================================
-- ComptaPro — Agents de prospection commerciale : portefeuilles clients,
-- plaintes, activités terrain et analyse de performance
-- À exécuter dans Supabase SQL Editor du projet ComptaPro
-- (proehigsikgqdrxjltmq), APRÈS 20261115_epargne_fria.sql.
-- =====================================================================
--
-- Principe :
--  • compta_agents_prospection : fiche de l'agent (zone de couverture,
--    objectifs mensuels, salaire fixe, taux de commission) ;
--  • compta_clients.agent_id : portefeuille de l'agent. Un client est soit
--    « apporté par l'agent » (nouveau client, compté dans ses acquisitions),
--    soit un client existant qui lui est confié ;
--  • compta_plaintes_agents : plaintes des clients sur leurs relations
--    avec un agent ;
--  • compta_activites_agents : tournées (prospects visités, frais terrain).
-- Le chiffre d'affaires et les encaissements se lisent dans
-- compta_documents (factures) et compta_reglements : rien n'est dupliqué.
-- Idempotent.
-- =====================================================================

-- 1. Agents de prospection
CREATE TABLE IF NOT EXISTS compta_agents_prospection (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES auth.users(id),
  code                   TEXT NOT NULL,
  nom                    TEXT NOT NULL,
  prenom                 TEXT,
  telephone              TEXT,
  email                  TEXT,
  zone                   TEXT,          -- intitulé de la zone de couverture
  localites              TEXT,          -- localités de la zone, séparées par des virgules
  date_recrutement       DATE,
  objectif_clients_mois  NUMERIC NOT NULL DEFAULT 0 CHECK (objectif_clients_mois >= 0),
  objectif_ca_mois       NUMERIC NOT NULL DEFAULT 0 CHECK (objectif_ca_mois >= 0),
  salaire_mensuel        NUMERIC NOT NULL DEFAULT 0 CHECK (salaire_mensuel >= 0),
  taux_commission        NUMERIC NOT NULL DEFAULT 0 CHECK (taux_commission >= 0 AND taux_commission <= 100),
  actif                  BOOLEAN NOT NULL DEFAULT true,
  observations           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- 2. Portefeuille : rattachement du client à son agent
ALTER TABLE compta_clients ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES compta_agents_prospection(id) ON DELETE SET NULL;
ALTER TABLE compta_clients ADD COLUMN IF NOT EXISTS date_affectation_agent DATE;
ALTER TABLE compta_clients ADD COLUMN IF NOT EXISTS apporte_par_agent BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_clients_agent ON compta_clients(agent_id);

-- 3. Plaintes et activités terrain
DO $$
DECLARE
  type_cli TEXT; rls_on BOOLEAN; pol RECORD; t TEXT;
BEGIN
  SELECT CASE WHEN data_type='uuid' THEN 'uuid' WHEN data_type IN ('integer','bigint') THEN data_type ELSE 'text' END
    INTO type_cli FROM information_schema.columns WHERE table_schema='public' AND table_name='compta_clients' AND column_name='id';

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS compta_plaintes_agents (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
      user_id          UUID REFERENCES auth.users(id),
      agent_id         UUID NOT NULL REFERENCES compta_agents_prospection(id) ON DELETE CASCADE,
      client_id        %1$s REFERENCES compta_clients(id) ON DELETE SET NULL,
      client_nom       TEXT,
      date_plainte     DATE NOT NULL,
      motif            TEXT NOT NULL,
      gravite          TEXT NOT NULL DEFAULT 'moyenne' CHECK (gravite IN ('mineure','moyenne','grave')),
      description      TEXT,
      statut           TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','resolue','non_fondee')),
      date_resolution  DATE,
      suite_donnee     TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )$t$, type_cli);
  CREATE INDEX IF NOT EXISTS idx_plaintes_agents_agent ON compta_plaintes_agents(agent_id, date_plainte);

  CREATE TABLE IF NOT EXISTS compta_activites_agents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES compta_companies(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES auth.users(id),
    agent_id       UUID NOT NULL REFERENCES compta_agents_prospection(id) ON DELETE CASCADE,
    date_activite  DATE NOT NULL,
    localite       TEXT,
    nb_prospects   INTEGER NOT NULL DEFAULT 0 CHECK (nb_prospects >= 0),
    frais          NUMERIC NOT NULL DEFAULT 0 CHECK (frais >= 0),
    observations   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_activites_agents_agent ON compta_activites_agents(agent_id, date_activite);

  -- Mêmes règles d'accès que compta_clients
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.compta_clients'::regclass;
  FOREACH t IN ARRAY ARRAY['compta_agents_prospection','compta_plaintes_agents','compta_activites_agents'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    IF rls_on THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='compta_clients' LOOP
        EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
          pol.policyname, t, pol.permissive, pol.cmd,
          (SELECT string_agg(quote_ident(r), ', ') FROM unnest(pol.roles) r),
          CASE WHEN pol.qual IS NOT NULL THEN 'USING (' || pol.qual || ')' ELSE '' END,
          CASE WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK (' || pol.with_check || ')' ELSE '' END);
      END LOOP;
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON compta_agents_prospection, compta_plaintes_agents, compta_activites_agents TO authenticated;

NOTIFY pgrst, 'reload schema';
