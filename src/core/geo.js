// Geolocalisation des biens : (1) extraction de coordonnees depuis la page
// detail, (2) detection de secteur/quartier dans le texte. Zone de validite
// bornee a l'arriere-pays nicois pour rejeter les coordonnees parasites.

const REGION = { latMin: 43.55, latMax: 43.85, lngMin: 6.85, lngMax: 7.35 };

export function inRegion(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= REGION.latMin && lat <= REGION.latMax &&
    lng >= REGION.lngMin && lng <= REGION.lngMax;
}

const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// --- Secteurs par commune (centroides APPROXIMATIFs, a affiner avec Lydia) ---
// aliases = variantes telles qu'ecrites dans les annonces. Ordre = priorite.
export const SECTORS = {
  'Saint-Paul-de-Vence': [
    { name: 'Les Hauts de Saint-Paul', a: ['hauts de saint-paul', 'hauts de st-paul', 'hauteurs de saint-paul'], lat: 43.7000, lng: 7.1180 },
    { name: 'Les Gardettes', a: ['gardettes'], lat: 43.6905, lng: 7.1300 },
    { name: 'Les Fumerates', a: ['fumerates', 'fumerattes'], lat: 43.6960, lng: 7.1330 },
    { name: 'Route de la Colle', a: ['route de la colle', 'chemin de la colle'], lat: 43.6890, lng: 7.1150 },
    { name: 'Sainte-Claire', a: ['sainte-claire', 'ste-claire', 'route de vence'], lat: 43.7010, lng: 7.1250 },
    { name: 'Le Village', a: ['village', 'intra-muros', 'remparts', 'coeur du village'], lat: 43.6951, lng: 7.1226 },
  ],
  'Vence': [
    { name: 'La Sine', a: ['la sine', 'quartier sine'], lat: 43.7290, lng: 7.1180 },
    { name: 'Les Salles', a: ['les salles', 'route de coursegoules'], lat: 43.7350, lng: 7.1230 },
    { name: 'Baou des Blancs / Godeau', a: ['baou des blancs', 'godeau'], lat: 43.7280, lng: 7.1300 },
    { name: 'Le Riou', a: ['le riou', 'quartier riou'], lat: 43.7180, lng: 7.1160 },
    { name: 'Route de Saint-Jeannet', a: ['route de saint-jeannet', 'route de st-jeannet'], lat: 43.7280, lng: 7.1350 },
    { name: 'Route de Tourrettes', a: ['route de tourrettes'], lat: 43.7180, lng: 7.0950 },
    { name: 'Centre historique', a: ['centre historique', 'vieille ville', 'cite historique', 'intra-muros'], lat: 43.7225, lng: 7.1119 },
  ],
  'La Colle-sur-Loup': [
    { name: 'Les Hauts de la Colle', a: ['hauts de la colle', 'hauteurs de la colle'], lat: 43.6920, lng: 7.0950 },
    { name: 'Montfort / Route de Grasse', a: ['montfort', 'route de grasse'], lat: 43.6800, lng: 7.0900 },
    { name: 'Route de Saint-Paul', a: ['route de saint-paul', 'route de st-paul'], lat: 43.6900, lng: 7.1080 },
    { name: 'Les Sausses', a: ['les sausses', 'sausses'], lat: 43.6830, lng: 7.1060 },
    { name: 'Le Village', a: ['village', 'centre'], lat: 43.6864, lng: 7.1011 },
  ],
  'Tourrettes-sur-Loup': [
    { name: 'Les Quenières', a: ['quenieres', 'quenières'], lat: 43.7180, lng: 7.0650 },
    { name: 'La Ferrage', a: ['la ferrage', 'ferrage'], lat: 43.7080, lng: 7.0620 },
    { name: 'Route de Vence', a: ['route de vence'], lat: 43.7100, lng: 7.0700 },
    { name: 'Le Village médiéval', a: ['village', 'medieval', 'cite'], lat: 43.7128, lng: 7.0583 },
  ],
  'La Gaude': [
    { name: 'Les Hauts / Plateau', a: ['hauts de la gaude', 'plateau', 'hauteurs'], lat: 43.7180, lng: 7.1550 },
    { name: 'Saint-Pierre', a: ['saint-pierre', 'st-pierre'], lat: 43.7080, lng: 7.1650 },
    { name: 'Route de Vence', a: ['route de vence'], lat: 43.7160, lng: 7.1500 },
    { name: 'Le Village', a: ['village', 'centre'], lat: 43.7131, lng: 7.1597 },
  ],
  'Saint-Jeannet': [
    { name: 'Les Ferres / Hauteurs', a: ['les ferres', 'hauteurs', 'sous le baou'], lat: 43.7520, lng: 7.1400 },
    { name: 'Route de Gattières', a: ['route de gattieres'], lat: 43.7500, lng: 7.1550 },
    { name: 'Le Village', a: ['village', 'pied du baou', 'centre'], lat: 43.7472, lng: 7.1456 },
  ],
  'Gattières': [
    { name: 'Les Plans', a: ['les plans'], lat: 43.7650, lng: 7.1700 },
    { name: 'Route de Vence / Carros', a: ['route de vence', 'route de carros'], lat: 43.7550, lng: 7.1850 },
    { name: 'Le Village', a: ['village', 'centre'], lat: 43.7589, lng: 7.1758 },
  ],
};

