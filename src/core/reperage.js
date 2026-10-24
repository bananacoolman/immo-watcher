// Reperage a la demande : commande Telegram "/reperage <url>" -> fiche
// d'indices visuels (photos analysees par l'API Claude) + lien satellite.
// Concu pour tourner par lots via GitHub Actions (MODE=reperage).

import { env } from '../config.js';
import { getHtml } from './http.js';
import { supabaseClient } from './store.js';
import { parseClientCommand, saveClient, listClients, setClientActive, deleteClient, searchStock, criteriaLine, claimMany, telegramList, formButton } from './clients.js';
import { getAllRows } from './store.js';

const TG = (m) => `https://api.telegram.org/bot${env.telegramToken}/${m}`;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.REPERAGE_MODEL || 'claude-sonnet-4-6';
const MAX_PHOTOS = parseInt(process.env.REPERAGE_MAX_PHOTOS || '5', 10);

// ---------- Telegram ----------
async function tgCall(method, body) {
  const res = await fetch(TG(method), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

async function getUpdates(offset) {
  return tgCall('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
}

async function send(text, buttons = null) {
  await tgCall('sendMessage', {
    chat_id: env.telegramChat, text, parse_mode: 'HTML', disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

// ---------- offset persistant (table immo_kv) ----------
async function kvGet(key) {
  const { data, error } = await supabaseClient().from('immo_kv').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}
async function kvSet(key, value) {
  const { error } = await supabaseClient().from('immo_kv').upsert({ key, value: String(value) });
  if (error) throw error;
}

// ---------- extraction des photos d'une page annonce ----------
export function extractPhotoUrls(html = '', baseUrl = '') {
  const urls = new Set();
  const add = (u) => {
    if (!u) return;
    let parsed;
    try { parsed = new URL(u, baseUrl); } catch { return; }
    if (!/^https?:$/.test(parsed.protocol)) return;
    if (!/\.(jpe?g|webp|png)(\?|$)/i.test(parsed.pathname + parsed.search)) return;
    // blacklist sur le CHEMIN uniquement (pas le domaine, ex. www.agence.fr)
    if (/(logo|icon|sprite|placeholder|avatar|team|footer|header)/i.test(parsed.pathname)) return;
    urls.add(parsed.origin + parsed.pathname);
  };
  let m;
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  while ((m = og.exec(html)) !== null) add(m[1]);
  const img = /<img[^>]+(?:src|data-src|data-lazy|data-original)=["']([^"']+)["']/gi;
  while ((m = img.exec(html)) !== null) add(m[1]);
  const srcset = /srcset=["']([^"']+)["']/gi;
  while ((m = srcset.exec(html)) !== null) {
    const first = m[1].split(',')[0].trim().split(/\s+/)[0]; add(first);
  }
  // grandes images en priorite (heuristique : url contenant des dimensions ou "large")
  return [...urls].slice(0, 20);
}

// ---------- telechargement + encodage base64 ----------
async function fetchImageB64(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(ct)) throw new Error(`type ${ct}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 4.5 * 1024 * 1024) throw new Error('image trop lourde');
  if (buf.length < 15 * 1024) throw new Error('image trop petite (vignette)');
  return { media_type: ct, data: buf.toString('base64') };
}

// ---------- analyse vision ----------
const PROMPT = `Tu analyses des photos d'une annonce immobiliere (villa dans l'arriere-pays nicois). Objectif : aider a RETROUVER la parcelle sur une vue satellite.
Decris UNIQUEMENT ce qui est identifiable DEPUIS LE CIEL, en francais, format compact :
• Piscine : forme (rectangulaire/couloir/haricot/ronde), proportions, orientation si deductible, couleur margelle/liner, position vs maison
• Toiture : nb de pans, forme du bati vu du dessus (L, U, rectangle, ailes), couleur tuiles, elements en toiture
• Terrain : restanques, plat/pente, oliveraie, boisement, tennis, dependances, pool-house
• Acces : allee (forme, revetement), portail, parking
• Vue/orientation : si une vue mer/montagne est visible, en deduire l'orientation probable du versant
• Signature distinctive : le detail le plus reconnaissable en satellite
Termine par "🔎 Chercher en priorite : <les 2 indices les plus discriminants>".
Si les photos ne montrent que des interieurs, dis-le honnetement et liste le peu d'exterieur visible.`;

async function analyzePhotos(images) {
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', ...img } })),
    { type: 'text', text: PROMPT },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content }] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`API: ${j.error.message}`);
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

// ---------- fiche ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function satLink(lat, lng) {
  return `https://www.google.com/maps/@${lat},${lng},1200m/data=!3m1!1e3`;
}

async function findListingByUrl(url) {
  const { data, error } = await supabaseClient()
    .from('immo_seen')
    .select('site, listing_id, url, title, commune, price, price_num, lat, lng, secteur, geo_source')
    .eq('url', url).maybeSingle();
  if (error) throw error;
  return data;
}

async function getCachedFiche(url) {
  const { data, error } = await supabaseClient().from('immo_reperage').select('fiche').eq('url', url).maybeSingle();
  if (error) throw error;
  return data ? data.fiche : null;
}
async function saveFiche(url, fiche) {
  const { error } = await supabaseClient().from('immo_reperage').upsert({ url, fiche, created_at: new Date().toISOString() });
  if (error) throw error;
}

export async function handleReperage(url) {
  // 0) cache
  const cached = await getCachedFiche(url);
  if (cached) { await send(cached); return 'cache'; }

  // 1) bien connu ?
  const rec = await findListingByUrl(url);
  const head = rec
    ? `🎯 <b>Repérage — ${esc(rec.site)} · ${rec.price ? esc(rec.price) : ''} · ${esc(rec.commune || '')}</b>`
    : `🎯 <b>Repérage</b>`;

  // 2) photos
  const html = await getHtml(url, { retries: 1, timeoutMs: 25000 });
  const photoUrls = extractPhotoUrls(html, url);
  const images = [];
  for (const pu of photoUrls) {
    if (images.length >= MAX_PHOTOS) break;
    try { images.push(await fetchImageB64(pu)); } catch { /* skip */ }
  }
  if (!images.length) {
    await send(`${head}\n⚠️ Impossible de récupérer les photos de l'annonce (protection du site ?). Fiche non générée.\n🔗 ${esc(url)}`);
    return 'nophotos';
  }

  // 3) analyse
  const analysis = await analyzePhotos(images);

  // 4) fiche
  const zone = rec && rec.lat != null
    ? (rec.geo_source === 'page' ? `📐 Zone de recherche : ≈ 1-1,5 km autour du point de l'annonce\n🛰️ <a href="${satLink(rec.lat, rec.lng)}">Ouvrir la zone en satellite ↗</a>`
      : `📐 Position connue au secteur${rec.secteur ? ` (${esc(rec.secteur)})` : ''} — zone plus large\n🛰️ <a href="${satLink(rec.lat, rec.lng)}">Ouvrir la zone en satellite ↗</a>`)
    : `📐 Bien non géolocalisé — utilise la commune comme point de départ`;

  const fiche = [head, '', `<b>Indices visuels (${images.length} photo(s) analysée(s)) :</b>`, esc(analysis), '', zone, '', `🔗 <a href="${esc(url)}">Annonce ↗</a>`].join('\n');
  await saveFiche(url, fiche);
  await send(fiche);
  return 'ok';
}

// ---------- boucle de commande ----------
export async function runReperage() {
  const last = parseInt((await kvGet('tg_offset')) || '0', 10);
  const updates = await getUpdates(last ? last + 1 : undefined);
  let handled = 0;
  for (const u of updates) {
    await kvSet('tg_offset', u.update_id);
    const msg = u.message;
    if (!msg || !msg.text) { console.log(`  [skip] update sans texte (type: ${Object.keys(u).filter(k=>k!=='update_id').join(',')})`); continue; }
    if (String(msg.chat.id) !== String(env.telegramChat)) {
      console.log(`  [skip] chat inattendu: recu=${msg.chat.id} attendu=${env.telegramChat} texte="${(msg.text||'').slice(0,30)}"`);
      continue;
    }
    console.log(`  [msg] "${(msg.text||'').slice(0,60)}"`);
    const m = msg.text.match(/^\/reperage(?:@\w+)?\s+(https?:\/\/\S+)/i);
    if (!m) {
      if (/^\/reperage/i.test(msg.text)) {
        await send('Usage : <code>/reperage https://lien-de-l-annonce</code>');
        continue;
      }
      // ----- commandes clients -----
      if (/^\/(nouveau|start)\b/i.test(msg.text) || /^\/client(@\w+)?\s*$/i.test(msg.text)) {
        await send('📝 Touchez le bouton pour remplir les critères du client. La liste des biens arrive ici dès l\'enregistrement.',
          [[formButton()]]);
        continue;
      }
      if (/^\/clients\b/i.test(msg.text)) {
        try {
          const cs = await listClients();
          if (!cs.length) { await send('Aucun client enregistré pour le moment.', [[formButton()]]); continue; }
          const lines = cs.map((c) => `${c.active ? '🟢' : '⚪️'} <b>${esc(c.name)}</b> — ${esc(criteriaLine(c))}`);
          await send('👥 <b>Clients</b>\n' + lines.join('\n'),
            [[formButton(), formButton('📋 Gérer / modifier', env.clientsPageUrl)]]);
        } catch (e) { await send('⚠️ ' + esc(e.message)); }
        continue;
      }
      const off = msg.text.match(/^\/client-(off|on|del)(?:@\w+)?\s+(\S+)/i);
      if (off) {
        try {
          const [, action, name] = off;
          if (action.toLowerCase() === 'del') { await deleteClient(name); await send(`🗑 Client <b>${esc(name)}</b> supprimé.`); }
          else { await setClientActive(name, action.toLowerCase() === 'on'); await send(`${action.toLowerCase() === 'on' ? '🟢' : '⚪️'} Client <b>${esc(name)}</b> ${action.toLowerCase() === 'on' ? 'réactivé' : 'en pause'}.`); }
        } catch (e) { await send('⚠️ ' + esc(e.message)); }
        continue;
      }
      if (/^\/rapport\b/i.test(msg.text)) {
        try {
          const { parseRapportCommand, buildRapportData, generatePdf, sendPdf } = await import('./rapport.js');
          const q = parseRapportCommand(msg.text);
          if (!q) {
            await send('Usage : <code>/rapport Vence 250m2</code> (surface et prix optionnels : <code>/rapport Saint-Paul 300m2 2.5M</code>)');
            continue;
          }
          await send('⏳ Génération du rapport ' + esc(q.commune) + '…');
          const rows = await getAllRows();
          const data = buildRapportData(rows, q.commune, { surface: q.surface, price: q.price });
          const pdf = await generatePdf(data);
          const fname = 'rapport-' + q.commune.toLowerCase().replace(/[^a-z]+/g, '-') + '.pdf';
          await sendPdf(pdf, fname, `📊 Rapport marché — ${q.commune} · ${data.stock} biens observés`);
        } catch (e) { await send('⚠️ Rapport impossible : ' + esc(e.message)); }
        continue;
      }
      if (/^\/client\b/i.test(msg.text)) {
        try {
          const c = parseClientCommand(msg.text);
          if (!c || (!c.budget_min && !c.budget_max && !c.communes && !c.surface_min && !c.keywords)) {
            await send('Le plus simple : le formulaire 👇\n\n(ou en une ligne : <code>/client Nom budget 1.5-2.5M communes Vence,Saint-Paul surface 200+ mots-cles piscine,vue mer</code>)', [[formButton()]]);
            continue;
          }
          await saveClient(c);
          const rows = await getAllRows();
          const matches = searchStock(c, rows);
          // la veille ne notifiera ensuite que les NOUVEAUX biens
          try { await claimMany(c.name, matches.map((m2) => m2.l.url)); } catch { /* ok */ }
          await send(telegramList(c, matches, env.clientsPageUrl, 'new'));
        } catch (e) { await send('⚠️ ' + esc(e.message)); }
        continue;
      }
      continue;
    }
    const url = m[1].trim();
    try {
      if (!ANTHROPIC_KEY) {
        await send('⚠️ La clé <code>ANTHROPIC_API_KEY</code> n\'est pas configurée (GitHub → Settings → Secrets → Actions). Le repérage photo est indisponible — les commandes /client fonctionnent normalement.');
        continue;
      }
      await send('⏳ Repérage en cours (30-60 s)…');
      const r = await handleReperage(url);
      console.log(`reperage ${url}: ${r}`);
      handled++;
    } catch (e) {
      console.error(`reperage KO: ${e.message}`);
      await send(`⚠️ Repérage impossible : ${esc(e.message)}`);
    }
  }
  console.log(`Repérage : ${updates.length} message(s) lu(s), ${handled} fiche(s).`);
}
