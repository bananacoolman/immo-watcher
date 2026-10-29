// Fabrique pour les agences dont le site est fourni par Apimo (tres repandu
// chez les independants de la Cote d'Azur). Reperes :
//   liste  : /fr/ventes  (pages suivantes suivies automatiquement)
//   fiche  : /fr/propriete/vente+maison+saint-paul-de-vence+<titre>+<id>
//            (variante recente : /fr/propriete/vente/maison/<commune>/<titre>/<id>)
export function apimo(name, domain, { indexPaths = ['/fr/ventes'], pages = 6 } = {}) {
  const host = domain.replace(/^www\./, '');
  return {
    name,
    domain: host,
    enabled: true,
    indexUrls: indexPaths.map((p) => `https://${domain}${p}`),
    followPages: pages,
    detailPattern: /\/(propriete|property)\/(vente|sale)[+/]/i,
    // commune = 3e element : vente+<type>+<commune>+...  ou  vente/<type>/<commune>/...
    communeRegex: /(?:propriete|property)\/(?:vente|sale)[+/][^+/]+[+/]([a-z0-9-]+)[+/]/i,
  };
}
