import { env } from '../config.js';

const API = (m) => `https://api.telegram.org/bot${env.telegramToken}/${m}`;

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function caption(l) {
  const lines = [
    `🏠 <b>Nouvelle annonce — ${esc(l.site)}</b>`,
    l.commune ? `📍 ${esc(l.commune)}` : null,
    l.price ? `💶 ${esc(l.price)}` : null,
    l.title ? `📝 ${esc(l.title)}` : null,
    `🔗 ${esc(l.url)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function call(method, body) {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.telegramChat, ...body }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json;
}

// Envoie une annonce. Photo si dispo, sinon message texte avec apercu du lien.
export async function notify(l) {
  const text = caption(l);
  if (l.image) {
    try {
      await call('sendPhoto', { photo: l.image, caption: text, parse_mode: 'HTML' });
      return;
    } catch {
      /* fallback texte si l'image est rejetee */
    }
  }
  await call('sendMessage', {
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  });
}

export async function notifyText(msg) {
  await call('sendMessage', { text: msg, parse_mode: 'HTML' });
}

const eur = (n) => (n != null ? Number(n).toLocaleString('fr-FR') + ' €' : '?');

// Notifie un signal "mandat qui traine" (baisse, anciennete, remise en vente).
export async function notifySignal(a) {
  const l = a.l;
  const loc = l.commune ? `📍 ${esc(l.commune)}` : null;
  const link = `🔗 ${esc(l.url)}`;
  let lines;
  if (a.kind === 'drop') {
    lines = [
      `🔻 <b>Baisse de prix — ${esc(l.site)}</b>`,
      loc,
      `💶 ${eur(a.initial)} → <b>${eur(a.price)}</b> (-${Math.round(a.dropPct * 100)} %)`,
      `⏱ ${a.days} j en ligne`,
      l.title ? `📝 ${esc(l.title)}` : null,
      link,
    ];
  } else if (a.kind === 'stale') {
    lines = [
      `⏳ <b>Mandat qui traîne — ${esc(l.site)}</b>`,
      loc,
      l.price ? `💶 ${esc(l.price)}` : null,
      `📅 ${a.days} j en ligne — sans doute négociable`,
      l.title ? `📝 ${esc(l.title)}` : null,
      link,
    ];
  } else { // reappear
    lines = [
      `♻️ <b>Remise en vente — ${esc(l.site)}</b>`,
      loc,
      l.price ? `💶 ${esc(l.price)}` : null,
      `↩️ réapparue après ${a.gapDays} j d'absence`,
      link,
    ];
  }
  await call('sendMessage', { text: lines.filter(Boolean).join('\n'), parse_mode: 'HTML' });
}
