// Engel & Völkers — engelvoelkers.com (rendu JavaScript -> needsJs)
// Refs type W-02DGJQ (dans l'URL de detail).
const base = 'https://www.engelvoelkers.com/fr/fr/propriete/res/vendre/maison/luxe/provence-alpes-cote-dazur';
export default {
  name: 'Engel & Völkers',
  enabled: false,            // SPA recalcitrante : a reprendre via leur API interne
  needsJs: true,             // SPA : necessite Playwright
  preferJsonLd: true,
  indexUrls: [
    `${base}/saint-paul-de-vence`,
    `${base}/vence`,
    `${base}/la-colle-sur-loup`,
    `${base}/tourrettes-sur-loup`,
    `${base}/la-gaude`,
  ],
  detailPattern: /\bW-[0-9A-Z]{6}\b/i,
};
