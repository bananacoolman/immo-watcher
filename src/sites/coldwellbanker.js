// Coldwell Banker — coldwellbanker.fr (refonte Rails 2026).
// Index : pages regionales PACA triees par nouveaute + pages commune legacy
// (certaines redirigent vers la region : le filtre commune du moteur trie).
// Detail : /vente-immobilier/<type>/france/provence-alpes-cote-d-azur/<commune>-<cp>/<slug>-<id>
export default {
  name: 'Coldwell Banker',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    // region PACA, plus recents d'abord (2 pages = 36 annonces les plus fraiches)
    'https://www.coldwellbanker.fr/vente-immobilier/biens-immobiliers/france/provence-alpes-cote-d-azur?sort=sort_by_published_at+desc',
    'https://www.coldwellbanker.fr/vente-immobilier/biens-immobiliers/france/provence-alpes-cote-d-azur?sort=sort_by_published_at+desc&page=2&limit=18',
    // pages commune (marche pour certaines ; les autres redirigent, sans casse)
    'https://www.coldwellbanker.fr/immobilier+saint-paul+06.html',
    'https://www.coldwellbanker.fr/immobilier+vence+06.html',
    'https://www.coldwellbanker.fr/immobilier+la-colle-sur-loup+06.html',
    'https://www.coldwellbanker.fr/immobilier+tourrettes-sur-loup+06.html',
    'https://www.coldwellbanker.fr/immobilier+saint-jeannet+06.html',
    'https://www.coldwellbanker.fr/immobilier+la-gaude+06.html',
    'https://www.coldwellbanker.fr/immobilier+gattieres+06.html',
  ],
  detailPattern: /coldwellbanker\.fr\/vente-immobilier\/[a-z-]+\/france\/provence-alpes-cote-d-azur\/[a-z-]+-\d{5}\/[a-z0-9-]+-\d+(?:$|\?)/i,
};
