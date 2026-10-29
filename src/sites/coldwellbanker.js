// Coldwell Banker — coldwellbanker.fr
// Fiche (oct. 2026) : /vente-immobilier/maison/france/provence-alpes-cote-d-azur/
//                     alpes-maritimes/antibes-06160/maison-antibes-441-m-9-pieces-601
// Listes : region PACA (plus recents d'abord) + agences du secteur.
const AGENCES = [
  'coldwell-banker-art-realty+id33728',
  'coldwell-banker-standing-realty+id33342',
];
const REGION = 'https://www.coldwellbanker.fr/vente-immobilier/biens-immobiliers/france/provence-alpes-cote-d-azur';
export default {
  name: 'Coldwell Banker',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    `${REGION}/alpes-maritimes?sort=sort_by_published_at+desc`,
    `${REGION}?sort=sort_by_published_at+desc`,
    ...AGENCES.map((a) => `https://www.coldwellbanker.fr/agences-immobilieres/${a}/vente+immobilier+provence-alpes-cote-d-azur+reg93.html`),
  ],
  followPages: 4,
  detailPattern: /coldwellbanker\.fr\/(?:en\/)?(?:vente-immobilier|sales)\/[a-z-]+\/france\/provence-alpes-cote-d-azur\/(?:alpes-maritimes\/)?[a-z-]+-\d{5}\/[a-z0-9-]+-\d+\/?$|coldwellbanker\.fr\/[a-z0-9+-]+\+r\d+\.html$/i,   // + ancien format
  // commune = segment "<commune>-<code postal>" de l'adresse
  communeRegex: /\/([a-z-]+)-\d{5}\//i,
};
