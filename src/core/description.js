// Description d'une annonce, lue sur sa page detail. Sert a verifier les
// souhaits des clients (piscine, vue mer, plain-pied...) que le titre ne dit
// pas toujours. On prend la description "officielle" publiee par l'agence
// (donnees structurees, balises de partage) plutot que tout le texte de la
// page : le menu, le pied de page et les "biens similaires" parlent souvent
// de piscine ou de vue mer sans rapport avec le bien.
import * as cheerio from 'cheerio';

const MAX = 1200;

const clean = (s = '') => String(s)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function fromJsonLd($) {
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o.description === 'string') out.push(o.description);
    for (const k of ['@graph', 'offers', 'itemOffered', 'mainEntity', 'about']) if (o[k]) walk(o[k]);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { walk(JSON.parse($(el).contents().text())); } catch { /* JSON invalide */ }
  });
  return out;
}

// Renvoie la description la plus complete trouvee, '' si aucune.
export function extractDescription(html) {
  if (!html) return '';
  let $;
  try { $ = cheerio.load(String(html)); } catch { return ''; }
  const cands = [
    ...fromJsonLd($),
    $('meta[property="og:description"]').attr('content'),
    $('meta[name="description"]').attr('content'),
    $('meta[name="twitter:description"]').attr('content'),
  ].map(clean).filter((s) => s.length >= 40);
  if (!cands.length) return '';
  cands.sort((a, b) => b.length - a.length);
  return cands[0].slice(0, MAX);
}

// Une meme description sur plusieurs annonces d'une agence = texte generique
// de l'agence (slogan), pas celui du bien : on la neutralise.
export function genericDescriptions(rows, minCount = 3) {
  const count = new Map();
  for (const r of rows) {
    if (!r.description) continue;
    const k = r.site + '\u0000' + r.description;
    count.set(k, (count.get(k) || 0) + 1);
  }
  const out = [];
  for (const [k, n] of count) if (n >= minCount) {
    const [site, description] = k.split('\u0000');
    out.push({ site, description });
  }
  return out;
}
