// Correspondance client <-> bien.
// FICHIER PARTAGE : charge par la page docs/clients.html (navigateur) ET par
// le bot (src/core/clients.js, Node). Une regle modifiee ici s'applique aux
// deux a l'identique : ce que Lydia voit sur la page = ce que le bot envoie.
// Aucune dependance : JavaScript pur.

export const COMMUNES = [
  'Saint-Paul-de-Vence', 'Vence', 'La Colle-sur-Loup', 'Tourrettes-sur-Loup',
  'La Gaude', 'Saint-Jeannet', 'Gattières',
];

export const ACTIVE_DAYS = 4; // un bien est "en vente" s'il a ete revu il y a < 4 jours

export const TYPES = {
  maison: 'Maison / villa',
  appartement: 'Appartement',
  terrain: 'Terrain',
};

// Souhaits proposes en un clic, avec les formulations cherchees dans l'annonce.
export const WISHES = {
  'Piscine': ['piscine', 'pool'],
  'Vue mer': ['vue mer', 'vue sur la mer', 'vue sur mer', 'sea view'],
  'Vue dégagée': ['vue degagee', 'vue panoramique', 'vue imprenable', 'panoramique'],
  'Jardin / terrain': ['jardin', 'terrain', 'parc arbore', 'parc'],
  'Dépendance': ['dependance', 'maison d amis', 'pool house', 'annexe', 'gite', 'studio independant'],
  'Plain-pied': ['plain pied', 'de plain pied'],
  'Garage': ['garage', 'box'],
  'Calme': ['calme', 'au calme', 'sans vis a vis', 'quiet'],
  'Proche village': ['proche village', 'proche du village', 'a pied du village', 'coeur du village', 'centre village'],
  'Rénové': ['renove', 'renovee', 'refait a neuf', 'refaite a neuf', 'neuf', 'contemporain', 'moderne'],
};

