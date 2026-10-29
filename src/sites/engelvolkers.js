// Engel & Völkers — engelvoelkers.com (rendu JavaScript -> needsJs)
// Fiche (oct. 2026) : /fr/fr/exposes/<identifiant>
const base = 'https://www.engelvoelkers.com/fr/fr/propriete/res/vendre/maison/luxe/provence-alpes-cote-dazur';
export default {
  name: 'Engel & Völkers',
  enabled: true,             // reactive oct. 2026 (nouveau format des fiches)
  needsJs: true,             // SPA : necessite Playwright
  preferJsonLd: false,
  indexUrls: [
    `${base}/saint-paul-de-vence`,
    `${base}/vence`,
    `${base}/la-colle-sur-loup`,
    `${base}/tourrettes-sur-loup`,
    `${base}/la-gaude`,
  ],
  detailPattern: /engelvoelkers\.com\/fr\/fr\/exposes\/[0-9a-f-]{36}/i,
};
