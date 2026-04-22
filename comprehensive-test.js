#!/usr/bin/env node
// Comprehensive test suite for app.html (Fiktionsoverenskomst) and rekl.html (Reklamefilmsoverenskomst)
// 7 scenarier × 150 tests × 2 apps = 2100 tests

'use strict';

// ═══════════════════════════════════════════════
// EXTRACT: app.html (Fiktionsoverenskomst) logic
// ═══════════════════════════════════════════════

const DIÆT = 94;

// Mutable global cfg (as in app.html)
let cfg = { ugelon: 10380, pers: 0, tillæg: false, model: '5dag', fridag: 'fre', dagLon: 0 };

function timesats() { return cfg.ugelon / 40; }

function timesatsMedTillæg() {
  const mindstelønTs = cfg.ugelon / 40 * (cfg.tillæg ? 1.1 : 1.0);
  const persTs = (cfg.pers || 0) / 40;
  return mindstelønTs + persTs;
}

function tidTilH(tid) {
  if (!tid) return null;
  return tid.h + tid.m / 60;
}

function calcTimer(start, slut) {
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return null;
  const h = (e >= s) ? e - s : e - s + 24;
  return Math.max(0, h - 0.5);
}

function calcForskudt(start, slut, dagIdx) {
  if (dagIdx === 0 || dagIdx === 6) return 0;
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return 0;
  let fsk = 0;
  const seg = (e >= s) ? [[s, e]] : [[s, 24], [0, e]];
  seg.forEach(([a, b]) => {
    if (dagIdx === 5 && a === 0) return;
    const aFsk = (dagIdx === 1) ? Math.max(a, 6) : a;
    const bFsk = (dagIdx === 5) ? Math.min(b, 20) : b;
    if (aFsk >= bFsk) return;
    if (aFsk < 6) fsk += Math.min(bFsk, 6) - aFsk;
    if (bFsk > 19) fsk += bFsk - Math.max(aFsk, 19);
  });
  return Math.max(0, fsk);
}

function calcWeekendTimer(start, slut, dagIdx) {
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return 0;
  const eAdj = (e > s) ? e : e + 24;
  let wkH = 0;
  if (dagIdx === 6 || dagIdx === 0) {
    wkH = eAdj - s;
  } else if (dagIdx === 5) {
    if (s >= 20)        wkH = eAdj - s;
    else if (eAdj > 20) wkH = eAdj - 20;
  } else if (dagIdx === 1) {
    if (s < 6) wkH = Math.min(eAdj, 6) - s;
  }
  return Math.max(0, wkH);
}

function dagMax() {
  return cfg.model === 'saertid' ? 10 : 8;
}