// --- texte -------------------------------------------------------------
export const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s = '') => ' ' + norm(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

function urlPath(u = '') {
  try { return new URL(u).pathname; } catch { return String(u || ''); }
}
// Texte "parlant" d'une annonce : titre + chemin de l'URL (les slugs disent
// souvent "villa-vue-mer-piscine") + secteur + description recuperee par le
// bot sur la page de l'annonce. On exclut le nom de domaine.
function listingText(l) {
  return words([l.title || '', urlPath(l.url), l.secteur || '', l.description || ''].join(' '));
}

// --- type de bien ------------------------------------------------------
const TYPE_TERMS = {
  appartement: ['appartement', 'apartment', 'appart', 'appt', 'studio', 'duplex', 'triplex', 'penthouse', 'loft',
    't1', 't2', 't3', 't4', 't5', 't6', 'f1', 'f2', 'f3', 'f4', 'f5'],
  maison: ['maison', 'villa', 'bastide', 'mas', 'propriete', 'chalet', 'bergerie', 'demeure', 'domaine', 'house',
    'longere', 'corps de ferme', 'moulin', 'chateau', 'mazet'],
  terrain: ['terrain a batir', 'terrain constructible', 'terrain', 'parcelle', 'land', 'plot'],
};
const hasTerm = (text, term) => text.includes(' ' + term + ' ');

export function detectTypes(l) {
  const t = listingText(l);
  const out = new Set();
  for (const [k, terms] of Object.entries(TYPE_TERMS)) if (terms.some((x) => hasTerm(t, x))) out.add(k);
  // "villa sur un terrain de 2000 m2" = une maison, pas un terrain a vendre
  if (out.has('terrain') && (out.has('maison') || out.has('appartement'))) out.delete('terrain');
  return out;
}

// --- souhaits ----------------------------------------------------------
export function wishTerms(w) {
  const key = Object.keys(WISHES).find((k) => norm(k) === norm(w));
  return (key ? WISHES[key] : [w]).map((x) => words(x).trim()).filter(Boolean);
}
export function wishesFound(client, l) {
  const list = client.keywords || [];
  const t = listingText(l);
  const found = list.filter((w) => wishTerms(w).some((term) => hasTerm(t, term)));
  return { found, missing: list.filter((w) => !found.includes(w)) };
}

// --- correspondance ------------------------------------------------------
// Precision "stricte" (par defaut) : un bien n'est retenu que si l'annonce
// CONFIRME chaque critere — type de bien, surface, et chacun des souhaits.
// Precision "large" : les annonces muettes sur un critere sont gardees avec
// une mention ("surface a verifier"), et les souhaits ne font que trier.
export const PRECISIONS = { stricte: 'Stricte', large: 'Large' };
export const isStrict = (client) => client.precision !== 'large';

// Renvoie null (ne correspond pas) ou { l, notes, found, missing, score }.
export function matchListing(client, l) {
  const strict = isStrict(client);
  const notes = [];
  const hasBudget = client.budget_min || client.budget_max;
  if (hasBudget && l.price_num == null) return null;
  if (client.budget_min && l.price_num < client.budget_min) return null;
  if (client.budget_max && l.price_num > client.budget_max) return null;
  if (client.communes && client.communes.length && !client.communes.includes(l.commune)) return null;

  if (client.type && TYPES[client.type]) {
    const types = detectTypes(l);
    if (!types.has(client.type)) {
      if (types.size || strict) return null;   // autre type, ou type non confirme en mode strict
      notes.push('type à vérifier');
    }
  }

  if (client.surface_min) {
    if (l.surface == null) {
      if (strict) return null;
      notes.push('surface à vérifier');
    } else if (l.surface < client.surface_min) return null;
  }

  const { found, missing } = wishesFound(client, l);
  if ((client.keywords || []).length) {
    if (strict && missing.length) return null;                       // tous les souhaits confirmes
    if (!strict && client.keywords_required && !found.length) return null;
  }

  return { l, notes, found, missing, score: found.length };
}

export function isActive(l, nowMs = Date.now(), activeDays = ACTIVE_DAYS) {
  return !l.last_seen || (nowMs - new Date(l.last_seen).getTime()) / 86400000 <= activeDays;
}

// Biens en vente qui correspondent, les plus pertinents d'abord
// (le plus de souhaits trouves, puis prix croissant).
export function searchStock(client, rows, nowMs = Date.now(), activeDays = ACTIVE_DAYS) {
  const out = [];
  for (const l of rows) {
    if (!isActive(l, nowMs, activeDays)) continue;
    const m = matchListing(client, l);
    if (m) out.push(m);
  }
  out.sort((a, b) => (b.score - a.score) || ((a.l.price_num || 0) - (b.l.price_num || 0)));
  return out;
}

// Regroupe un meme bien affiche par plusieurs agences (meme commune, prix a
// 0,5 % pres, agences differentes) pour ne pas le montrer deux fois.
export function groupSameProperty(matches) {
  const groups = [];
  for (const m of matches) {
    const g = groups.find((x) => x.lead.l.commune === m.l.commune && x.lead.l.price_num && m.l.price_num
      && Math.abs(x.lead.l.price_num - m.l.price_num) <= Math.max(x.lead.l.price_num * 0.005, 5000)
      && !x.items.some((i) => i.l.site === m.l.site));
    if (g) g.items.push(m); else groups.push({ lead: m, items: [m] });
  }
  return groups;
}

// --- affichage --------------------------------------------------------------
export function eur(n) {
  if (n == null) return 'Prix nc';
  if (n >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/\s/g, ' ') + ' M€';
  return Math.round(n / 1000).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' k€';
}

export function criteriaParts(c) {
  const p = [];
  if (c.budget_min || c.budget_max) {
    if (c.budget_min && c.budget_max) p.push(`${eur(c.budget_min)} – ${eur(c.budget_max)}`);
    else if (c.budget_max) p.push(`jusqu'à ${eur(c.budget_max)}`);
    else p.push(`à partir de ${eur(c.budget_min)}`);
  }
  if (c.type && TYPES[c.type]) p.push(TYPES[c.type]);
  p.push(c.communes && c.communes.length ? c.communes.join(', ') : 'toutes communes');
  if (c.surface_min) p.push(`≥ ${c.surface_min} m²`);
  if (c.keywords && c.keywords.length) p.push((c.precision !== 'large' ? 'indispensable : ' : 'souhaits : ') + c.keywords.join(', '));
  return p;
}

// Lecture tolerante d'un montant saisi : "850k", "1,5M", "1.2 M€", "850 000".
export function parseMoney(s) {
  if (s == null) return null;
  let t = String(s).toLowerCase().replace(/€|eur|euros?/g, '').replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "850.000" / "1.500.000"
  let m = t.match(/^(\d+(?:\.\d+)?)m$/); if (m) return Math.round(parseFloat(m[1]) * 1e6);
  m = t.match(/^(\d+(?:\.\d+)?)k$/); if (m) return Math.round(parseFloat(m[1]) * 1e3);
  m = t.match(/^\d+(?:\.\d+)?$/);
  if (m) { const v = parseFloat(t); return v < 100 ? Math.round(v * 1e6) : Math.round(v); }
  return null;
}

// --- texte Telegram (identique page / bot) ---------------------------------------
const escH = (x = '') => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function telegramLine(m, others = []) {
  const { l, notes = [], found = [] } = m;
  const bits = [
    `• <a href="${escH(l.url)}">${escH(l.commune)}</a> — <b>${eur(l.price_num)}</b>`,
    l.surface ? `${l.surface} m²` : null,
    l.secteur ? escH(l.secteur) : null,
    `<i>${escH(l.site)}</i>`,
    found.length ? `✓ ${escH(found.join(', '))}` : null,
    notes.length ? `⚠️ ${escH(notes.join(' · '))}` : null,
  ].filter(Boolean);
  let line = bits.join(' · ');
  if (others.length) line += ' · aussi chez ' + others.map((o) => `<a href="${escH(o.l.url)}">${escH(o.l.site)}</a>`).join(', ');
  return line;
}

// Liste complete pour un client : kind = 'new' (enregistrement) ou 'list' (renvoi).
// Reste sous la limite Telegram de 4096 caracteres.
export function telegramList(client, matches, pageUrl, kind = 'new') {
  const groups = groupSameProperty(matches);
  const icon = kind === 'new' ? '🆕' : '📋';
  let text = `${icon} <b>${escH(client.name)}</b>\n${escH(criteriaParts(client).join(' · '))}`
    + (isStrict(client) ? '' : ' · précision large') + '\n\n';
  if (!groups.length) {
    text += 'Aucun bien en vente ne correspond pour le moment. Tu seras prévenue dès qu\'un bien correspondant sort.';
  } else {
    text += `🔎 <b>${groups.length} bien${groups.length > 1 ? 's' : ''} correspond${groups.length > 1 ? 'ent' : ''} :</b>\n`;
    let shown = 0;
    for (const g of groups) {
      const line = telegramLine(g.lead, g.items.slice(1)) + '\n';
      if (text.length + line.length > 3700) break;
      text += line; shown++;
    }
    if (shown < groups.length) text += `… et ${groups.length - shown} autre${groups.length - shown > 1 ? 's' : ''} sur la page clients\n`;
  }
  if (pageUrl) text += `\n📋 <a href="${escH(pageUrl)}">Ouvrir la page clients</a>`;
  return text;
}
