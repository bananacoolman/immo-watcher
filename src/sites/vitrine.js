// Fabrique pour les agences sur le moteur de site "pages .html" (Agence
// Puccetti, Atrio, Vence Real Estate, Immobiliere Azureenne). Reperes :
//   listes : /immobilier-a-vence.html, /vente-maison.html ...
//   fiche  : /annonce-immobiliere/vente-maison-vence-06140-1-513v900422m.html
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
      `https://${domain}/en/selection.html`,
    ],
    followPages: pages,
    detailPattern: /\/annonce-immobiliere\/vente-[^/]+\.html/i,
  };
}
