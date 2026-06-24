import cron from 'node-cron';
import { runOnce } from './core/run.js';
import { env } from './config.js';

function checkEnv() {
  const need = ['telegramToken', 'telegramChat', 'supabaseUrl', 'supabaseKey'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length && !env.debug) {
    console.error('Variables manquantes dans .env :', missing.join(', '));
    process.exit(1);
  }
}

async function main() {
  checkEnv();

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
