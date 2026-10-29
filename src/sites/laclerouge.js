// La Cle Rouge — Tourrettes-sur-Loup — laclerouge.fr ; fiche : /fr/property/<titre>/
export default {
  name: 'La Clé Rouge',
  domain: 'laclerouge.fr',
  enabled: true,
  indexUrls: ['https://laclerouge.fr/fr/properties/', 'https://laclerouge.fr/fr/'],
  followPages: 5,
  detailPattern: /laclerouge\.fr\/(?:fr\/|en\/)?property\//i,
};
