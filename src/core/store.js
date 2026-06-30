import { createClient } from '@supabase/supabase-js';
import { env } from '../config.js';

let _client = null;
function supabaseClient() {
  if (!_client) {
    _client = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// Charge tout l'historique connu d'un site -> Map(listing_id -> record).
export async function getRecords(site) {
  const map = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient()
      .from('immo_seen')
      .select('listing_id, url, title, commune, image, price, price_num, initial_price, price_history, first_seen, last_seen, alerted_stale, alerted_drop_price')
      .eq('site', site)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const r of data) map.set(r.listing_id, r);
    if (data.length < pageSize) break;
  }
  return map;
}

// Compat : Set des ids connus (utilise encore par le bridge e-mail le cas echeant).
export async function getSeenIds(site) {
  return new Set((await getRecords(site)).keys());
}

// Upsert d'un lot de lignes completes (insert OU update).
export async function saveRows(site, rows) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({ site, ...r }));
  const { error } = await supabaseClient()
    .from('immo_seen')
    .upsert(payload, { onConflict: 'site,listing_id' });
  if (error) throw error;
}

// Y a-t-il deja des lignes pour ce site ? (-> evite le spam au 1er passage)
export async function isSiteSeeded(site) {
  const { count, error } = await supabaseClient()
    .from('immo_seen')
    .select('*', { count: 'exact', head: true })
    .eq('site', site);
  if (error) throw error;
  return (count || 0) > 0;
}

// Toutes les annonces, tous sites confondus (pour multi-mandat / digest).
export async function getAllRows() {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient()
      .from('immo_seen')
      .select('site, listing_id, url, title, commune, price, price_num, initial_price, price_history, first_seen, last_seen, alerted_stale')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

// Dedup des alertes agregees (multi-mandat...). Renvoie true si la cle est NOUVELLE.
export async function claimAlert(key) {
  const { error } = await supabaseClient()
    .from('immo_alerts')
    .insert({ key });
  if (error) {
    if (error.code === '23505') return false; // deja present (cle dupliquee)
    throw error;
  }
  return true;
}