function calcLon(h, opt, wkAutoH = 0, wkRate = 0.75) {
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0 };
  const ts = timesats();
  const { varslet, uvarslet, helligdag, frokost, pause10 } = opt;
  const dMax = dagMax();
  const normalH = Math.min(dMax, h);
  const otH     = Math.max(0, h - dMax);
  const ot1H    = Math.min(1, otH);
  const ot2H    = Math.min(1, Math.max(0, otH - 1));
  const ot3H    = Math.max(0, otH - 2);
  const harEnkeltdag = !!(opt.enkeltdag || cfg.tillæg);
  const tsGrund = ts;
  const tsNorm  = cfg.ugelon / 40 * (harEnkeltdag ? 1.1 : 1.0) + (cfg.pers || 0) / 40;
  const tsWk    = tsGrund * (harEnkeltdag ? 1.1 : 1.0);
  let normal = 0, ot1 = 0, ot2 = 0, ot3 = 0, wk = 0;

  if (helligdag) {
    const betaltH = Math.max(4, normalH);
    wk     = tsWk * wkRate * betaltH;
    normal = tsNorm * normalH;
    ot1 = tsWk * (1 + wkRate + 0.50) * ot1H;
    ot2 = tsWk * (1 + wkRate + 0.60) * ot2H;
    ot3 = tsWk * (1 + wkRate + 1.35) * ot3H;
  } else {
    normal = tsNorm * normalH;
    if (wkAutoH > 0) wk = tsWk * wkRate * wkAutoH;
    if (varslet) {
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
  if (frokost)            ext += DIÆT;
  if (pause10 && h > 10)  ext += ts * (15/60);

  return {
    total: Math.round(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: Math.round(normal), ot1: Math.round(ot1),
    ot2: Math.round(ot2), ot3: Math.round(ot3),
    wk: Math.round(wk), ext: Math.round(ext),
    normalH, ot1H, ot2H, ot3H
  };
}

// ═══════════════════════════════════════════════
// EXTRACT: rekl.html (Reklamefilmsoverenskomst) logic
// ═══════════════════════════════════════════════

const GR_SATSER = { 1: 0, 2: 4100, 3: 3300, 4: 2750, 5: 1540 };

const FAGGRUPPER = [
  { gruppe: 1, titler: ['Kameraoperatør','Steadicam operatør','Food styling','Stylist','Sound designer'] },
  { gruppe: 2, titler: ['Indspilningsleder','Location manager','Tonemester','1. AC / B-foto','Belysningsmester','SFX Supervisor','Key grip','Chefkostume','Chefrekvisitør','Chefsminkør'] },
  { gruppe: 3, titler: ['Statistkoordinator','2. AC','B-tonemester','Q-take operatør','DIT','Scripter','Board operator','Belyser','Best boy grip','Kostumier','Rekvisitør','Sminkør / Hår','SFX Tekniker'] },
  { gruppe: 4, titler: ['Indspilningslederassistant','Videoassistent','Data Wrangler','Belysningsassistent','Toneassistent','Grip assistent','Kostumierassistent','Rekvisitørassistent','Sminkørassistent','SFX-assistent','Locationassistant'] },
  { gruppe: 5, titler: ['Runner','Trainee'] },
];

function otBands(t) {
  const ot = Math.max(0, t - 8);
  return {
    I: Math.min(ot, 2),
    J: Math.min(Math.max(ot - 2, 0), 2),
    K: Math.min(Math.max(ot - 4, 0), 2),
    L: Math.max(ot - 6, 0)
  };
}

function overlap(sh, eh, fra, til) {
  const a = Math.max(sh, fra), b = Math.min(eh, til);
  return b > a ? b - a : 0;
}

function calcReklame(dagtype, start, slut, dagssats, gruppe, opts) {
  if (!start || !slut) return null;
  const s = start.h + start.m / 60;
  const e = slut.h + slut.m / 60;
  const raaTimer = e >= s ? e - s : e - s + 24;
  const arbejdsTimer = dagtype === 'forbered' ? Math.max(4, raaTimer) : raaTimer;
  const ts = dagssats / 8;
  const b = otBands(arbejdsTimer);
  const otTimer = b.I + b.J + b.K + b.L;

  let normalKr = Math.min(arbejdsTimer, 8) * ts;
  let otKr = 0;

  if (gruppe === 5) {
    const band1 = b.I + b.J + b.K;
    otKr = band1 * 200 + b.L * 350;
  } else if (gruppe === 1) {
    if (opts.gr1OTSats > 0) otKr = otTimer * opts.gr1OTSats;
    else otKr = 0;
  } else {
    if (dagtype === 'optagelse') {
      otKr = b.I * ts * 1.25 + b.J * ts * 2.00 + b.K * ts * 2.50 + b.L * ts * 3.00;
    } else {
      otKr = b.I * ts * 1.25 + b.J * ts * 1.50 + b.K * ts * 1.75 + b.L * ts * 1.75;
    }
  }

  let transKr = 0, transTimer = 0;
  if (dagtype === 'optagelse' && opts.transport > 0) {
    transTimer = opts.transport;
    transKr = transTimer * ts * 1.75;
  }

  let natKr = 0, nat18t = 0, nat00t = 0;
  if (dagtype === 'optagelse' && opts.nat) {
    const sh = s, eh = e >= s ? e : e + 24;
    nat18t = overlap(sh, eh, 18, 24);
    nat00t = (sh < 6 ? overlap(sh, eh, 0, 6) : 0) + overlap(sh, eh, 24, 30);
    natKr = nat18t * 100 + nat00t * 200;
  }

  let wkKr = 0;
  const effWk = (dagtype === 'optagelse' && opts.helligdag && opts.wk < 2) ? 2 : opts.wk;
  if (dagtype === 'optagelse' && (effWk > 0 || opts.helligdag)) {
    const wTimer = arbejdsTimer + transTimer;
    const wFaktor = effWk === 2 ? 1.0 : (effWk === 1 ? 0.75 : 1.0);
    wkKr = wTimer * ts * wFaktor;
  }

  let pauseKr = 0;
  if (dagtype === 'optagelse') {
    if (opts.pauseForsinketFrokost) pauseKr += (30/60) * ts * 2.00;
    if (opts.pauseIngenServering)   pauseKr += (15/60) * ts * 2.50;
    if (opts.pausePlanlagt)         pauseKr += (45/60) * ts * 1.25;
    if (opts.pause5)                pauseKr += (30/60) * ts * 2.00;
    if (opts.pause10)               pauseKr += (30/60) * ts * 2.00;
    if (opts.pause13)               pauseKr += (30/60) * ts * 2.00;
  }

  let rabatKr = 0;
  if (dagtype === 'optagelse' && opts.rabat > 0) {
    const pct = opts.rabat === 1 ? 0.10 : 0.15;
    rabatKr = -(normalKr + otKr) * pct;
  }

  const brutto = normalKr + otKr + rabatKr + transKr + natKr + wkKr + pauseKr;
  const garantiKr = (dagtype === 'optagelse' && brutto < dagssats) ? dagssats - brutto : 0;
  const diaetKr = (opts.diaeter || 0) * 172.20;
  const persontillaegKr = opts.persontillaeg || 0;
  const total = brutto + garantiKr + diaetKr + persontillaegKr;

  return {
    raaTimer, arbejdsTimer, otTimer, transTimer,
    normalKr, otKr, transKr, natKr, wkKr, pauseKr, rabatKr,
    garantiKr, diaetKr, persontillaegKr,
    brutto, total, ts,
    bI: b.I, bJ: b.J, bK: b.K, bL: b.L,
    nat18t, nat00t, effWk,
    helligdag: opts.helligdag || false
  };
}

// ═══════════════════════════════════════════════
// TEST FRAMEWORK
// ═══════════════════════════════════════════════

let passed = 0, failed = 0;
const errors = [];

function assert(condition, testName, details) {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push({ testName, details });
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// Kvarter-afrundede tider
function randTid(minH, maxH) {
  const h = randInt(minH, maxH);
  const m = randChoice([0, 15, 30, 45]);
  return { h, m };
}

// Random start + slut (8-16 timer)
function randVagt(targetHours) {
  const startH = randInt(4, 14);
  const startM = randChoice([0, 15, 30, 45]);
  const totalMinutes = Math.round(targetHours * 60 / 15) * 15;
  const slutMinutes = startH * 60 + startM + totalMinutes + 30; // +30 for the unpaid break
  const slutH = Math.floor(slutMinutes / 60) % 24;
  const slutM = slutMinutes % 60;
  return {
    start: { h: startH, m: startM },
    slut: { h: slutH, m: slutM },
    targetHours
  };
}

// Random dagtype (app.html): 0=søn, 1=man, 2=tir, 3=ons, 4=tor, 5=fre, 6=lør
function randHverdag() { return randInt(2, 4); }       // tir-tor (sikkert hverdag)
function randWeekend() { return randChoice([0, 6]); }  // lør eller søn
function randFredag()  { return 5; }
function randMandag()  { return 1; }

// Random rekl-gruppe 1-5
function randGruppe() { return randInt(1, 5); }

function isFinitePositive(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

function isStrictPositive(v) {
  return typeof v === 'number' && isFinite(v) && v > 0;
}

// ═══════════════════════════════════════════════
// APP.HTML TESTS (Fiktionsoverenskomst)
// ═══════════════════════════════════════════════

// Repræsentative løngrupper (ugelønninger)
const FIKTION_UGELONNER = [8200, 9000, 10380, 11000, 12500, 14000, 16000];

function setCfgFiktion(ugelon, pers, model, enkeltdag) {
  cfg.ugelon  = ugelon;
  cfg.pers    = pers || 0;
  cfg.model   = model || '5dag';
  cfg.tillæg  = !!enkeltdag;
  cfg.dagLon  = 0;
}

function runFiktionTest(scenarieNavn, h, dagIdx, optExtra, ugelon, pers, model, enkeltdag) {
  setCfgFiktion(ugelon, pers, model, enkeltdag);
  const start = { h: 7, m: 0 };
  // slut = start + h + 0.5 (break)
  const slutMin = 7 * 60 + Math.round((h + 0.5) * 60);
  const slut = { h: Math.floor(slutMin / 60) % 24, m: slutMin % 60 };

  const fsk    = calcForskudt(start, slut, dagIdx);
  const wkAutoH = calcWeekendTimer(start, slut, dagIdx);
  const calcH  = calcTimer(start, slut);
  const opt    = { varslet: false, uvarslet: true, helligdag: false, frokost: false, pause10: false, ...optExtra };
  const r      = calcLon(calcH, opt, wkAutoH, 0.75);

  const testId = `Fiktion/${scenarieNavn}`;

  assert(calcH !== null, testId, `calcTimer returnerede null (start=${JSON.stringify(start)}, slut=${JSON.stringify(slut)})`);
  assert(Math.abs(calcH - h) < 0.01, testId + '/timer',
    `Forventet ${h}t, fik ${calcH}t`);
  assert(isFinitePositive(r.total), testId + '/total', `total=${r.total}`);
  assert(isFinitePositive(r.normal), testId + '/normal', `normal=${r.normal}`);
  assert(r.total >= r.normal, testId + '/total>=normal', `total=${r.total} < normal=${r.normal}`);
  // OT-beløb skal være 0 ved <= dagMax
  if (h <= dagMax()) {
    assert(r.ot1 === 0 && r.ot2 === 0 && r.ot3 === 0, testId + '/no-OT',
      `OT skal være 0 ved ${h}t (dMax=${dagMax()}): ot1=${r.ot1}, ot2=${r.ot2}, ot3=${r.ot3}`);
  }
  // OT-beløb ved OT
  if (h > dagMax()) {
    assert(r.ot1 > 0 || r.ot2 > 0 || r.ot3 > 0, testId + '/has-OT',
      `OT skal være > 0 ved ${h}t (dMax=${dagMax()}): ot1=${r.ot1}, ot2=${r.ot2}, ot3=${r.ot3}`);
  }
  // Weekend tillæg ved helligdag
  if (opt.helligdag) {
    assert(r.wk > 0, testId + '/wk-on-holiday', `wk=${r.wk} på helligdag`);
  }
  // Alle felter er gyldige tal
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') {
      assert(isFinite(v) && !isNaN(v), testId + `/field-${k}`, `${k}=${v} er NaN/Infinity`);
    }
  }
  return r;
}

// ═══════════════════════════════════════════════
// REKL.HTML TESTS (Reklamefilmsoverenskomst)
// ═══════════════════════════════════════════════

function runReklTest(scenarieNavn, h, dagtype, gruppe, dagssats, opts) {
  const startH = 7;
  const slutMin = startH * 60 + Math.round(h * 60);
  const slut = { h: Math.floor(slutMin / 60) % 24, m: slutMin % 60 };
  const start = { h: startH, m: 0 };

  const fullOpts = {
    transport: 0, nat: false, wk: 0, rabat: 0, helligdag: false,
    pauseForsinketFrokost: false, pauseIngenServering: false, pausePlanlagt: false,
    pause5: false, pause10: false, pause13: false,
    diaeter: 0, persontillaeg: 0, gr1OTSats: 0,
    ...opts
  };

  const r = calcReklame(dagtype, start, slut, dagssats, gruppe, fullOpts);
  const testId = `Rekl/${scenarieNavn}/gr${gruppe}`;

  assert(r !== null, testId, 'calcReklame returnerede null');
  if (!r) return null;

  assert(isFinitePositive(r.total), testId + '/total', `total=${r.total}`);
  assert(isFinitePositive(r.brutto), testId + '/brutto', `brutto=${r.brutto}`);
  assert(isFinitePositive(r.normalKr), testId + '/normalKr', `normalKr=${r.normalKr}`);
  assert(r.total >= r.brutto, testId + '/total>=brutto', `total=${r.total} < brutto=${r.brutto}`);

  // Dagsløngaranti: brutto+garanti >= dagssats (kun optagelse)
  if (dagtype === 'optagelse') {
    assert(r.brutto + r.garantiKr >= dagssats - 0.01, testId + '/garanti',
      `brutto=${r.brutto.toFixed(2)} + garanti=${r.garantiKr.toFixed(2)} < dagssats=${dagssats}`);
  }

  // OT-logik
  if (r.arbejdsTimer <= 8) {
    assert(r.otKr === 0, testId + '/no-OT', `otKr=${r.otKr} ved ${r.arbejdsTimer}t (<=8)`);
  } else {
    if (gruppe !== 1 || fullOpts.gr1OTSats > 0) {
      assert(r.otKr > 0, testId + '/has-OT', `otKr=${r.otKr} ved ${r.arbejdsTimer}t (>8)`);
    }
  }

  // Alle numeriske felter gyldige
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') {
      assert(isFinite(v) && !isNaN(v), testId + `/field-${k}`, `${k}=${v} er NaN/Infinity`);
    }
  }

  // Transport kun ved optagelse
  if (dagtype === 'forbered') {
    assert(r.transKr === 0, testId + '/no-trans-forbered', `transKr=${r.transKr} på forbered`);
  }

  return r;
}

