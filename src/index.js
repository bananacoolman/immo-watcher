import cron from 'node-cron';
import { runOnce, runDigest, runGeoProbe, runSitesProbe } from './core/run.js';
import { runReperage } from './core/reperage.js';
import { env } from './config.js';
import { syncTelegramKv, setupTelegramMenu } from './core/clients.js';

function checkEnv() {
  const need = ['telegramToken', 'telegramChat', 'supabaseUrl', 'supabaseKey'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length && !env.debug) {
    console.error('Variables manquantes dans .env :', missing.join(', '));
    process.exit(1);
  }
}

async function main() {
  if (env.mode === 'sites-probe') { await runSitesProbe(); process.exit(0); }   // aucun secret requis
  checkEnv();
  // envoi immediat depuis la page clients : Supabase doit connaitre le bot
  try { await syncTelegramKv(); } catch (e) { console.warn('syncTelegramKv:', e.message); }
  // bouton "➕ Client" dans Telegram (formulaire)
  try { await setupTelegramMenu(); } catch (e) { console.warn('setupTelegramMenu:', e.message); }

  if (env.mode === 'digest') {
    await runDigest();
    process.exit(0);
  }

  if (env.mode === 'sites-probe') {
    await runSitesProbe();
    process.exit(0);
  }

  if (env.mode === 'geo-probe') {
    await runGeoProbe();
    process.exit(0);
  }

  if (env.mode === 'reperage') {
    await runReperage();
    process.exit(0);
  }

  if (env.mode === 'once') {
    await runOnce();
    process.exit(0);
  }

  console.log(`Mode loop — planning "${env.intervalCron}". Premier passage immediat.`);
  await runOnce();
  cron.schedule(env.intervalCron, () => {
    runOnce().catch((e) => console.error('runOnce:', e.message));
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
