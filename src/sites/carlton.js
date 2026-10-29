// Carlton International — carlton-international.com (pages par commune)
// fiche : /annonce/<titre>/  (fr) ou /en/annonce/<titre>/
const BASE = 'https://www.carlton-international.com/en/buying-dream-homes-and-investment-opportunities-on-the-french-riviera/luxury-villas-in-saint-paul-de-vence/';
export default {
  name: 'Carlton International',
  domain: 'carlton-international.com',
  enabled: true,
  indexUrls: [BASE, BASE + 'vence/'],
  followPages: 4,
  detailPattern: /carlton-international\.com\/(?:en\/)?annonce\//i,
};
