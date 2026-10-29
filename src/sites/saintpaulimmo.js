// Agence St Paul La Colle Immo — saintpaul.immo
// Liste : /a-vendre/1, /a-vendre/2... ; fiches reperees automatiquement.
export default {
  name: 'St Paul La Colle Immo',
  domain: 'saintpaul.immo',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [1, 2, 3, 4].map((i) => `https://www.saintpaul.immo/a-vendre/${i}`),
  detailPattern: 'auto',
  excludePattern: /\/a-vendre\/\d+\/?$/,
};
