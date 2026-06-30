-- Table de deduplication des alertes agregees (multi-mandat, etc.)
-- A executer une fois dans Supabase → SQL Editor.
create table if not exists immo_alerts (
  key        text primary key,
  created_at timestamptz default now()
);

-- (RLS non necessaire : seul le bot, avec la cle service_role, y ecrit/lit.)
