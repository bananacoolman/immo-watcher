import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as cheerio from 'cheerio';
import { env } from '../config.js';
import { priceValue, extractPrice, matchCommune, looksLikeRental, hash } from './normalize.js';

// Definition des portails : comment reconnaitre l'expediteur et les liens d'annonce.
const PORTALS = [
  {
    name: 'Leboncoin',
    sender: /leboncoin/i,
    adHref: /leboncoin\.fr/i,           // lien vers une annonce LBC
    looksAd: /(ventes_immobilieres|\/ad\/|\/\d{7,})/i,
  },
  {
    name: 'Seloger',
    sender: /seloger/i,
    adHref: /seloger\.com|links\.seloger|sl\.seloger/i,
    looksAd: /(annonces|detail|\/\d{6,}|bien=)/i,
  },
];

function cleanUrl(u = '') {
  try {
    const url = new URL(u);
    // retire les parametres de tracking pour stabiliser la dedup
    [...url.searchParams.keys()].forEach((k) => {
      if (/^(utm_|mtm_|cmp|xtor|at_|pid|ept|trk|cx|mkt)/i.test(k)) url.searchParams.delete(k);
    });
    return url.toString();
  } catch { return u; }
}

function idFromUrl(u = '', title = '') {
  const m = u.match(/(\d{6,})/);
  return m ? m[1] : 'h_' + hash(title || u);
}

// Construit la carte autour d'un lien d'annonce (texte voisin = titre + prix).
function cardText($, a) {
  let el = a;
  for (let i = 0; i < 5; i++) {
    const $el = $(el);
    if (/€|EUR/i.test($el.text())) return $el.text().replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!$el.parent().length) break;
    el = $el.parent()[0];
  }
  return $(a).closest('td,tr,table,div').text().replace(/\s+/g, ' ').trim().slice(0, 600);
}

function parseEmail(html, portal) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!portal.adHref.test(href) || !portal.looksAd.test(href)) return;
    const url = cleanUrl(href);
    if (seen.has(url)) return;
    seen.add(url);

    const text = cardText($, a);
    const title = ($(a).text() || $(a).attr('title') || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const blob = `${title} ${text}`;
    if (looksLikeRental(blob)) return;

    const num = priceValue(blob);
    if (num != null && env.minPrice && num < env.minPrice) return;
    if (num == null && !env.keepUnknownPrice) return;

    out.push({
      site: portal.name,
      id: idFromUrl(url, title),
      url,
      title: title || null,
      price: extractPrice(blob),
      commune: matchCommune(blob),
      image: null,
    });
  });
  return out;
}

// Lit les e-mails non lus de la boite, en extrait les annonces, marque comme lus.
export async function getEmailListings() {
  if (!env.emailEnabled) return [];
  if (!env.imapHost || !env.imapUser || !env.imapPassword) {
    console.warn('  [email] config IMAP incomplete — bridge ignore.');
    return [];
  }

  const client = new ImapFlow({
    host: env.imapHost,
    port: env.imapPort,
    secure: env.imapPort === 993,
    auth: { user: env.imapUser, pass: env.imapPassword },
    logger: false,
  });

  const listings = [];
  await client.connect();
  const lock = await client.getMailboxLock(env.imapMailbox);
  try {
    const uids = await client.search({ seen: false });
    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true });
      const mail = await simpleParser(msg.source);
      const fromTo = `${mail.from?.text || ''} ${mail.subject || ''}`;
      const portal = PORTALS.find((p) => p.sender.test(fromTo));
      if (portal && mail.html) {
        const found = parseEmail(mail.html, portal);
        listings.push(...found);
        if (env.debug) console.log(`  [email] ${portal.name} : ${found.length} annonce(s) dans "${(mail.subject || '').slice(0, 50)}"`);
      }
      // marque lu seulement apres traitement (sauf en debug, on ne touche a rien)
      if (!env.debug) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return listings;
}
