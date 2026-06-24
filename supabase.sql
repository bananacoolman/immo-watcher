-- A coller dans Supabase > SQL Editor, puis "Run".
create table if not exists immo_seen (
  site        text        not null,
  listing_id  text        not null,
  url         text,
  title       text,
  price       text,
  commune     text,
  image       text,
  first_seen  timestamptz not null default now(),
  primary key (site, listing_id)
);

create index if not exists immo_seen_first_seen_idx on immo_seen (first_seen desc);
