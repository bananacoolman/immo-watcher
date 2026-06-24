import crypto from 'node:crypto';
import { TARGET_COMMUNES } from '../config.js';

// "Saint-Paul-de-Vence" -> "saintpauldevence"
export function norm(s = '') {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');        // espaces, tirets, ponctuation
}

// Cible -> liste d'alias normalises (le plus specifique inclus en premier).
const TARGETS = TARGET_COMMUNES
  .map((c) => ({ commune: c, key: norm(c) }))
  // tri par longueur decroissante : "saintpauldevence" teste avant "vence"
  .sort((a, b) => b.key.length - a.key.length);

// Retrouve la commune cible mentionnee dans un texte (label ou texte de carte).
// Renvoie le nom propre, ou null si hors secteur.
export function matchCommune(text = '') {
  let n = norm(text);
  // Neutralise les descripteurs de region (sinon "saint-paul-de-vence-et-ses-environs"
  // ferait matcher Saint-Paul partout, meme sur un bien a Cagnes-sur-Mer).
  n = n
    .replace(/saintpauldevenceetsesenvirons/g, ' ')
    .replace(/etsesenvirons/g, ' ')
    .replace(/etenvirons/g, ' ')
    .replace(/andsurroundings/g, ' ');
  // Etend les abreviations AVANT le test (sinon "stpauldevence" matcherait "vence").
  n = n
    .replace(/stpauldevence/g, 'saintpauldevence')
    .replace(/stpaul/g, 'saintpaul')
    .replace(/stjeannet/g, 'saintjeannet');
  for (const { commune, key } of TARGETS) {
    if (n.includes(key)) return commune;
  }
  // alias frequents (les cartes affichent souvent "Saint Paul", "St-Paul"...)
  if (n.includes('saintpaul') || n.includes('stpaul')) return 'Saint-Paul-de-Vence';
  if (n.includes('saintjeannet') || n.includes('stjeannet')) return 'Saint-Jeannet';
  if (n.includes('lacollesurloup') || n.includes('collesurloup')) return 'La Colle-sur-Loup';
  return null;
}

// Prix lisible pour l'affichage (= le plus gros montant en €, formate).
export function extractPrice(text = '') {
  const v = priceValue(text);
  return v == null ? null : v.toLocaleString('fr-FR') + ' €';
}

// Valeur numerique du prix (pour le filtre). On prend le PLUS GROS montant en €
// de la carte : c'est le prix de vente (evite le prix/m² et les honoraires).
export function priceValue(text = '') {
  let max = null;
  for (const m of text.matchAll(/(\d[\d\s.\u00a0\u202f]{3,})\s*(?:€|EUR)/gi)) {
    const digits = m[1].replace(/[^\d]/g, '');
    if (digits.length >= 4) { const n = Number(digits); if (max == null || n > max) max = n; }
  }
  return max;
}

// Detecte une location (loyer hebdo/mensuel) -> a exclure des ventes.
export function looksLikeRental(text = '') {
  return /\/\s*(semaine|sem\.?|mois|nuit|week|month|night)\b/i.test(text) ||
         /\b(à partir de)\b[^.]*\bsemaine\b/i.test(text);
}

// Extrait une reference d'annonce ("V2731CO", "AP0401", "ca6-2304"...).
export function extractRef(text = '') {
  const m =
    text.match(/\/ref-([a-z]{1,4}\d+-\d+)/i) ||              // Sotheby URL : ref-ca6-2304
    text.match(/\bref[\s:.-]*([A-Za-z]{1,4}\d{3,}[A-Za-z]{0,3})\b/i) || // V2731CO, AP0401
    text.match(/\b([A-Z]{1,3}\d{3,}[A-Z]{0,3})\b/);
  return m ? m[1].toUpperCase() : null;
}

export function hash(str = '') {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

// Construit un identifiant stable : ref si dispo, sinon hash de l'URL.
export function listingId(ref, url) {
  return ref || 'u_' + hash(url);
}
