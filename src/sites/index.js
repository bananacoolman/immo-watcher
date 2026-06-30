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

export const SITES = [
  // Grandes enseignes
  johntaylor, sothebys, savills, zingraff, wretman, engelvolkers, coldwellbanker,
  // Agences locales (moteur bObcat)
  saintpaulproperties, realimmo, lacanopee, lemasprovencal, brison, tslimmo,
].filter((s) => s.enabled);
