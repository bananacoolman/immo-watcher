import * as cheerio from 'cheerio';
import { getHtml } from '../core/http.js';
import {
  matchCommune, extractPrice, extractRef, listingId,
  priceValue, looksLikeRental,
} from '../core/normalize.js';
import { env } from '../config.js';

function abs(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}

// --- Detection automatique des fiches (sites sans motif d'URL connu) ---
// Un lien est candidat s'il reste sur le site et n'est pas une page de
// service (contact, estimation, blog...). On ne garde ensuite que ceux dont
// la "carte" affiche un prix : c'est ce qui distingue une annonce d'un menu.
const NAV_WORDS = /(contact|estimation|estimer|vendre-mon|honoraire|mention|legal|cookie|confidential|privacy|recrut|emploi|blog|actualit|news|equipe|team|about|a-propos|qui-sommes|notre-agence|agence\/\d+$|partenaire|plan[+-]site|sitemap|favori|alerte|login|connexion|compte|account|newsletter|location|louer|rent|\.pdf$|\.jpe?g$|\.png$|tel:|mailto:|whatsapp|facebook|instagram|linkedin|youtube|twitter)/i;
export function autoDetail(site) {
  const host = (h) => h.replace(/^www\./, '');
  const index = new Set(site.indexUrls.map((u) => u.split('#')[0].replace(/\/$/, '')));
  return {
    test(u) {
      let url;
      try { url = new URL(u); } catch { return false; }
      if (host(url.hostname) !== host(site.domain)) return false;
      const path = url.pathname.replace(/\/$/, '');
      if (!path || path === '/fr' || path === '/en') return false;
      if (index.has(u.split('#')[0].replace(/\/$/, ''))) return false;
      if (site.excludePattern && site.excludePattern.test(u)) return false;
      if (NAV_WORDS.test(u)) return false;
      if (/[?&](page|p|pg)=\d+|\/page\/\d+/i.test(u)) return false;
      return true;
    },
  };
}

// Pages suivantes d'une liste (?page=2, /page/2/, /vente/2...) : meme site,
// meme chemin de base, seul le numero change.
function nextPages($, baseUrl) {
  const out = new Set();
  let base;
  try { base = new URL(baseUrl); } catch { return out; }
  const stem = base.pathname.replace(/\/(page\/)?\d+\/?$/, '').replace(/\/$/, '');
  $('a[href]').each((_, a) => {
    const u = abs($(a).attr('href') || '', baseUrl);
    if (!u) return;
    let x; try { x = new URL(u); } catch { return; }
    if (x.hostname !== base.hostname) return;
    const qp = /[?&](page|p|pg)=(\d+)/i.test(x.search);
    const xs = x.pathname.replace(/\/(page\/)?\d+\/?$/, '').replace(/\/$/, '');
    const pathNum = /\/(page\/)?\d+\/?$/.test(x.pathname) && xs === stem;
    if ((qp && x.pathname.replace(/\/$/, '') === base.pathname.replace(/\/$/, '')) || pathNum) out.add(u.split('#')[0]);
  });
  return out;
}

// --- Strategie 1 : donnees structurees JSON-LD (la plus fiable quand presente)
function fromJsonLd($, baseUrl) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).contents().text()); } catch { return; }
    const arr = Array.isArray(data) ? data : [data];
    for (const node of arr) {
      const graph = node['@graph'] ? node['@graph'] : [node];
      for (const item of graph) {
        const type = String(item['@type'] || '').toLowerCase();
        if (!/(residence|house|apartment|product|offer|realestate|accommodation)/.test(type)) continue;
        const url = abs(item.url || item['@id'] || '', baseUrl);
        if (!url) continue;
        const price =
          item.offers?.price ?? item.price ?? null;
        const priceNum = price ? Number(String(price).replace(/[^\d]/g, '')) || null : null;
        out.push({
          url,
          title: item.name || '',
          price: priceNum ? priceNum.toLocaleString('fr-FR') + ' €' : null,
          priceNum,
          image: Array.isArray(item.image) ? item.image[0] : item.image || null,
          text: item.name || '',
        });
      }
    }
  });
  return out;
}

const SHARE = /(facebook\.com|twitter\.com|\/\/x\.com|pinterest\.|linkedin\.com|whatsapp|wa\.me|mailto:|sharer|\/share\?|passthru|wp-content\/|addtoany)/i;

// Remonte jusqu'au plus grand ancetre ne contenant qu'UNE seule annonce
// (on s'arrete des qu'un parent englobe un 2e lien de detail). Robuste a
// l'imbrication et garantit qu'on lit le prix de la bonne annonce.
function cardOf($, a, detailPattern, baseUrl) {
  let el = a;
  for (let i = 0; i < 20; i++) {
    const p = $(el).parent();
    if (!p.length) break;
    const urls = new Set();
    p.find('a[href]').each((_, x) => {
      const u = abs($(x).attr('href') || '', baseUrl);
      if (u && detailPattern.test(u)) urls.add(u.split('#')[0]);
    });
    if (urls.size > 1) break;   // le parent contient une autre annonce -> stop
    el = p[0];
  }
  return $(el);
}

