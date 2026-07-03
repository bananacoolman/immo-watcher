import { SITES } from '../sites/index.js';
import { genericScrape } from '../sites/base.js';
import { getEmailListings } from './email.js';
import { getRecords, saveRows, getAllRows, claimAlert, saveGeo } from './store.js';
import { notify, notifySignal, notifyMulti, sendDigest } from './telegram.js';
import { evaluate } from './signals.js';
import { findMultiMandat, clusterKey } from './multimandat.js';
import { buildDigest } from './digest.js';
import { extractCoordsFromHtml, detectSecteur } from './geo.js';
import { parseSurface, m2Plausible } from './market.js';
import { listClients, matchListing, claimMatch, matchLine } from './clients.js';
import { getHtml, closeBrowser } from './http.js';
import { env } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICON = { new: '🏠', drop: '🔻', stale: '⏳', reappear: '♻️' };

// Logique partagee : memoire temporelle -> signaux -> notif -> enregistrement.
async function emit(source, listings) {
  if (!listings.length) return 0;

  const byId = new Map();
  for (const l of listings) if (!byId.has(l.id)) byId.set(l.id, l);
  const unique = [...byId.values()];

  const records = await getRecords(source);
  const seeding = env.seedOnly || records.size === 0;
  const nowIso = new Date().toISOString();

  const rows = [];
  const alerts = [];
  for (const l of unique) {
    const { row, alerts: a } = evaluate(records.get(l.id), { ...l, site: source }, nowIso, seeding);
    rows.push(row);
    for (const x of a) alerts.push(x);
  }

  await saveRows(source, rows);

  if (seeding) {
    console.log(`  [${source}] seed : ${rows.length} annonces enregistrees (pas de notif).`);
    return 0;
  }

  let sent = 0;
  for (const a of alerts) {
    if (env.debug) {
      console.log(`  [DEBUG] ${ICON[a.kind] || ''} ${a.kind} : ${a.l.commune || '?'} ${a.l.price || ''} ${a.l.url}`);
      sent++;
      continue;
    }
    try {
      if (a.kind === 'new') await notify(a.l);
      else await notifySignal(a);
      sent++;
      await sleep(400);
    } catch (e) {
      console.warn(`  notif KO (${a.kind}): ${e.message}`);
    }
  }
  return sent;
}

// Passe transverse : detecte les biens en multi-mandat (meme commune + prix
// chez plusieurs agences) et notifie les grappes encore jamais signalees.
async function multiMandatPass() {
  if (!env.multiMandatEnabled) return 0;
  const rows = await getAllRows();
  const clusters = findMultiMandat(rows);
  let sent = 0;
  for (const c of clusters) {
    const key = clusterKey(c);
    if (env.debug) {
      console.log(`  [DEBUG] 🎯 multi-mandat : ${c.commune} ${c.price} chez ${c.sites.join(', ')}`);
      sent++;
      continue;
    }
    let fresh;
    try { fresh = await claimAlert(key); } catch (e) { console.warn(`  multi-mandat dedupe KO: ${e.message}`); continue; }
    if (!fresh) continue;
    try { await notifyMulti(c); sent++; await sleep(400); }
    catch (e) { console.warn(`  notif multi KO: ${e.message}`); }
  }
  if (env.debug) console.log(`  [multi-mandat] ${clusters.length} grappe(s) detectee(s)`);
  return sent;
}

// Digest hebdomadaire (MODE=digest) : synthese de la semaine sur Telegram.
export async function runDigest() {
  const rows = await getAllRows();
  const text = buildDigest(rows);
  if (env.debug) { console.log(text); return; }
  await sendDigest(text);
  console.log('Digest envoye.');
}

const DAY = 86400000;
const isActive = (r, now) => r.url && (!r.last_seen || (now - new Date(r.last_seen)) / DAY <= env.activeDays);

// Enrichissement geo : (1) secteur depuis le titre (gratuit), puis (2) coords
// exactes depuis la page detail (budget limite, une tentative par bien).
async function geoEnrich() {
  if (!env.geoEnrich) return;
  const now = Date.now();
  const rows = (await getAllRows()).filter((r) => isActive(r, now));

  // 1) secteur depuis le titre — sans requete reseau
  let secteurT = 0;
  for (const r of rows) {
    if (r.lat != null || r.secteur) continue;
    const s = detectSecteur(r.title || '', r.commune);
    if (!s) continue;
    if (!env.debug) await saveGeo(r.site, r.listing_id, { lat: s.lat, lng: s.lng, secteur: s.name, geo_source: 'texte' });
    secteurT++;
  }

  // 2) coords exactes + secteur (description) + surface depuis la page detail
  const todo = rows.filter((r) => r.geo_source !== 'page' && !r.geo_at).slice(0, env.geoBudget);
  let page = 0, secteurP = 0, surf = 0;
  for (const r of todo) {
    let saved = false;
    try {
      const html = await getHtml(r.url, { retries: 1, timeoutMs: 20000 });
      // texte complet de la page (la description est loin, apres le menu)
      const text = (r.title || '') + ' ' + String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 60000);
      const c = extractCoordsFromHtml(html);
      const s = r.secteur ? null : detectSecteur(text, r.commune);
      const surface = parseSurface(text);
      const geo = {};
      if (c) { geo.lat = c.lat; geo.lng = c.lng; geo.geo_source = 'page'; page++; saved = true; }
      else if (s) { geo.lat = s.lat; geo.lng = s.lng; geo.secteur = s.name; geo.geo_source = 'texte'; secteurP++; saved = true; }
      if (surface && (!r.price_num || m2Plausible(r.price_num, surface, r.commune))) { geo.surface = surface; surf++; }
      if (!env.debug && (saved || surface)) await saveGeo(r.site, r.listing_id, geo);
    } catch { /* page indisponible */ }
    if (!saved && !env.debug) await saveGeo(r.site, r.listing_id, {}); // tampon geo_at -> pas de re-essai
    await sleep(env.geoDelayMs);
  }
  console.log(`  [geo] secteur/titre: ${secteurT} · coords/page: ${page} · secteur/page: ${secteurP} · surfaces: ${surf} (budget ${env.geoBudget})`);
}

