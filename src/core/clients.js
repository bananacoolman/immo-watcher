// Matching acheteurs : criteres par client, recherche dans le stock et
// veille continue (nouveaux biens testes contre tous les clients actifs).

import { env, TARGET_COMMUNES } from '../config.js';
import { supabaseClient } from './store.js';
// Logique de correspondance PARTAGEE avec la page web docs/clients.html :
// la page et le bot appliquent exactement les memes regles.
import * as shared from '../../docs/clientmatch.js';

const norm = shared.norm;

// ---------- parsing de la commande ----------
// /client Dupont budget 1.5-2.5M communes Vence,Saint-Paul surface 200+ mots-cles piscine,vue mer
export function parseClientCommand(text) {
  const body = text.replace(/^\/client(?:@\w+)?\s+/i, '').trim();
  if (!body) return null;
  const nameM = body.match(/^([^\s]+)/);
  if (!nameM) return null;
  const c = { name: nameM[1], budget_min: null, budget_max: null, communes: null, surface_min: null, keywords: null };

  const money = (s) => {
    s = s.replace(/\s/g, '').replace(',', '.').toLowerCase();
    let m = s.match(/^([\d.]+)m€?$/); if (m) return Math.round(parseFloat(m[1]) * 1e6);
    m = s.match(/^([\d.]+)k€?$/); if (m) return Math.round(parseFloat(m[1]) * 1e3);
    m = s.match(/^([\d.]+)€?$/); if (m) { const v = parseFloat(m[1]); return v < 100 ? Math.round(v * 1e6) : Math.round(v); }
    return null;
  };

  const bud = body.match(/budget\s+([\d.,]+\s*[mk]?€?)\s*[-–a\u00e0]+\s*([\d.,]+\s*[mk]?€?)/i)
          || body.match(/budget\s+max\s+([\d.,]+\s*[mk]?€?)/i);
  if (bud) {
    if (bud.length === 3) { c.budget_min = money(bud[1]); c.budget_max = money(bud[2]); }
    else { c.budget_max = money(bud[1]); }
  } else {
    const solo = body.match(/budget\s+([\d.,]+\s*[mk]?€?)/i);
    if (solo) c.budget_max = money(solo[1]);
  }

  const com = body.match(/communes?\s+([a-zà-ÿ' ,\-]+?)(?=\s+(?:surface|budget|mots?|$))/i)
          || body.match(/communes?\s+([a-zà-ÿ' ,\-]+)$/i);
  if (com) {
    const list = com[1].split(',').map((s) => s.trim()).filter(Boolean);
    const resolved = [];
    for (const item of list) {
      const n = norm(item);
      const hit = TARGET_COMMUNES.find((t) => norm(t) === n)
        || TARGET_COMMUNES.find((t) => norm(t).startsWith(n))
        || TARGET_COMMUNES.find((t) => norm(t).includes(n));
      if (hit) resolved.push(hit);
    }
    if (resolved.length) c.communes = [...new Set(resolved)];
  }

  const surf = body.match(/surface\s+(\d+)\s*\+?/i);
  if (surf) c.surface_min = parseInt(surf[1], 10);

  const kw = body.match(/mots?-?cl[eé]s?\s+(.+)$/i);
  if (kw) c.keywords = kw[1].split(',').map((s) => s.trim()).filter(Boolean);

  return c;
}

// ---------- formulaire dans Telegram ----------
// Adresse du formulaire "nouveau client" (s'ouvre dans Telegram).
export const newClientUrl = () => env.clientsPageUrl + (env.clientsPageUrl.includes('?') ? '&' : '?') + 'new=1';
const isPrivateChat = () => Number(env.telegramChat) > 0;

// Bouton a utiliser sous un message : dans une conversation privee, le
// formulaire s'ouvre DANS Telegram (connexion automatique) ; dans un groupe,
// Telegram ne le permet pas -> lien classique (page web + code).
export function formButton(text = '📝 Nouveau client', url = newClientUrl()) {
  return isPrivateChat() ? { text, web_app: { url } } : { text, url };
}

// Bouton permanent a cote de la zone de saisie + liste des commandes.
// Fait une seule fois (memorise dans immo_kv), refait si l'adresse change.
export async function setupTelegramMenu() {
  if (env.debug || !env.telegramToken || !env.telegramChat) return;
  const sig = 'v1|' + newClientUrl();
  const { data } = await supabaseClient().from('immo_kv').select('value').eq('key', 'telegram_menu').maybeSingle();
  if (data && data.value === sig) return;
  const call = async (method, body) => {
    const r = await fetch(`https://api.telegram.org/bot${env.telegramToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  };
  await call('setMyCommands', { commands: [
    { command: 'nouveau', description: 'Nouveau client (formulaire)' },
    { command: 'clients', description: 'Mes clients et leurs biens' },
    { command: 'reperage', description: 'Fiche repérage d\'une annonce' },
    { command: 'rapport', description: 'Rapport vendeur PDF' },
  ] });
  if (isPrivateChat()) {
    await call('setChatMenuButton', { chat_id: env.telegramChat,
      menu_button: { type: 'web_app', text: '➕ Client', web_app: { url: newClientUrl() } } });
  }
  await supabaseClient().from('immo_kv').upsert({ key: 'telegram_menu', value: sig }, { onConflict: 'key' });
  console.log('  [clients] bouton Telegram "➕ Client" installe');
}

// ---------- matching (module partage) ----------
export const matchListing = shared.matchListing;

// ---------- persistence ----------
export async function saveClient(c) {
  const { error } = await supabaseClient().from('immo_clients')
    .upsert({ ...c, active: true, seeded_at: new Date().toISOString() });
  if (error) throw error;
}
// recap initial envoye pour ce client
export async function markSeeded(name) {
  const { error } = await supabaseClient().from('immo_clients')
    .update({ seeded_at: new Date().toISOString() }).eq('name', name);
  if (error) throw error;
}
export async function listClients() {
  const { data, error } = await supabaseClient().from('immo_clients').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}
export async function setClientActive(name, active) {
  const { error } = await supabaseClient().from('immo_clients').update({ active }).eq('name', name);
  if (error) throw error;
}
export async function deleteClient(name) {
  await supabaseClient().from('immo_client_matches').delete().eq('client_name', name);
  const { error } = await supabaseClient().from('immo_clients').delete().eq('name', name);
  if (error) throw error;
}
// dedup : true si ce match est nouveau
export async function claimMatch(clientName, url) {
  const { error } = await supabaseClient().from('immo_client_matches').insert({ client_name: clientName, url });
  if (error) { if (error.code === '23505') return false; throw error; }
  return true;
}

// Historique des biens deja signales, charge en une fois : Map(nom -> Set(url))
export async function claimedByClient() {
  const out = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient().from('immo_client_matches')
      .select('client_name, url').range(from, from + pageSize - 1);
    if (error) throw error;
    for (const r of data) {
      if (!out.has(r.client_name)) out.set(r.client_name, new Set());
      out.get(r.client_name).add(r.url);
    }
    if (data.length < pageSize) break;
  }
  return out;
}
// Marque plusieurs biens comme signales en une requete (doublons ignores)
export async function claimMany(clientName, urls) {
  if (!urls.length) return;
  const { error } = await supabaseClient().from('immo_client_matches')
    .upsert(urls.map((url) => ({ client_name: clientName, url })),
      { onConflict: 'client_name,url', ignoreDuplicates: true });
  if (error) throw error;
}

// ---------- rendu ----------
export function criteriaLine(c) {
  return shared.criteriaParts(c).join(' · ') || 'aucun critère';
}

// une ligne par bien (meme rendu que la page clients)
export function matchLine(m, others = []) {
  return shared.telegramLine(m, others);
}
export const telegramList = shared.telegramList;
export const groupSameProperty = shared.groupSameProperty;

// La page clients fait envoyer la liste sur Telegram par Supabase des
// l'enregistrement. Pour cela Supabase a besoin du jeton du bot : le bot l'y
// depose (table immo_kv verrouillee, illisible depuis la page) a chaque passage.
// Ainsi le jeton reste uniquement dans les secrets GitHub et dans Supabase.
export async function syncTelegramKv() {
  if (env.debug || !env.telegramToken || !env.telegramChat) return;
  const { error } = await supabaseClient().from('immo_kv').upsert([
    { key: 'telegram_token', value: String(env.telegramToken) },
    { key: 'telegram_chat', value: String(env.telegramChat) },
  ], { onConflict: 'key' });
  if (error) console.warn(`  [clients] config Telegram non deposee (migration 7 faite ?) : ${error.message}`);
}

// recherche dans le stock en vente (memes regles que la page)
export function searchStock(client, rows, nowMs = Date.now()) {
  return shared.searchStock(client, rows, nowMs, env.activeDays);
}
