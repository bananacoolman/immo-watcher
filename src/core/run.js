import { SITES } from '../sites/index.js';
import { genericScrape } from '../sites/base.js';
import { getEmailListings } from './email.js';
import { getRecords, saveRows } from './store.js';
import { notify, notifySignal } from './telegram.js';
import { evaluate } from './signals.js';
import { closeBrowser } from './http.js';
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
  console.log(`[${ts}] Termine — ${total} notification(s) (nouveautes + signaux).`);
  return total;
}
