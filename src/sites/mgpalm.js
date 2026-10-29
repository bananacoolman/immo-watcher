// MG Palm Properties — mg-palmproperties.com ; fiche : /propriete/<titre>/
export default {
  name: 'MG Palm Properties',
  domain: 'mg-palmproperties.com',
  enabled: true,
  indexUrls: ['https://mg-palmproperties.com/'],
  followPages: 5,
  detailPattern: /^https?:\/\/(?:www\.)?mg-palmproperties\.com\/propriete\/[^/?#]+\/?$/i,   // version francaise seulement
};