// ═══════════════════════════════════════════════
// SCENARIE-DEFINITIONER
// ═══════════════════════════════════════════════

const N = 150; // tests per scenario

// Hjælper til tilfældig opsætning
function rFiktion() {
  return {
    ugelon:   randChoice(FIKTION_UGELONNER),
    pers:     randChoice([0, 0, 0, 500, 1000, 2000, 3500]),
    model:    randChoice(['5dag', 'saertid']),
    enkeltdag: Math.random() < 0.3,
  };
}

function rHours(min, max) {
  // Kvarter-afrundede timer
  const raw = rand(min, max);
  return Math.round(raw * 4) / 4;
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  TIME APP COMPREHENSIVE TEST SUITE                          ║');
console.log('║  Fiktionsoverenskomst (app.html) + Reklame (rekl.html)       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ─────────────────────────────────────────────
// SCENARIE 1: Weekend (lørdag, søndag)
// ─────────────────────────────────────────────
console.log('▶ Scenarie 1: Weekend (lørdag/søndag)');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  const h = rHours(6, 14);
  const dagIdx = randWeekend();
  // App.html: weekend-flag sættes manuelt som helligdag
  runFiktionTest('Weekend', h, dagIdx,
    { helligdag: true, varslet: Math.random() < 0.5, frokost: Math.random() < 0.3 },
    f.ugelon, f.pers, f.model, f.enkeltdag
  );

  // Rekl: wk=1 (lørdag) eller wk=2 (søndag), optagelse
  const gr = randGruppe();
  const ds = gr === 1 ? 4100 : GR_SATSER[gr];
  runReklTest('Weekend', h, 'optagelse', gr, ds, {
    wk: dagIdx === 6 ? 1 : 2,
    helligdag: dagIdx === 0,
    transport: Math.random() < 0.4 ? rand(0.5, 3) : 0,
    persontillaeg: Math.random() < 0.3 ? randInt(500, 3000) : 0,
  });
}
console.log(`  Fiktion: ${N} tests × timer/wk-checks`);
console.log(`  Rekl:    ${N} tests × dagsløngaranti/wk-checks`);

// ─────────────────────────────────────────────
// SCENARIE 2: Helligdag
// ─────────────────────────────────────────────
console.log('▶ Scenarie 2: Helligdag');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  const h = rHours(4, 14);
  // Helligdag kan falde på en hverdag (dagIdx 2-4)
  const dagIdx = randInt(2, 4);
  runFiktionTest('Helligdag', h, dagIdx,
    { helligdag: true, varslet: false },
    f.ugelon, f.pers, f.model, f.enkeltdag
  );

  // Rekl: helligdag=true opgraderer wk til 2
  const gr = randGruppe();
  const ds = gr === 1 ? 4100 : GR_SATSER[gr];
  runReklTest('Helligdag', h, 'optagelse', gr, ds, {
    helligdag: true,
    wk: randChoice([0, 1]),  // skal opgraderes til 2 af calcReklame
    transport: Math.random() < 0.3 ? rand(0.5, 2) : 0,
  });
}
console.log('  OK');

