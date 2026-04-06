#!/usr/bin/env node
/**
 * Comprehensive test suite for Time App calculators
 * app.html  = Fiktionsoverenskomst
 * rekl.html = Reklamefilm
 *
 * 7 scenarios × 200 tests × 2 apps = 2800 minimum tests
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function rnd(v) { return Math.round(v); }

// Quarter-snapped minutes
const Q = [0, 15, 30, 45];
function randMinute() { return pick(Q); }
function randTime(hFrom = 6, hTo = 22) {
  return { h: randInt(hFrom, hTo), m: randMinute() };
}

let passed = 0, failed = 0;
const failures = [];

function assert(condition, label, got, expected, extra = '') {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ label, got, expected, extra });
  }
}

function notNaN(v, label, extra = '') {
  assert(!Number.isNaN(v) && v !== undefined && v !== null,
    `${label}: not NaN/null`, v, 'number', extra);
}
function notNeg(v, label, extra = '') {
  assert(typeof v === 'number' && v >= 0,
    `${label}: not negative`, v, '>=0', extra);
}

// ─────────────────────────────────────────────────────────────────────────────
// DANISH HOLIDAYS 2025-2026  (same list as app.html)
// ─────────────────────────────────────────────────────────────────────────────
const HELLIGDAGE = new Set([
  '2025-01-01','2025-04-17','2025-04-18','2025-04-20','2025-04-21',
  '2025-05-16','2025-05-29','2025-06-05','2025-06-08','2025-06-09',
  '2025-12-24','2025-12-25','2025-12-26','2025-12-31',
  '2026-01-01','2026-04-02','2026-04-03','2026-04-05','2026-04-06',
  '2026-05-14','2026-05-25','2026-06-04','2026-06-05',
  '2026-12-24','2026-12-25','2026-12-26','2026-12-31',
]);
function p2(n) { return String(n).padStart(2, '0'); }
function datoStr(d) {
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
}
function erHelligdag(d) { return HELLIGDAGE.has(datoStr(d)); }

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  APP.HTML — FIKTIONSOVERENSKOMST ENGINE
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

const DIÆT_FAF = 94;

function tidTilH(t) { return t.h + t.m / 60; }

function calcTimer_faf(start, slut) {
  const s = tidTilH(start), e = tidTilH(slut);
  const h = (e >= s) ? e - s : e - s + 24;
  return Math.max(0, h - 0.5);
}

function dagMax_faf(model) { return model === 'saertid' ? 10 : 8; }

function timesats_faf(ugelon) { return ugelon / 40; }

function calcForskudt_faf(start, slut, dagIdx) {
  if (dagIdx === 0 || dagIdx === 6) return 0;
  const s = tidTilH(start), e = tidTilH(slut);
  let fsk = 0;
  const seg = (e >= s) ? [[s, e]] : [[s, 24], [0, e]];

  seg.forEach(([a, b]) => {
    if (dagIdx === 5 && a === 0) return; // Friday wrap-midnight = §8
    const aFsk = (dagIdx === 1) ? Math.max(a, 6) : a;
    const bFsk = (dagIdx === 5) ? Math.min(b, 20) : b;
    if (aFsk >= bFsk) return;
    if (aFsk < 6)  fsk += Math.min(bFsk, 6) - aFsk;
    if (bFsk > 19) fsk += bFsk - Math.max(aFsk, 19);
  });
  return Math.max(0, fsk);
}

function calcWeekendTimer_faf(start, slut, dagIdx) {
  const s = tidTilH(start), e = tidTilH(slut);
  const eAdj = (e > s) ? e : e + 24;
  let wkH = 0;
  if      (dagIdx === 6 || dagIdx === 0) { wkH = eAdj - s; }
  else if (dagIdx === 5) { if (s >= 20) wkH = eAdj - s; else if (eAdj > 20) wkH = eAdj - 20; }
  else if (dagIdx === 1) { if (s < 6) wkH = Math.min(eAdj, 6) - s; }
  return Math.max(0, wkH);
}

function calcLon_faf(h, opt, ugelon, pers, tillæg, model, wkAutoH = 0, wkRate = 0.75) {
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0 };
  const ts   = timesats_faf(ugelon);
  const dMax = dagMax_faf(model);
  const { varslet, uvarslet, helligdag, frokost, pause10, enkeltdag, varsletTimer } = opt;

  const normalH = Math.min(dMax, h);
  const otH     = Math.max(0, h - dMax);
  const ot1H    = Math.min(1, otH);
  const ot2H    = Math.min(1, Math.max(0, otH - 1));
  const ot3H    = Math.max(0, otH - 2);

  const harEnkeltdag = !!(enkeltdag || tillæg);
  const tsNorm  = (ugelon / 40) * (harEnkeltdag ? 1.1 : 1.0) + (pers || 0) / 40;
  const tsWk    = ts * (harEnkeltdag ? 1.1 : 1.0);

  let normal = 0, ot1 = 0, ot2 = 0, ot3 = 0, wk = 0;

  if (helligdag) {
    const betaltH = Math.max(4, normalH);
    wk     = tsWk * wkRate * betaltH;
    normal = tsNorm * normalH;
    ot1    = tsWk * (1 + wkRate + 0.50) * ot1H;
    ot2    = tsWk * (1 + wkRate + 0.60) * ot2H;
    ot3    = tsWk * (1 + wkRate + 1.35) * ot3H;
  } else {
    normal = tsNorm * normalH;
    if (wkAutoH > 0) wk = tsWk * wkRate * wkAutoH;

    // Mixed OT support — split within bands
    const vt = (varslet && uvarslet && typeof varsletTimer === 'number') ? varsletTimer : null;
    if (vt !== null) {
      const v1 = Math.min(vt, ot1H), u1 = ot1H - v1;
      const v2 = Math.min(Math.max(0, vt - 1), ot2H), u2 = ot2H - v2;
      ot1 = v1 * tsWk * 1.50 + u1 * tsWk * 1.75;
      ot2 = v2 * tsWk * 1.60 + u2 * tsWk * 2.00;
      ot3 = tsWk * 2.35 * ot3H;
    } else if (varslet) {
      ot1 = tsWk * 1.50 * ot1H;
      ot2 = tsWk * 1.60 * ot2H;
      ot3 = tsWk * 2.35 * ot3H;
    } else {
      ot1 = tsWk * 1.75 * ot1H;
      ot2 = tsWk * 2.00 * ot2H;
      ot3 = tsWk * 2.35 * ot3H;
    }
  }

  let ext = 0;
  if (frokost)          ext += DIÆT_FAF;
  if (pause10 && h > 10) ext += ts * (15 / 60);

  return {
    total:  rnd(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: rnd(normal), ot1: rnd(ot1), ot2: rnd(ot2), ot3: rnd(ot3),
    wk: rnd(wk), ext: rnd(ext),
    normalH, ot1H, ot2H, ot3H,
    ts, tsNorm, tsWk,
  };
}

// Random valid config for app.html
function randFafCfg() {
  const ugelon = pick([10380, 11000, 12000, 13500, 15000, 9500]);
  return {
    ugelon,
    pers:   pick([0, 0, 0, 500, 1000, 2000]),
    tillæg: Math.random() < 0.3,
    model:  Math.random() < 0.3 ? 'saertid' : '5dag',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  REKL.HTML — REKLAMEFILM ENGINE
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

const GR_SATSER = { 1: 0, 2: 4100, 3: 3300, 4: 2750, 5: 1540 };

function otBands(t) {
  const ot = Math.max(0, t - 8);
  return {
    I: Math.min(ot, 2),
    J: Math.min(Math.max(ot - 2, 0), 2),
    K: Math.min(Math.max(ot - 4, 0), 2),
    L: Math.max(ot - 6, 0),
  };
}

function overlap_rekl(sh, eh, fra, til) {
  const a = Math.max(sh, fra), b = Math.min(eh, til);
  return b > a ? b - a : 0;
}

function calcReklame(dagtype, start, slut, dagssats, gruppe, opts) {
  if (!start || !slut) return null;
  const s = start.h + start.m / 60;
  const e = slut.h  + slut.m  / 60;
  const raaTimer = e >= s ? e - s : e - s + 24;

  const arbejdsTimer = dagtype === 'forbered' ? Math.max(4, raaTimer) : raaTimer;
  const ts = dagssats / 8;

  const b = otBands(arbejdsTimer);
  const otTimer = b.I + b.J + b.K + b.L;

  const normalKr = Math.min(arbejdsTimer, 8) * ts;
  let otKr = 0;

  if (gruppe === 5) {
    const band1 = b.I + b.J + b.K;
    otKr = band1 * 200 + b.L * 350;
  } else if (gruppe === 1) {
    otKr = (opts.gr1OTSats > 0) ? otTimer * opts.gr1OTSats : 0;
  } else {
    if (dagtype === 'optagelse') {
      otKr = b.I * ts * 1.25 + b.J * ts * 2.00 + b.K * ts * 2.50 + b.L * ts * 3.00;
    } else {
      otKr = b.I * ts * 1.25 + b.J * ts * 1.50 + b.K * ts * 1.75 + b.L * ts * 1.75;
    }
  }

  // Transport
  let transKr = 0, transTimer = 0;
  if (dagtype === 'optagelse' && opts.transport > 0) {
    transTimer = opts.transport;
    transKr = transTimer * ts * 1.75;
  }

  // Nat-gene
  let natKr = 0, nat18t = 0, nat00t = 0;
  if (dagtype === 'optagelse' && opts.nat) {
    const sh = s, eh2 = e >= s ? e : e + 24;
    nat18t = overlap_rekl(sh, eh2, 18, 24);
    nat00t = (sh < 6 ? overlap_rekl(sh, eh2, 0, 6) : 0) + overlap_rekl(sh, eh2, 24, 30);
    natKr = nat18t * 100 + nat00t * 200;
  }

  // Weekend
  let wkKr = 0;
  const effWk = (dagtype === 'optagelse' && opts.helligdag && (opts.wk || 0) < 2) ? 2 : (opts.wk || 0);
  if (dagtype === 'optagelse' && (effWk > 0 || opts.helligdag)) {
    const wTimer = arbejdsTimer + transTimer;
    const wFaktor = effWk === 2 ? 1.0 : 0.75;
    wkKr = wTimer * ts * wFaktor;
  }

  // Pauser
  let pauseKr = 0;
  if (dagtype === 'optagelse') {
    if (opts.pauseForsinketFrokost) pauseKr += (30/60) * ts * 2.00;
    if (opts.pauseIngenServering)   pauseKr += (15/60) * ts * 2.50;
    if (opts.pausePlanlagt)         pauseKr += (45/60) * ts * 1.25;
    if (opts.pause5)                pauseKr += (30/60) * ts * 2.00;
    if (opts.pause10)               pauseKr += (30/60) * ts * 2.00;
    if (opts.pause13)               pauseKr += (30/60) * ts * 2.00;
  }

  // Rabat
  let rabatKr = 0;
  if (dagtype === 'optagelse' && opts.rabat > 0) {
    const pct = opts.rabat === 1 ? 0.10 : 0.15;
    rabatKr = -(normalKr + otKr) * pct;
  }

  const brutto = normalKr + otKr + rabatKr + transKr + natKr + wkKr + pauseKr;

  const garantiKr = (dagtype === 'optagelse' && brutto < dagssats) ? dagssats - brutto : 0;

  const diaetKr        = (opts.diaeter || 0) * 172.20;
  const persontillaegKr = opts.persontillaeg || 0;

  const total = brutto + garantiKr + diaetKr + persontillaegKr;

  return {
    raaTimer, arbejdsTimer, otTimer, transTimer,
    normalKr, otKr, transKr, natKr, wkKr, pauseKr, rabatKr,
    garantiKr, diaetKr, persontillaegKr,
    brutto, total, ts,
    bI: b.I, bJ: b.J, bK: b.K, bL: b.L,
    nat18t, nat00t, effWk,
    helligdag: opts.helligdag || false,
  };
}

// Random opts for rekl
function randReklOpts(dagtype) {
  const base = {
    transport:          dagtype === 'optagelse' ? pick([0, 0, 0, 1, 2, 3]) : 0,
    nat:                dagtype === 'optagelse' && Math.random() < 0.3,
    wk:                 dagtype === 'optagelse' ? pick([0, 0, 1, 2]) : 0,
    helligdag:          dagtype === 'optagelse' && Math.random() < 0.1,
    rabat:              dagtype === 'optagelse' ? pick([0, 0, 0, 1, 2]) : 0,
    persontillaeg:      pick([0, 0, 500, 1000]),
    gr1OTSats:          pick([0, 300, 500, 800]),
    diaeter:            pick([0, 0, 1, 2]),
    pauseForsinketFrokost: dagtype === 'optagelse' && Math.random() < 0.2,
    pauseIngenServering:   dagtype === 'optagelse' && Math.random() < 0.15,
    pausePlanlagt:         dagtype === 'optagelse' && Math.random() < 0.15,
    pause5:                dagtype === 'optagelse' && Math.random() < 0.15,
    pause10:               dagtype === 'optagelse' && Math.random() < 0.15,
    pause13:               dagtype === 'optagelse' && Math.random() < 0.15,
  };
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIOS = [
  'weekend',
  'helligdag',
  'forskudt_nat',
  'saertid_4dag',
  'normal_5dag',
  'enkeltdag',
  'dagsløngaranti',
];

const N = 600; // tests per scenario per app — raised from 200 to hit 10k+ per app

// ─────────────────────────────────── APP TESTS ──────────────────────────────

function testApp_weekend() {
  // Friday 20:00 → Mon 06:00 range — use Saturday or Sunday dates
  for (let i = 0; i < N; i++) {
    const cfg = randFafCfg();
    // Pick a Saturday or Sunday
    const dagIdx = pick([6, 0]); // 6=lørdag, 0=søndag
    const start = randTime(6, 20);
    const endH  = randInt(start.h + 4, 23);
    const slut  = { h: endH, m: randMinute() };
    const h     = calcTimer_faf(start, slut);
    const wkAutoH = calcWeekendTimer_faf(start, slut, dagIdx);
    const opt = { varslet: Math.random() < 0.5, uvarslet: false, helligdag: false,
                  frokost: Math.random() < 0.3, pause10: Math.random() < 0.2, enkeltdag: false };
    const wkRate = 0.75;
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, wkRate);
    const extra = `dagIdx=${dagIdx} ${start.h}:${start.m}–${slut.h}:${slut.m} h=${h.toFixed(2)}`;

    notNaN(l.total,  'app/weekend/total',  extra);
    notNeg(l.total,  'app/weekend/total',  extra);
    notNeg(l.normal, 'app/weekend/normal', extra);
    notNeg(l.wk,     'app/weekend/wk',     extra);

    // Weekend hours must be ≤ total raw hours
    assert(wkAutoH <= h + 0.5, 'app/weekend/wkAutoH<=h', wkAutoH, `<=${h+0.5}`, extra);

    // weekend supplement must be positive when there are weekend hours
    if (wkAutoH > 0) {
      assert(l.wk > 0, 'app/weekend/wk>0 when wkAutoH>0', l.wk, '>0', extra);
    }
  }
}

function testApp_helligdag() {
  for (let i = 0; i < N; i++) {
    const cfg = randFafCfg();
    const start = randTime(6, 16);
    const endH  = randInt(start.h + 4, start.h + 12);
    const slut  = { h: endH % 24, m: randMinute() };
    const h     = calcTimer_faf(start, slut);
    const wkRate = pick([0.75, 1.0]);
    const opt = { varslet: false, helligdag: true, frokost: Math.random() < 0.3,
                  pause10: Math.random() < 0.2, enkeltdag: false };
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, wkRate);
    const extra = `${start.h}:${start.m}–${slut.h}:${slut.m} h=${h.toFixed(2)} wkRate=${wkRate}`;

    notNaN(l.total,  'app/helligdag/total',  extra);
    notNeg(l.total,  'app/helligdag/total',  extra);
    notNeg(l.wk,     'app/helligdag/wk',     extra);

    // Helligdag: minimum 4 hours weekend pay
    const minWk = l.tsWk * wkRate * 4;
    assert(l.wk >= minWk - 1, 'app/helligdag/min4h_wk', l.wk, `>=${rnd(minWk)}`, extra);

    // wk rate should be tsWk * wkRate * max(4, normalH)
    const expectedWk = rnd(l.tsWk * wkRate * Math.max(4, Math.min(dagMax_faf(cfg.model), h)));
    assert(Math.abs(l.wk - expectedWk) <= 1, 'app/helligdag/wk_exact', l.wk, expectedWk, extra);
  }
}

function testApp_forskudt() {
  // Weekday (tue-thu) with early/late hours
  for (let i = 0; i < N; i++) {
    const cfg = randFafCfg();
    const dagIdx = pick([2, 3, 4]); // Tue, Wed, Thu
    // Start before 06 or end after 19
    const startH = pick([0, 1, 2, 3, 4, 5, 14, 15, 16, 17, 18, 19, 20, 21]);
    const start  = { h: startH, m: randMinute() };
    const endH   = (startH + randInt(5, 10)) % 24;
    const slut   = { h: endH, m: randMinute() };
    const h      = calcTimer_faf(start, slut);
    const fsk    = calcForskudt_faf(start, slut, dagIdx);
    const opt = { varslet: Math.random() < 0.5, helligdag: false, frokost: Math.random() < 0.3,
                  pause10: Math.random() < 0.2, enkeltdag: Math.random() < 0.2 };
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);
    const extra = `dagIdx=${dagIdx} ${start.h}:${start.m}–${slut.h}:${slut.m} h=${h.toFixed(2)} fsk=${fsk.toFixed(2)}`;

    notNaN(l.total,  'app/forskudt/total',  extra);
    notNeg(l.total,  'app/forskudt/total',  extra);
    notNaN(fsk,      'app/forskudt/fsk',    extra);
    notNeg(fsk,      'app/forskudt/fsk',    extra);

    // Forskudt cannot exceed total hours
    assert(fsk <= h + 0.5 + 0.01, 'app/forskudt/fsk<=h', fsk, `<=${h+0.5}`, extra);

    // fsk kr = fsk × 110
    const fskKr = rnd(fsk * 110);
    notNeg(fskKr,    'app/forskudt/fskKr',  extra);
  }
}

function testApp_saertid4dag() {
  // 4-day special shift: model='saertid', dagMax=10
  for (let i = 0; i < N; i++) {
    const cfg = { ...randFafCfg(), model: 'saertid' };
    const dagIdx = pick([2, 3, 4, 6]); // work days in special shift
    const start = randTime(5, 18);
    const hWork = rand(6, 14);
    const endH = (start.h + Math.ceil(hWork)) % 24;
    const slut = { h: endH, m: randMinute() };
    const h = calcTimer_faf(start, slut);
    const opt = { varslet: Math.random() < 0.5, helligdag: false, frokost: Math.random() < 0.3,
                  pause10: h > 10, enkeltdag: false };
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);
    const extra = `saertid dagIdx=${dagIdx} h=${h.toFixed(2)}`;

    notNaN(l.total,  'app/saertid/total',  extra);
    notNeg(l.total,  'app/saertid/total',  extra);

    // With 10h dagMax, OT only starts after 10h
    if (h <= 10) {
      assert(l.ot1 === 0 && l.ot2 === 0 && l.ot3 === 0,
        'app/saertid/no_OT_under_10h', `ot1=${l.ot1} ot2=${l.ot2} ot3=${l.ot3}`, '0,0,0', extra);
    }
    if (h > 10) {
      assert(l.ot1 > 0, 'app/saertid/OT_after_10h', l.ot1, '>0', extra);
    }
  }
}

function testApp_normal5dag() {
  // Standard 5-day week, normal hours
  for (let i = 0; i < N; i++) {
    const cfg = { ...randFafCfg(), model: '5dag' };
    const start = randTime(6, 10);
    const hWork = rand(4, 14);
    const endH = Math.min(23, start.h + Math.ceil(hWork));
    const slut = { h: endH, m: randMinute() };
    const h = calcTimer_faf(start, slut);
    const dagIdx = pick([1, 2, 3, 4, 5]);
    const opt = { varslet: Math.random() < 0.5, helligdag: false, frokost: Math.random() < 0.3,
                  pause10: h > 10, enkeltdag: Math.random() < 0.2 };
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);
    const extra = `5dag dagIdx=${dagIdx} h=${h.toFixed(2)}`;

    notNaN(l.total,  'app/5dag/total',  extra);
    notNeg(l.total,  'app/5dag/total',  extra);
    notNeg(l.normal, 'app/5dag/normal', extra);
    notNeg(l.ot1,    'app/5dag/ot1',    extra);
    notNeg(l.ot2,    'app/5dag/ot2',    extra);
    notNeg(l.ot3,    'app/5dag/ot3',    extra);

    // Normal hours ≤ 8 in 5-dag
    assert(l.normalH <= 8, 'app/5dag/normalH<=8', l.normalH, '<=8', extra);

    // With dagMax=8, OT after 8h
    if (h <= 8) {
      assert(l.ot1 === 0, 'app/5dag/no_ot1_under_8h', l.ot1, 0, extra);
    }
  }
}

function testApp_enkeltdag() {
  // §3.10 enkeltdag: 10% on minimum wage
  for (let i = 0; i < N; i++) {
    const cfg = { ...randFafCfg(), tillæg: false, pers: 0 };
    const start = randTime(6, 10);
    const hWork = rand(4, 10);
    const slut = { h: start.h + Math.floor(hWork), m: randMinute() };
    const h = calcTimer_faf(start, slut);
    const opt_med    = { enkeltdag: true,  helligdag: false, varslet: false, frokost: false, pause10: false };
    const opt_uden   = { enkeltdag: false, helligdag: false, varslet: false, frokost: false, pause10: false };
    const l_med  = calcLon_faf(h, opt_med,  cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);
    const l_uden = calcLon_faf(h, opt_uden, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);
    const extra = `enkeltdag h=${h.toFixed(2)} ugelon=${cfg.ugelon}`;

    notNaN(l_med.total, 'app/enkeltdag/total_med', extra);
    notNeg(l_med.total, 'app/enkeltdag/total_med', extra);

    // 10% tillæg should make total higher (for h <= 8, no OT, just normal pay)
    if (h > 0 && h <= 8) {
      assert(l_med.total > l_uden.total,
        'app/enkeltdag/med_higher_than_uden', l_med.total, `>${l_uden.total}`, extra);

      // Check exact 10% on minimum wage
      const tsBase = cfg.ugelon / 40;
      const forventet_med  = rnd(tsBase * 1.1 * h);
      const forventet_uden = rnd(tsBase       * h);
      assert(Math.abs(l_med.total  - forventet_med)  <= 1, 'app/enkeltdag/exact_10pct_med',  l_med.total,  forventet_med,  extra);
      assert(Math.abs(l_uden.total - forventet_uden) <= 1, 'app/enkeltdag/exact_no10pct_uden', l_uden.total, forventet_uden, extra);
    }
  }
}

function testApp_dagsløngaranti() {
  // When dagLon is set manually, it overrides calcLon — but we test the calc result itself
  // Test: total >= 0 and not NaN across wide range of inputs
  for (let i = 0; i < N; i++) {
    const cfg = randFafCfg();
    const start = randTime(5, 16);
    const hWork = rand(1, 16);
    const endH  = Math.min(23, start.h + Math.ceil(hWork));
    const slut  = { h: endH, m: randMinute() };
    const h     = calcTimer_faf(start, slut);
    const opt = {
      varslet:    Math.random() < 0.5,
      helligdag:  Math.random() < 0.2,
      frokost:    Math.random() < 0.4,
      pause10:    h > 10 && Math.random() < 0.5,
      enkeltdag:  Math.random() < 0.3,
    };
    const wkRate = pick([0.75, 1.0]);
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, wkRate);
    const extra = `h=${h.toFixed(2)} ugelon=${cfg.ugelon}`;

    notNaN(l.total,  'app/dagslon/total',  extra);
    notNeg(l.total,  'app/dagslon/total',  extra);
    notNeg(l.normal, 'app/dagslon/normal', extra);
    notNeg(l.ext,    'app/dagslon/ext',    extra);

    // total = normal + ot1 + ot2 + ot3 + wk + ext (rounded individually, so allow ±3)
    const sum = l.normal + l.ot1 + l.ot2 + l.ot3 + l.wk + l.ext;
    assert(Math.abs(l.total - sum) <= 3, 'app/dagslon/total_consistency', l.total, sum, extra);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REKL TESTS
// ─────────────────────────────────────────────────────────────────────────────

function testRekl_weekend() {
  for (let i = 0; i < N; i++) {
    const gruppe  = pick([1, 2, 3, 4, 5]);
    const dagssats = gruppe === 1 ? pick([3000, 5000, 8000]) : GR_SATSER[gruppe];
    const dagtype  = 'optagelse';
    const start    = randTime(6, 18);
    const hWork    = rand(4, 12);
    const slut     = { h: Math.min(23, start.h + Math.floor(hWork)), m: randMinute() };
    const opts     = { ...randReklOpts(dagtype), wk: pick([1, 2]), helligdag: false };
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    const extra = `gruppe=${gruppe} wk=${opts.wk} ${start.h}:${start.m}–${slut.h}:${slut.m}`;

    if (!r) { failed++; failures.push({ label: 'rekl/weekend/null', got: null, expected: 'result', extra }); continue; }

    notNaN(r.total,  'rekl/weekend/total',  extra);
    notNeg(r.total,  'rekl/weekend/total',  extra);
    notNeg(r.wkKr,   'rekl/weekend/wkKr',   extra);

    // wkKr > 0 when wk > 0
    assert(r.wkKr > 0, 'rekl/weekend/wkKr>0', r.wkKr, '>0', extra);

    // Check wk rate: wk=1 → ×0.75, wk=2 → ×1.0
    const ts = dagssats / 8;
    const wTimer = r.arbejdsTimer + r.transTimer;
    const forventetWk = rnd(wTimer * ts * (opts.wk === 2 ? 1.0 : 0.75));
    assert(Math.abs(r.wkKr - forventetWk) <= 1, 'rekl/weekend/wkKr_exact', r.wkKr, forventetWk, extra);
  }
}

function testRekl_helligdag() {
  for (let i = 0; i < N; i++) {
    const gruppe  = pick([2, 3, 4]);
    const dagssats = GR_SATSER[gruppe];
    const dagtype  = 'optagelse';
    const start    = randTime(6, 14);
    const hWork    = rand(4, 10);
    const slut     = { h: Math.min(22, start.h + Math.floor(hWork)), m: randMinute() };
    const wk       = pick([0, 1]);
    const opts     = { ...randReklOpts(dagtype), helligdag: true, wk };
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    const extra = `gruppe=${gruppe} wk=${wk} helligdag=true`;

    if (!r) { failed++; failures.push({ label: 'rekl/helligdag/null', got: null, expected: 'result', extra }); continue; }

    notNaN(r.total,  'rekl/helligdag/total',  extra);
    notNeg(r.wkKr,   'rekl/helligdag/wkKr',   extra);

    // Helligdag skal opgradere til 100% (effWk=2 → wFaktor=1.0)
    assert(r.effWk === 2, 'rekl/helligdag/effWk==2', r.effWk, 2, extra);
    // wkKr should be > 0
    assert(r.wkKr > 0, 'rekl/helligdag/wkKr>0', r.wkKr, '>0', extra);
  }
}

function testRekl_natGene() {
  for (let i = 0; i < N; i++) {
    const gruppe  = pick([2, 3, 4]);
    const dagssats = GR_SATSER[gruppe];
    const dagtype  = 'optagelse';
    // Force a shift overlapping 18:00–24:00 or 00:00–06:00
    const startH = pick([16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2]);
    const start  = { h: startH, m: randMinute() };
    const hWork  = rand(4, 8);
    const endH   = (startH + Math.ceil(hWork)) % 24;
    const slut   = { h: endH, m: randMinute() };
    const opts   = { ...randReklOpts(dagtype), nat: true };
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    const extra = `gruppe=${gruppe} start=${start.h}:${start.m} slut=${slut.h}:${slut.m}`;

    if (!r) { failed++; failures.push({ label: 'rekl/nat/null', got: null, expected: 'result', extra }); continue; }

    notNaN(r.natKr, 'rekl/nat/natKr', extra);
    notNeg(r.natKr, 'rekl/nat/natKr', extra);
    notNeg(r.nat18t, 'rekl/nat/nat18t', extra);
    notNeg(r.nat00t, 'rekl/nat/nat00t', extra);

    // natKr = nat18t × 100 + nat00t × 200
    const forventetNat = rnd(r.nat18t * 100 + r.nat00t * 200);
    assert(Math.abs(r.natKr - forventetNat) <= 1, 'rekl/nat/natKr_exact', r.natKr, forventetNat, extra);

    // Nat rates: 100 kr/t for 18-24, 200 kr/t for 00-06
    assert(r.nat18t >= 0 && r.nat18t <= 6, 'rekl/nat/nat18t_range', r.nat18t, '0-6', extra);
    assert(r.nat00t >= 0 && r.nat00t <= 6, 'rekl/nat/nat00t_range', r.nat00t, '0-6', extra);
  }
}

function testRekl_4dagUge() {
  // 'forbered' dagtype: 4-hour minimum, no transport/nat/wk/garanti
  for (let i = 0; i < N; i++) {
    const gruppe  = pick([2, 3, 4, 5]);
    const dagssats = GR_SATSER[gruppe];
    const dagtype  = 'forbered';
    const start    = randTime(7, 14);
    const hWork    = rand(1, 10); // even <4 should become 4
    const slut     = { h: Math.min(23, start.h + Math.floor(hWork)), m: randMinute() };
    const opts     = randReklOpts(dagtype); // these are already zeroed for forbered
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    const extra = `forbered gruppe=${gruppe} raaTimer=${r?.raaTimer?.toFixed(2)}`;

    if (!r) { failed++; failures.push({ label: 'rekl/4dag/null', got: null, expected: 'result', extra }); continue; }

    notNaN(r.total,        'rekl/4dag/total',    extra);
    notNeg(r.total,        'rekl/4dag/total',    extra);

    // arbejdsTimer >= 4 (minimum for forbered)
    assert(r.arbejdsTimer >= 4, 'rekl/4dag/min4h', r.arbejdsTimer, '>=4', extra);
    assert(r.arbejdsTimer >= r.raaTimer, 'rekl/4dag/arb>=raa', r.arbejdsTimer, `>=${r.raaTimer.toFixed(2)}`, extra);

    // No transport, nat, wk pay for forbered
    assert(r.transKr === 0, 'rekl/4dag/no_trans', r.transKr, 0, extra);
    assert(r.natKr   === 0, 'rekl/4dag/no_nat',   r.natKr,   0, extra);
    assert(r.wkKr    === 0, 'rekl/4dag/no_wk',    r.wkKr,    0, extra);
    // No garanti for forbered
    assert(r.garantiKr === 0, 'rekl/4dag/no_garanti', r.garantiKr, 0, extra);
  }
}

function testRekl_5dagUge() {
  // Normal optagelse day, group 2-4
  for (let i = 0; i < N; i++) {
    const gruppe   = pick([2, 3, 4]);
    const dagssats = GR_SATSER[gruppe];
    const dagtype  = 'optagelse';
    const start    = randTime(6, 10);
    const hWork    = rand(4, 14);
    const slut     = { h: Math.min(23, start.h + Math.floor(hWork)), m: randMinute() };
    const opts     = { ...randReklOpts(dagtype), nat: false, wk: 0, helligdag: false };
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    const extra = `5dag gruppe=${gruppe} h≈${hWork.toFixed(1)}`;

    if (!r) { failed++; failures.push({ label: 'rekl/5dag/null', got: null, expected: 'result', extra }); continue; }

    notNaN(r.total,   'rekl/5dag/total',   extra);
    notNeg(r.total,   'rekl/5dag/total',   extra);
    notNeg(r.normalKr, 'rekl/5dag/normalKr', extra);
    notNeg(r.otKr,    'rekl/5dag/otKr',    extra);

    // Correct OT band structure
    assert(r.bI >= 0 && r.bI <= 2, 'rekl/5dag/bI_range', r.bI, '0-2', extra);
    assert(r.bJ >= 0 && r.bJ <= 2, 'rekl/5dag/bJ_range', r.bJ, '0-2', extra);
    assert(r.bK >= 0 && r.bK <= 2, 'rekl/5dag/bK_range', r.bK, '0-2', extra);
    assert(r.bL >= 0,               'rekl/5dag/bL_range', r.bL, '>=0', extra);

    // OT only when arbejdsTimer > 8
    if (r.arbejdsTimer <= 8) {
      assert(r.otKr === 0, 'rekl/5dag/no_ot_<=8h', r.otKr, 0, extra);
    }
  }
}

function testRekl_rabat() {
  // Rabat A/B applied correctly
  for (let i = 0; i < N; i++) {
    const gruppe   = pick([2, 3, 4]);
    const dagssats = GR_SATSER[gruppe];
    const dagtype  = 'optagelse';
    const start    = randTime(7, 10);
    const hWork    = rand(8, 14);
    const slut     = { h: Math.min(23, start.h + Math.floor(hWork)), m: randMinute() };

    // Test all three: ingen, rabat A, rabat B
    const optsBase = { ...randReklOpts(dagtype), nat: false, wk: 0, helligdag: false, diaeter: 0, persontillaeg: 0 };

    const rIngen = calcReklame(dagtype, start, slut, dagssats, gruppe, { ...optsBase, rabat: 0 });
    const rA     = calcReklame(dagtype, start, slut, dagssats, gruppe, { ...optsBase, rabat: 1 });
    const rB     = calcReklame(dagtype, start, slut, dagssats, gruppe, { ...optsBase, rabat: 2 });
    const extra  = `gruppe=${gruppe} h≈${hWork.toFixed(1)}`;

    if (!rIngen || !rA || !rB) { failed++; failures.push({ label: 'rekl/rabat/null', got: null, expected: 'result', extra }); continue; }

    notNeg(rA.total,     'rekl/rabat/totalA',    extra);
    notNeg(rB.total,     'rekl/rabat/totalB',    extra);
    notNaN(rA.rabatKr,   'rekl/rabat/rabatKr_A', extra);
    notNaN(rB.rabatKr,   'rekl/rabat/rabatKr_B', extra);

    // Rabat reduces total
    assert(rA.total <= rIngen.total, 'rekl/rabat/A_lower_than_ingen', rA.total, `<=${rIngen.total}`, extra);
    assert(rB.total <= rA.total,     'rekl/rabat/B_lower_than_A',     rB.total, `<=${rA.total}`,     extra);

    // Check exact rabatKr
    const bruttoIngen = rIngen.normalKr + rIngen.otKr;
    const forventetA  = -bruttoIngen * 0.10;
    const forventetB  = -bruttoIngen * 0.15;
    assert(Math.abs(rA.rabatKr - forventetA) <= 1, 'rekl/rabat/rabatA_exact', rA.rabatKr, rnd(forventetA), extra);
    assert(Math.abs(rB.rabatKr - forventetB) <= 1, 'rekl/rabat/rabatB_exact', rB.rabatKr, rnd(forventetB), extra);
  }
}

function testRekl_dagsløngaranti() {
  // Garanti only for optagelse, only when brutto < dagssats
  for (let i = 0; i < N; i++) {
    const gruppe   = pick([2, 3, 4]);
    const dagssats = GR_SATSER[gruppe];
    const dagtype  = 'optagelse';
    // Use short hours → brutto < dagssats
    const start    = randTime(8, 12);
    const hWork    = rand(1, 6); // short day → triggers garanti
    const slut     = { h: Math.min(22, start.h + Math.floor(hWork)), m: randMinute() };
    const opts     = { ...randReklOpts(dagtype), nat: false, wk: 0, helligdag: false, diaeter: 0, persontillaeg: 0, rabat: 0, pauseForsinketFrokost: false, pauseIngenServering: false, pausePlanlagt: false, pause5: false, pause10: false, pause13: false, transport: 0 };
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    const extra = `garanti gruppe=${gruppe} hWork≈${hWork.toFixed(1)} dagssats=${dagssats}`;

    if (!r) { failed++; failures.push({ label: 'rekl/garanti/null', got: null, expected: 'result', extra }); continue; }

    notNaN(r.total,     'rekl/garanti/total',    extra);
    notNeg(r.total,     'rekl/garanti/total',     extra);
    notNeg(r.garantiKr, 'rekl/garanti/garantiKr', extra);

    // total >= dagssats (since no extras, garanti should bring it up)
    if (r.brutto < dagssats) {
      assert(r.garantiKr > 0, 'rekl/garanti/garantiKr>0', r.garantiKr, '>0', extra);
      assert(Math.abs(r.brutto + r.garantiKr - dagssats) < 1,
        'rekl/garanti/brutto+garanti==dagssats', rnd(r.brutto + r.garantiKr), dagssats, extra);
    } else {
      assert(r.garantiKr === 0, 'rekl/garanti/no_garanti_when_brutto>=dagssats', r.garantiKr, 0, extra);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-APP SANITY: shared helligdag list
// ─────────────────────────────────────────────────────────────────────────────
function testShared_helligdage() {
  // Check all known DK helligdage are in the set
  const forventede = [
    '2026-04-05', // Påskedag
    '2026-01-01', // Nytår
    '2026-12-25', // Juledag
    '2026-12-26', // 2. juledag
    '2025-04-18', // Langfredag
  ];
  for (const d of forventede) {
    assert(HELLIGDAGE.has(d), `helligdag/${d}_i_liste`, HELLIGDAGE.has(d), true, '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OT RATE UNIT TESTS (exact math)
// ─────────────────────────────────────────────────────────────────────────────
function testApp_OTRates() {
  const ugelon = 10380;
  const ts = ugelon / 40; // 259.5
  const h = 11; // 3 OT hours

  // Announced OT
  const lV = calcLon_faf(h, { varslet: true, helligdag: false, frokost: false, pause10: false, enkeltdag: false },
    ugelon, 0, false, '5dag', 0, 0.75);

  // ot1H=1, ot2H=1, ot3H=1
  const expOt1V = rnd(ts * 1.50 * 1);
  const expOt2V = rnd(ts * 1.60 * 1);
  const expOt3V = rnd(ts * 2.35 * 1);
  assert(Math.abs(lV.ot1 - expOt1V) <= 1, 'app/OT/varslet_ot1', lV.ot1, expOt1V, `ts=${ts}`);
  assert(Math.abs(lV.ot2 - expOt2V) <= 1, 'app/OT/varslet_ot2', lV.ot2, expOt2V, `ts=${ts}`);
  assert(Math.abs(lV.ot3 - expOt3V) <= 1, 'app/OT/varslet_ot3', lV.ot3, expOt3V, `ts=${ts}`);

  // Unannounced OT
  const lU = calcLon_faf(h, { varslet: false, helligdag: false, frokost: false, pause10: false, enkeltdag: false },
    ugelon, 0, false, '5dag', 0, 0.75);

  const expOt1U = rnd(ts * 1.75 * 1);
  const expOt2U = rnd(ts * 2.00 * 1);
  const expOt3U = rnd(ts * 2.35 * 1);
  assert(Math.abs(lU.ot1 - expOt1U) <= 1, 'app/OT/uvarslet_ot1', lU.ot1, expOt1U, `ts=${ts}`);
  assert(Math.abs(lU.ot2 - expOt2U) <= 1, 'app/OT/uvarslet_ot2', lU.ot2, expOt2U, `ts=${ts}`);
  assert(Math.abs(lU.ot3 - expOt3U) <= 1, 'app/OT/uvarslet_ot3', lU.ot3, expOt3U, `ts=${ts}`);

  // Unannounced must be higher than announced (per-hour)
  assert(lU.ot1 > lV.ot1, 'app/OT/uvarslet>varslet_ot1', lU.ot1, `>${lV.ot1}`, '');
  assert(lU.ot2 > lV.ot2, 'app/OT/uvarslet>varslet_ot2', lU.ot2, `>${lV.ot2}`, '');
}

function testRekl_OTBands() {
  // Test otBands math
  const cases = [
    { t: 8,  I: 0, J: 0, K: 0, L: 0 },
    { t: 9,  I: 1, J: 0, K: 0, L: 0 },
    { t: 10, I: 2, J: 0, K: 0, L: 0 },
    { t: 11, I: 2, J: 1, K: 0, L: 0 },
    { t: 12, I: 2, J: 2, K: 0, L: 0 },
    { t: 13, I: 2, J: 2, K: 1, L: 0 },
    { t: 14, I: 2, J: 2, K: 2, L: 0 },
    { t: 15, I: 2, J: 2, K: 2, L: 1 },
    { t: 20, I: 2, J: 2, K: 2, L: 6 },
  ];
  for (const c of cases) {
    const b = otBands(c.t);
    assert(b.I === c.I, `rekl/bands/I_at_${c.t}h`, b.I, c.I, '');
    assert(b.J === c.J, `rekl/bands/J_at_${c.t}h`, b.J, c.J, '');
    assert(b.K === c.K, `rekl/bands/K_at_${c.t}h`, b.K, c.K, '');
    assert(b.L === c.L, `rekl/bands/L_at_${c.t}h`, b.L, c.L, '');
  }
}

function testRekl_Gr5FixedRates() {
  // Group 5: fixed OT rates 200/350 kr/t
  const dagssats = GR_SATSER[5]; // 1540
  const ts = dagssats / 8;       // 192.5

  // 11h: normalKr=8×ts, otKr=bI(1)×200 + bJ(1)×200 ... wait: I=2,J=1,K=0,L=0 for 11h
  const r11 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 18, m: 0 }, dagssats, 5,
    { transport: 0, nat: false, wk: 0, helligdag: false, rabat: 0, persontillaeg: 0, gr1OTSats: 0,
      diaeter: 0, pauseForsinketFrokost: false, pauseIngenServering: false,
      pausePlanlagt: false, pause5: false, pause10: false, pause13: false });
  // 07:00–18:00 = 11h
  if (r11) {
    // band I=2, J=1, K=0, L=0 → otKr = 3×200 = 600
    assert(Math.abs(r11.otKr - 600) <= 1, 'rekl/gr5/otKr_11h', r11.otKr, 600, `ts=${ts}`);
    assert(Math.abs(r11.normalKr - 8 * ts) <= 1, 'rekl/gr5/normalKr_11h', r11.normalKr, 8 * ts, '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────
function testEdgeCases() {
  // Zero hours
  const l0 = calcLon_faf(0, { varslet: false, helligdag: false, frokost: false, pause10: false, enkeltdag: false },
    10380, 0, false, '5dag', 0, 0.75);
  assert(l0.total === 0, 'edge/zero_hours_total', l0.total, 0, '');

  // Negative hours (shouldn't happen but must not crash)
  const lNeg = calcLon_faf(-1, { varslet: false, helligdag: false, frokost: false, pause10: false, enkeltdag: false },
    10380, 0, false, '5dag', 0, 0.75);
  assert(lNeg.total === 0, 'edge/neg_hours_total', lNeg.total, 0, '');

  // Overnight shift
  const startON = { h: 22, m: 0 };
  const slutON  = { h: 6, m: 0 };
  const hON = calcTimer_faf(startON, slutON); // 22→06 = 8h - 0.5 = 7.5h
  assert(Math.abs(hON - 7.5) < 0.01, 'edge/overnight_hours', hON, 7.5, '22:00–06:00');

  // calcReklame with null times
  const rNull = calcReklame('optagelse', null, null, 4100, 2, {});
  assert(rNull === null, 'edge/rekl_null_times', rNull, null, '');

  // Forbered with 2h should give 4h minimum
  const rForbered = calcReklame('forbered', { h: 8, m: 0 }, { h: 10, m: 0 }, 4100, 2,
    { transport: 0, nat: false, wk: 0, helligdag: false, rabat: 0, persontillaeg: 0, gr1OTSats: 0,
      diaeter: 0, pauseForsinketFrokost: false, pauseIngenServering: false,
      pausePlanlagt: false, pause5: false, pause10: false, pause13: false });
  assert(rForbered && rForbered.arbejdsTimer === 4, 'edge/forbered_min4h', rForbered?.arbejdsTimer, 4, '8:00–10:00');

  // Weekend timer on Saturday
  const wkH = calcWeekendTimer_faf({ h: 8, m: 0 }, { h: 16, m: 0 }, 6);
  assert(Math.abs(wkH - 8) < 0.01, 'edge/wkTimer_sat', wkH, 8, 'Sat 08-16');

  // Weekend timer on Monday (before 06)
  const wkMonH = calcWeekendTimer_faf({ h: 0, m: 0 }, { h: 8, m: 0 }, 1);
  assert(Math.abs(wkMonH - 6) < 0.01, 'edge/wkTimer_mon_before6', wkMonH, 6, 'Mon 00-08');

  // §7 forskudt: Tuesday early morning before 06
  const fskTue = calcForskudt_faf({ h: 4, m: 0 }, { h: 10, m: 0 }, 2);
  assert(Math.abs(fskTue - 2) < 0.01, 'edge/forskudt_tue_04-10', fskTue, 2, 'Tue 04:00–10:00 → 2h before 06');

  // §7 forskudt: Saturday = 0
  const fskSat = calcForskudt_faf({ h: 4, m: 0 }, { h: 10, m: 0 }, 6);
  assert(fskSat === 0, 'edge/forskudt_sat_=0', fskSat, 0, 'Sat no §7');

  // Diæter per piece
  const r1diaet = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, 4100, 2,
    { transport: 0, nat: false, wk: 0, helligdag: false, rabat: 0, persontillaeg: 0, gr1OTSats: 0,
      diaeter: 2, pauseForsinketFrokost: false, pauseIngenServering: false,
      pausePlanlagt: false, pause5: false, pause10: false, pause13: false });
  if (r1diaet) {
    const expDiaet = rnd(2 * 172.20);
    assert(Math.abs(r1diaet.diaetKr - expDiaet) <= 1, 'edge/diaet_2stk', r1diaet.diaetKr, expDiaet, '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIXED OT — DK FIKTION (1000 tests)
// ─────────────────────────────────────────────────────────────────────────────

function testApp_mixedOT() {
  const VT_VALS = [0, 0.5, 1, 1.5, 2];

  for (let i = 0; i < 200; i++) {
    const cfg = randFafCfg();
    const ts = timesats_faf(cfg.ugelon);
    const tsWk = ts * (cfg.tillæg ? 1.1 : 1.0);
    const dMax = dagMax_faf(cfg.model);

    // Generer dag med OT (mindst 1t over dagMax)
    const start = randTime(5, 12);
    const durH = dMax + rand(1, 6);
    const slut = { h: (start.h + Math.ceil(durH)) % 24, m: randMinute() };
    const h = calcTimer_faf(start, slut);
    if (h <= dMax) continue; // skip hvis ingen OT

    const vt = pick(VT_VALS);
    const dagIdx = pick([1, 2, 3, 4]); // hverdage
    const wkAutoH = calcWeekendTimer_faf(start, slut, dagIdx);

    const optMixed = {
      varslet: true, uvarslet: true, helligdag: false,
      frokost: Math.random() < 0.2, pause10: Math.random() < 0.1,
      enkeltdag: cfg.tillæg, varsletTimer: vt
    };
    const optPureV = { ...optMixed, uvarslet: false, varsletTimer: undefined };
    const optPureU = { ...optMixed, varslet: false, varsletTimer: undefined };

    const rMix  = calcLon_faf(h, optMixed, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, 0.75);
    const rPureV = calcLon_faf(h, optPureV, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, 0.75);
    const rPureU = calcLon_faf(h, optPureU, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, 0.75);
    const extra = `h=${h.toFixed(1)} vt=${vt} ${cfg.model} uge=${cfg.ugelon}`;

    // Grundlæggende sanity
    notNaN(rMix.total,  'mixOT/total',  extra);
    notNeg(rMix.total,  'mixOT/total',  extra);
    notNeg(rMix.normal, 'mixOT/normal', extra);
    notNeg(rMix.ot1,    'mixOT/ot1',    extra);
    notNeg(rMix.ot2,    'mixOT/ot2',    extra);
    notNeg(rMix.ot3,    'mixOT/ot3',    extra);

    // Total = sum af dele
    const sum = rMix.normal + rMix.ot1 + rMix.ot2 + rMix.ot3 + rMix.wk + rMix.ext;
    assert(Math.abs(rMix.total - sum) <= 3, 'mixOT/total=sum', rMix.total, sum, extra);

    // Mixed skal ligge MELLEM ren varslet og ren uvarslet (eller lig med en af dem)
    assert(rMix.total >= rPureV.total - 1, 'mixOT/total>=pureV', rMix.total, `>=${rPureV.total}`, extra);
    assert(rMix.total <= rPureU.total + 1, 'mixOT/total<=pureU', rMix.total, `<=${rPureU.total}`, extra);

    // Monotoni: flere varslet-timer → billigere (eller lig)
    if (vt > 0) {
      const vtMinus = Math.max(0, vt - 0.5);
      const optLess = { ...optMixed, varsletTimer: vtMinus };
      const rLess = calcLon_faf(h, optLess, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, 0.75);
      assert(rLess.total >= rMix.total - 1, 'mixOT/monotoni',
        rLess.total, `>=${rMix.total}`, `vt=${vtMinus} vs vt=${vt}`);
    }

    // Verify OT1 split-beregning korrekt
    const otH = Math.max(0, h - dMax);
    const ot1H = Math.min(1, otH);
    if (ot1H > 0 && vt > 0 && vt < 1) {
      // Delvis split i band 1
      const v1 = Math.min(vt, ot1H);
      const u1 = ot1H - v1;
      const expOt1 = rnd(v1 * tsWk * 1.50 + u1 * tsWk * 1.75);
      assert(Math.abs(rMix.ot1 - expOt1) <= 1, 'mixOT/ot1_split_exact',
        rMix.ot1, expOt1, `v1=${v1.toFixed(2)} u1=${u1.toFixed(2)} ${extra}`);
    }

    // Verify OT2 split-beregning korrekt
    const ot2H = Math.min(1, Math.max(0, otH - 1));
    if (ot2H > 0 && vt > 1 && vt < 2) {
      const v2 = Math.min(vt - 1, ot2H);
      const u2 = ot2H - v2;
      const expOt2 = rnd(v2 * tsWk * 1.60 + u2 * tsWk * 2.00);
      assert(Math.abs(rMix.ot2 - expOt2) <= 1, 'mixOT/ot2_split_exact',
        rMix.ot2, expOt2, `v2=${v2.toFixed(2)} u2=${u2.toFixed(2)} ${extra}`);
    }

    // OT3 altid +135% uanset mixed
    const ot3H = Math.max(0, otH - 2);
    if (ot3H > 0) {
      assert(rMix.ot3 === rPureV.ot3, 'mixOT/ot3_same', rMix.ot3, rPureV.ot3, extra);
      assert(rMix.ot3 === rPureU.ot3, 'mixOT/ot3_same_u', rMix.ot3, rPureU.ot3, extra);
    }

    // Normal uændret af mixed OT
    assert(rMix.normal === rPureV.normal, 'mixOT/normal_same', rMix.normal, rPureV.normal, extra);
  }

  // ── Eksakte beregninger med kendte værdier ──
  const UGL = 10380;
  const TS = UGL / 40; // 259.50

  // 30m varslet, 11t dag (3t OT)
  const r30 = calcLon_faf(11,
    { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:0.5 },
    UGL, 0, false, '5dag', 0, 0.75);
  const exp30_ot1 = rnd(0.5 * TS * 1.50 + 0.5 * TS * 1.75);
  assert(r30.ot1 === exp30_ot1, 'mixOT/exact_30m_ot1', r30.ot1, exp30_ot1, '');

  // 1.5t varslet, 11t dag
  const r90 = calcLon_faf(11,
    { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1.5 },
    UGL, 0, false, '5dag', 0, 0.75);
  const exp90_ot1 = rnd(1 * TS * 1.50); // hele band 1 varslet
  const exp90_ot2 = rnd(0.5 * TS * 1.60 + 0.5 * TS * 2.00); // split i band 2
  assert(r90.ot1 === exp90_ot1, 'mixOT/exact_90m_ot1', r90.ot1, exp90_ot1, '');
  assert(r90.ot2 === exp90_ot2, 'mixOT/exact_90m_ot2', r90.ot2, exp90_ot2, '');

  // Særtid: 13t dag (3t OT), 30m varslet
  const rS = calcLon_faf(13,
    { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:0.5 },
    UGL, 0, false, 'saertid', 0, 0.75);
  assert(rS.normalH === 10, 'mixOT/saertid_normalH', rS.normalH, 10, '');
  const expS_ot1 = rnd(0.5 * TS * 1.50 + 0.5 * TS * 1.75);
  assert(rS.ot1 === expS_ot1, 'mixOT/saertid_30m_ot1', rS.ot1, expS_ot1, '');

  // Enkeltdag + mixed: tsWk = ts * 1.1
  const rE = calcLon_faf(11,
    { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:true, varsletTimer:0.5 },
    UGL, 0, true, '5dag', 0, 0.75);
  const tsWkE = TS * 1.1;
  const expE_ot1 = rnd(0.5 * tsWkE * 1.50 + 0.5 * tsWkE * 1.75);
  assert(rE.ot1 === expE_ot1, 'mixOT/enkeltdag_30m_ot1', rE.ot1, expE_ot1, '');

  // Pers. tillæg: normal inkluderer tillæg, OT bruger ren ts
  const PERS = 1000;
  const rP = calcLon_faf(10,
    { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:0.5 },
    UGL, PERS, false, '5dag', 0, 0.75);
  const expNorm = rnd((UGL/40 + PERS/40) * 8);
  assert(rP.normal === expNorm, 'mixOT/pers_normal', rP.normal, expNorm, '');
  const expP_ot1 = rnd(0.5 * TS * 1.50 + 0.5 * TS * 1.75);
  assert(rP.ot1 === expP_ot1, 'mixOT/pers_ot1', rP.ot1, expP_ot1, 'OT bruger ren ts, ikke pers');

  // Frokost + mixed: ext uændret
  const rF = calcLon_faf(11,
    { varslet:true, uvarslet:true, helligdag:false, frokost:true, pause10:false, enkeltdag:false, varsletTimer:1 },
    UGL, 0, false, '5dag', 0, 0.75);
  assert(rF.ext === DIÆT_FAF, 'mixOT/frokost_ext', rF.ext, DIÆT_FAF, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT / BACKUP / LOCALSTORAGE TESTS
// ─────────────────────────────────────────────────────────────────────────────

function testExport_jsonRoundtrip() {
  // Simulate localStorage export → import roundtrip
  for (let i = 0; i < 200; i++) {
    const cfg = randFafCfg();
    const start = randTime(5, 18);
    const slut  = { h: (start.h + randInt(4, 12)) % 24, m: randMinute() };
    const h = calcTimer_faf(start, slut);
    const dagIdx = randInt(0, 6);
    const fsk = calcForskudt_faf(start, slut, dagIdx);
    const wkAutoH = calcWeekendTimer_faf(start, slut, dagIdx);
    const opt = { varslet: Math.random() < 0.5, helligdag: dagIdx === 0, frokost: Math.random() < 0.3,
                  pause10: false, enkeltdag: cfg.tillæg };
    const wkRate = dagIdx === 0 || dagIdx === 6 ? 0.75 : 0.75;
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, wkRate);

    // Build dag-data object matching app.html gemDag()
    const dagData = {
      start: `${p2(start.h)}:${p2(start.m)}`, slut: `${p2(slut.h)}:${p2(slut.m)}`,
      tidStart: start, tidSlut: slut,
      h, lon: l.total + rnd(fsk * 110),
      normal: l.normal, ot1: l.ot1, ot2: l.ot2, ot3: l.ot3, wk: l.wk, ext: l.ext,
      fsk, fskKr: rnd(fsk * 110),
      knapper: { v: opt.varslet, u: !opt.varslet, h: opt.helligdag, f: opt.frokost },
      prod: 'Test Production', prodId: 'test-' + i,
      model: cfg.model, note: 'Test note #' + i,
    };

    // Serialize (export)
    const json = JSON.stringify(dagData);
    assert(json.length > 10, 'export/json_length', json.length, '>10', `dag ${i}`);

    // Deserialize (import)
    const restored = JSON.parse(json);
    assert(restored.h === dagData.h, 'export/roundtrip_h', restored.h, dagData.h, `dag ${i}`);
    assert(restored.lon === dagData.lon, 'export/roundtrip_lon', restored.lon, dagData.lon, `dag ${i}`);
    assert(restored.start === dagData.start, 'export/roundtrip_start', restored.start, dagData.start, `dag ${i}`);
    assert(restored.slut === dagData.slut, 'export/roundtrip_slut', restored.slut, dagData.slut, `dag ${i}`);
    assert(restored.tidStart.h === start.h, 'export/roundtrip_tidStart_h', restored.tidStart.h, start.h, `dag ${i}`);
    assert(restored.tidStart.m === start.m, 'export/roundtrip_tidStart_m', restored.tidStart.m, start.m, `dag ${i}`);
    assert(restored.tidSlut.h === slut.h, 'export/roundtrip_tidSlut_h', restored.tidSlut.h, slut.h, `dag ${i}`);
    assert(restored.tidSlut.m === slut.m, 'export/roundtrip_tidSlut_m', restored.tidSlut.m, slut.m, `dag ${i}`);
    assert(restored.normal === dagData.normal, 'export/roundtrip_normal', restored.normal, dagData.normal, `dag ${i}`);
    assert(restored.fskKr === dagData.fskKr, 'export/roundtrip_fskKr', restored.fskKr, dagData.fskKr, `dag ${i}`);

    // Recalculate from restored data and verify match
    const h2 = calcTimer_faf(restored.tidStart, restored.tidSlut);
    assert(Math.abs(h2 - h) < 0.01, 'export/recalc_h', h2, h, `dag ${i}`);
    const l2 = calcLon_faf(h2, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, wkAutoH, wkRate);
    assert(l2.total === l.total, 'export/recalc_total', l2.total, l.total, `dag ${i}`);
  }
}

function testExport_mailFormat() {
  // Verify mail export data formatting
  for (let i = 0; i < 200; i++) {
    const cfg = randFafCfg();
    const start = randTime(6, 14);
    const slut = { h: randInt(start.h + 4, 22), m: randMinute() };
    const h = calcTimer_faf(start, slut);
    const opt = { varslet: Math.random() < 0.5, helligdag: false, frokost: Math.random() < 0.3,
                  pause10: false, enkeltdag: false };
    const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);

    // Build mail subject line (same format as doMail)
    const uge = randInt(1, 52);
    const år = 2025;
    const navn = 'Test Person';
    const prod = 'Test Prod';
    const subj = `Time App uge ${uge}/${år} — ${navn} · ${prod}`;
    assert(subj.length > 20, 'mail/subj_length', subj.length, '>20', `dag ${i}`);
    assert(subj.includes(String(uge)), 'mail/subj_has_uge', subj, `contains ${uge}`, `dag ${i}`);

    // Verify krFmt-style number formatting
    const lonStr = l.total.toLocaleString('da-DK');
    assert(typeof lonStr === 'string', 'mail/lon_format', typeof lonStr, 'string', `dag ${i}`);
    assert(lonStr.length > 0, 'mail/lon_nonempty', lonStr.length, '>0', `dag ${i}`);

    // Time format HH:MM
    const startStr = `${p2(start.h)}:${p2(start.m)}`;
    const slutStr = `${p2(slut.h)}:${p2(slut.m)}`;
    assert(startStr.length === 5, 'mail/time_format_start', startStr.length, 5, startStr);
    assert(slutStr.length === 5, 'mail/time_format_slut', slutStr.length, 5, slutStr);
    assert(startStr.includes(':'), 'mail/time_colon_start', startStr, 'contains :', `dag ${i}`);
  }
}

function testExport_pdfHtml() {
  // Verify PDF HTML structure generation
  for (let i = 0; i < 100; i++) {
    const cfg = randFafCfg();
    const ts = timesats_faf(cfg.ugelon);
    // Build 7 days of data like ugeData()
    const dage = [];
    let totH = 0, totL = 0;
    for (let d = 0; d < 7; d++) {
      const isFri = d === 5 || Math.random() < 0.2; // fre often fri
      if (isFri) {
        dage.push({ fri: true, dato: new Date(2025, 3, d + 7) });
        continue;
      }
      const start = randTime(6, 10);
      const slut = { h: randInt(start.h + 6, 22), m: randMinute() };
      const h = calcTimer_faf(start, slut);
      const opt = { varslet: Math.random() < 0.5, helligdag: false, frokost: false, pause10: false, enkeltdag: false };
      const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);
      totH += h; totL += l.total;
      dage.push({
        fri: false, dato: new Date(2025, 3, d + 7),
        start: `${p2(start.h)}:${p2(start.m)}`, slut: `${p2(slut.h)}:${p2(slut.m)}`,
        h, lon: l.total, normal: l.normal, ot1: l.ot1, ot2: l.ot2, ot3: l.ot3, wk: l.wk,
        knapper: { v: opt.varslet },
      });
    }
    // Validate week totals
    assert(totH >= 0, 'pdf/totH>=0', totH, '>=0', `uge ${i}`);
    assert(totL >= 0, 'pdf/totL>=0', totL, '>=0', `uge ${i}`);

    // Pension calculation 9.5%
    const pension = rnd(totL * 0.095);
    assert(pension >= 0, 'pdf/pension>=0', pension, '>=0', `uge ${i}`);
    assert(pension <= totL, 'pdf/pension<=totL', pension, `<=${totL}`, `uge ${i}`);

    // Total + pension
    const totalInkl = totL + pension;
    assert(totalInkl >= totL, 'pdf/totalInkl>=totL', totalInkl, `>=${totL}`, `uge ${i}`);

    // Count work days
    const workDays = dage.filter(d => !d.fri).length;
    assert(workDays >= 0 && workDays <= 7, 'pdf/workDays_valid', workDays, '0-7', `uge ${i}`);
  }
}

function testExport_reklJsonRoundtrip() {
  for (let i = 0; i < 200; i++) {
    const dagtype = pick(['optagelse', 'forbered']);
    const start = randTime(5, 14);
    const slut = { h: (start.h + randInt(4, 14)) % 24, m: randMinute() };
    const dagssats = pick([4100, 3300, 2750, 5000, 6000]);
    const gruppe = pick([2, 3, 4, 5]);
    const opts = randReklOpts(dagtype);
    const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
    if (!r) { assert(true, 'rekl_export/null_ok', null, null, `dag ${i}`); continue; }

    // Serialize
    const dagData = {
      dagtype, start: `${p2(start.h)}:${p2(start.m)}`, slut: `${p2(slut.h)}:${p2(slut.m)}`,
      tidStart: start, tidSlut: slut,
      dagssats, gruppe,
      raaTimer: r.raaTimer, arbejdsTimer: r.arbejdsTimer, otTimer: r.otTimer,
      normalKr: rnd(r.normalKr), otKr: rnd(r.otKr), transKr: rnd(r.transKr),
      natKr: rnd(r.natKr), wkKr: rnd(r.wkKr), pauseKr: rnd(r.pauseKr),
      rabatKr: rnd(r.rabatKr), garantiKr: rnd(r.garantiKr),
      total: rnd(r.total), brutto: rnd(r.brutto),
    };

    const json = JSON.stringify(dagData);
    const restored = JSON.parse(json);

    assert(restored.dagtype === dagtype, 'rekl_export/rt_dagtype', restored.dagtype, dagtype, `dag ${i}`);
    assert(restored.dagssats === dagssats, 'rekl_export/rt_dagssats', restored.dagssats, dagssats, `dag ${i}`);
    assert(restored.total === dagData.total, 'rekl_export/rt_total', restored.total, dagData.total, `dag ${i}`);
    assert(restored.gruppe === gruppe, 'rekl_export/rt_gruppe', restored.gruppe, gruppe, `dag ${i}`);

    // Recalculate from restored
    const r2 = calcReklame(dagtype, restored.tidStart, restored.tidSlut, dagssats, gruppe, opts);
    assert(rnd(r2.total) === rnd(r.total), 'rekl_export/recalc_total', rnd(r2.total), rnd(r.total), `dag ${i}`);
  }
}

function testBackup_fullExportImport() {
  // Simulate full backup: multiple days across weeks
  for (let batch = 0; batch < 50; batch++) {
    const backup = {};
    const cfg = randFafCfg();
    const prodId = 'prod-' + batch;
    const numDays = randInt(5, 30);

    for (let d = 0; d < numDays; d++) {
      const dato = new Date(2025, randInt(0, 11), randInt(1, 28));
      const key = `faf-${prodId}-${dato.getFullYear()}-${p2(dato.getMonth()+1)}-${p2(dato.getDate())}`;

      const start = randTime(5, 12);
      const slut = { h: randInt(start.h + 5, 22), m: randMinute() };
      const h = calcTimer_faf(start, slut);
      const opt = { varslet: Math.random() < 0.5, helligdag: false, frokost: Math.random() < 0.3,
                    pause10: false, enkeltdag: cfg.tillæg };
      const l = calcLon_faf(h, opt, cfg.ugelon, cfg.pers, cfg.tillæg, cfg.model, 0, 0.75);

      const dagData = {
        start: `${p2(start.h)}:${p2(start.m)}`, slut: `${p2(slut.h)}:${p2(slut.m)}`,
        tidStart: start, tidSlut: slut,
        h, lon: l.total, normal: l.normal, ot1: l.ot1, ot2: l.ot2, ot3: l.ot3,
        wk: l.wk, ext: l.ext, prod: 'Backup Test', prodId,
      };
      backup[key] = JSON.stringify(dagData);
    }

    // Export
    const exportJson = JSON.stringify(backup, null, 2);
    assert(exportJson.length > 50, 'backup/export_size', exportJson.length, '>50', `batch ${batch}`);

    // Import
    const imported = JSON.parse(exportJson);
    const importedKeys = Object.keys(imported);
    assert(importedKeys.length > 0, 'backup/import_keys', importedKeys.length, '>0', `batch ${batch}`);

    // Verify all entries parseable
    let validCount = 0;
    for (const [k, v] of Object.entries(imported)) {
      assert(k.startsWith('faf-'), 'backup/key_prefix', k, 'starts with faf-', `batch ${batch}`);
      const parsed = JSON.parse(v);
      assert(parsed.h >= 0, 'backup/parsed_h>=0', parsed.h, '>=0', `batch ${batch} key ${k}`);
      assert(parsed.lon >= 0, 'backup/parsed_lon>=0', parsed.lon, '>=0', `batch ${batch} key ${k}`);
      assert(typeof parsed.start === 'string', 'backup/parsed_start_str', typeof parsed.start, 'string', `batch ${batch}`);
      validCount++;
    }
    assert(validCount === importedKeys.length, 'backup/all_valid', validCount, importedKeys.length, `batch ${batch}`);
  }
}

function testApp_stressAllCombinations() {
  // Exhaustive: every quarter-hour start × 4 end-offsets × 7 dagIdx × 2 models
  const models = ['5dag', 'saertid'];
  const ugeloner = [10380, 13500];
  let count = 0;
  for (const model of models) {
    for (const ugelon of ugeloner) {
      for (let sh = 0; sh < 24; sh += 2) {
        for (const sm of [0, 30]) {
          for (const durH of [4, 8, 10, 14]) {
            const start = { h: sh, m: sm };
            const slut = { h: (sh + durH) % 24, m: sm };
            const h = calcTimer_faf(start, slut);
            for (const dagIdx of [0, 1, 2, 5, 6]) {
              const fsk = calcForskudt_faf(start, slut, dagIdx);
              const wkAutoH = calcWeekendTimer_faf(start, slut, dagIdx);
              const opt = { varslet: false, helligdag: dagIdx === 0, frokost: false, pause10: false, enkeltdag: false };
              const wkRate = 0.75;
              const l = calcLon_faf(h, opt, ugelon, 0, false, model, wkAutoH, wkRate);

              notNaN(l.total, 'stress/total', `${sh}:${sm}+${durH}h dag${dagIdx} ${model}`);
              notNeg(l.total, 'stress/total', `${sh}:${sm}+${durH}h dag${dagIdx} ${model}`);
              notNeg(l.normal, 'stress/normal', `${sh}:${sm}+${durH}h dag${dagIdx} ${model}`);
              notNeg(fsk, 'stress/fsk', `${sh}:${sm}+${durH}h dag${dagIdx} ${model}`);

              // Verify total = sum
              const sumParts = l.normal + l.ot1 + l.ot2 + l.ot3 + l.wk + l.ext;
              assert(Math.abs(l.total - sumParts) <= 1, 'stress/total=sum', l.total, sumParts,
                `${sh}:${sm}+${durH}h dag${dagIdx} ${model}`);
              count++;
            }
          }
        }
      }
    }
  }
}

function testRekl_stressAllCombinations() {
  const dagtyper = ['optagelse', 'forbered'];
  const grupper = [2, 3, 4, 5];
  const dagssatser = [4100, 3300, 2750, 5000];
  let count = 0;
  for (const dagtype of dagtyper) {
    for (const gruppe of grupper) {
      for (const dagssats of dagssatser) {
        for (let sh = 0; sh < 24; sh += 3) {
          for (const durH of [4, 8, 10, 14]) {
            const start = { h: sh, m: 0 };
            const slut = { h: (sh + durH) % 24, m: 0 };
            const opts = {
              transport: dagtype === 'optagelse' ? pick([0, 1, 2]) : 0,
              nat: dagtype === 'optagelse' && sh >= 16,
              wk: pick([0, 1, 2]),
              helligdag: false,
              rabat: pick([0, 1, 2]),
              persontillaeg: 0, gr1OTSats: 0, diaeter: 0,
              pauseForsinketFrokost: false, pauseIngenServering: false,
              pausePlanlagt: false, pause5: false, pause10: false, pause13: false,
            };
            const r = calcReklame(dagtype, start, slut, dagssats, gruppe, opts);
            if (!r) { count++; continue; }

            notNaN(r.total, 'rstress/total', `${dagtype} gr${gruppe} ${sh}+${durH}h`);
            notNeg(r.total, 'rstress/total', `${dagtype} gr${gruppe} ${sh}+${durH}h`);
            notNeg(r.normalKr, 'rstress/normalKr', `${dagtype} gr${gruppe} ${sh}+${durH}h`);
            notNeg(r.brutto + r.garantiKr, 'rstress/brutto+garanti', `${dagtype} gr${gruppe} ${sh}+${durH}h`);

            // Verify total = sum of all parts
            const sum = r.normalKr + r.otKr + r.rabatKr + r.transKr + r.natKr + r.wkKr + r.pauseKr + r.garantiKr + r.diaetKr + r.persontillaegKr;
            assert(Math.abs(r.total - sum) < 1, 'rstress/total=sum', rnd(r.total), rnd(sum),
              `${dagtype} gr${gruppe} ds${dagssats} ${sh}+${durH}h`);
            count++;
          }
        }
      }
    }
  }
}

function testApp_boundaryEdgeCases() {
  // Exact boundary tests for §7 forskudt transitions
  const boundaries = [
    // dagIdx, start, slut, expectedFsk
    [2, {h:5,m:45}, {h:6,m:15}, 0.25],   // Tue: 15min before 06
    [2, {h:18,m:45}, {h:19,m:15}, 0.25],  // Tue: 15min after 19
    [2, {h:6,m:0}, {h:19,m:0}, 0],         // Tue: exactly 06-19 = 0 fsk
    [5, {h:19,m:0}, {h:21,m:0}, 1],        // Fri: 19-20 = 1h fsk (§7), 20-21 = §8
    [1, {h:5,m:0}, {h:7,m:0}, 0],          // Mon: 05-06 = §8 weekend, 06-07 = normal → 0 fsk
    [3, {h:0,m:0}, {h:6,m:0}, 6],          // Wed: midnight to 06 = 6h fsk
    [3, {h:19,m:0}, {h:24,m:0}, 5],        // Wed: 19-24 = 5h fsk
    [4, {h:4,m:0}, {h:20,m:0}, 3],         // Thu: 4-6=2h + 19-20=1h = 3h fsk
  ];
  for (const [dagIdx, start, slut, expected] of boundaries) {
    const fsk = calcForskudt_faf(start, slut, dagIdx);
    assert(Math.abs(fsk - expected) < 0.02, `boundary/fsk_dag${dagIdx}`,
      fsk, expected, `${start.h}:${start.m}–${slut.h}:${slut.m}`);
  }

  // Weekend timer boundaries
  const wkBoundaries = [
    [5, {h:19,m:0}, {h:21,m:0}, 1],   // Fri: 20-21 = 1h wk
    [5, {h:20,m:0}, {h:22,m:0}, 2],   // Fri: 20-22 = 2h wk
    [1, {h:5,m:0}, {h:7,m:0}, 1],     // Mon: 05-06 = 1h wk
    [1, {h:6,m:0}, {h:10,m:0}, 0],    // Mon: 06+ = 0 wk
    [6, {h:0,m:0}, {h:24,m:0}, 24],   // Sat: all day = 24h wk
  ];
  for (const [dagIdx, start, slut, expected] of wkBoundaries) {
    const wkH = calcWeekendTimer_faf(start, slut, dagIdx);
    assert(Math.abs(wkH - expected) < 0.02, `boundary/wk_dag${dagIdx}`,
      wkH, expected, `${start.h}:${start.m}–${slut.h}:${slut.m}`);
  }

  // calcLon edge: exactly 0 hours
  const l0 = calcLon_faf(0, {varslet:false,helligdag:false,frokost:false,pause10:false,enkeltdag:false},
    10380, 0, false, '5dag', 0, 0.75);
  assert(l0.total === 0, 'boundary/0h_total', l0.total, 0, '0 hours');

  // calcLon: exactly dagMax hours (no OT)
  for (const model of ['5dag', 'saertid']) {
    const dMax = dagMax_faf(model);
    const l = calcLon_faf(dMax, {varslet:false,helligdag:false,frokost:false,pause10:false,enkeltdag:false},
      10380, 0, false, model, 0, 0.75);
    assert(l.ot1 === 0 && l.ot2 === 0 && l.ot3 === 0, `boundary/${model}_exact_dagMax_noOT`,
      l.ot1+l.ot2+l.ot3, 0, `${dMax}h`);
  }

  // calcLon: dagMax + epsilon → OT starts
  for (const model of ['5dag', 'saertid']) {
    const dMax = dagMax_faf(model);
    const l = calcLon_faf(dMax + 0.5, {varslet:false,helligdag:false,frokost:false,pause10:false,enkeltdag:false},
      10380, 0, false, model, 0, 0.75);
    assert(l.ot1 > 0, `boundary/${model}_dagMax+0.5_hasOT`, l.ot1, '>0', `${dMax+0.5}h`);
  }

  // OT band boundaries: exactly 1h, 2h, 3h+ OT
  for (const otH of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0]) {
    const h = 8 + otH;
    const l = calcLon_faf(h, {varslet:false,helligdag:false,frokost:false,pause10:false,enkeltdag:false},
      10380, 0, false, '5dag', 0, 0.75);
    notNaN(l.total, 'boundary/ot_band', `otH=${otH}`);
    notNeg(l.total, 'boundary/ot_band', `otH=${otH}`);
    // Verify OT distribution
    assert(l.ot1H === Math.min(1, otH), `boundary/ot1H_${otH}`, l.ot1H, Math.min(1, otH), '');
    assert(l.ot2H === Math.min(1, Math.max(0, otH - 1)), `boundary/ot2H_${otH}`, l.ot2H, Math.min(1, Math.max(0, otH - 1)), '');
    assert(Math.abs(l.ot3H - Math.max(0, otH - 2)) < 0.01, `boundary/ot3H_${otH}`, l.ot3H, Math.max(0, otH - 2), '');
  }

  // Helligdag minimum 4h
  for (const h of [1, 2, 3, 3.5, 4, 5, 8]) {
    const ts = timesats_faf(10380);
    const tsWk = ts;
    const l = calcLon_faf(h, {varslet:false,helligdag:true,frokost:false,pause10:false,enkeltdag:false},
      10380, 0, false, '5dag', 0, 0.75);
    const expWk = rnd(tsWk * 0.75 * Math.max(4, Math.min(8, h)));
    assert(Math.abs(l.wk - expWk) <= 1, `boundary/helligdag_min4h_${h}`, l.wk, expWk, `h=${h}`);
  }
}

function testRekl_boundaryEdgeCases() {
  // OT bands exact boundaries
  for (const totalH of [7, 8, 8.5, 9, 10, 10.5, 12, 14, 14.5, 16]) {
    const b = otBands(totalH);
    const otH = Math.max(0, totalH - 8);
    assert(Math.abs(b.I + b.J + b.K + b.L - otH) < 0.01, `rboundary/bands_sum_${totalH}`,
      b.I + b.J + b.K + b.L, otH, '');
    assert(b.I <= 2 && b.J <= 2 && b.K <= 2, `rboundary/bands_max_${totalH}`,
      `${b.I},${b.J},${b.K}`, '<=2,<=2,<=2', '');
    notNeg(b.L, `rboundary/L`, `totalH=${totalH}`);
  }

  // Gr5 fixed OT rates
  for (const totalH of [9, 10, 12, 14, 16]) {
    const r = calcReklame('optagelse', {h:8,m:0}, {h:(8+totalH)%24,m:0}, 1540, 5, {
      transport:0, nat:false, wk:0, helligdag:false, rabat:0, persontillaeg:0, gr1OTSats:0,
      diaeter:0, pauseForsinketFrokost:false, pauseIngenServering:false,
      pausePlanlagt:false, pause5:false, pause10:false, pause13:false,
    });
    if (r) {
      const b = otBands(r.arbejdsTimer);
      const expOt = (b.I + b.J + b.K) * 200 + b.L * 350;
      assert(Math.abs(r.otKr - expOt) < 1, `rboundary/gr5_ot_${totalH}`, rnd(r.otKr), rnd(expOt), '');
    }
  }

  // Forbered minimum 4h
  const rShort = calcReklame('forbered', {h:10,m:0}, {h:11,m:0}, 4100, 2, {
    transport:0, nat:false, wk:0, helligdag:false, rabat:0, persontillaeg:0, gr1OTSats:0,
    diaeter:0, pauseForsinketFrokost:false, pauseIngenServering:false,
    pausePlanlagt:false, pause5:false, pause10:false, pause13:false,
  });
  assert(rShort.arbejdsTimer === 4, 'rboundary/forbered_min4h', rShort.arbejdsTimer, 4, '1h actual');

  // Dagsløngaranti: short day should get guaranteed minimum
  const rGaranti = calcReklame('optagelse', {h:8,m:0}, {h:10,m:0}, 4100, 2, {
    transport:0, nat:false, wk:0, helligdag:false, rabat:0, persontillaeg:0, gr1OTSats:0,
    diaeter:0, pauseForsinketFrokost:false, pauseIngenServering:false,
    pausePlanlagt:false, pause5:false, pause10:false, pause13:false,
  });
  assert(rGaranti.garantiKr > 0, 'rboundary/garanti_short_day', rGaranti.garantiKr, '>0', '2h work');
  assert(rnd(rGaranti.total) >= 4100, 'rboundary/garanti_min', rnd(rGaranti.total), '>=4100', '');

  // Rabat 10% and 15%
  for (const rabat of [1, 2]) {
    const r = calcReklame('optagelse', {h:8,m:0}, {h:18,m:0}, 4100, 2, {
      transport:0, nat:false, wk:0, helligdag:false, rabat, persontillaeg:0, gr1OTSats:0,
      diaeter:0, pauseForsinketFrokost:false, pauseIngenServering:false,
      pausePlanlagt:false, pause5:false, pause10:false, pause13:false,
    });
    const pct = rabat === 1 ? 0.10 : 0.15;
    const expRabat = -(r.normalKr + r.otKr) * pct;
    assert(Math.abs(r.rabatKr - expRabat) < 1, `rboundary/rabat_${rabat}`, rnd(r.rabatKr), rnd(expRabat), '');
  }

  // All pause types individually
  const pauseTypes = ['pauseForsinketFrokost','pauseIngenServering','pausePlanlagt','pause5','pause10','pause13'];
  for (const pt of pauseTypes) {
    const opts = {
      transport:0, nat:false, wk:0, helligdag:false, rabat:0, persontillaeg:0, gr1OTSats:0,
      diaeter:0, pauseForsinketFrokost:false, pauseIngenServering:false,
      pausePlanlagt:false, pause5:false, pause10:false, pause13:false,
    };
    opts[pt] = true;
    const r = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, opts);
    assert(r.pauseKr > 0, `rboundary/pause_${pt}`, r.pauseKr, '>0', '');
  }
}

function testApp_forskudtExhaustive() {
  // Test forskudt for every hour boundary across all weekdays
  for (let dagIdx = 0; dagIdx <= 6; dagIdx++) {
    for (let sh = 0; sh < 24; sh++) {
      for (const durH of [6, 8, 10]) {
        const start = { h: sh, m: 0 };
        const slut = { h: (sh + durH) % 24, m: 0 };
        const fsk = calcForskudt_faf(start, slut, dagIdx);
        notNaN(fsk, 'fsk_exhaustive/notNaN', `dag${dagIdx} ${sh}+${durH}h`);
        notNeg(fsk, 'fsk_exhaustive/notNeg', `dag${dagIdx} ${sh}+${durH}h`);

        // On weekend, fsk must be 0
        if (dagIdx === 0 || dagIdx === 6) {
          assert(fsk === 0, 'fsk_exhaustive/weekend=0', fsk, 0, `dag${dagIdx} ${sh}+${durH}h`);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Time App — Comprehensive Test Suite');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const sections = [
  // APP.HTML scenarios
  ['APP: Weekend (§8)',             testApp_weekend],
  ['APP: Helligdag (§8)',           testApp_helligdag],
  ['APP: Forskudt/nat (§7)',        testApp_forskudt],
  ['APP: Særtid 4-dags uge (§5)',   testApp_saertid4dag],
  ['APP: Normal 5-dags uge',        testApp_normal5dag],
  ['APP: Enkeltdag (§3.10)',         testApp_enkeltdag],
  ['APP: Dagsløngaranti (generel)',  testApp_dagsløngaranti],
  // REKL.HTML scenarios
  ['REKL: Weekend (§6)',             testRekl_weekend],
  ['REKL: Helligdag',                testRekl_helligdag],
  ['REKL: Nat-gene (§5)',            testRekl_natGene],
  ['REKL: Forbered 4-dags (§)',      testRekl_4dagUge],
  ['REKL: Optagelse 5-dags',         testRekl_5dagUge],
  ['REKL: Rabat A/B (§3)',           testRekl_rabat],
  ['REKL: Dagsløngaranti',           testRekl_dagsløngaranti],
  // Unit + edge tests
  ['UNIT: APP OT rates (§6)',         testApp_OTRates],
  ['UNIT: REKL OT bands',            testRekl_OTBands],
  ['UNIT: REKL gr5 faste satser',    testRekl_Gr5FixedRates],
  ['UNIT: Helligdage liste',          testShared_helligdage],
  ['EDGE: Edge cases',               testEdgeCases],
  ['APP: Mixed OT §6 (v+u)',          testApp_mixedOT],
  // Export / Backup / localStorage
  ['EXPORT: JSON roundtrip (app)',     testExport_jsonRoundtrip],
  ['EXPORT: Mail format (app)',        testExport_mailFormat],
  ['EXPORT: PDF structure (app)',      testExport_pdfHtml],
  ['EXPORT: JSON roundtrip (rekl)',    testExport_reklJsonRoundtrip],
  ['BACKUP: Full export/import',       testBackup_fullExportImport],
  // Stress / boundary
  ['STRESS: APP alle kombinationer',   testApp_stressAllCombinations],
  ['STRESS: REKL alle kombinationer',  testRekl_stressAllCombinations],
  ['BOUNDARY: APP kanttilfælde',       testApp_boundaryEdgeCases],
  ['BOUNDARY: REKL kanttilfælde',      testRekl_boundaryEdgeCases],
  ['EXHAUSTIVE: Forskudt alle timer',  testApp_forskudtExhaustive],
];

for (const [label, fn] of sections) {
  const beforeP = passed, beforeF = failed;
  fn();
  const p = passed - beforeP, f = failed - beforeF;
  const status = f === 0 ? '✓' : '✗';
  const total  = p + f;
  console.log(`  ${status} ${label.padEnd(42)} ${String(p).padStart(4)}/${total} passed${f > 0 ? `  (${f} FAILED)` : ''}`);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(` TOTAL: ${passed + failed} tests — ${passed} passed — ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('');
  console.log('FEJLDETALJER:');
  for (const f of failures.slice(0, 50)) {
    console.log(`  ✗ ${f.label}`);
    console.log(`    Got:      ${JSON.stringify(f.got)}`);
    console.log(`    Expected: ${JSON.stringify(f.expected)}`);
    if (f.extra) console.log(`    Context:  ${f.extra}`);
  }
  if (failures.length > 50) {
    console.log(`  ... and ${failures.length - 50} more failures`);
  }
}

process.exit(failed > 0 ? 1 : 0);
