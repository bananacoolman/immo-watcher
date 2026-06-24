import { USER_AGENT, env } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Recupere le HTML d'une page. Retry + timeout. Bascule sur Playwright si demande
// (globalement via USE_PLAYWRIGHT, ou par site via l'option useJs).
export async function getHtml(url, { retries = 2, timeoutMs = 25000, useJs = false } = {}) {
  if (env.usePlaywright || useJs) return renderWithPlaywright(url, timeoutMs);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(t);
      if (attempt === retries) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
}

// Rendu JS via Playwright (chargement dynamique seulement si USE_PLAYWRIGHT=1).
let _browser = null;
async function renderWithPlaywright(url, timeoutMs) {
  const { chromium } = await import('playwright');
  if (!_browser) _browser = await chromium.launch({ headless: true });
  const ctx = await _browser.newContext({ userAgent: USER_AGENT, locale: 'fr-FR' });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    return await page.content();
  } finally {
    await ctx.close();
  }
}

export async function closeBrowser() {
  if (_browser) { await _browser.close(); _browser = null; }
}