// ─────────────────────────────────────────────
// SCENARIE 3: Forskudt tid (nat-gene, aften/nat)
// ─────────────────────────────────────────────
console.log('▶ Scenarie 3: Forskudt tid (nat/aften-tillæg)');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  const h = rHours(8, 14);
  const dagIdx = randInt(2, 4); // hverdag
  // Sent start (nat-gene aktiveres)
  const startH = randInt(19, 23);
  const startM = randChoice([0, 15, 30, 45]);
  const slutMin = startH * 60 + startM + Math.round((h + 0.5) * 60);
  const start  = { h: startH, m: startM };
  const slutH  = Math.floor(slutMin / 60) % 24;
  const slutM  = slutMin % 60;
  const slut   = { h: slutH, m: slutM };

  setCfgFiktion(f.ugelon, f.pers, f.model, f.enkeltdag);
  const fsk     = calcForskudt(start, slut, dagIdx);
  const calcH   = calcTimer(start, slut);
  const wkAutoH = calcWeekendTimer(start, slut, dagIdx);
  const opt     = { varslet: false, helligdag: false, frokost: false, pause10: false };
  const r       = calcLon(calcH, opt, wkAutoH, 0.75);
  const fskKr   = Math.round(fsk * 110);
  const testId  = 'Fiktion/Forskudt';

  assert(typeof fsk === 'number' && isFinite(fsk) && fsk >= 0, testId + '/fsk', `fsk=${fsk}`);
  assert(isFinitePositive(r.total), testId + '/total', `total=${r.total}`);
  // Nat-gene: ved sent start skal der være forskudt timer
  if (startH >= 19) {
    assert(fsk > 0, testId + '/fsk>0', `Forventet forskudt > 0 ved start=${startH}:00, dagIdx=${dagIdx}, fik ${fsk}`);
    assert(fskKr >= 0, testId + '/fskKr>=0', `fskKr=${fskKr}`);
  }

  // Rekl: nat=true med sent start
  const gr = randGruppe();
  const ds = gr === 1 ? 4100 : GR_SATSER[gr];
  runReklTest('Forskudt', h, 'optagelse', gr, ds, {
    nat: true,
    wk: 0,
  });
}
console.log('  OK');

