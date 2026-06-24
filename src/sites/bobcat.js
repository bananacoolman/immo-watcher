// Fabrique de config pour les agences sur le moteur "bObcat" (tres repandu sur
// la Cote d'Azur). Deux schemas d'URL de detail coexistent :
//   A : /vente/<num>-<commune>/<type>/<id>-<slug>
//   B : /vente/<dept>/<num>-<commune>/<slug>/<id>-<type>
// Dans les deux cas : un id de 3+ chiffres en fin d'URL, et un segment
// "/<num>-<commune>/" pour la commune (on prend celui colle a l'id, pas le dept).
export function bobcat(name, domain, { pages = 5 } = {}) {
  const host = domain.replace(/^www\./, '');
  const esc = host.replace(/\./g, '\\.');
  return {
    name,
    enabled: true,
    preferJsonLd: false,
    indexUrls: Array.from({ length: pages }, (_, i) => `https://www.${host}/vente/${i + 1}`),
    // page d'annonce = chemin /vente/... se terminant par /<id 3+ chiffres>-<lettre>
    detailPattern: new RegExp(`${esc}/vente/.*\\d{3,}-[a-z]`, 'i'),
    // commune = segment <num>-<commune> immediatement suivi (option slug) de l'id
    communeRegex: /\d+-([a-z][a-z-]*?)\/(?:[a-z][a-z0-9-]*\/)?\d{3,}-/i,
  };
}
