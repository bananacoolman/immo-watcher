// Wretman Estate — wretmanestate.com (rendu JavaScript -> needsJs)
// Detail FR : /biens/<slug>-<id>/   |   Detail EN : /en/properties/<slug>-<id>/
export default {
  name: 'Wretman Estate',
  enabled: true,
  needsJs: true,             // page rendue en JS : necessite Playwright
  preferJsonLd: true,
  indexUrls: [
    'https://www.wretmanestate.com/biens/',
  ],
  // exige un id numerique -> evite de capter le simple lien "/biens/"
  detailPattern: /wretmanestate\.com\/(biens|en\/properties)\/[a-z0-9-]*\d{5,}/i,
};
