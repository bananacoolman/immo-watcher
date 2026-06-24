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
  // Bridge e-mail (Leboncoin / Seloger via alertes)
  emailEnabled: process.env.EMAIL_ENABLED === '1',
  imapHost: process.env.IMAP_HOST,
  imapPort: parseInt(process.env.IMAP_PORT || '993', 10),
  imapUser: process.env.IMAP_USER,
  imapPassword: process.env.IMAP_PASSWORD,
  imapMailbox: process.env.IMAP_MAILBOX || 'INBOX',
};

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';