// Lit le prix dans le plus PETIT element qui le contient (evite que le nombre
// de pieces/chambres voisin se colle au prix). Ignore prix/m² et honoraires.
function priceFromCard($, $card) {
  let best = null; // { v, len }
  $card.find('*').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 40 || !/€|EUR/i.test(t)) return;
    if (/\/m|m²|m2|honorair|mensu|\/an|\/sem/i.test(t)) return;
    const v = priceValue(t);
    if (v == null) return;
    if (best == null || t.length < best.len) best = { v, len: t.length };
  });
  return best ? best.v : priceValue($card.text());
}

// --- Strategie 2 : liens de detail + texte de carte (fallback generique)
function fromAnchors($, baseUrl, detailPattern) {
  const seen = new Set();
  const out = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const url = abs(href, baseUrl);              // resout les liens relatifs en absolu
    if (!url || !detailPattern.test(url)) return; // puis teste le motif sur l'URL absolue
    if (SHARE.test(url)) return;                  // boutons de partage (Facebook, Pinterest...)
    if (seen.has(url)) return;
    seen.add(url);

    const $card = cardOf($, a, detailPattern, baseUrl);
    const text = $card.text().replace(/\s+/g, ' ').trim();
    const $img = $card.find('img').first();
    const image = abs($img.attr('data-src') || $img.attr('src') || '', baseUrl);
    let title =
      ($(a).attr('title') || $(a).text() || $img.attr('alt') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 140);
    // titre charabia (hash d'image, attribution...) -> on derive du slug de l'URL
    if (!title || /\b[0-9a-f]{12,}\b/i.test(title) || /\boriginal\b.*attribut/i.test(title)) {
      const slug = (url.split('?')[0].split('/').filter(Boolean).pop() || '')
        .replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim();
      if (slug) title = (slug.charAt(0).toUpperCase() + slug.slice(1)).slice(0, 140);
    }
    // titre = simple numero (Century 21, ERA...) ou "Voir la fiche" -> debut du texte de la carte
    if (/\b\d{3,4}x\d{3,4}\b|^logo$|^image$|^photo/i.test(title)) {        // nom d'image -> titre tire de l'adresse
      const slug = decodeURIComponent(url.split('?')[0].split('/').filter(Boolean).pop() || '')
        .replace(/[+_-]+/g, ' ').replace(/\s\d{5,}$/, '').trim();
      title = slug ? (slug.charAt(0).toUpperCase() + slug.slice(1)).slice(0, 140) : '';
    }
    if (!title || /^\d+$/.test(title) || /^(voir|see|view|en savoir|d[ée]couvrir|discover|details?|more)\b/i.test(title)) {
      // l'adresse de la fiche si elle est parlante, sinon le debut du texte de la carte
      const slug = decodeURIComponent(url.split('?')[0].split('/').filter(Boolean).pop() || '')
        .replace(/\.html?$/, '').replace(/[+_-]+/g, ' ').trim();
      const t = /[a-z]{4,}.*[a-z]{4,}/i.test(slug) ? slug.charAt(0).toUpperCase() + slug.slice(1)
        : text.replace(/\s+/g, ' ').trim();
      if (t) title = t.slice(0, 110);
    }

    const pv = priceFromCard($, $card);
    out.push({
      url,
      title,
      price: pv != null ? pv.toLocaleString('fr-FR') + ' €' : null,
      priceNum: pv,
      image,
      text: `${title} ${text} ${url}`,
    });
  });
  return out;
}

