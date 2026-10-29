// Zingraff — Michaël Zingraf Real Estate (affilie Christie's) — michaelzingraf.com
// Server-rendered (pas de JS). La page "saint-paul-de-vence-et-environs" agrege
// tout le secteur (66 biens). Detail = /fr/<slug>-<id numerique>.
// Ils decrivent beaucoup de biens comme "Proche Saint-Paul" -> on lit la commune
// sur l'etiquette "Vente <Type> <Commune>" (communeRegex), pas sur le titre.
const area = 'https://www.michaelzingraf.com/fr/vente/cote-dazur/saint-paul-de-vence-et-environs';
export default {
  name: 'Zingraff',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    area,
    `${area}?category=1&region=1&sector=28&page=2`,
    `${area}?category=1&region=1&sector=28&page=3`,
    `${area}?category=1&region=1&sector=28&page=4`,
    `${area}?category=1&region=1&sector=28&page=5`,
    `${area}?category=1&region=1&sector=28&page=6`,
  ],
  // fiche (oct. 2026) : /fr/vente/MZISP1831-titre-du-bien
  detailPattern: /michaelzingraf\.com\/fr\/vente\/[A-Z]{2,}\d+-/,
  communeRegex: /Vente\s+[A-Za-zÀ-ÿ]+\s+([A-Za-zÀ-ÿ'’\- ]+?)\s*\d/,
};
