// ERA Agence B.A Immobilier — Vence — eraimmobilier.com (rendu JavaScript)
export default {
  name: 'ERA B.A Immobilier',
  domain: 'eraimmobilier.com',
  enabled: true,
  needsJs: true,
  indexUrls: [1, 2, 3].map((p) => `https://www.eraimmobilier.com/acheter/Vence-c23884?display=list&page=${p}`),
  detailPattern: 'auto',
};
