// Orpi — agences de La Colle-sur-Loup (Immobiliere GTI Clocher) et de Vence
// (Caracache) + annonces Orpi de nos communes. Site rendu en JavaScript.
const VILLES = ['vence', 'saint-paul-de-vence', 'la-colle-sur-loup', 'tourrettes-sur-loup', 'la-gaude', 'saint-jeannet', 'gattieres'];
export default {
  name: 'Orpi',
  domain: 'orpi.com',
  enabled: true,
  needsJs: true,
  indexUrls: [
    'https://www.orpi.com/agenceduclocher/acheter/biens-en-vente',
    'https://www.orpi.com/agencecaracache/acheter/biens-en-vente',
    ...VILLES.map((v) => `https://www.orpi.com/annonces-immobilieres-${v}/vente-maison/`),
  ],
  followPages: 0,
  stripQuery: true,          // ?agency=... : meme annonce vue depuis 2 agences
  // fiche : /annonce-vente-maison-t7-la-colle-sur-loup-06480-<identifiant>/
  detailPattern: /orpi\.com\/annonce-vente-/i,
  communeRegex: /annonce-vente-[a-z]+-(?:t\d+-)?([a-z-]+?)-\d{5}-/i,
};
