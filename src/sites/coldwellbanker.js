// Coldwell Banker — coldwellbanker.fr
// On lit les annonces des agences Coldwell du secteur (Art Realty a Saint-Paul,
// Standing Realty) + les pages commune. Fiche : /saint-paul+06+villa+vente+r28480565.html
const AGENCES = [
  'coldwell-banker-art-realty+id33728',
  'coldwell-banker-standing-realty+id33342',
];
export default {
  name: 'Coldwell Banker',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    ...AGENCES.map((a) => `https://www.coldwellbanker.fr/agences-immobilieres/${a}/vente+immobilier+provence-alpes-cote-d-azur+reg93.html`),
    'https://www.coldwellbanker.fr/vente+immobilier+saint-paul+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+vence+com06.html',
  ],
  followPages: 4,
  detailPattern: /coldwellbanker\.fr\/.*\+r\d+\.html/i,
  communeRegex: /coldwellbanker\.fr\/(?:en\/)?([a-z-]+)\+06\+/i,
};
