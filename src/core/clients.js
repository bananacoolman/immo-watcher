// Matching acheteurs : criteres par client, recherche dans le stock et
// veille continue (nouveaux biens testes contre tous les clients actifs).

import { env, TARGET_COMMUNES } from '../config.js';
import { supabaseClient } from './store.js';

const DAY = 86400000;
const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const eur = (n) => n == null ? 'Prix nc' : n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: n % 1e6 ? 2 : 0 }) + ' M€' : Math.round(n / 1000) + ' k€';

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

// ---------- matching ----------
export function matchListing(client, l) {
  if (l.price_num == null && (client.budget_min || client.budget_max)) return null; // prix requis si budget
  if (client.budget_min && l.price_num < client.budget_min) return null;
  if (client.budget_max && l.price_num > client.budget_max) return null;
  if (client.communes && client.communes.length && !client.communes.includes(l.commune)) return null;

  const notes = [];
  if (client.surface_min) {
    if (l.surface == null) notes.push('surface à vérifier');
    else if (l.surface < client.surface_min) return null;
  }
  if (client.keywords && client.keywords.length) {
    const hay = norm(l.title || '');
    const found = client.keywords.filter((k) => hay.includes(norm(k)));
    if (!found.length) return null;               // au moins UN mot-clef present
    if (found.length < client.keywords.length) {
      notes.push('mots-clés partiels : ' + found.join(', '));
    }
  }
  return { l, notes };
}

// ---------- persistence ----------
export async function saveClient(c) {
  const { error } = await supabaseClient().from('immo_clients').upsert({ ...c, active: true });
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

// ---------- rendu ----------
export function criteriaLine(c) {
  const parts = [];
  if (c.budget_min || c.budget_max) parts.push(`💶 ${c.budget_min ? eur(c.budget_min) : '0'} → ${c.budget_max ? eur(c.budget_max) : '∞'}`);
  if (c.communes && c.communes.length) parts.push(`📍 ${c.communes.join(', ')}`);
  if (c.surface_min) parts.push(`📐 ≥ ${c.surface_min} m²`);
  if (c.keywords && c.keywords.length) parts.push(`🔎 ${c.keywords.join(', ')}`);
  return parts.join(' · ') || 'aucun critère';
}

export function matchLine({ l, notes }) {
  const bits = [
    `• <a href="${esc(l.url)}">${esc(l.commune)}</a> — <b>${eur(l.price_num)}</b>`,
    l.surface ? `${l.surface} m²` : null,
    l.secteur ? esc(l.secteur) : null,
    `<i>${esc(l.site)}</i>`,
    notes.length ? `⚠️ ${esc(notes.join(' · '))}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

// recherche dans le stock actif
export function searchStock(client, rows, nowMs = Date.now()) {
  const active = rows.filter((r) => !r.last_seen || (nowMs - new Date(r.last_seen)) / DAY <= env.activeDays);
  const out = [];
  for (const l of active) {
    const m = matchListing(client, l);
    if (m) out.push(m);
  }
  out.sort((a, b) => (a.l.price_num || 0) - (b.l.price_num || 0));
  return out;
}
