// CENTURY 21 Mas d'Azur — Vence (agence 1037189054) — century21.fr
// On lit les annonces CENTURY 21 de nos communes (c'est l'agence du secteur).
const VILLES = ['v-vence', 'v-saint+paul+de+vence', 'v-la+colle+sur+loup', 'v-tourrettes+sur+loup', 'v-la+gaude', 'v-saint+jeannet'];
export default {
  name: 'Century 21',
  domain: 'century21.fr',
  enabled: true,
  indexUrls: [
    'https://www.century21.fr/trouver_agence/agence/1037189054/',
    ...VILLES.map((v) => `https://www.century21.fr/annonces/f/achat/${v}/`),
  ],
  followPages: 4,
  detailPattern: /century21\.fr\/trouver_logement\/detail\/\d+/i,
};
