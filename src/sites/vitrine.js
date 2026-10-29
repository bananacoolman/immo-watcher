// Fabrique pour les agences sur le moteur de site "pages .html" (Agence
// Puccetti, Atrio, Vence Real Estate, Immobiliere Azureenne). Reperes :
//   listes : /immobilier-a-vence.html, /vente-maison.html ...
//   fiche  : /annonce-immobiliere/vente-maison-vence-06140-1-513v900422m.html
// pages lues avec un navigateur (plus lent) : on se limite aux principales
const COMMUNE_SLUGS = ['vence', 'saint+paul+de+vence'];
export function vitrine(name, domain, { communes = COMMUNE_SLUGS, pages = 4 } = {}) {
  const host = domain.replace(/^www\./, '');
  return {
    name,
    domain: host,
    enabled: true,
    preferJsonLd: false,
    needsJs: true,           // liste remplie en JavaScript
    indexUrls: [
      ...communes.map((c) => `https://${domain}/immobilier-a-${c}.html`),
      `https://${domain}/vente-maison.html`,
      `https://${domain}/vente-appartement.html`,
      `https://${domain}/en/selection.html`,
    ],
    followPages: pages,
    detailPattern: /\/annonce-immobiliere\/vente-[^/]+\.html/i,
  };
}