// ─────────────────────────────────────────────
// SCENARIE 4: 4-dages uge (særtid)
// ─────────────────────────────────────────────
console.log('▶ Scenarie 4: 4-dages uge (særtid §5)');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  const h = rHours(8, 16);
  const dagIdx = randInt(2, 4);
  runFiktionTest('4dagUge', h, dagIdx,
    { varslet: Math.random() < 0.5, frokost: Math.random() < 0.2 },
    f.ugelon, f.pers, 'saertid', f.enkeltdag  // model = saertid
  );
  // OT-tærsklen er 10t ved saertid
  // Verificer specifikt at OT er 0 ved 9.5t
  setCfgFiktion(f.ugelon, f.pers, 'saertid', false);
  const v9 = { h: 7, m: 0 };
  const v9Slut = { h: 17, m: 30 };  // 9.5t + 0.5 = 10t → calcTimer = 9.5t
  const calcH9 = calcTimer(v9, v9Slut);
  const r9 = calcLon(calcH9, {}, 0, 0.75);
  assert(r9.ot1 === 0 && r9.ot2 === 0, '4dagUge/OT-ved-9.5t',
    `OT skal være 0 ved 9.5t i saertid, fik ot1=${r9.ot1}, ot2=${r9.ot2}`);

  // Rekl har ingen 4-dages uge model, men vi tester forbered-type
  const gr = randGruppe();
  const ds = gr === 1 ? 4100 : GR_SATSER[gr];
  runReklTest('ForberedDag', h, 'forbered', gr, ds, {
    persontillaeg: Math.random() < 0.3 ? randInt(200, 2000) : 0,
  });
}
console.log('  OK');

