import { apimo } from './apimo.js';
// Riviera Hunt — Vence — rivierahunt.com (Apimo)
// pas de page /fr/ventes : accueil + page secteur Saint-Paul
export default apimo('Riviera Hunt', 'rivierahunt.com', { indexPaths: ['/fr/', '/fr/secteur-st-paul-de-vence'] });