// Detecte un secteur a partir d'un texte (titre + description) pour une commune.
export function detectSecteur(text, commune) {
  const list = SECTORS[commune];
  if (!list || !text) return null;
  const t = norm(text);
  for (const s of list) {
    if (s.a.some((alias) => t.includes(norm(alias)))) {
      return { name: s.name, lat: s.lat, lng: s.lng };
    }
  }
  return null;
}

// Renvoie toutes les paires (lat,lng) plausibles trouvees dans un HTML brut,
// puis la plus frequente (le vrai marqueur se repete souvent dans la page).
export function extractCoordsFromHtml(html = '') {
  if (!html) return null;
  const cands = [];
  const push = (a, b) => {
    const lat = parseFloat(a), lng = parseFloat(b);
    if (inRegion(lat, lng)) cands.push([lat, lng]);
    // certaines pages inversent lat/lng
    else if (inRegion(lng, lat)) cands.push([lng, lat]);
  };
  const LAT = '(-?4[23]\\.\\d{3,})';
  const LNG = '(-?[67]\\.\\d{3,})';
  const patterns = [
    // JSON / JSON-LD
    new RegExp('"lat(?:itude)?"\\s*:\\s*"?' + LAT + '"?[\\s\\S]{0,40}?"l(?:ng|on|ongitude)"\\s*:\\s*"?' + LNG + '"?', 'gi'),
    new RegExp('"l(?:ng|on|ongitude)"\\s*:\\s*"?' + LNG + '"?[\\s\\S]{0,40}?"lat(?:itude)?"\\s*:\\s*"?' + LAT + '"?', 'gi'),
    // attributs data-*
    new RegExp('data-lat(?:itude)?=["\']' + LAT + '["\'][\\s\\S]{0,60}?data-l(?:ng|on|ongitude)=["\']' + LNG + '["\']', 'gi'),
    // liens Google Maps : @lat,lng | q=lat,lng | ll=lat,lng | destination=lat,lng
    new RegExp('[@=]' + LAT + '\\s*,\\s*' + LNG, 'gi'),
    // Google Maps place : !3dlat!4dlng
    new RegExp('!3d' + LAT + '!4d' + LNG, 'gi'),
    // Leaflet : setView([lat,lng]) | L.marker([lat,lng])
    new RegExp('(?:setview|marker|latlng)\\s*\\(\\s*\\[?\\s*' + LAT + '\\s*,\\s*' + LNG, 'gi'),
    // paire nue "lat, lng" (sur, car borne a 43.x / 7.x avec 3+ decimales)
    new RegExp('\\b' + LAT + '\\s*,\\s*' + LNG + '\\b', 'gi'),
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      // selon le pattern, l'ordre lat/lng peut differer
      if (re.source.startsWith('"l(?:ng')) push(m[2], m[1]);
      else push(m[1], m[2]);
    }
  }
  if (!cands.length) return null;
  // mode : paire la plus frequente (arrondie a 4 decimales pour regrouper)
  const key = ([a, b]) => a.toFixed(4) + ',' + b.toFixed(4);
  const count = {};
  for (const c of cands) count[key(c)] = (count[key(c)] || 0) + 1;
  const best = Object.entries(count).sort((x, y) => y[1] - x[1])[0][0];
  const [lat, lng] = best.split(',').map(Number);
  return { lat, lng };
}
