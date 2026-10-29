// Des Pallieres Immobilier (conseiller iad) — despallieres-immobilier.com
// Liste : /biens-a-vendre/ ; fiche : /vente-immobilier/<titre>/
export default {
  name: 'Des Pallières Immobilier',
  enabled: true,
  indexUrls: [
    'https://www.despallieres-immobilier.com/biens-a-vendre/',
    'https://www.despallieres-immobilier.com/vente-immobilier/category/maison/',
  ],
  followPages: 4,
  detailPattern: /despallieres-immobilier\.com\/vente-immobilier\/(?!category\/)[^/?#]+\/?$/i,
};