// Scrape generique d'un site a partir de sa config.
export async function genericScrape(site, stats = null) {
  const collected = new Map(); // url -> raw
  const auto = !site.detailPattern || site.detailPattern === 'auto';
  const pattern = auto ? autoDetail(site) : site.detailPattern;
  const maxPages = site.followPages || 0;     // pages suivantes a suivre en plus
  const queue = [...site.indexUrls];
  const done = new Set();
  let extra = 0;

  while (queue.length) {
    const indexUrl = queue.shift();
    if (done.has(indexUrl)) continue;
    done.add(indexUrl);
    let html;
    try {
      html = await getHtml(indexUrl, { useJs: !!site.needsJs });
    } catch (e) {
      console.warn(`  [${site.name}] echec ${indexUrl}: ${e.message}`);
      if (stats) stats.failed.push(`${indexUrl} (${e.message})`);
      continue;
    }
    if (stats) stats.pages.push(indexUrl);
    const $ = cheerio.load(html);

    let raws = site.preferJsonLd !== false ? fromJsonLd($, indexUrl) : [];
    if (raws.length < 2) raws = fromAnchors($, indexUrl, pattern);
    // en detection automatique : une annonce affiche un prix
    if (auto) raws = raws.filter((r) => r.priceNum != null);
    if (stats && !raws.length && stats.samples.length < 12) {
      // liens qui ressemblent a des annonces (numero, "annonce", "propriete"...) en priorite
      const all = new Set();
      $('a[href]').each((_, a) => {
        const u = abs($(a).attr('href') || '', indexUrl);
        if (u && !SHARE.test(u) && u !== indexUrl) all.add(u);
      });
      const looks = [...all].filter((u) => /\d{4,}|annonce|propri|bien|detail|fiche|vente[-+/]|for-sale|listing/i.test(u) && !NAV_WORDS.test(u));
      const ex = (looks.length ? looks : [...all]).slice(0, 8);
      stats.samples.push(`${indexUrl} -> ${all.size} liens (${looks.length} ressemblent a des annonces), ex. : ${ex.join('  ')}`);
    }
    // meme annonce vue depuis plusieurs pages (?agency=...) -> une seule adresse
    if (site.stripQuery) raws = raws.map((r) => ({ ...r, url: r.url.split('?')[0] }));

    let added = 0;
    for (const r of raws) { if (!collected.has(r.url)) added++; collected.set(r.url, r); }

    if (maxPages && added) {
      for (const u of nextPages($, indexUrl)) {
        if (extra >= maxPages || done.has(u) || queue.includes(u)) continue;
        queue.push(u); extra++;
      }
    }
    if (queue.length) await new Promise((r) => setTimeout(r, site.pageDelayMs ?? (maxPages ? 800 : 0)));
  }
  if (stats) stats.raw = [...collected.keys()];

  // Normalisation + filtres (secteur, location, prix mini).
  const listings = [];
  let skippedPrice = 0;
  for (const r of collected.values()) {
    const blob = `${r.text || ''} ${r.title || ''}`;
    // Commune : si le site fournit une etiquette fiable (ex. "Vente Villa <Commune>"),
    // on la prend comme source autoritaire ; sinon on cherche dans tout le texte + l'URL.
    let communeSrc = `${blob} ${r.url}`;
    if (site.communeRegex) {
      const m = communeSrc.match(site.communeRegex);
      if (m) communeSrc = m[1];
    }
    // communeFrom 'url' : seule l'adresse de la fiche fait foi (pages qui
    // melangent les secteurs) ; 'url-first' : l'adresse d'abord, sinon le texte.
    const fromUrl = matchCommune(decodeURIComponent(r.url.split('?')[0]).replace(/^https?:\/\/[^/]+/, ''));
    const commune = site.communeFrom === 'url' ? fromUrl
      : site.communeFrom === 'url-first' ? (fromUrl || matchCommune(communeSrc))
      : matchCommune(communeSrc);
    if (!commune) { if (stats) stats.otherCommune.push(r.url); continue; }
    if (looksLikeRental(blob)) { if (stats) stats.dropped.push(`location : ${r.url}`); continue; } // ventes seulement

    // Prix : valeur numerique deja connue (JSON-LD) ou extraite du texte.
    const num = r.priceNum ?? priceValue(blob);
    if (num != null) {
      if (env.minPrice && num < env.minPrice) {
        skippedPrice++;
        if (stats) stats.dropped.push(`prix ${num.toLocaleString('fr-FR')} € < mini : ${commune} ${r.url} « ${(r.text || '').slice(0, 90)} »`);
        continue;
      }
    } else if (!env.keepUnknownPrice) {
      continue; // prix inconnu et on a choisi de les exclure
    }

    const ref = extractRef(`${r.text || ''} ${r.url}`);
    listings.push({
      site: site.name,
      id: listingId(ref, r.url),
      url: r.url,
      title: r.title || null,
      price: r.price || (num != null ? num.toLocaleString('fr-FR') + ' €' : null),
      commune,
      image: r.image || null,
      priceNum: num ?? null,
    });
  }

  if (env.debug) {
    console.log(`  [${site.name}] ${collected.size} liens bruts -> ${listings.length} retenus` +
      (skippedPrice ? ` (${skippedPrice} ecartes < ${env.minPrice.toLocaleString('fr-FR')} €)` : ''));
    listings.slice(0, 5).forEach((l) =>
      console.log(`     • ${l.commune} | ${l.price || '?'} | ${l.id} | ${l.url}`));
    if (!listings.length && collected.size) {
      console.log('     (aucun match secteur — exemples de liens trouves :)');
      [...collected.keys()].slice(0, 5).forEach((u) => console.log('       ', u));
    }
  }
  return listings;
}
