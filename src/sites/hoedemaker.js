// Hoedemaker & Hudig — La Gaude / Vence — hoedemakerhudig.com (agence presente
// dans toute la France : seuls les biens de nos communes sont gardes).
// Liste : /en/properties/ ; fiches : /en/biens-test/<titre>/, /en/annonce/<titre>/
export default {
  name: 'Hoedemaker & Hudig',
  enabled: true,
  needsJs: true,             // liste remplie en JavaScript
  indexUrls: ['https://www.hoedemakerhudig.com/en/properties/', 'https://www.hoedemakerhudig.com/proprietes/'],
  followPages: 6,
  detailPattern: /hoedemakerhudig\.com\/(?:en\/|fr\/)?(?:annonce|for-sale|biens-test|biens|propriete)\/[^/?#]+\/?$/i,
  communeFrom: 'url-first',
};
