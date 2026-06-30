import { env } from '../config.js';
import { TARGET_COMMUNES } from '../config.js';
import { findMultiMandat } from './multimandat.js';

const DAY = 86400000;
const eur = (n) => n == null ? '?' : n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: n % 1e6 ? 1 : 0 }) + ' M€' : Math.round(n / 1000) + ' k€';
const esc = (s = '') => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Construit le message Telegram (HTML) du digest hebdo a partir de toutes les lignes.
export function buildDigest(rows, nowMs = Date.now()) {
  const wk = nowMs - 7 * DAY;
  const active = rows.filter(r => !r.last_seen || (nowMs - new Date(r.last_seen)) / DAY <= env.activeDays);

  // 1) nouveautes de la semaine
  const News = active.filter(r => r.first_seen && new Date(r.first_seen).getTime() >= wk);

  // 2) baisses de prix de la semaine (depuis price_history)
  const drops = [];
  for (const r of active) {
    const h = Array.isArray(r.price_history) ? r.price_history : [];
    if (h.length < 2) continue;
    const recent = h.filter(p => new Date(p.d).getTime() >= wk);
    if (!recent.length) continue;
    const before = h[0].p, now = r.price_num ?? h[h.length - 1].p;
    if (before && now && now < before) {
      const pct = Math.round((1 - now / before) * 100);
      if (pct >= 1) drops.push({ ...r, before, now, pct });
    }
  }
  drops.sort((a, b) => b.pct - a.pct);

  // 3) mandats qui viennent de franchir le seuil "qui traine"
  const newlyStale = active.filter(r => {
    if (!r.first_seen) return false;
    const age = (nowMs - new Date(r.first_seen)) / DAY;
    return age >= env.staleDays && age < env.staleDays + 7;
  });

  // 4) activite par commune
  const byCommune = {};
  for (const c of TARGET_COMMUNES) byCommune[c] = 0;
  for (const r of active) if (r.commune in byCommune) byCommune[r.commune]++;

  // 5) multi-mandat actifs
  const multi = findMultiMandat(rows, nowMs);

  // ---- mise en forme ----
  const d = new Date(nowMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const L = [];
  L.push(`🗞️ <b>Veille immo — semaine du ${d}</b>`);
  L.push('');
  L.push(`🏠 <b>${News.length}</b> nouveauté(s) · 🔻 <b>${drops.length}</b> baisse(s) · ⏳ <b>${newlyStale.length}</b> mandat(s) qui viennent de stagner · 🎯 <b>${multi.length}</b> multi-mandat`);

  if (News.length) {
    L.push('');
    L.push('<b>✨ Nouveautés</b>');
    News.slice(0, 8).forEach(r => L.push(`• ${esc(r.commune)} — ${eur(r.price_num)} <i>${esc(r.site)}</i>`));
    if (News.length > 8) L.push(`  … +${News.length - 8} autres`);
  }
  if (drops.length) {
    L.push('');
    L.push('<b>🔻 Plus grosses baisses</b>');
    drops.slice(0, 6).forEach(r => L.push(`• ${esc(r.commune)} — ${eur(r.before)} → <b>${eur(r.now)}</b> (-${r.pct}%) <i>${esc(r.site)}</i>`));
  }
  if (newlyStale.length) {
    L.push('');
    L.push('<b>⏳ Mandats à recontacter (≥ ' + env.staleDays + ' j)</b>');
    newlyStale.slice(0, 6).forEach(r => L.push(`• ${esc(r.commune)} — ${eur(r.price_num)} <i>${esc(r.site)}</i>`));
  }
  if (multi.length) {
    L.push('');
    L.push('<b>🎯 Multi-mandat (vendeurs sans doute déçus)</b>');
    multi.slice(0, 6).forEach(c => L.push(`• ${esc(c.commune)} — ${eur(c.price)} chez <b>${c.sites.length}</b> agences (${c.sites.map(esc).join(', ')})`));
  }

  L.push('');
  L.push('<b>📍 Stock par commune</b>');
  Object.entries(byCommune).sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => L.push(`• ${esc(c)} : ${n}`));

  return L.join('\n');
}