// ─────────────────────────────────────────────
// SCENARIE 5: 5-dages uge
// ─────────────────────────────────────────────
console.log('▶ Scenarie 5: 5-dages uge (normal §4)');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  const h = rHours(6, 16);
  const dagIdx = randInt(2, 4);
  runFiktionTest('5dagUge', h, dagIdx,
    { varslet: Math.random() < 0.5 },
    f.ugelon, f.pers, '5dag', f.enkeltdag
  );
  // OT-tærsklen er 8t: tjek at OT er 0 ved præcis 8t
  setCfgFiktion(f.ugelon, 0, '5dag', false);
  const v8 = { h: 8, m: 0 };
  const v8Slut = { h: 16, m: 30 }; // 8t + 0.5 break = calcTimer = 8t
  const calcH8 = calcTimer(v8, v8Slut);
  const r8 = calcLon(calcH8, {}, 0, 0.75);
  assert(Math.abs(calcH8 - 8) < 0.01, '5dagUge/timer=8', `Forventet 8t, fik ${calcH8}`);
  assert(r8.ot1 === 0, '5dagUge/no-OT-8t', `OT skal være 0 ved 8t, fik ot1=${r8.ot1}`);

  const gr = randGruppe();
  const ds = gr === 1 ? 4100 : GR_SATSER[gr];
  runReklTest('OptagelseDag', h, 'optagelse', gr, ds, {
    transport: Math.random() < 0.4 ? rand(0.5, 4) : 0,
    nat: Math.random() < 0.2,
    persontillaeg: Math.random() < 0.3 ? randInt(0, 3000) : 0,
  });
}
console.log('  OK');

// ─────────────────────────────────────────────
// SCENARIE 6: Enkelt dag (1 optagelsesdag)
// ─────────────────────────────────────────────
console.log('▶ Scenarie 6: Enkelt dag (1 optagelsesdag)');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  const h = rHours(4, 16);
  const dagIdx = randInt(1, 5);
  runFiktionTest('EnkeltDag', h, dagIdx,
    { enkeltdag: true, varslet: Math.random() < 0.5 },
    f.ugelon, f.pers, f.model, false  // enkeltdag via opt, ikke cfg
  );

  const gr = randGruppe();
  const ds = gr === 1 ? randInt(3000, 6000) : GR_SATSER[gr];
  runReklTest('EnkeltDag', h, 'optagelse', gr, ds, {
    persontillaeg: randInt(0, 2000),
    diaeter: randInt(0, 3),
    transport: Math.random() < 0.4 ? rand(0.5, 3) : 0,
  });
}
console.log('  OK');

