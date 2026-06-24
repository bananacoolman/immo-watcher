// Cote d'Azur Sotheby's International Realty — cotedazur-sothebysrealty.com
// Pages detail : /fr/immobilier-luxe/ref-xxxx/... et /fr/immobilier-prestige/ref-xxxx/...
// Les pages "secteur" agregent les communes alentour, on filtre ensuite.
export default {
  name: "Sotheby's",
  enabled: true,
  preferJsonLd: true,
  indexUrls: [
    'https://www.cotedazur-sothebysrealty.com/fr/immobilier-luxe-saint-paul-de-vence/',
    'https://www.cotedazur-sothebysrealty.com/fr/immobilier-luxe-vence/',
  ],
  detailPattern: /\/fr\/(immobilier-luxe|immobilier-prestige)\/ref-/i,
};
