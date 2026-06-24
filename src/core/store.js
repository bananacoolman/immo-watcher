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

// Renvoie un Set des listing_id deja connus pour un site.
export async function getSeenIds(site) {
  const ids = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient()
      .from('immo_seen')
      .select('listing_id')
      .eq('site', site)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    data.forEach((r) => ids.add(r.listing_id));
    if (data.length < pageSize) break;
  }
  return ids;
}

// Insere les nouvelles annonces (ignore les doublons).
export async function insertSeen(site, listings) {
  if (!listings.length) return;
  const rows = listings.map((l) => ({
    site,
    listing_id: l.id,
    url: l.url,
    title: l.title,
    price: l.price,
    commune: l.commune,
    image: l.image,
  }));
  const { error } = await supabaseClient()
    .from('immo_seen')
    .upsert(rows, { onConflict: 'site,listing_id', ignoreDuplicates: true });
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
