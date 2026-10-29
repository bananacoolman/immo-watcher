// Des Pallieres Immobilier (conseiller iad) — despallieres-immobilier.com
export default {
  name: 'Des Pallières Immobilier',
  domain: 'despallieres-immobilier.com',
  enabled: true,
  indexUrls: ['https://www.despallieres-immobilier.com/biens-a-vendre/'],
  followPages: 5,
  detailPattern: 'auto',
  excludePattern: /\/category\/|\/chasseur|\/vendre-mon|\/votre-conseiller/i,
};
