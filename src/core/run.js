import { SITES } from '../sites/index.js';
import { genericScrape } from '../sites/base.js';
import { getEmailListings } from './email.js';
import { getRecords, saveRows, getAllRows, claimAlert, saveGeo, saveDescription, blankDescription } from './store.js';
import { extractDescription, genericDescriptions } from './description.js';
import { notify, notifySignal, notifyMulti, sendDigest } from './telegram.js';
import { evaluate } from './signals.js';
import { findMultiMandat, clusterKey } from './multimandat.js';
import { buildDigest } from './digest.js';
import { extractCoordsFromHtml, detectSecteur } from './geo.js';
import { parseSurface, m2Plausible } from './market.js';
import { listClients, claimMany, claimedByClient, matchLine, searchStock, markSeeded, telegramList, groupSameProperty } from './clients.js';
import { getHtml, closeBrowser } from './http.js';
import { env } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICON = { new: '🏠', drop: '🔻', stale: '⏳', reappear: '♻️' };

// Agences lues pour la premiere fois pendant ce passage (stock enregistre
// sans notification) : nom -> nombre d'annonces.
const seededNow = new Map();

// Logique partagee : memoire temporelle -> signaux -> notif -> enregistrement.
export async function emit(source, listings) {
  if (!listings.length) return 0;

  const byId = new Map();
  for (const l of listings) if (!byId.has(l.id)) byId.set(l.id, l);
  const unique = [...byId.values()];

  const records = await getRecords(source);
  // Agence jamais lue -> enregistrement silencieux. Idem si AUCUNE annonce lue
  // n'est connue alors que l'agence a deja un historique : le site a change le
  // format de ses adresses (ou on a corrige sa lecture) -> pas d'avalanche.
  const overlap = unique.some((l) => records.has(l.id));
  const reformatted = records.size > 0 && unique.length >= 3 && !overlap;
  if (reformatted) console.log(`  [${source}] adresses changees : ${unique.length} annonces re-enregistrees sans notification.`);
  const seeding = env.seedOnly || records.size === 0 || reformatted;
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
    if (!env.seedOnly && !reformatted && rows.length) seededNow.set(source, rows.length);
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

let silentMulti = 0;

// Un seul message quand de nouvelles agences sont lues pour la 1re fois.
async function newAgenciesSummary() {
  if (!seededNow.size || env.debug) return;
  const total = [...seededNow.values()].reduce((a, b) => a + b, 0);
  const lines = [...seededNow.entries()].sort((a, b) => b[1] - a[1]).map(([n, k]) => `• ${n} : ${k}`);
  const text = `🏢 <b>${seededNow.size} agence${seededNow.size > 1 ? 's' : ''} ajoutée${seededNow.size > 1 ? 's' : ''} à la veille</b> — ${total} annonces lues\n`
    + lines.join('\n')
    + (silentMulti ? `\n\n🎯 ${silentMulti} de ces biens étaient déjà proposés par d'autres agences (multi-mandat).` : '')
    + '\n\nÀ partir de maintenant, leurs nouveautés et baisses de prix sont signalées comme pour les autres.';
  try { await sendDigest(text); } catch (e) { console.warn(`  resume agences KO: ${e.message}`); }
  seededNow.clear();
}

// Passe transverse : detecte les biens en multi-mandat (meme commune + prix
// chez plusieurs agences) et notifie les grappes encore jamais signalees.
async function multiMandatPass() {
  if (!env.multiMandatEnabled) return 0;
  const rows = await getAllRows();
  const clusters = findMultiMandat(rows);
  let sent = 0;
  silentMulti = 0;
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
    // agence lue pour la 1re fois : ses doublons avec le stock existant ne
    // sont pas des nouveautes -> enregistres sans notification (resume plus bas)
    if (c.sites.some((s) => seededNow.has(s))) { silentMulti++; continue; }
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
      if (r.description == null) geo.description = extractDescription(html);
      if (c) { geo.lat = c.lat; geo.lng = c.lng; geo.geo_source = 'page'; page++; saved = true; }
      else if (s) { geo.lat = s.lat; geo.lng = s.lng; geo.secteur = s.name; geo.geo_source = 'texte'; secteurP++; saved = true; }
      if (surface && (!r.price_num || m2Plausible(r.price_num, surface, r.commune))) { geo.surface = surface; surf++; }
      if (!env.debug && (saved || surface || geo.description != null)) await saveGeo(r.site, r.listing_id, geo);
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

// Descriptions du stock deja connu (les nouvelles annonces sont lues par
// geoEnrich). Budget limite par passage ; une seule lecture par annonce.
async function descEnrich() {
  if (!env.geoEnrich) return;
  const now = Date.now();
  const all = await getAllRows();
  const todo = all.filter((r) => isActive(r, now) && r.description == null).slice(0, env.descBudget);
  let n = 0;
  for (const r of todo) {
    let d = '';
    try { d = extractDescription(await getHtml(r.url, { retries: 1, timeoutMs: 20000 })); } catch { /* page indisponible */ }
    if (!env.debug) { try { await saveDescription(r.site, r.listing_id, d); } catch { /* migration 7 absente */ return; } }
    r.description = d;
    if (d) n++;
    await sleep(env.geoDelayMs);
  }
  // slogans d'agence repetes -> neutralises (sinon "piscine" partout)
  let g = 0;
  for (const x of genericDescriptions(all)) {
    if (!env.debug) { try { await blankDescription(x.site, x.description); g++; } catch { /* ignore */ } }
  }
  if (todo.length || g) console.log(`  [desc] ${n}/${todo.length} descriptions lues${g ? ` · ${g} texte(s) generique(s) neutralise(s)` : ''} · reste ${Math.max(0, all.filter((r) => isActive(r, now) && r.description == null).length - todo.length)}`);
}

// Mode sonde agences (MODE=sites-probe) : lit chaque agence et affiche ce qui
// est trouve, SANS rien enregistrer ni envoyer. Filtre : SITES="Burns,Orpi".
export async function runSitesProbe() {
  const { ALL_SITES } = await import('../sites/index.js');
  const want = (process.env.SITES || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const list = ALL_SITES.filter((s) => !want.length || want.some((w) => s.name.toLowerCase().includes(w)));
  console.log(`=== SONDE AGENCES — ${list.length} agence(s), aucune ecriture ===`);
  const summary = [];
  for (const site of list) {
    const stats = { pages: [], failed: [], raw: [], otherCommune: [], dropped: [], samples: [] };
    let listings = [];
    const t0 = Date.now();
    try { listings = await genericScrape(site, stats); }
    catch (e) { stats.failed.push('ERREUR ' + e.message); }
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    const withPrice = listings.filter((l) => l.priceNum != null).length;
    const verdict = listings.length ? 'OK' : stats.raw.length ? 'HORS SECTEUR ?' : stats.pages.length ? 'AUCUNE FICHE' : 'SITE INACCESSIBLE';
    summary.push(`${verdict.padEnd(17)} ${site.name.padEnd(26)} ${String(listings.length).padStart(3)} annonces (${withPrice} avec prix) · ${stats.raw.length} liens · ${stats.pages.length} page(s) lue(s) · ${sec}s`);
    console.log(`\n--- ${site.name} ${site.enabled ? '' : '(desactivee)'} ---`);
    console.log(`  pages lues : ${stats.pages.length}${stats.failed.length ? ` · echecs : ${stats.failed.length}` : ''}`);
    stats.failed.slice(0, 4).forEach((f) => console.log('    x ' + f));
    console.log(`  liens d'annonces trouves : ${stats.raw.length} · gardes (nos communes) : ${listings.length} · hors secteur : ${stats.otherCommune.length}`);
    listings.slice(0, 4).forEach((l) => console.log(`    • ${l.commune} | ${l.price || 'prix ?'} | ${(l.title || '').slice(0, 50)} | ${l.url}`));
    if (!listings.length) stats.raw.slice(0, 4).forEach((u) => console.log('    ? ' + u));
    if (!stats.raw.length && stats.samples.length) {
      console.log('  aucun lien d\'annonce reconnu ; liens presents sur la page :');
      stats.samples.slice(0, 2).forEach((x) => console.log('    > ' + x.slice(0, 900)));
    }
    if (stats.dropped.length) {
      console.log(`  ecartes (prix < mini ou location) : ${stats.dropped.length}`);
      stats.dropped.slice(0, 3).forEach((d) => console.log('    - ' + d.slice(0, 220)));
    }
    await sleep(env.politeDelayMs);
  }
  console.log('\n=== RESUME ===');
  summary.forEach((l) => console.log(l));
  if (env.usePlaywright || list.some((s) => s.needsJs)) await closeBrowser();
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

// Matching acheteurs : biens en vente vs clients actifs.
// Client nouveau ou modifie (seeded_at vide) : UN message avec les biens deja
// en vente (normalement deja envoye par la page des l'enregistrement ; le bot
// ne prend le relais que si cet envoi n'a pas eu lieu). Ensuite : un message
// par client quand de NOUVEAUX biens correspondants sortent.
export async function clientsPass() {
  const clients = (await listClients()).filter((c) => c.active);
  if (!clients.length) return;
  const rows = await getAllRows();
  const now = Date.now();
  const escH = (x = '') => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const claimed = await claimedByClient();
  let sent = 0;
  for (const c of clients) {
    const matches = searchStock(c, rows, now);
    const seen = claimed.get(c.name) || new Set();

    if (!c.seeded_at) {
      if (env.debug) { console.log(`  [client] recap ${c.name} : ${matches.length} bien(s)`); continue; }
      try {
        await claimMany(c.name, matches.map((m) => m.l.url).filter((u) => !seen.has(u)));
        await sendDigest(telegramList(c, matches, env.clientsPageUrl, 'new'));
        await markSeeded(c.name);
        sent++; await sleep(400);
      } catch (e) { console.warn(`  recap client ${c.name} KO: ${e.message}`); }
      continue;
    }

    // nouveaux biens : on ignore ceux deja signales, et le doublon d'un bien
    // deja signale chez une autre agence (meme bien, autre vitrine)
    const fresh = [];
    for (const g of groupSameProperty(matches)) {
      const urls = g.items.map((i) => i.l.url);
      const newUrls = urls.filter((u) => !seen.has(u));
      if (!newUrls.length) continue;
      if (newUrls.length < urls.length) {                // meme bien deja envoye
        if (!env.debug) { try { await claimMany(c.name, newUrls); } catch { /* ignore */ } }
        continue;
      }
      fresh.push(g);
    }
    if (!fresh.length) continue;
    if (env.debug) { console.log(`  [client] ${c.name}: ${fresh.length} nouveau(x) bien(s)`); sent++; continue; }
    try {
      await claimMany(c.name, fresh.flatMap((g) => g.items.map((i) => i.l.url)));
    } catch (e) { console.warn(`  matchs ${c.name} non enregistres: ${e.message}`); continue; }
    const head = `🤝 <b>${fresh.length > 1 ? fresh.length + ' nouveaux biens' : 'Nouveau bien'} pour ${escH(c.name)}</b>\n`;
    let body = '';
    for (const g of fresh) {
      const line = matchLine(g.lead, g.items.slice(1)) + '\n';
      if (head.length + body.length + line.length > 3800) { body += '…\n'; break; }
      body += line;
    }
    try {
      await sendDigest(head + body.trimEnd());
      sent++; await sleep(400);
    } catch (e) { console.warn(`  notif match KO: ${e.message}`); }
  }
  if (sent) console.log(`  [clients] ${sent} message(s) envoye(s)`);
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

  await newAgenciesSummary();

  try {
    await geoEnrich();
    await geoPropagate();
  } catch (e) {
    console.error(`  [geo] erreur : ${e.message}`);
  }

  try {
    await descEnrich();
  } catch (e) {
    console.error(`  [desc] erreur : ${e.message}`);
  }

  try {
    await clientsPass();
  } catch (e) {
    console.error(`  [clients] erreur : ${e.message}`);
  }

  if (env.usePlaywright) await closeBrowser();
  console.log(`[${ts}] Termine — ${total} notification(s) (nouveautes + signaux).`);
  return total;
}
