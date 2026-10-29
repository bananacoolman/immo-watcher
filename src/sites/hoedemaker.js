// Hoedemaker & Hudig — La Gaude / Vence — hoedemakerhudig.com
// Liste : /en/properties/ ; fiche : /en/annonce/<titre>/ (ou /annonce/<titre>/ en fr)
export default {
  name: 'Hoedemaker & Hudig',
  enabled: true,
  indexUrls: ['https://www.hoedemakerhudig.com/en/properties/'],
  followPages: 6,
  detailPattern: /hoedemakerhudig\.com\/(?:en\/|fr\/)?(?:annonce|for-sale)\//i,
};
