-- ============================================================
--  Migration 7 : saisie des clients depuis la page web "Mes clients"
--  A executer une fois dans Supabase -> SQL Editor.
--
--  Securite : la table immo_clients reste verrouillee (RLS). La page web
--  n'y accede QUE via les fonctions ci-dessous, qui exigent un code d'acces
--  (stocke chiffre en bcrypt dans immo_kv, jamais dans le depot GitHub).
--  Anti-force-brute : 10 codes faux en 15 min -> blocage 15 min.
--  Le code se definit A PART (voir instructions), pas dans ce fichier public.
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;          -- envoi Telegram immediat depuis la base

create table if not exists immo_kv (key text primary key, value text);
alter table immo_kv enable row level security;

-- nouvelles colonnes clients
alter table immo_clients add column if not exists type text;               -- maison | appartement | terrain | null
alter table immo_clients add column if not exists keywords_required boolean default false;
alter table immo_clients add column if not exists notes text;               -- coordonnees, remarques
alter table immo_clients add column if not exists seeded_at timestamptz;    -- null = recap Telegram a envoyer
alter table immo_clients add column if not exists updated_at timestamptz default now();
alter table immo_clients add column if not exists precision text default 'stricte';  -- stricte | large

-- description des annonces (recuperee par le bot) : sert a verifier piscine, vue mer...
alter table immo_seen add column if not exists description text;

-- les clients deja crees via Telegram ont deja recu leur liste : pas de re-recap
update immo_clients set seeded_at = coalesce(created_at, now()) where seeded_at is null;

create table if not exists immo_pin_fails (ts timestamptz default now());
alter table immo_pin_fails enable row level security;

-- ---------- connexion depuis Telegram (formulaire ouvert dans Telegram) ----------
-- Telegram joint au formulaire une signature (initData) calculee avec le jeton
-- du bot. On la verifie ici : seule une ouverture depuis la conversation du bot,
-- par un compte autorise, est acceptee. Aucun code a taper dans Telegram.
create or replace function public.immo_url_decode(s text)
returns text language plpgsql immutable
as $$
declare b bytea := ''::bytea; i int := 1; n int := length(s); c text;
begin
  while i <= n loop
    c := substr(s, i, 1);
    if c = '%' and i + 2 <= n then b := b || decode(substr(s, i + 1, 2), 'hex'); i := i + 3;
    elsif c = '+' then b := b || '\x20'::bytea; i := i + 1;
    else b := b || convert_to(c, 'UTF8'); i := i + 1;
    end if;
  end loop;
  return convert_from(b, 'UTF8');
end $$;

create or replace function public.immo_tg_ok(p_init text)
returns boolean language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_token text; v_chat text; v_users text;
  pair text; k text; v text; v_hash text; v_auth bigint; v_user jsonb;
  parts text[] := '{}'; dcs text; calc text;
begin
  select value into v_token from immo_kv where key = 'telegram_token';
  select value into v_chat from immo_kv where key = 'telegram_chat';
  select value into v_users from immo_kv where key = 'telegram_users';
  if v_token is null or p_init is null or p_init = '' then return false; end if;

  foreach pair in array string_to_array(p_init, '&') loop
    k := split_part(pair, '=', 1);
    v := immo_url_decode(substr(pair, length(k) + 2));
    if k = 'hash' then v_hash := v;
    else
      parts := parts || (k || '=' || v);
      if k = 'auth_date' then v_auth := v::bigint; end if;
      if k = 'user' then v_user := v::jsonb; end if;
    end if;
  end loop;
  if v_hash is null or v_auth is null or v_user is null then return false; end if;

  select string_agg(x, E'\n' order by x collate "C") into dcs from unnest(parts) x;
  calc := encode(extensions.hmac(convert_to(dcs, 'UTF8'),
            extensions.hmac(convert_to(v_token, 'UTF8'), convert_to('WebAppData', 'UTF8'), 'sha256'),
            'sha256'), 'hex');
  if calc <> lower(v_hash) then return false; end if;
  if to_timestamp(v_auth) < now() - interval '24 hours' then return false; end if;   -- ouverture recente

  -- compte autorise : celui de la conversation du bot, ou liste telegram_users (ids separes par des virgules)
  return (v_user->>'id') = v_chat
      or (v_user->>'id') = any (string_to_array(replace(coalesce(v_users, ''), ' ', ''), ','));
