import johntaylor from './johntaylor.js';
import sothebys from './sothebys.js';
import savills from './savills.js';
import zingraff from './zingraff.js';
import wretman from './wretman.js';
import engelvolkers from './engelvolkers.js';
import coldwellbanker from './coldwellbanker.js';
import saintpaulproperties from './saintpaulproperties.js';
import realimmo from './realimmo.js';
import lacanopee from './lacanopee.js';
import lemasprovencal from './lemasprovencal.js';
import brison from './brison.js';
import tslimmo from './tslimmo.js';
import pap from './pap.js';
// Ajouts octobre 2026 (liste de Lydia)
import burns from './burns.js';
import saintpaulimmo from './saintpaulimmo.js';
import century21 from './century21.js';
import gubernatis from './gubernatis.js';
import rgimmobilier from './rgimmobilier.js';
import puccetti from './puccetti.js';
import atrio from './atrio.js';
import labellepierre from './labellepierre.js';
import carlton from './carlton.js';
import immobilieremb from './immobilieremb.js';
import leandri from './leandri.js';
import mriviera from './mriviera.js';
import era from './era.js';
import mgpalm from './mgpalm.js';
import lubiana from './lubiana.js';
import orpi from './orpi.js';
import rivierahunt from './rivierahunt.js';
import vencerealestate from './vencerealestate.js';
import despallieres from './despallieres.js';
import laclerouge from './laclerouge.js';
import hoedemaker from './hoedemaker.js';
import immoazur from './immoazur.js';

export const SITES = [
  // Grandes enseignes
  johntaylor, sothebys, savills, zingraff, wretman, engelvolkers, coldwellbanker,
  // Agences locales (moteur bObcat)
  saintpaulproperties, realimmo, lacanopee, lemasprovencal, brison, tslimmo,
  // Particuliers (vendeurs sans mandat)
  pap,
  // Ajouts octobre 2026
  burns, saintpaulimmo, rgimmobilier, immobilieremb, leandri, labellepierre, mriviera, despallieres,
  lubiana, rivierahunt, puccetti, vencerealestate, atrio, immoazur, laclerouge, hoedemaker,
  carlton, mgpalm, gubernatis, century21, orpi, era,
].filter((s) => s.enabled);

// Toutes les agences configurees (y compris desactivees) : pour le mode sonde.
export const ALL_SITES = [
  johntaylor, sothebys, savills, zingraff, wretman, engelvolkers, coldwellbanker,
  saintpaulproperties, realimmo, lacanopee, lemasprovencal, brison, tslimmo, pap,
  burns, saintpaulimmo, rgimmobilier, immobilieremb, leandri, labellepierre, mriviera, despallieres,
  lubiana, rivierahunt, puccetti, vencerealestate, atrio, immoazur, laclerouge, hoedemaker,
  carlton, mgpalm, gubernatis, century21, orpi, era,
];
