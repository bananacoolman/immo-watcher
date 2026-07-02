// Savills French Riviera — riviera.savills.fr
// La page "tous les biens Cote d'Azur" est paginee en JS (page 1 = hors zone) :
// on utilise les pages PAR COMMUNE, server-rendered avec liens + prix.
// Savills couvre Saint-Paul, La Colle, Vence, Tourrettes (pas la vallee).
// Detail : /fr/nos-biens/ref-<id>/vente-<type>-<commune>-...
export default {
  name: 'Savills',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    'https://riviera.savills.fr/fr/saint-paul-de-vence/&new_research=1',
    'https://riviera.savills.fr/fr/vence/&new_research=1',
    'https://riviera.savills.fr/fr/la-colle-sur-loup/&new_research=1',
    'https://riviera.savills.fr/fr/tourrettes-sur-loup/&new_research=1',
    'https://riviera.savills.fr/fr/achat-villa-de-luxe-saint-paul-de-vence/&new_research=1',
  ],
  detailPattern: /riviera\.savills\.fr\/fr\/nos-biens\/ref-[a-z0-9]+\/vente-/i,
};
