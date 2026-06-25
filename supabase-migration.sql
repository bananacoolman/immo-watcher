-- Migration : memoire temporelle pour la detection des "mandats qui trainent".
-- A executer une seule fois dans Supabase (SQL Editor). Non destructif :
-- les lignes existantes sont conservees, on ajoute seulement des colonnes.

alter table immo_seen add column if not exists price_num          bigint;
alter table immo_seen add column if not exists initial_price      bigint;
alter table immo_seen add column if not exists price_history      jsonb       default '[]'::jsonb;
alter table immo_seen add column if not exists first_seen         timestamptz default now();
alter table immo_seen add column if not exists last_seen          timestamptz default now();
alter table immo_seen add column if not exists alerted_stale      boolean     default false;
alter table immo_seen add column if not exists alerted_drop_price bigint;

-- Pour les annonces deja en base (seedees avant la migration) :
-- on initialise le prix initial avec le prix courant si on l'a, sinon rien.
update immo_seen
   set initial_price = price_num
 where initial_price is null and price_num is not null;
