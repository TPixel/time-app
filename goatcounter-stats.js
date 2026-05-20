#!/usr/bin/env node
/* eslint-disable no-console */
// ════════════════════════════════════════════════════════════════════
// TIME APP — lokal GoatCounter-tæller til Mac
// ────────────────────────────────────────────────────────────────────
// Henter besøgstal fra GoatCounter og viser begge apps adskilt
// (app.html = Fiktion, rekl.html = Reklame) + PWA-installationer.
//
// FØRSTE GANG (når GoatCounter-kontoen er oprettet):
//   1) Log ind på https://timeapp.goatcounter.com
//   2) Settings → "API tokens" → "Add token"  (sæt flueben i "Read statistics")
//   3) Gem nøglen ét af disse steder:
//        • miljøvariabel:   export GOATCOUNTER_TOKEN="din-nøgle"
//        • eller fil:       /Users/thomas/time-app/.goatcounter-token   (1 linje)
//   (site-koden er "timeapp" — ret GOATCOUNTER_SITE hvis du valgte en anden)
//
// BRUG:
//   node goatcounter-stats.js            # sidste 30 dage
//   node goatcounter-stats.js 7          # sidste 7 dage
//   node goatcounter-stats.js all        # alt (siden 2020)
//   node goatcounter-stats.js 30 --raw   # dump rå JSON (debug)
// ════════════════════════════════════════════════════════════════════

const https = require('https');
const fs = require('fs');
const path = require('path');

const SITE = process.env.GOATCOUNTER_SITE || 'timeapp';
const TOKEN = readToken();
const args = process.argv.slice(2);
const RAW = args.includes('--raw');
const periodArg = args.find(a => a !== '--raw') || '30';

function readToken() {
  if (process.env.GOATCOUNTER_TOKEN) return process.env.GOATCOUNTER_TOKEN.trim();
  const candidates = [
    path.join(__dirname, '.goatcounter-token'),
    path.join(process.env.HOME || '', '.config', 'timeapp', 'goatcounter.token'),
  ];
  for (const f of candidates) {
    try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } catch (_) {}
  }
  return null;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function getPeriod() {
  const end = new Date();
  let start = new Date();
  if (periodArg === 'all') start = new Date('2020-01-01');
  else start.setDate(end.getDate() - (parseInt(periodArg, 10) || 30));
  return { start: isoDate(start), end: isoDate(end) };
}

function api(pathname, query) {
  const qs = new URLSearchParams(query).toString();
  const options = {
    hostname: `${SITE}.goatcounter.com`,
    path: `/api/v0${pathname}?${qs}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Ugyldigt JSON-svar: ' + body.slice(0, 200))); }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`Adgang nægtet (HTTP ${res.statusCode}). Tjek at API-nøglen er gyldig og har "Read statistics".`));
        } else if (res.statusCode === 404) {
          reject(new Error(`Ikke fundet (HTTP 404). Findes "${SITE}.goatcounter.com"? Opret kontoen først, eller ret GOATCOUNTER_SITE.`));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout mod GoatCounter (15s).')));
    req.end();
  });
}

function bar(n, max, width = 24) {
  if (max <= 0) return '';
  const len = Math.round((n / max) * width);
  return '█'.repeat(len) + '░'.repeat(width - len);
}

function fmt(n) { return Number(n || 0).toLocaleString('da-DK'); }

async function main() {
  console.log('');
  console.log('  ⏱  TIME APP — GoatCounter statistik');
  console.log('  ' + '─'.repeat(54));

  if (!TOKEN) {
    console.log('  ⚠  Ingen API-nøgle fundet.');
    console.log('');
    console.log('     Sæt en af disse:');
    console.log('       export GOATCOUNTER_TOKEN="din-nøgle"');
    console.log('       (eller læg nøglen i  ' + path.join(__dirname, '.goatcounter-token') + ')');
    console.log('');
    console.log('     Nøglen laves på  https://' + SITE + '.goatcounter.com');
    console.log('       → Settings → API tokens → Add token (Read statistics)');
    console.log('');
    process.exit(1);
  }

  const { start, end } = getPeriod();
  console.log(`  Site:    ${SITE}.goatcounter.com`);
  console.log(`  Periode: ${start} → ${end}` + (periodArg === 'all' ? '  (alt)' : `  (${periodArg} dage)`));
  console.log('');

  let total, hits;
  try {
    [total, hits] = await Promise.all([
      api('/stats/total', { start, end }),
      api('/stats/hits', { start, end, limit: 100 }),
    ]);
  } catch (e) {
    console.log('  ✗ ' + e.message);
    console.log('');
    process.exit(1);
  }

  if (RAW) {
    console.log(JSON.stringify({ total, hits }, null, 2));
    return;
  }

  const list = (hits && hits.hits) || [];
  // Kategorisér stier
  const cat = { fiktion: [], reklame: [], pwa: [], andet: [] };
  for (const h of list) {
    const p = h.path || '';
    if (p.includes('app.html') || p === '/' ) cat.fiktion.push(h);
    else if (p.includes('rekl.html')) cat.reklame.push(h);
    else if (p.includes('pwa/')) cat.pwa.push(h);
    else cat.andet.push(h);
  }
  const sum = arr => arr.reduce((a, h) => a + (h.count || 0), 0);
  const sumU = arr => arr.reduce((a, h) => a + (h.count_unique != null ? h.count_unique : 0), 0);

  const fik = sum(cat.fiktion), rek = sum(cat.reklame);
  const maxApp = Math.max(fik, rek, 1);

  console.log('  APPS (sidevisninger)');
  console.log(`    Fiktion  (app.html)   ${bar(fik, maxApp)}  ${fmt(fik)}` + (sumU(cat.fiktion) ? `  ·  ${fmt(sumU(cat.fiktion))} unikke` : ''));
  console.log(`    Reklame  (rekl.html)  ${bar(rek, maxApp)}  ${fmt(rek)}` + (sumU(cat.reklame) ? `  ·  ${fmt(sumU(cat.reklame))} unikke` : ''));
  console.log('');

  // PWA-events
  const installs = cat.pwa.filter(h => /installed/.test(h.path));
  const launches = cat.pwa.filter(h => /standalone-launch/.test(h.path));
  console.log('  PWA');
  console.log(`    Installationer        ${fmt(sum(installs))}`);
  console.log(`    Standalone-launches   ${fmt(sum(launches))}`);
  console.log('');

  // Øvrige stier
  if (cat.andet.length) {
    console.log('  ANDRE SIDER');
    cat.andet.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8)
      .forEach(h => console.log(`    ${(h.path || '').padEnd(24).slice(0, 24)} ${fmt(h.count)}`));
    console.log('');
  }

  // Totaler
  const tTotal = (total && (total.total != null ? total.total : total.total_pageviews)) || sum(list);
  console.log('  I ALT');
  console.log(`    Sidevisninger         ${fmt(tTotal)}`);
  if (total && total.total_events != null) console.log(`    Heraf events          ${fmt(total.total_events)}`);
  console.log('');
  console.log('  Dashboard: https://' + SITE + '.goatcounter.com');
  console.log('');
}

main().catch(e => { console.error('\n  ✗ Uventet fejl:', e.message, '\n'); process.exit(1); });
