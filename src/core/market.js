import { env, MARKET_M2 } from '../config.js';

// Extrait une surface habitable (m²) depuis un texte de titre.
// On ignore les surfaces de terrain ("terrain 2000 m²") pour ne pas fausser le calcul.
export function parseSurface(text = '') {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\u00a0/g, ' ');
  const out = [];
  const re = /(\d[\d\s.,]*)\s*m(?:²|2|\b)/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 14), m.index);
    if (/terrain|parcelle|jardin|terr\.|plot|land/.test(before)) continue; // surface terrain -> on saute
    const v = parseFloat(m[1].replace(/[\s.]/g, '').replace(',', '.'));
    if (v >= 20 && v <= 2000) out.push(v);  // bornes plausibles d'une surface habitable
  }
  if (!out.length) return null;
  // s'il reste plusieurs nombres (ex. "200 m² hab, 1500 m²"), on prend le plus petit plausible
  return Math.min(...out);
}

// Renvoie un objet { ratio, pct, label } comparant le prix/m² du bien au marche
// de sa commune, ou null si surface/prix/commune indisponibles.
export function marketEval(l) {
  const ref = MARKET_M2[l.commune];
  const price = l.priceNum ?? null;
  if (!ref || price == null) return null;
  const surf = parseSurface(l.title || '');
  if (!surf) return null;
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
