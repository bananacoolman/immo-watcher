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
    if (seen.has(url)) return;
    seen.add(url);

    const $card = cardOf($, a, detailPattern, baseUrl);
    const text = $card.text().replace(/\s+/g, ' ').trim();
    const $img = $card.find('img').first();
    const image = abs($img.attr('data-src') || $img.attr('src') || '', baseUrl);
    const title =
      ($(a).attr('title') || $(a).text() || $img.attr('alt') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 140);

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
export async function genericScrape(site) {
  const collected = new Map(); // url -> raw

  for (const indexUrl of site.indexUrls) {
    let html;
    try {
      html = await getHtml(indexUrl, { useJs: !!site.needsJs });
    } catch (e) {
      console.warn(`  [${site.name}] echec ${indexUrl}: ${e.message}`);
      continue;
    }
    const $ = cheerio.load(html);

    let raws = site.preferJsonLd !== false ? fromJsonLd($, indexUrl) : [];
    if (raws.length < 2) raws = fromAnchors($, indexUrl, site.detailPattern);

    for (const r of raws) collected.set(r.url, r);
  }

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
    const commune = matchCommune(communeSrc);
    if (!commune) continue;
    if (looksLikeRental(blob)) continue; // on ne veut que les ventes

    // Prix : valeur numerique deja connue (JSON-LD) ou extraite du texte.
    const num = r.priceNum ?? priceValue(blob);
    if (num != null) {
      if (env.minPrice && num < env.minPrice) { skippedPrice++; continue; }
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