// Propagation : dans une grappe multi-mandat, un bien geolocalise partage sa
// position avec ses jumeaux (meme bien, autres agences) encore sans position.
async function geoPropagate() {
  const rows = await getAllRows();
  const clusters = findMultiMandat(rows);
  let n = 0;
  for (const c of clusters) {
    const ref = c.items.find((i) => i.lat != null);
    if (!ref) continue;
    for (const it of c.items) {
      if (it.lat != null) continue;
      if (!env.debug) await saveGeo(it.site, it.listing_id, { lat: ref.lat, lng: ref.lng, secteur: ref.secteur || null, geo_source: 'multimandat' });
      n++;
    }
  }
  if (n) console.log(`  [geo] propagation multi-mandat: ${n}`);
}

// Mode sonde (MODE=geo-probe) : mesure, agence par agence, le taux de reussite
// de la geoloc sur un echantillon. Aucune ecriture en base.
export async function runGeoProbe() {
  const now = Date.now();
  const rows = (await getAllRows()).filter((r) => isActive(r, now));
  const sample = parseInt(process.env.GEO_PROBE_N || '8', 10);
  const bySite = {};
  for (const r of rows) (bySite[r.site] = bySite[r.site] || []).push(r);
  console.log(`=== SONDE GEO — echantillon ${sample}/agence ===`);
  console.log(`  ${'AGENCE'.padEnd(24)} COORDS  SECTEUR  (sur N)`);
  for (const [site, list] of Object.entries(bySite)) {
    let coords = 0, secteur = 0, n = 0;
    for (const r of list.slice(0, sample)) {
      n++;
      try {
        const html = await getHtml(r.url, { retries: 1, timeoutMs: 20000 });
        if (extractCoordsFromHtml(html)) coords++;
        else {
          const txt = (r.title || '') + ' ' + String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 60000);
          if (detectSecteur(txt, r.commune)) secteur++;
        }
      } catch { /* skip */ }
      await sleep(env.geoDelayMs);
    }
    console.log(`  ${site.padEnd(24)} ${String(coords).padStart(3)}/${n}   ${String(secteur).padStart(3)}/${n}`);
  }
  if (env.usePlaywright) await closeBrowser();
}

async function processSite(site) {
  const listings = await genericScrape(site);
  return emit(site.name, listings);
}

// Bridge e-mail : recupere les annonces des alertes, groupe par portail, emet.
async function processEmail() {
  const listings = await getEmailListings();
  if (!listings.length) return 0;
  const groups = {};
  for (const l of listings) (groups[l.site] ||= []).push(l);
  let total = 0;
  for (const [source, items] of Object.entries(groups)) total += await emit(source, items);
  return total;
}

export async function runOnce() {
  const ts = new Date().toLocaleString('fr-FR');
  const emailOn = env.emailEnabled ? ' + e-mail' : '';
  console.log(`\n[${ts}] Veille — ${SITES.length} site(s)${emailOn}`);
  let total = 0;

  for (const site of SITES) {
    try {
      total += await processSite(site);
    } catch (e) {
      console.error(`  [${site.name}] erreur : ${e.message}`);
    }
    await sleep(env.politeDelayMs);
  }

  if (env.emailEnabled) {
    try {
      total += await processEmail();
    } catch (e) {
      console.error(`  [email] erreur : ${e.message}`);
    }
  }

  try {
    total += await multiMandatPass();
  } catch (e) {
    console.error(`  [multi-mandat] erreur : ${e.message}`);
  }

  try {
    await geoEnrich();
    await geoPropagate();
  } catch (e) {
    console.error(`  [geo] erreur : ${e.message}`);
  }

  // ----- matching acheteurs : biens actifs vs clients actifs -----
  try {
    const clients = (await listClients()).filter((c) => c.active);
    if (clients.length) {
      const rows = await getAllRows();
      const now = Date.now();
      const active = rows.filter((r) => !r.last_seen || (now - new Date(r.last_seen)) / 86400000 <= env.activeDays);
      let sent = 0;
      for (const c of clients) {
        for (const l of active) {
          const m = matchListing(c, l);
          if (!m) continue;
          let fresh;
          try { fresh = await claimMatch(c.name, l.url); } catch { continue; }
          if (!fresh) continue;
          if (env.debug) { console.log(`  [client] match ${c.name}: ${l.url}`); sent++; continue; }
          try {
            await sendDigest(`🤝 <b>Match pour ${c.name}</b>\n${matchLine(m)}`);
            sent++; await sleep(400);
          } catch (e) { console.warn(`  notif match KO: ${e.message}`); }
        }
      }
      if (sent) console.log(`  [clients] ${sent} match(s) notifie(s)`);
    }
  } catch (e) {
    console.error(`  [clients] erreur : ${e.message}`);
  }

  if (env.usePlaywright) await closeBrowser();
  console.log(`[${ts}] Termine — ${total} notification(s) (nouveautes + signaux).`);
  return total;
}