exception when others then
  return false;
end $$;

-- ---------- verification du code (usage interne) ----------
create or replace function public.immo_pin_error(p_pin text)
returns text language plpgsql security definer
set search_path = public, extensions
as $$
declare h text; n int;
begin
  delete from immo_pin_fails where ts < now() - interval '1 day';
  select count(*) into n from immo_pin_fails where ts > now() - interval '15 minutes';
  if n >= 10 then return 'Trop de tentatives — réessayez dans 15 minutes'; end if;
  if p_pin like 'tg:%' then                              -- ouvert depuis Telegram
    if immo_tg_ok(substr(p_pin, 4)) then return null; end if;
    insert into immo_pin_fails default values;
    return 'Session Telegram expirée — rouvrez le formulaire depuis Telegram';
  end if;
  select value into h from immo_kv where key = 'clients_pin';
  if h is null then return 'Code non configuré (voir instructions de mise en place)'; end if;
  if p_pin is not null and p_pin <> '' and extensions.crypt(p_pin, h) = h then return null; end if;
  insert into immo_pin_fails default values;
  return 'Code incorrect';
end $$;

-- ---------- liste ----------
create or replace function public.clients_list(p_pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare e text;
begin
  e := immo_pin_error(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  return jsonb_build_object('ok', true, 'clients',
    coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from immo_clients c), '[]'::jsonb));
end $$;

-- ---------- creation / modification ----------
-- p_old_name : null pour un nouveau client, sinon le nom actuel (permet le renommage)
create or replace function public.clients_save(p_pin text, p_client jsonb, p_old_name text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare e text; v_name text; v_communes text[]; v_keywords text[]; v_type text;
begin
  e := immo_pin_error(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;

  v_name := nullif(btrim(p_client->>'name'), '');
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'Le nom du client est obligatoire'); end if;
  if length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'Nom trop long'); end if;

  if p_old_name is null and exists (select 1 from immo_clients where name = v_name) then
    return jsonb_build_object('ok', false, 'error', 'Un client porte déjà ce nom');
  end if;
  if p_old_name is not null and p_old_name <> v_name then
    if exists (select 1 from immo_clients where name = v_name) then
      return jsonb_build_object('ok', false, 'error', 'Un client porte déjà ce nom');
    end if;
    update immo_clients set name = v_name where name = p_old_name;
    update immo_client_matches set client_name = v_name where client_name = p_old_name;
  end if;

  select array_agg(btrim(x)) into v_communes
    from jsonb_array_elements_text(coalesce(p_client->'communes', '[]'::jsonb)) x where btrim(x) <> '';
  select array_agg(btrim(x)) into v_keywords
    from jsonb_array_elements_text(coalesce(p_client->'keywords', '[]'::jsonb)) x where btrim(x) <> '';
  v_type := p_client->>'type';
  if v_type not in ('maison', 'appartement', 'terrain') then v_type := null; end if;

  insert into immo_clients (name, budget_min, budget_max, communes, surface_min, keywords,
                            keywords_required, type, notes, active, precision, seeded_at, updated_at)
  values (v_name,
          nullif(p_client->>'budget_min', '')::bigint,
          nullif(p_client->>'budget_max', '')::bigint,
          v_communes,
          nullif(p_client->>'surface_min', '')::int,
          v_keywords,
          coalesce((p_client->>'keywords_required')::boolean, false),
          v_type,
          nullif(btrim(coalesce(p_client->>'notes', '')), ''),
          coalesce((p_client->>'active')::boolean, true),
          case when p_client->>'precision' = 'large' then 'large' else 'stricte' end,
          null, now())
  on conflict (name) do update set
    budget_min = excluded.budget_min, budget_max = excluded.budget_max,
    communes = excluded.communes, surface_min = excluded.surface_min,
    keywords = excluded.keywords, keywords_required = excluded.keywords_required,
    type = excluded.type, notes = excluded.notes, active = excluded.active,
    precision = excluded.precision,
    seeded_at = null,              -- criteres changes -> nouveau recap Telegram
    updated_at = now();

  return jsonb_build_object('ok', true, 'name', v_name);