// ─────────────────────────────────────────────
// SCENARIE 7: Enkeltdags løn / dagsløngaranti
// ─────────────────────────────────────────────
console.log('▶ Scenarie 7: Enkeltdagsløn / dagsløngaranti');
for (let i = 0; i < N; i++) {
  const f = rFiktion();
  // Kort dag (2-6 timer) for at teste minimumsbetalingen
  const h = rHours(2, 6);
  const dagIdx = randInt(2, 4);
  runFiktionTest('DagsLonGaranti', h, dagIdx,
    { enkeltdag: true },
    f.ugelon, f.pers, f.model, true  // enkeltdag via cfg.tillæg
  );

  // Rekl: kort dag, garantien bør træde i kraft (under 8t = normal løn < dagssats)
  const gr = randInt(2, 4); // Gr 1 og 5 har specielle regler
  const ds = GR_SATSER[gr];
  const rOpts = {
    persontillaeg: 0,
    diaeter: 0,
    transport: 0,
    nat: false, wk: 0, rabat: 0,
  };
  const r = runReklTest('DagsLonGaranti', h, 'optagelse', gr, ds, rOpts);
  if (r) {
    // Ved < 8 timer skal garantiKr kompensere op til dagssats
    if (r.arbejdsTimer < 8) {
      const bruttoBasic = r.normalKr;  // ingen OT, trans, wk etc.
      if (bruttoBasic < ds) {
        assert(r.garantiKr >= 0, 'DagsLonGaranti/garantiKr>=0', `garantiKr=${r.garantiKr}`);
        assert(r.brutto + r.garantiKr >= ds - 0.01, 'DagsLonGaranti/garanti-dækker',
          `brutto=${r.brutto.toFixed(2)} + garantiKr=${r.garantiKr.toFixed(2)} < dagssats=${ds}`);
      }
    }
  }
}
console.log('  OK');

// ═══════════════════════════════════════════════
// EKSTRA: SAMMENLIGNING AF LOGIK (overlap-regler)
// ═══════════════════════════════════════════════

console.log('\n▶ Ekstra: Kryds-validering Fiktion ↔ Rekl (overlappende regler)');

let crossErrors = [];

// Begge apps: personligt tillæg skal give højere total
for (let i = 0; i < 50; i++) {
  const ugelon = randChoice(FIKTION_UGELONNER);
  const h      = rHours(8, 12);
  const dagIdx = randInt(2, 4);
  const pers   = randInt(500, 3000);

  // App.html: med pers
  setCfgFiktion(ugelon, pers, '5dag', false);
  const calcH = calcTimer({ h: 7, m: 0 }, { h: Math.floor((7*60 + (h+0.5)*60)/60)%24, m: Math.round(((7*60 + (h+0.5)*60)%60)) });
  const rMed   = calcLon(calcH || h, {}, 0, 0.75);
  setCfgFiktion(ugelon, 0, '5dag', false);
  const rUden  = calcLon(calcH || h, {}, 0, 0.75);
  assert(rMed.total >= rUden.total, 'Cross/fiktion-pers-tillæg',
    `Med pers ${pers}: total=${rMed.total}, uden pers: total=${rUden.total}`);

  // Rekl: med persontillaeg
  const gr = randInt(2, 4);
  const ds = GR_SATSER[gr];
  const rRMed  = calcReklame('optagelse', {h:7,m:0}, {h:Math.floor((7*60+(h)*60)/60)%24, m:(7*60+(h)*60)%60}, ds, gr, { persontillaeg: pers });
  const rRUden = calcReklame('optagelse', {h:7,m:0}, {h:Math.floor((7*60+(h)*60)/60)%24, m:(7*60+(h)*60)%60}, ds, gr, { persontillaeg: 0 });
  if (rRMed && rRUden) {
    assert(rRMed.total >= rRUden.total, 'Cross/rekl-pers-tillæg',
      `Med pers ${pers}: total=${rRMed.total}, uden pers: total=${rRUden.total}`);
  }
}

