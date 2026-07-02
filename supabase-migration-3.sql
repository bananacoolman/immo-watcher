-- Colonnes de geolocalisation des biens. A executer une fois dans Supabase.
alter table immo_seen add column if not exists lat        double precision;
alter table immo_seen add column if not exists lng        double precision;
alter table immo_seen add column if not exists secteur    text;
alter table immo_seen add column if not exists geo_source text;         -- 'page' | 'texte' | 'multimandat'
alter table immo_seen add column if not exists geo_at     timestamptz;  -- horodatage de la derniere tentative
