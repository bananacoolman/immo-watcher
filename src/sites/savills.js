// Savills French Riviera — riviera.savills.fr
// Page liste "Cote d'Azur" server-rendered (tri Nouveautes), ~290 annonces.
// Pages detail : /fr/nos-biens/ref-<id>/vente-<type>-<commune>-<n>-pieces-...
// La commune est lisible dans l'URL -> matchCommune filtre le secteur.
export default {
  name: 'Savills',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    'https://riviera.savills.fr/fr/acheter-cote-azur/&new_research=1',
  ],
  detailPattern: /riviera\.savills\.fr\/fr\/nos-biens\/ref-[a-z0-9]+\/vente-/i,
};