end $$;

-- ---------- pause / reprise ----------
create or replace function public.clients_set_active(p_pin text, p_name text, p_active boolean)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare e text;
begin
  e := immo_pin_error(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  update immo_clients set active = p_active, updated_at = now() where name = p_name;
  return jsonb_build_object('ok', found);
end $$;

-- ---------- suppression ----------
create or replace function public.clients_delete(p_pin text, p_name text)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare e text;
begin
  e := immo_pin_error(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  delete from immo_client_matches where client_name = p_name;
  delete from immo_clients where name = p_name;
  return jsonb_build_object('ok', found);
end $$;

-- ---------- envoi immediat de la liste sur Telegram ----------
-- La page calcule la liste (memes regles que le bot) et la fait envoyer ici.
-- Le jeton du bot est lu dans immo_kv (verrouillee) : il ne passe jamais par la page.
-- Le bot y depose lui-meme son jeton et le chat a chaque passage.
create or replace function public.clients_notify(p_pin text, p_name text, p_text text, p_urls text[] default '{}')
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare e text; v_token text; v_chat text;
begin
  e := immo_pin_error(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if not exists (select 1 from immo_clients where name = p_name) then
    return jsonb_build_object('ok', false, 'error', 'Client introuvable');
  end if;
  select value into v_token from immo_kv where key = 'telegram_token';
  select value into v_chat from immo_kv where key = 'telegram_chat';
  if v_token is null or v_chat is null then
    return jsonb_build_object('ok', false, 'error', 'telegram_non_configure');
  end if;
  if p_text is null or length(p_text) = 0 or length(p_text) > 4096 then
    return jsonb_build_object('ok', false, 'error', 'Message vide ou trop long');
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', p_text,
                               'parse_mode', 'HTML', 'disable_web_page_preview', true),
    headers := jsonb_build_object('Content-Type', 'application/json'));

  -- les biens envoyes ne seront pas re-signales par le bot ; recap marque comme fait
  insert into immo_client_matches (client_name, url)
    select p_name, u from unnest(coalesce(p_urls, '{}'::text[])) u
    on conflict do nothing;
  update immo_clients set seeded_at = now() where name = p_name;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- droits : la page (cle anon) n'appelle QUE les 5 fonctions clients ----------
revoke all on function public.immo_pin_error(text) from public, anon, authenticated;
revoke all on function public.immo_tg_ok(text) from public, anon, authenticated;
revoke all on function public.immo_url_decode(text) from public, anon, authenticated;
revoke all on function public.clients_list(text) from public;
revoke all on function public.clients_save(text, jsonb, text) from public;
revoke all on function public.clients_set_active(text, text, boolean) from public;
revoke all on function public.clients_delete(text, text) from public;
revoke all on function public.clients_notify(text, text, text, text[]) from public;
grant execute on function public.clients_list(text) to anon, authenticated;
grant execute on function public.clients_save(text, jsonb, text) to anon, authenticated;
grant execute on function public.clients_set_active(text, text, boolean) to anon, authenticated;
grant execute on function public.clients_delete(text, text) to anon, authenticated;
grant execute on function public.clients_notify(text, text, text, text[]) to anon, authenticated;
