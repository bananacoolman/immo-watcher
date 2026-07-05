// PAP.fr — vendeurs PARTICULIERS (sans mandat = leads directs pour Lydia).
// Pages par commune server-rendered, qui listent aussi les communes voisines
// (le filtre commune du moteur garde nos 7 cibles). Pages "vente maisons"
// Vence + Saint-Paul couvrent tout le secteur par rayonnement.
// Detail : pap.fr/annonces/<slug>-r<id>
export default {
  name: 'PAP',
  enabled: false,  // PAP bloque les IP GitHub (403/timeout) -> passage par le bridge e-mail
  preferJsonLd: false,
  needsJs: true,   // PAP bloque les requetes simples (403) -> navigateur complet
  indexUrls: [
    'https://www.pap.fr/annonce/vente-maisons-saint-paul-de-vence-06570-g8849',
    'https://www.pap.fr/annonce/vente-maisons-vence-06140-g8746',
    'https://www.pap.fr/annonce/vente-maisons-saint-paul-de-vence-06570-g8849-2',
    'https://www.pap.fr/annonce/vente-maisons-vence-06140-g8746-2',
  ],
  detailPattern: /pap\.fr\/annonces\/[a-z0-9-]+-r\d+/i,
};
