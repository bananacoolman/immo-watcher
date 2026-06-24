// John Taylor — john-taylor.fr
// Les pages "secteur" listent toutes les communes alentour ; on filtre ensuite
// sur TARGET_COMMUNES. JSON-LD souvent present -> peu de calibration necessaire.
export default {
  name: 'John Taylor',
  enabled: true,
  preferJsonLd: true,
  indexUrls: [
    'https://www.john-taylor.fr/france/vente/cote-d-azur/saint-paul-de-vence-et-ses-environs/',
    'https://www.john-taylor.fr/france/vente/cote-d-azur/saint-paul-de-vence-et-ses-environs/vence/',
    'https://www.john-taylor.fr/france/vente/cote-d-azur/saint-paul-de-vence-et-ses-environs/saint-paul/',
  ],
  // A VERIFIER via `npm run debug` : motif d'URL des pages d'annonce (detail).
  // Les references John Taylor ressemblent a V2731CO / L0144LC.
  detailPattern: /john-taylor\.fr\/.+\/[^/]*([A-Z]\d{3,}[A-Z]{2})/i,
};