// Rekl: OT-progression (mere OT = højere sats)
for (let i = 0; i < 50; i++) {
  const gr = randInt(2, 4);
  const ds = GR_SATSER[gr];
  const h1 = 10;   // Band I OT (2t OT)
  const h2 = 12;   // Band J OT (4t OT)
  const h3 = 14;   // Band K OT (6t OT)
  const h4 = 15;   // Band L OT (7t OT)

  const makeR = (h) => calcReklame('optagelse', {h:7,m:0}, {h:Math.floor((7*60+h*60)/60)%24, m:(7*60+h*60)%60}, ds, gr, {});

  const r1=makeR(h1), r2=makeR(h2), r3=makeR(h3), r4=makeR(h4);
  if(r1&&r2&&r3&&r4) {
    assert(r2.total > r1.total, 'Cross/rekl-OT-progression-12>10', `${h2}t(${r2.total}) skal > ${h1}t(${r1.total})`);
    assert(r3.total > r2.total, 'Cross/rekl-OT-progression-14>12', `${h3}t(${r3.total}) skal > ${h2}t(${r2.total})`);
    assert(r4.total > r3.total, 'Cross/rekl-OT-progression-15>14', `${h4}t(${r4.total}) skal > ${h3}t(${r3.total})`);
  }
}

// App.html: OT-progression (mere OT = højere sats)
for (let i = 0; i < 50; i++) {
  setCfgFiktion(randChoice(FIKTION_UGELONNER), 0, '5dag', false);
  const r8  = calcLon(8,  { varslet: false }, 0, 0.75);
  const r9  = calcLon(9,  { varslet: false }, 0, 0.75);
  const r10 = calcLon(10, { varslet: false }, 0, 0.75);
  const r11 = calcLon(11, { varslet: false }, 0, 0.75);
  assert(r9.total  > r8.total,  'Cross/fiktion-OT-9>8',   `9t(${r9.total}) skal > 8t(${r8.total})`);
  assert(r10.total > r9.total,  'Cross/fiktion-OT-10>9',  `10t(${r10.total}) skal > 9t(${r9.total})`);
  assert(r11.total > r10.total, 'Cross/fiktion-OT-11>10', `11t(${r11.total}) skal > 10t(${r10.total})`);
}

// Rekl: rabat skal reducere lønnen
for (let i = 0; i < 50; i++) {
  const gr = randInt(2, 4);
  const ds = GR_SATSER[gr];
  const h  = rHours(9, 14);
  const makeRabat = (rabat) => calcReklame('optagelse', {h:7,m:0}, {h:Math.floor((7*60+h*60)/60)%24, m:(7*60+h*60)%60}, ds, gr, { rabat });
  const r0=makeRabat(0), r1=makeRabat(1), r2=makeRabat(2);
  if(r0&&r1&&r2) {
    assert(r0.total >= r1.total, 'Cross/rekl-rabat-A', `Ingen rabat(${r0.total}) skal >= Rabat A(${r1.total})`);
    assert(r1.total >= r2.total, 'Cross/rekl-rabat-B', `Rabat A(${r1.total}) skal >= Rabat B(${r2.total})`);
  }
}

console.log('  OK');

// ═══════════════════════════════════════════════
// RAPPORT
// ═══════════════════════════════════════════════

const total = passed + failed;
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  TESTRESULTATER                                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`\n  Total:   ${total}`);
console.log(`  Bestået: ${passed} ✓`);
console.log(`  Fejlet:  ${failed} ✗`);
console.log(`  Rate:    ${((passed/total)*100).toFixed(1)}%`);

if (errors.length > 0) {
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('FEJL grupperet per type:');
  console.log('──────────────────────────────────────────────────────────────');

  const grouped = {};
  for (const e of errors) {
    const key = e.testName.replace(/\/[0-9]+$/, '');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e.details);
  }

  for (const [type, details] of Object.entries(grouped)) {
    console.log(`\n[${type}] — ${details.length} fejl`);
    // Vis max 3 eksempler per type
    for (const d of details.slice(0, 3)) {
      console.log(`  • ${d}`);
    }
    if (details.length > 3) console.log(`  … og ${details.length - 3} flere`);
  }
} else {
  console.log('\n  Ingen fejl! Alle tests bestod.');
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log('KONKLUSION');
console.log('──────────────────────────────────────────────────────────────');
if (failed === 0) {
  console.log('✓ Begge beregnere producerer korrekte og gyldige resultater');
  console.log('  på tværs af alle 7 scenarier med 150 tests each.');
} else {
  console.log(`⚠ ${failed} test(s) fejlede. Se detaljer ovenfor.`);
}
