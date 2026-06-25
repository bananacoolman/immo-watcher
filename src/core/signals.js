import { env } from '../config.js';

const DAY = 86400000;
const daysBetween = (a, b) => (new Date(a) - new Date(b)) / DAY;

// A partir de l'historique connu (rec) et de l'annonce vue maintenant (l),
// construit la ligne a sauvegarder et la liste des signaux a notifier.
// `seeding` = true au tout premier passage d'une source (on enregistre sans alerter).
export function evaluate(rec, l, nowIso, seeding) {
  const price = l.priceNum ?? null;
  const alerts = [];

  // --- Annonce inconnue : nouvelle entree
  if (!rec) {
    const row = {
      listing_id: l.id,
      url: l.url,
      title: l.title || null,
      commune: l.commune || null,
      image: l.image || null,
      price: l.price || null,
      price_num: price,
      initial_price: price,
      price_history: price != null ? [{ d: nowIso, p: price }] : [],
      first_seen: nowIso,
      last_seen: nowIso,
      alerted_stale: false,
      alerted_drop_price: null,
    };
    if (!seeding) alerts.push({ kind: 'new', l });
    return { row, alerts };
  }

  // --- Annonce deja connue : mise a jour + detection de signaux
  const firstSeen = rec.first_seen || nowIso;
  let initial = rec.initial_price;
  let history = Array.isArray(rec.price_history) ? rec.price_history : [];
  const prevPrice = rec.price_num ?? null;
  let alertedDrop = rec.alerted_drop_price ?? null;
  let alertedStale = !!rec.alerted_stale;

  if (initial == null && price != null) initial = price; // backfill anciennes lignes

  // Remise en vente : disparue >= reappearGapDays puis revue
  if (!seeding && rec.last_seen && daysBetween(nowIso, rec.last_seen) >= env.reappearGapDays) {
    alerts.push({ kind: 'reappear', l, gapDays: Math.round(daysBetween(nowIso, rec.last_seen)) });
  }

  // Changement de prix -> historisation (on garde les 30 derniers points)
  if (price != null && price !== prevPrice) {
    history = [...history, { d: nowIso, p: price }].slice(-30);
  }

  // Baisse significative vs prix initial, a un nouveau plus-bas non encore alerte
  if (!seeding && price != null && initial != null && initial > 0) {
    const drop = (initial - price) / initial;
    const isNewLow = alertedDrop == null || price < alertedDrop;
    if (drop >= env.dropPct && isNewLow) {
      alerts.push({ kind: 'drop', l, initial, price, dropPct: drop, days: Math.round(daysBetween(nowIso, firstSeen)) });
      alertedDrop = price;
    }
  }

  // Anciennete : en ligne depuis >= staleDays (une seule alerte)
  const ageDays = daysBetween(nowIso, firstSeen);
  if (!seeding && ageDays >= env.staleDays && !alertedStale) {
    alerts.push({ kind: 'stale', l, days: Math.round(ageDays), initial, price });
    alertedStale = true;
  }

  const row = {
    listing_id: l.id,
    url: l.url,
    title: l.title || rec.title || null,
    commune: l.commune || rec.commune || null,
    image: l.image || rec.image || null,
    price: l.price || rec.price || null,
    price_num: price ?? prevPrice ?? null,
    initial_price: initial ?? null,
    price_history: history,
    first_seen: firstSeen,
    last_seen: nowIso,
    alerted_stale: alertedStale,
    alerted_drop_price: alertedDrop,
  };
  return { row, alerts };
}
