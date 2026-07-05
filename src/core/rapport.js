// Rapport vendeur a la demande : /rapport <commune> [surface]m2 [prix]
// -> PDF de positionnement marche (donnees reelles de la veille) envoye sur Telegram.

import PDFDocument from 'pdfkit';
import { env, TARGET_COMMUNES, MARKET_M2 } from '../config.js';

const DAY = 86400000;
const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nfmt = (n) => n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
const eur = (n) => n == null ? '—' : nfmt(n) + ' €';
const eurK = (n) => n == null ? '—' : n >= 1e6 ? nfmt2(n / 1e6, n % 1e6 ? 2 : 0) + ' M€' : nfmt(Math.round(n / 1000)) + ' k€';
const nfmt2 = (n, d) => n.toLocaleString('fr-FR', { maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ');
const median = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

// /rapport Vence 250m2 1.5M   (surface et prix optionnels)
export function parseRapportCommand(text) {
  const body = text.replace(/^\/rapport(?:@\w+)?\s*/i, '').trim();
  if (!body) return null;
  const out = { commune: null, surface: null, price: null };
  const sm = body.match(/(\d{2,4})\s*m[²2]?/i);
  if (sm) out.surface = parseInt(sm[1], 10);
  const pm = body.match(/([\d.,]+)\s*m€/i) || body.match(/([\d.,]+)\s*M\b/) || body.match(/([\d.,]+)\s*k€?/i);
  if (pm) {
    const v = parseFloat(pm[1].replace(',', '.'));
    out.price = /k/i.test(pm[0]) ? Math.round(v * 1e3) : Math.round(v * 1e6);
  }
  const rest = norm(body.replace(/(\d{2,4})\s*m[²2]?/ig, ' ').replace(/([\d.,]+)\s*[mk]€?/ig, ' '));
  const hit = TARGET_COMMUNES.find((t) => norm(t) === rest.trim())
    || TARGET_COMMUNES.find((t) => rest.includes(norm(t)))
    || TARGET_COMMUNES.find((t) => norm(t).startsWith(rest.trim().split(' ')[0] || '###'));
  if (hit) out.commune = hit;
  return out.commune ? out : null;
}

// Agrege les donnees marche d'une commune depuis les lignes de la base.
export function buildRapportData(rows, commune, { surface = null, price = null } = {}, nowMs = Date.now()) {
  const active = rows.filter((r) => r.commune === commune &&
    (!r.last_seen || (nowMs - new Date(r.last_seen)) / DAY <= env.activeDays));
  const prices = active.map((r) => r.price_num).filter((n) => n != null);
  const stale = active.filter((r) => r.first_seen && (nowMs - new Date(r.first_seen)) / DAY >= env.staleDays);
  const drops = active.filter((r) => Array.isArray(r.price_history) && r.price_history.length >= 2
    && r.price_num != null && r.price_history[0].p > r.price_num);
  const withM2 = active.filter((r) => r.surface && r.price_num);
  const m2s = withM2.map((r) => Math.round(r.price_num / r.surface))
    .filter((v) => { const ref = MARKET_M2[commune]; return !ref || (v >= ref * 0.5 && v <= ref * 2); });

  // comparables : proches en prix (±20%) ou en surface (±25%)
  let comps = [];
  if (price) comps = active.filter((r) => r.price_num && Math.abs(r.price_num - price) / price <= 0.2);
  else if (surface) comps = active.filter((r) => r.surface && Math.abs(r.surface - surface) / surface <= 0.25);
  comps = comps.sort((a, b) => (a.price_num || 0) - (b.price_num || 0)).slice(0, 8);

  const refM2 = MARKET_M2[commune] || null;
  const estimate = (surface && refM2) ? { low: Math.round(surface * refM2 * 0.9), mid: Math.round(surface * refM2), high: Math.round(surface * refM2 * 1.1) } : null;

  return {
    commune, surface, price, refM2,
    stock: active.length,
    medPrice: median(prices),
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    medM2: median(m2s),
    staleCount: stale.length,
    stalePct: active.length ? Math.round(stale.length / active.length * 100) : 0,
    dropCount: drops.length,
    dropPct: active.length ? Math.round(drops.length / active.length * 100) : 0,
    comps, estimate,
    sitesCount: [...new Set(active.map((r) => r.site))].length,
  };
}

// ---------- PDF ----------
const INK = '#0d1b2a', GOLD = '#b8935a', MUTED = '#5a6b7a', LINE = '#d8d2c4';

export function generatePdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 54, left: 54, right: 54, bottom: 54 } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 108;

    // entete
    doc.fontSize(9).fillColor(GOLD).font('Helvetica-Bold')
      .text('ANALYSE DE MARCHÉ · ARRIÈRE-PAYS NIÇOIS', { characterSpacing: 2 });
    doc.moveDown(0.3);
    doc.fontSize(26).fillColor(INK).font('Helvetica-Bold').text(d.commune);
    doc.fontSize(10).fillColor(MUTED).font('Helvetica')
      .text(`Établi le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · données de veille multi-agences (${d.sitesCount} sources)`);
    doc.moveDown(0.6);
    doc.moveTo(54, doc.y).lineTo(54 + W, doc.y).strokeColor(GOLD).lineWidth(1.2).stroke();
    doc.moveDown(1);

    // chiffres cles
    const kpi = (label, value, x, y, w) => {
      doc.fontSize(8).fillColor(MUTED).font('Helvetica').text(label.toUpperCase(), x, y, { width: w, characterSpacing: 1, lineBreak: false });
      doc.fontSize(16).fillColor(INK).font('Helvetica-Bold').text(value, x, y + 13, { width: w, lineBreak: false });
    };
    const y0 = doc.y;
    kpi('Prix marché', d.refM2 ? nfmt(d.refM2) + ' €/m²' : '—', 54, y0, W / 4);
    kpi('Biens en vente', String(d.stock), 54 + W / 4, y0, W / 4);
    kpi('Prix médian', eurK(d.medPrice), 54 + W / 2, y0, W / 4);
    kpi('€/m² constaté', d.medM2 ? nfmt(d.medM2) + ' €' : '—', 54 + 3 * W / 4, y0, W / 4);
    doc.text('', 54, y0 + 44); doc.x = 54;
    doc.moveDown(0.8);

    // tension du marche
    doc.fontSize(11).fillColor(GOLD).font('Helvetica-Bold').text('TENSION DU MARCHÉ', { characterSpacing: 1.5 });
    doc.moveDown(0.4);
    doc.fontSize(10.5).fillColor(INK).font('Helvetica');
    doc.text(`• ${d.staleCount} bien(s) en vente depuis plus de ${env.staleDays} jours (${d.stalePct} % du stock observé) — signe de biens surévalués qui stagnent.`);
    doc.text(`• ${d.dropCount} bien(s) ont déjà baissé leur prix (${d.dropPct} % du stock) — le marché sanctionne les prix d'appel trop hauts.`);
    doc.text(`• Fourchette des prix affichés : ${eurK(d.minPrice)} – ${eurK(d.maxPrice)}.`);
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor(MUTED).font('Helvetica-Oblique')
      .text(`Lecture : un bien correctement positionné dès la mise en vente évite la spirale « affichage long, baisses successives, négociation défavorable ».`);
    doc.moveDown(1);

    // estimation
    if (d.estimate) {
      doc.fontSize(11).fillColor(GOLD).font('Helvetica-Bold').text('POSITIONNEMENT INDICATIF', { characterSpacing: 1.5 });
      doc.moveDown(0.4);
      doc.fontSize(10.5).fillColor(INK).font('Helvetica')
        .text(`Pour ${d.surface} m² au prix marché de ${d.commune} (${nfmt(d.refM2)} €/m²) :`);
      doc.moveDown(0.3);
      doc.fontSize(15).font('Helvetica-Bold')
        .text(`${eurK(d.estimate.low)}  —  ${eurK(d.estimate.mid)}  —  ${eurK(d.estimate.high)}`, { align: 'center' });
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica')
        .text('fourchette basse · valeur indicative · fourchette haute (±10 %)', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor(MUTED).font('Helvetica-Oblique')
        .text(`Estimation indicative fondée sur le prix moyen communal — la valeur réelle dépend du micro-secteur, de la vue, de l'état et des prestations. Une visite d'évaluation permet un positionnement précis.`);
      doc.moveDown(1);
    }

    // comparables
    if (d.comps.length) {
      doc.fontSize(11).fillColor(GOLD).font('Helvetica-Bold').text('BIENS ACTUELLEMENT EN CONCURRENCE', { characterSpacing: 1.5 });
      doc.moveDown(0.5);
      const cols = [54, 150, 230, 330, 54 + W];
      doc.fontSize(8).fillColor(MUTED).font('Helvetica-Bold');
      doc.text('PRIX', cols[0], doc.y, { continued: false });
      const yh = doc.y - 10;
      doc.text('SURFACE', cols[1], yh); doc.text('€/m²', cols[2], yh); doc.text('SOURCE', cols[3], yh);
      doc.moveDown(0.2);
      doc.moveTo(54, doc.y).lineTo(54 + W, doc.y).strokeColor(LINE).lineWidth(0.7).stroke();
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(INK).font('Helvetica');
      for (const c of d.comps) {
        const y = doc.y;
        doc.font('Helvetica-Bold').text(eurK(c.price_num), cols[0], y);
        doc.font('Helvetica').text(c.surface ? c.surface + ' m²' : '—', cols[1], y);
        doc.text(c.surface && c.price_num ? nfmt(Math.round(c.price_num / c.surface)) : '—', cols[2], y);
        doc.fillColor(MUTED).text(c.site || '—', cols[3], y, { width: W - (cols[3] - 54) });
        doc.fillColor(INK);
        doc.moveDown(0.15);
      }
      doc.x = 54;
      doc.moveDown(0.8);
    }

    // pied
    doc.fontSize(8).fillColor(MUTED).font('Helvetica')
      .text(`Document d'information établi à partir des annonces publiques observées (multi-agences + particuliers). Les prix affichés ne sont pas les prix de vente réels. Ne constitue pas une expertise.`,
        54, doc.page.height - 90, { width: W });
    doc.end();
  });
}

// ---------- envoi Telegram (document) ----------
export async function sendPdf(buffer, filename, caption) {
  const form = new FormData();
  form.append('chat_id', String(env.telegramChat));
  form.append('caption', caption);
  form.append('document', new Blob([buffer], { type: 'application/pdf' }), filename);
  const res = await fetch(`https://api.telegram.org/bot${env.telegramToken}/sendDocument`, { method: 'POST', body: form });
  const j = await res.json();
  if (!j.ok) throw new Error(`Telegram sendDocument: ${j.description}`);
}
