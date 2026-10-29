import { apimo } from './apimo.js';
// Immobiliere MB — Saint-Paul-de-Vence — immobilieremb.com (Apimo)
// pas de page /fr/ventes : les biens sont sur l'accueil et la page agence
export default apimo('Immobilière MB', 'www.immobilieremb.com', { indexPaths: ['/fr/', '/fr/agence/13027'] });
