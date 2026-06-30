import 'dotenv/config';

// Secteurs surveilles. Les variantes (St-Paul, Saint Paul...) sont gerees
// automatiquement par la normalisation (cf. core/normalize.js).
export const TARGET_COMMUNES = [
  'Saint-Paul-de-Vence',
  'Vence',
  'La Colle-sur-Loup',
  'Tourrettes-sur-Loup',
  'Gattières',
  'La Gaude',
  'Saint-Jeannet',
];

export const env = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChat: process.env.TELEGRAM_CHAT_ID,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  mode: process.env.MODE || 'loop',
  intervalCron: process.env.INTERVAL_CRON || '*/5 * * * *',
  politeDelayMs: parseInt(process.env.POLITE_DELAY_MS || '1500', 10),
  usePlaywright: process.env.USE_PLAYWRIGHT === '1',
  debug: process.env.DEBUG_SCRAPE === '1',
  seedOnly: process.env.SEED_ONLY === '1',
  minPrice: parseInt(process.env.MIN_PRICE || '300000', 10),
  keepUnknownPrice: process.env.KEEP_UNKNOWN_PRICE !== '0',
  // Signaux "mandats qui trainent"
  signalsEnabled: process.env.SIGNALS_ENABLED !== '0',   // actif par defaut
  staleDays: parseInt(process.env.STALE_DAYS || '75', 10),       // ancien depuis X jours
  dropPct: parseFloat(process.env.DROP_PCT || '0.07'),           // baisse >= 7%
  reappearGapDays: parseInt(process.env.REAPPEAR_GAP_DAYS || '5', 10), // disparu puis revenu
  // Multi-mandat : meme bien (commune + prix proche) chez plusieurs agences
  multiMandatEnabled: process.env.MULTI_MANDAT !== '0',
  multiPriceTol: parseFloat(process.env.MULTI_PRICE_TOL || '0.005'), // 0,5 %
  activeDays: parseInt(process.env.ACTIVE_DAYS || '4', 10),          // "encore en ligne" si revu < N j
  // Ecart au prix marche (#3)
  marketFlagPct: parseFloat(process.env.MARKET_FLAG_PCT || '0.15'),  // +/- 15% = sur/sous-evalue
  // Bridge e-mail (Leboncoin / Seloger via alertes)
  emailEnabled: process.env.EMAIL_ENABLED === '1',
  imapHost: process.env.IMAP_HOST,
  imapPort: parseInt(process.env.IMAP_PORT || '993', 10),
  imapUser: process.env.IMAP_USER,
  imapPassword: process.env.IMAP_PASSWORD,
  imapMailbox: process.env.IMAP_MAILBOX || 'INBOX',
};

// Prix marche indicatif au m² (maisons) par commune — repere mensuel
// (MeilleursAgents / efficity / SeLoger / DVF, juin 2026). Sert au flag #3.
export const MARKET_M2 = {
  'Saint-Paul-de-Vence': 6700,
  'La Colle-sur-Loup': 5900,
  'La Gaude': 5500,
  'Tourrettes-sur-Loup': 5300,
  'Vence': 5000,
  'Saint-Jeannet': 4900,
  'Gattières': 4500,
};

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';
