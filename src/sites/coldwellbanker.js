// Coldwell Banker — portail coldwellbanker.fr (agrege les agences CB locales :
// Art Realty + Standing Realty a Saint-Paul, etc.). Prix affiches, commune
// lisible dans l'URL. Pages liste par commune ; detail : <commune>+06+<type>+vente+r<id>.html
export default {
  name: 'Coldwell Banker',
  enabled: true,
  preferJsonLd: false,
  indexUrls: [
    'https://www.coldwellbanker.fr/vente+immobilier+saint-paul+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+vence+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+la-colle-sur-loup+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+tourrettes-sur-loup+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+saint-jeannet+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+la-gaude+com06.html',
    'https://www.coldwellbanker.fr/vente+immobilier+gattieres+com06.html',
  ],
  detailPattern: /coldwellbanker\.fr\/[a-z-]+\+06\+[a-z-]+\+vente\+r\d+\.html/i,
};
