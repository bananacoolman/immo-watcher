// Fabrique pour les agences sur le moteur de site "pages .html" (Agence
// Puccetti, Atrio, Vence Real Estate, Immobiliere Azureenne). Reperes :
//   listes : /immobilier-a-vence.html, /vente-maison.html ...
//   fiche  : /annonce-vente-maison-vence-piscine.html
const COMMUNE_SLUGS = ['vence', 'saint+paul+de+vence', 'la+colle+sur+loup', 'tourrettes+sur+loup',
  'la+gaude', 'saint+jeannet', 'gattieres'];
export function vitrine(name, domain, { communes = COMMUNE_SLUGS, pages = 4 } = {}) {
  const host = domain.replace(/^www\./, '');
  return {
    name,
    domain: host,
    enabled: true,
    preferJsonLd: false,
    indexUrls: [
      ...communes.map((c) => `https://${domain}/immobilier-a-${c}.html`),
      `https://${domain}/vente-maison.html`,
      `https://${domain}/vente-appartement.html`,
      `https://${domain}/vente-terrain.html`,
    ],
    followPages: pages,
    detailPattern: /\/annonce-vente-[^/]+\.html/i,
  };
}
