// M Riviera — agence digitale, Saint-Paul-de-Vence — m-riviera.com
// fiche : /a-vendre/<titre>/
export default {
  name: 'M Riviera',
  enabled: true,
  indexUrls: ['https://www.m-riviera.com/villas/', 'https://www.m-riviera.com/'],
  detailPattern: /^https?:\/\/(?:www\.)?m-riviera\.com\/a-vendre\/[^/?#]+\/?$/i,
};
