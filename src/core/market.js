import { env, MARKET_M2 } from '../config.js';

// Extrait la surface HABITABLE (m²) d'un texte. On ignore les m² qui designent
// autre chose (terrain, terrasse, sejour, chambre, piscine, garage...) et on
// privilegie une surface explicitement "habitable". En dernier recours, la plus
// grande surface plausible (une villa a 3,5 M€ ne fait pas 55 m²).
const SURF_EXCL = /(terrain|parcelle|jardin|terrasse|balcon|loggia|veranda|véranda|piscine|pool|garage|cave|cellier|buanderie|dressing|sous-sol|combles?|sejour|séjour|salon|chambre|cuisine|bureau|suite|studio|dependance|dépendance|garden|plot|\bland\b)/;
const SURF_HAB = /(habitable|surface de plancher|surface habitable|plancher|de vie|living)/;

export function parseSurface(text = '') {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\u00a0/g, ' ');
  const re = /(\d[\d\s.,]*)\s*m(?:²|2|\b)/gi;
  const hab = [], gen = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const v = parseFloat(m[1].replace(/[\s.]/g, '').replace(',', '.'));
    if (!(v >= 20 && v <= 2000)) continue;                 // bornes plausibles
    const before = t.slice(Math.max(0, m.index - 25), m.index);
    if (SURF_EXCL.test(before)) continue;                  // pas la surface habitable
    const around = t.slice(Math.max(0, m.index - 40), m.index + 15);
    if (SURF_HAB.test(around)) hab.push(v); else gen.push(v);
  }
  if (hab.length) return Math.max(...hab);                  // surface explicitement habitable
  if (gen.length) return Math.max(...gen);                  // sinon la plus grande plausible
  return null;
}

// Plausibilite d'un couple prix/surface, RELATIVE au marche de la commune.
// Un €/m² > 2x ou < 0,5x le prix marche local = surface quasi surement fausse.
export function m2Plausible(price, surface, commune) {
  if (!price || !surface) return false;
  const m2 = price / surface;
  const ref = MARKET_M2[commune];
  if (ref) return m2 >= ref * 0.5 && m2 <= ref * 2.0;
  return m2 >= 1500 && m2 <= 20000; // repli sans reference commune
}

// Renvoie un objet { ratio, pct, label } comparant le prix/m² du bien au marche
// de sa commune, ou null si surface/prix/commune indisponibles.
export function marketEval(l) {
  const ref = MARKET_M2[l.commune];
  const price = l.priceNum ?? null;
  if (!ref || price == null) return null;
  const surf = l.surface || parseSurface(l.title || '');
  if (!surf) return null;
  if (!m2Plausible(price, surf, l.commune)) return null;  // surface douteuse vs marche -> rien
  const m2 = price / surf;
  const ratio = m2 / ref;
  const pct = Math.round((ratio - 1) * 100);
  let label = 'dans le marche';
  if (ratio >= 1 + env.marketFlagPct) label = 'au-dessus du marche';
  else if (ratio <= 1 - env.marketFlagPct) label = 'sous le marche';
  return { m2: Math.round(m2), ref, ratio, pct, label, surf };
}

// Ligne courte prete a coller dans une notif (ou null).
export function marketLine(l) {
  const e = marketEval(l);
  if (!e) return null;
  const sign = e.pct > 0 ? '+' : '';
  const tag = e.label === 'au-dessus du marche' ? '🔺 au-dessus du marche'
    : e.label === 'sous le marche' ? '🟢 sous le marche (opportunite)'
    : '➖ dans le marche';
  return `${tag} · ${e.m2.toLocaleString('fr-FR')} €/m² vs ${e.ref.toLocaleString('fr-FR')} (${sign}${e.pct}%)`;
}
