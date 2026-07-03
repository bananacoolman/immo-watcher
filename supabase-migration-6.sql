-- Matching acheteurs : criteres clients + dedup des notifs de match.
create table if not exists immo_clients (
  name       text primary key,
  budget_min bigint,
  budget_max bigint,
  communes   text[],          -- null = toutes
  surface_min int,
  keywords   text[],          -- mots-clefs a chercher dans le titre
  active     boolean default true,
  created_at timestamptz default now()
);

create table if not exists immo_client_matches (
  client_name text,
  url         text,
  created_at  timestamptz default now(),
  primary key (client_name, url)
);
