// Coldwell Banker — coldwellbanker.fr (retour aux adresses "...+com06.html", oct. 2026)
// Liste par commune : /vente+immobilier+<commune>+com06.html
// Fiche : /saint-paul+06+villa+vente+r28480565.html
const VILLES = ['saint-paul', 'vence', 'la-colle-sur-loup', 'tourrettes-sur-loup', 'saint-jeannet', 'la-gaude', 'gattieres'];
export default {
  name: 'Coldwell Banker',
  enabled: true,
  preferJsonLd: false,
  indexUrls: VILLES.map((v) => `https://www.coldwellbanker.fr/vente+immobilier+${v}+com06.html`),
  followPages: 3,
  detailPattern: /coldwellbanker\.fr\/(?:en\/)?[a-z0-9+-]+\+(?:vente|sale)\+r\d+\.html/i,
  // commune = debut de l'adresse de la fiche : "saint-paul+06+villa+vente+r..."
  communeRegex: /coldwellbanker\.fr\/(?:en\/)?([a-z-]+)\+06\+/i,
};
