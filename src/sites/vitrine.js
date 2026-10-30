// Fabrique pour les agences sur le moteur de site "pages .html" (Agence
// Puccetti, Atrio, Vence Real Estate, Immobiliere Azureenne). Reperes :
//   listes : /immobilier-a-vence.html, /vente-maison.html ...
//   fiche  : /vente-appartement-studio-vence-proximite-centre-ville-1-513v2558a.html
//            (ou /annonce-immobiliere/vente-maison-vence-06140-1-513v900422m.html)
//            -> toujours "-<n>-<agence>v<numero><type>.html"
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
    communeFrom: 'url-first',   // la commune est dans l'adresse de la fiche ("...-vence-la-sine-1-513v...")
    detailPattern: /\/(?:annonce-immobiliere\/)?vente-[^/?#]*-\d+-\d+v\d+[a-z]{0,3}\.html$/i,
  };
}
