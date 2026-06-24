import { SITES } from '../sites/index.js';
import { genericScrape } from '../sites/base.js';
import { getEmailListings } from './email.js';
import { getSeenIds, insertSeen, isSiteSeeded } from './store.js';
import { notify } from './telegram.js';
import { closeBrowser } from './http.js';
import { env } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Logique partagee : dedup -> seed-guard -> notif -> enregistrement.
async function emit(source, listings) {
  if (!listings.length) return 0;

  const byId = new Map();
  for (const l of listings) if (!byId.has(l.id)) byId.set(l.id, l);
  const unique = [...byId.values()];

  const seen = await getSeenIds(source);
  const fresh = unique.filter((l) => !seen.has(l.id));
  if (!fresh.length) return 0;

  // 1er passage sur cette source OU mode seed : on enregistre sans notifier.
  const seeded = await isSiteSeeded(source);
  if (env.seedOnly || !seeded) {
    await insertSeen(source, fresh);
    console.log(`  [${source}] seed : ${fresh.length} annonces enregistrees (pas de notif).`);
    return 0;
  }

  let sent = 0;
  for (const l of fresh) {
    if (env.debug) { console.log(`  [DEBUG] notif simulee: ${l.commune || '?'} ${l.price || ''} ${l.url}`); }
    else { try { await notify(l); sent++; await sleep(400); } catch (e) { console.warn(`  notif KO: ${e.message}`); } }
  }
  await insertSeen(source, fresh);
  return env.debug ? fresh.length : sent;
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

  if (env.usePlaywright) await closeBrowser();
  console.log(`[${ts}] Termine — ${total} nouvelle(s) annonce(s).`);
  return total;
}
