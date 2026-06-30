import { env } from '../config.js';

const DAY = 86400000;

// Recoit toutes les lignes (tous sites) et renvoie les grappes "multi-mandat" :
// meme commune + prix proche (tolerance) + au moins 2 agences differentes.
export function findMultiMandat(rows, nowMs = Date.now()) {
  // 1) ne garder que les annonces encore en ligne, avec prix et commune
  const active = rows.filter(r =>
    r.commune && r.price_num != null &&
    (!r.last_seen || (nowMs - new Date(r.last_seen)) / DAY <= env.activeDays)
  );

  // 2) trier par commune puis prix, puis fenetre glissante sur le prix
  active.sort((a, b) =>
    a.commune < b.commune ? -1 : a.commune > b.commune ? 1 : a.price_num - b.price_num);

  const clusters = [];
  let i = 0;
  while (i < active.length) {
    let j = i + 1;
    const base = active[i];
    const tol = Math.max(base.price_num * env.multiPriceTol, 5000); // au moins 5 k€ de marge
    const group = [base];
    while (j < active.length &&
           active[j].commune === base.commune &&
           active[j].price_num - base.price_num <= tol) {
      group.push(active[j]); j++;
    }
    // distinct sites dans la grappe
    const sites = [...new Set(group.map(g => g.site))];
    if (sites.length >= 2) {
      clusters.push({
        commune: base.commune,
        price: Math.round(group.reduce((s, g) => s + g.price_num, 0) / group.length),
        sites,
        items: group,
      });
      i = j; // on saute la grappe entiere
    } else {
      i++;   // pas de grappe ici, on avance d'un cran
    }
  }
  return clusters;
}

// Signature stable d'une grappe (pour ne notifier qu'une fois).
export function clusterKey(c) {
  const p = Math.round(c.price / 10000) * 10000;          // prix arrondi a 10 k€
  return `mm:${c.commune}:${p}:${c.sites.slice().sort().join('+')}`;
}
