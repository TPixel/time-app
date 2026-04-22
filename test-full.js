#!/usr/bin/env /usr/local/bin/node
// ═══════════════════════════════════════════════════════════════════════════
// time-app: Fuld testpakke — app.html + rekl.html
// Scenarier: weekend, helligdag, nat, 4-dags uge, 5-dags uge, enkelt dag,
//            dagsløngaranti, OT-bands, transport, pause, rabat
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

// ─── Test-harness ────────────────────────────────────────────────────────────
let passed = 0, failed = 0, failLog = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n▸ ${name}`);
}

function ok(cond, msg) {
  if (cond) { passed++; }
  else {
    failed++;
    const line = `  ✗ [${currentSuite}] ${msg}`;
    failLog.push(line);
    console.error(line);
  }
}

function eq(a, b, msg)    { ok(a === b,               `${msg} — got ${a}, expected ${b}`); }
function near(a, b, msg, tol = 0.02) {
  ok(Math.abs(a - b) <= tol, `${msg} — got ${a}, expected ~${b} (±${tol})`);
}
function h(hh, mm) { return { h: hh, m: mm }; }

// ─── Kode-udtræk fra HTML-filer ─────────────────────────────────────────────
function extractFn(src, ...names) {
  let code = '';
  for (const name of names) {
    let idx = src.indexOf(`\nfunction ${name}(`);
    if (idx === -1) idx = src.indexOf(`function ${name}(`);
    if (idx === -1) { console.error(`FEJL: function ${name} ikke fundet`); continue; }
    let depth = 0, i = idx;
    while (i < src.length && src[i] !== '{') i++;
    while (i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
      i++;
    }
    code += src.slice(idx, i + 1) + '\n\n';
  }
  return code;
}

// ─── Indlæs rekl.html ────────────────────────────────────────────────────────
const reklSrc = fs.readFileSync('/Users/thomas/time-app/rekl.html', 'utf8');
const reklCode = extractFn(reklSrc, 'otBands', 'overlap', 'calcReklame');
const reklCtx = vm.createContext({});
vm.runInNewContext(reklCode, reklCtx);
const { calcReklame, otBands, overlap } = reklCtx;

// ─── Indlæs app.html ─────────────────────────────────────────────────────────
const appSrc = fs.readFileSync('/Users/thomas/time-app/app.html', 'utf8');
// Vi sætter cfg op som global i konteksten FØR vi kører koden
const appCtx = vm.createContext({
  cfg: { ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' },
  DIÆT: 94,
  knapper: {},
  aktivDag: new Date(),
  tidStart: null, tidSlut: null,
  document: { getElementById: () => ({ textContent:'', style:{}, classList:{ toggle:()=>{}, remove:()=>{} } }), querySelectorAll:()=>[] },
  localStorage: { getItem:()=>null, setItem:()=>{}, key:()=>null, length:0 },
  produktioner: [],
  aktivProdId: null,
  visAlleProduktioner: false,
  otVis: false,
});
const appCode = extractFn(appSrc,
  'tidTilH', 'p2', 'timesats', 'timesatsMedTillæg',
  'calcTimer', 'calcForskudt', 'calcWeekendTimer', 'dagMax', 'calcLon'
);
vm.runInNewContext(appCode, appCtx);
const { calcTimer, calcForskudt, calcWeekendTimer, calcLon } = appCtx;

// Hjælper: sæt cfg i appCtx
function setCfg(overrides) {
  Object.assign(appCtx.cfg, {
    ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag'
  }, overrides);
}

// Standard opts til rekl (ingen extras)
const INGEN = { transport:0, nat:false, wk:0, rabat:0, helligdag:false,
  pauseForsinketFrokost:false, pauseIngenServering:false, pausePlanlagt:false,
  pause5:false, pause10:false, pause13:false, diaeter:0, persontillaeg:0, gr1OTSats:0 };

const DS2750 = 2750; // gr4 standard dagssats
const DS3300 = 3300; // gr3
const DS4100 = 4100; // gr2
const DS1540 = 1540; // gr5
const TS2750 = DS2750 / 8; // = 343.75

// ═══════════════════════════════════════════════════════════════════════════
// REKL.HTML TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. otBands ──────────────────────────────────────────────────────────────
suite('rekl · otBands');
{
  const b = otBands(8);
  eq(b.I, 0, '8t → bI=0'); eq(b.J, 0, '8t → bJ=0'); eq(b.K, 0, '8t → bK=0'); eq(b.L, 0, '8t → bL=0');
}
{
  const b = otBands(9);
  eq(b.I, 1, '9t → bI=1'); eq(b.J, 0, '9t → bJ=0');
}
{
  const b = otBands(10);
  eq(b.I, 2, '10t → bI=2'); eq(b.J, 0, '10t → bJ=0');
}
{
  const b = otBands(11);
  eq(b.I, 2, '11t → bI=2'); eq(b.J, 1, '11t → bJ=1'); eq(b.K, 0, '11t → bK=0');
}
{
  const b = otBands(12);
  eq(b.I, 2, '12t → bI=2'); eq(b.J, 2, '12t → bJ=2'); eq(b.K, 0, '12t → bK=0');
}
{
  const b = otBands(13);
  eq(b.I, 2, '13t → bI=2'); eq(b.J, 2, '13t → bJ=2'); eq(b.K, 1, '13t → bK=1'); eq(b.L, 0, '13t → bL=0');
}
{
  const b = otBands(14);
  eq(b.I, 2, '14t → bI=2'); eq(b.J, 2, '14t → bJ=2'); eq(b.K, 2, '14t → bK=2'); eq(b.L, 0, '14t → bL=0');
}
{
  const b = otBands(15);
  eq(b.I, 2, '15t → bI=2'); eq(b.J, 2, '15t → bJ=2'); eq(b.K, 2, '15t → bK=2'); eq(b.L, 1, '15t → bL=1');
}
{
  const b = otBands(16);
  eq(b.L, 2, '16t → bL=2');
}
{
  const b = otBands(18);
  eq(b.L, 4, '18t → bL=4');
}
eq(otBands(0).I, 0, '0t → bI=0');
eq(otBands(7).I, 0, '7t under grænsen → bI=0');

// ─── 2. overlap ─────────────────────────────────────────────────────────────
suite('rekl · overlap');
near(overlap(18, 24, 18, 24), 6, '18-24 overlapper 18-24 fuldt = 6t');
near(overlap(20, 24, 18, 24), 4, '20-24 overlapper 18-24 = 4t');
near(overlap(0, 6, 18, 24), 0, '0-6 overlapper ikke 18-24');
near(overlap(0, 6, 0, 6), 6, '0-6 overlapper 0-6 fuldt = 6t');
near(overlap(3, 9, 0, 6), 3, '3-9 overlapper 0-6 = 3t');
near(overlap(5, 10, 3, 6), 1, '5-10 overlapper 3-6 = 1t');
near(overlap(10, 14, 0, 6), 0, '10-14 overlapper ikke 0-6');
near(overlap(22, 30, 18, 24), 2, '22-30 (nat-skift) overlapper 18-24 = 2t');
near(overlap(22, 30, 24, 30), 6, '22-30 overlapper 24-30 = 6t');
near(overlap(6, 6, 6, 6), 0, 'tom interval = 0');

// ─── 3. Basis optagelse (ingen OT, ingen extras) ────────────────────────────
suite('rekl · 5-dags uge — normal optagelse gr2-4');
{
  // 8t optagelse gr4: normalKr = dagssats, garanti=0
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, INGEN);
  near(r.normalKr, DS2750, 'gr4 8t: normalKr = dagssats');
  near(r.otKr, 0, 'gr4 8t: ingen OT');
  near(r.garantiKr, 0, 'gr4 8t: ingen garanti');
  near(r.total, DS2750, 'gr4 8t: total = dagssats');
  near(r.raaTimer, 8, 'gr4 8t: raaTimer=8');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS3300, 3, INGEN);
  near(r.normalKr, DS3300, 'gr3 8t: normalKr = dagssats');
  near(r.total, DS3300, 'gr3 8t: total = dagssats');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS4100, 2, INGEN);
  near(r.normalKr, DS4100, 'gr2 8t: normalKr = dagssats');
  near(r.total, DS4100, 'gr2 8t: total = dagssats');
}
{
  // 6t optagelse gr4: normalKr < dagssats → garanti aktiveres
  const r = calcReklame('optagelse', h(9,0), h(15,0), DS2750, 4, INGEN);
  near(r.normalKr, 6 * TS2750, 'gr4 6t: normalKr = 6×ts');
  ok(r.garantiKr > 0, 'gr4 6t: garanti aktiv');
  near(r.total, DS2750, 'gr4 6t: total = dagssats via garanti');
}
{
  // 4t optagelse gr4: normalKr = 0.5×dagssats → garanti = 0.5×dagssats
  const r = calcReklame('optagelse', h(10,0), h(14,0), DS2750, 4, INGEN);
  near(r.normalKr, 4 * TS2750, 'gr4 4t: normalKr = 4×ts');
  near(r.garantiKr, DS2750 - 4 * TS2750, 'gr4 4t: garanti = rest til dagssats');
  near(r.total, DS2750, 'gr4 4t: total = dagssats via garanti');
}
{
  // 7t optagelse: normalKr = 7×ts < dagssats → garanti
  const r = calcReklame('optagelse', h(8,0), h(15,0), DS2750, 4, INGEN);
  near(r.garantiKr, DS2750 - 7 * TS2750, 'gr4 7t: garanti korrekt');
  near(r.total, DS2750, 'gr4 7t: total = dagssats');
}

// ─── 4. OT — 5-dags uge ─────────────────────────────────────────────────────
suite('rekl · OT optagelse gr4');
{
  // 9t: bI=1
  const r = calcReklame('optagelse', h(8,0), h(17,0), DS2750, 4, INGEN);
  near(r.bI, 1, '9t: bI=1');
  near(r.otKr, 1 * TS2750 * 1.25, '9t gr4: otKr = bI × ts × 1.25');
  ok(r.total > DS2750, '9t: total > dagssats (garanti ikke aktiv)');
  near(r.garantiKr, 0, '9t: ingen garanti');
}
{
  // 10t: bI=2
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS2750, 4, INGEN);
  near(r.bI, 2, '10t: bI=2');
  near(r.otKr, 2 * TS2750 * 1.25, '10t gr4: otKr = bI×ts×1.25');
}
{
  // 11t: bI=2, bJ=1
  const r = calcReklame('optagelse', h(8,0), h(19,0), DS2750, 4, INGEN);
  near(r.bI, 2, '11t: bI=2'); near(r.bJ, 1, '11t: bJ=1');
  const expected = 2 * TS2750 * 1.25 + 1 * TS2750 * 2.00;
  near(r.otKr, expected, '11t gr4: otKr korrekt');
}
{
  // 12t: bI=2, bJ=2
  const r = calcReklame('optagelse', h(8,0), h(20,0), DS2750, 4, INGEN);
  near(r.bI, 2, '12t: bI=2'); near(r.bJ, 2, '12t: bJ=2'); near(r.bK, 0, '12t: bK=0');
  near(r.otKr, 2 * TS2750 * 1.25 + 2 * TS2750 * 2.00, '12t gr4: otKr');
}
{
  // 13t: bI=2, bJ=2, bK=1
  const r = calcReklame('optagelse', h(8,0), h(21,0), DS2750, 4, INGEN);
  near(r.bK, 1, '13t: bK=1');
  const exp = 2*TS2750*1.25 + 2*TS2750*2.00 + 1*TS2750*2.50;
  near(r.otKr, exp, '13t gr4: otKr');
}
{
  // 14t: bK=2, bL=0
  const r = calcReklame('optagelse', h(8,0), h(22,0), DS2750, 4, INGEN);
  near(r.bK, 2, '14t: bK=2'); near(r.bL, 0, '14t: bL=0');
}
{
  // 15t: bL=1
  const r = calcReklame('optagelse', h(8,0), h(23,0), DS2750, 4, INGEN);
  near(r.bL, 1, '15t: bL=1');
  const exp = 2*TS2750*1.25 + 2*TS2750*2.00 + 2*TS2750*2.50 + 1*TS2750*3.00;
  near(r.otKr, exp, '15t gr4: otKr');
}
{
  // 16t: bL=2
  const r = calcReklame('optagelse', h(8,0), h(0,0), DS2750, 4, INGEN);  // 16t nat-skift
  near(r.raaTimer, 16, '16t nat-skift: raaTimer=16');
  near(r.bL, 2, '16t: bL=2');
}

suite('rekl · OT optagelse gr2');
{
  const ts = DS4100 / 8;
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS4100, 2, INGEN);
  near(r.otKr, 2 * ts * 1.25, '10t gr2: otKr = bI×ts×1.25');
}
{
  const ts = DS4100 / 8;
  const r = calcReklame('optagelse', h(8,0), h(21,0), DS4100, 2, INGEN);
  const exp = 2*ts*1.25 + 2*ts*2.00 + 1*ts*2.50;
  near(r.otKr, exp, '13t gr2: otKr korrekt');
}

suite('rekl · OT gr3 forbered');
{
  // Forbered: +25%/+50%/+75%/+75% — OT ikke +25%/+100%/...
  const ts = DS3300 / 8;
  const r = calcReklame('forbered', h(8,0), h(18,0), DS3300, 3, INGEN);
  near(r.bI, 2, 'forbered 10t: bI=2');
  near(r.otKr, 2 * ts * 1.25, 'forbered gr3 10t: bI sats = 1.25');
}
{
  const ts = DS3300 / 8;
  const r = calcReklame('forbered', h(8,0), h(20,0), DS3300, 3, INGEN);
  near(r.otKr, 2*ts*1.25 + 2*ts*1.50, 'forbered gr3 12t: bI+bJ');
}
{
  const ts = DS3300 / 8;
  const r = calcReklame('forbered', h(8,0), h(22,0), DS3300, 3, INGEN);
  near(r.otKr, 2*ts*1.25 + 2*ts*1.50 + 2*ts*1.75, 'forbered gr3 14t: bI+bJ+bK');
}
{
  // bL på forbered: stadig 1.75 (ikke 3.00)
  const ts = DS3300 / 8;
  const r = calcReklame('forbered', h(8,0), h(23,0), DS3300, 3, INGEN);
  near(r.otKr, 2*ts*1.25 + 2*ts*1.50 + 2*ts*1.75 + 1*ts*1.75, 'forbered gr3 15t: bL = 1.75');
}

// ─── 5. Gruppe 5 fast OT-sats ───────────────────────────────────────────────
suite('rekl · gruppe 5 fast OT');
{
  const r = calcReklame('optagelse', h(8,0), h(17,0), DS1540, 5, INGEN);
  near(r.otKr, 1 * 200, 'gr5 9t: otKr = 1×200');
}
{
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS1540, 5, INGEN);
  near(r.otKr, 2 * 200, 'gr5 10t: otKr = 2×200');
}
{
  const r = calcReklame('optagelse', h(8,0), h(20,0), DS1540, 5, INGEN);
  near(r.otKr, 4 * 200, 'gr5 12t: bI+bJ = 4×200');
}
{
  const r = calcReklame('optagelse', h(8,0), h(22,0), DS1540, 5, INGEN);
  near(r.otKr, 6 * 200, 'gr5 14t: bI+bJ+bK = 6×200');
}
{
  const r = calcReklame('optagelse', h(8,0), h(23,0), DS1540, 5, INGEN);
  near(r.otKr, 6 * 200 + 1 * 350, 'gr5 15t: bL = 350');
}
{
  const r = calcReklame('optagelse', h(8,0), h(0,0), DS1540, 5, INGEN); // 16t
  near(r.otKr, 6 * 200 + 2 * 350, 'gr5 16t: bL=2 → 2×350');
}

// ─── 6. Gruppe 1 fri forhandling ────────────────────────────────────────────
suite('rekl · gruppe 1 fri forhandling');
{
  const r = calcReklame('optagelse', h(8,0), h(18,0), 5000, 1, {...INGEN, gr1OTSats:0});
  near(r.otKr, 0, 'gr1 gr1OTSats=0: ingen OT-betaling');
  near(r.bI, 2, 'gr1 10t: bI=2');
}
{
  const r = calcReklame('optagelse', h(8,0), h(18,0), 5000, 1, {...INGEN, gr1OTSats:500});
  near(r.otKr, 2 * 500, 'gr1 gr1OTSats=500, 10t: 2×500=1000');
}
{
  const r = calcReklame('optagelse', h(8,0), h(21,0), 5000, 1, {...INGEN, gr1OTSats:800});
  near(r.otKr, 5 * 800, 'gr1 13t: 5 OT-timer × 800');
}
{
  // gr1 garanti: 8t med ingen OT-sats → brutto = normalKr < dagssats? Nej: brutto = normalKr = dagssats
  const r = calcReklame('optagelse', h(8,0), h(16,0), 5000, 1, {...INGEN, gr1OTSats:0});
  near(r.garantiKr, 0, 'gr1 8t: garanti=0 (brutto=dagssats)');
}

// ─── 7. Forbered scenarie ───────────────────────────────────────────────────
suite('rekl · forbered minimum 4 timer');
{
  // 1t forbered → arbejdsTimer=4
  const r = calcReklame('forbered', h(10,0), h(11,0), DS2750, 4, INGEN);
  near(r.raaTimer, 1, 'forbered 1t: raaTimer=1');
  near(r.arbejdsTimer, 4, 'forbered 1t: arbejdsTimer=4 (minimum)');
  near(r.normalKr, 4 * TS2750, 'forbered 1t: betalt for 4t');
}
{
  const r = calcReklame('forbered', h(10,0), h(12,0), DS2750, 4, INGEN);
  near(r.arbejdsTimer, 4, 'forbered 2t: arbejdsTimer=4');
}
{
  const r = calcReklame('forbered', h(10,0), h(14,0), DS2750, 4, INGEN);
  near(r.arbejdsTimer, 4, 'forbered 4t nøjagtigt: arbejdsTimer=4');
}
{
  const r = calcReklame('forbered', h(10,0), h(15,0), DS2750, 4, INGEN);
  near(r.arbejdsTimer, 5, 'forbered 5t: arbejdsTimer=5');
}
{
  const r = calcReklame('forbered', h(8,0), h(18,0), DS2750, 4, INGEN);
  near(r.arbejdsTimer, 10, 'forbered 10t: arbejdsTimer=10');
  near(r.bI, 2, 'forbered 10t: bI=2');
}
{
  // Forbered: ingen garanti, ingen transport, nat, wk
  const r = calcReklame('forbered', h(10,0), h(11,0), DS2750, 4, {...INGEN, nat:true, wk:2, transport:2});
  near(r.natKr, 0, 'forbered: nat ignoreres');
  near(r.wkKr, 0, 'forbered: weekend ignoreres');
  near(r.transKr, 0, 'forbered: transport ignoreres');
  near(r.garantiKr, 0, 'forbered: ingen garanti');
}
{
  // Forbered: ingen pause-betalinger
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, pauseForsinketFrokost:true, pauseIngenServering:true});
  near(r.pauseKr, 0, 'forbered: pause ignoreres');
}
{
  // Forbered: ingen rabat
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:1});
  near(r.rabatKr, 0, 'forbered: rabat ignoreres');
}

// ─── 8. Dagsløngaranti ─────────────────────────────────────────────────────
suite('rekl · dagsløngaranti');
{
  // 8t optagelse: brutto=dagssats → garanti=0
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, INGEN);
  near(r.garantiKr, 0, 'dagsløngaranti: 8t nøjagtig = ingen garanti');
}
{
  // >8t: brutto>dagssats → garanti=0
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS2750, 4, INGEN);
  near(r.garantiKr, 0, 'dagsløngaranti: >8t ingen garanti');
}
{
  // 3t optagelse: brutto=3×ts, garanti=dagssats-brutto
  const r = calcReklame('optagelse', h(10,0), h(13,0), DS2750, 4, INGEN);
  const brutto = 3 * TS2750;
  near(r.garantiKr, DS2750 - brutto, '3t: garanti præcis');
  near(r.total, DS2750, '3t: total=dagssats');
}
{
  // Med weekend (wkKr kan løfte brutto over dagssats)
  const r = calcReklame('optagelse', h(10,0), h(14,0), DS2750, 4, {...INGEN, wk:2});
  // 4t: normalKr = 4×ts=1375, wkKr=4×ts×1.0=1375 → brutto=2750=dagssats → garanti=0
  near(r.garantiKr, 0, '4t weekend 100%: brutto=dagssats → garanti=0');
}
{
  // Rabat trækker fra, kan gøre brutto < dagssats → garanti aktiveres
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:2});
  // normalKr=2750, rabat=15%: rabatKr=-412.5, brutto=2337.5 < 2750 → garanti=412.5
  near(r.brutto, 2750 * 0.85, '8t rabat B: brutto=85% af dagssats');
  near(r.garantiKr, 2750 * 0.15, '8t rabat B: garanti=15%');
  near(r.total, DS2750, '8t rabat B: total=dagssats');
}

// ─── 9. Weekend ─────────────────────────────────────────────────────────────
suite('rekl · weekend tillæg');
{
  // wk=0: ingen weekend
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, wk:0});
  near(r.wkKr, 0, 'wk=0: ingen weekend-kr');
}
{
  // wk=1: +75%
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, wk:1});
  near(r.wkKr, 8 * TS2750 * 0.75, 'wk=1: 75% af 8t normaltid');
  near(r.effWk, 1, 'wk=1: effWk=1');
}
{
  // wk=2: +100%
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, wk:2});
  near(r.wkKr, 8 * TS2750 * 1.0, 'wk=2: 100% af 8t normaltid');
  near(r.effWk, 2, 'wk=2: effWk=2');
}
{
  // helligdag + wk=0 → effWk opgraderes til 2 (100%)
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, helligdag:true, wk:0});
  near(r.effWk, 2, 'helligdag wk=0 → effWk=2');
  near(r.wkKr, 8 * TS2750 * 1.0, 'helligdag wk=0: 100% wk-tillæg');
}
{
  // helligdag + wk=1 → effWk opgraderes til 2
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, helligdag:true, wk:1});
  near(r.effWk, 2, 'helligdag wk=1 → effWk=2');
  near(r.wkKr, 8 * TS2750 * 1.0, 'helligdag wk=1: 100% wk-tillæg');
}
{
  // helligdag + wk=2 → ingen ændring
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, helligdag:true, wk:2});
  near(r.effWk, 2, 'helligdag wk=2 → effWk=2 (uændret)');
}
{
  // Weekend inkluderer transport-timer (optagelse)
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, wk:1, transport:2});
  // wTimer = 8+2 = 10, wkKr = 10×ts×0.75
  near(r.wkKr, (8+2) * TS2750 * 0.75, 'wk=1 med 2t transport: weekend inkl. transport');
}
{
  // Forbered: ingen weekend
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, wk:2, helligdag:true});
  near(r.wkKr, 0, 'forbered: weekend ignoreres');
}
{
  // 10t med weekend wk=2
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS2750, 4, {...INGEN, wk:2});
  // arbejdsTimer=10, wTimer=10+0=10, wkKr=10×ts×1.0
  near(r.wkKr, 10 * TS2750 * 1.0, '10t wk=2: weekend på alle 10t');
}

// ─── 10. Helligdag ──────────────────────────────────────────────────────────
suite('rekl · helligdag');
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, helligdag:true, wk:0});
  ok(r.helligdag, 'helligdag flag sat');
  near(r.wkKr, 8 * TS2750, 'helligdag 8t: wkKr=dagssats (100%)');
}
{
  // Helligdag kombineret med OT: 10t
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS2750, 4, {...INGEN, helligdag:true, wk:2});
  near(r.wkKr, 10 * TS2750 * 1.0, 'helligdag 10t: wkKr på alle 10t');
}
{
  // Forbered: helligdag ignoreres for wk
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, helligdag:true, wk:2});
  near(r.wkKr, 0, 'forbered + helligdag: ingen wkKr');
}

// ─── 11. Nat-gene ────────────────────────────────────────────────────────────
suite('rekl · nat-gene');
{
  // Dagvagt 08-16: ingen nat
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, nat:true});
  near(r.natKr, 0, 'dagvagt 08-16: ingen nat-gene');
  near(r.nat18t, 0, 'dagvagt: nat18t=0');
}
{
  // 18:00-24:00 = 6t aftenvagt (100kr/t)
  const r = calcReklame('optagelse', h(18,0), h(0,0), DS2750, 4, {...INGEN, nat:true});
  near(r.nat18t, 6, '18-24: nat18t=6');
  near(r.nat00t, 0, '18-24: nat00t=0');
  near(r.natKr, 6 * 100, '18-24: natKr=600');
}
{
  // 00:00-06:00 = 6t natgevagt (200kr/t)
  const r = calcReklame('optagelse', h(0,0), h(6,0), DS2750, 4, {...INGEN, nat:true});
  near(r.nat18t, 0, '00-06: nat18t=0');
  near(r.nat00t, 6, '00-06: nat00t=6');
  near(r.natKr, 6 * 200, '00-06: natKr=1200');
}
{
  // Nat-skift 22:00-04:00 = 6t rå (men 5.5t efter 30 min pause — nej, calcReklame trækker IKKE pause fra)
  // sh=22, eh=22+6=28 (4+24). nat18t=overlap(22,28,18,24)=2, nat00t=overlap(22,28,24,30)=4
  const r = calcReklame('optagelse', h(22,0), h(4,0), DS2750, 4, {...INGEN, nat:true});
  near(r.nat18t, 2, '22-04: nat18t=2 (22-24)');
  near(r.nat00t, 4, '22-04: nat00t=4 (00-04)');
  near(r.natKr, 2*100 + 4*200, '22-04: natKr=200+800=1000');
}
{
  // 20:00-02:00 = 6t. sh=20, eh=26. nat18t=overlap(20,26,18,24)=4, nat00t=overlap(20,26,24,30)=2
  const r = calcReklame('optagelse', h(20,0), h(2,0), DS2750, 4, {...INGEN, nat:true});
  near(r.nat18t, 4, '20-02: nat18t=4');
  near(r.nat00t, 2, '20-02: nat00t=2');
  near(r.natKr, 4*100 + 2*200, '20-02: natKr=800');
}
{
  // 06:00-18:00: ingen nat (dag inden for nat-frizone)
  const r = calcReklame('optagelse', h(6,0), h(18,0), DS2750, 4, {...INGEN, nat:true});
  near(r.natKr, 0, '06-18: ingen nat-gene');
}
{
  // nat=false: ingen nat-gene selv med aftengevagt
  const r = calcReklame('optagelse', h(18,0), h(0,0), DS2750, 4, {...INGEN, nat:false});
  near(r.natKr, 0, 'nat=false: natKr=0 uanset tidspunkt');
}
{
  // Forbered: nat ignoreres
  const r = calcReklame('forbered', h(22,0), h(4,0), DS2750, 4, {...INGEN, nat:true});
  near(r.natKr, 0, 'forbered: nat ignoreres');
}

// ─── 12. Transport ────────────────────────────────────────────────────────────
suite('rekl · transport');
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, transport:2});
  near(r.transTimer, 2, '2t transport: transTimer=2');
  near(r.transKr, 2 * TS2750 * 1.75, '2t transport: transKr=2×ts×1.75');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, transport:0.5});
  near(r.transKr, 0.5 * TS2750 * 1.75, '0.5t transport');
}
{
  // Forbered: ingen transport
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, transport:3});
  near(r.transKr, 0, 'forbered: transport ignoreres');
  near(r.transTimer, 0, 'forbered: transTimer=0');
}
{
  // Transport med weekend: transport indgår i wkKr base
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, wk:1, transport:1});
  near(r.wkKr, (8+1) * TS2750 * 0.75, 'transport indgår i weekend-base');
}

// ─── 13. Pause-betalinger ────────────────────────────────────────────────────
suite('rekl · pause-betalinger optagelse');
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, pauseForsinketFrokost:true});
  near(r.pauseKr, (30/60) * TS2750 * 2.00, 'forsinket frokost: 30min × ts × 200%');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, pauseIngenServering:true});
  near(r.pauseKr, (15/60) * TS2750 * 2.50, 'ingen servering: 15min × ts × 250%');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, pausePlanlagt:true});
  near(r.pauseKr, (45/60) * TS2750 * 1.25, 'planlagt pause: 45min × ts × 125%');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, pause5:true});
  near(r.pauseKr, (30/60) * TS2750 * 2.00, 'pause5: 30min × ts × 200%');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, pause10:true});
  near(r.pauseKr, (30/60) * TS2750 * 2.00, 'pause10: 30min × ts × 200%');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, pause13:true});
  near(r.pauseKr, (30/60) * TS2750 * 2.00, 'pause13: 30min × ts × 200%');
}
{
  // Alle pauser kombineret
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {
    ...INGEN, pauseForsinketFrokost:true, pauseIngenServering:true, pausePlanlagt:true,
    pause5:true, pause10:true, pause13:true
  });
  const expected = (30/60)*TS2750*2.00 + (15/60)*TS2750*2.50 + (45/60)*TS2750*1.25 + 3*(30/60)*TS2750*2.00;
  near(r.pauseKr, expected, 'alle pauser kombineret');
}
{
  // Forbered: ingen pause
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, pause5:true, pauseForsinketFrokost:true});
  near(r.pauseKr, 0, 'forbered: pauser ignoreres');
}

// ─── 14. Rabat ───────────────────────────────────────────────────────────────
suite('rekl · rabat');
{
  // Rabat A = -10% af (normal+ot)
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:1});
  near(r.rabatKr, -DS2750 * 0.10, 'rabat A: -10% af normalKr');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:2});
  near(r.rabatKr, -DS2750 * 0.15, 'rabat B: -15% af normalKr');
}
{
  // Rabat på 10t (normal + OT)
  const r = calcReklame('optagelse', h(8,0), h(18,0), DS2750, 4, {...INGEN, rabat:1});
  const normalOtSum = r.normalKr + (r.rabatKr / -0.10); // back-calculate
  // rabatKr = -(normalKr + otKr) × 0.10
  const exp = -(r.normalKr + 2 * TS2750 * 1.25) * 0.10;
  near(r.rabatKr, exp, 'rabat A på 10t: inkluderer OT');
}
{
  // Rabat på forbered: ingen
  const r = calcReklame('forbered', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:1});
  near(r.rabatKr, 0, 'forbered: rabat ignoreres');
}
{
  // Rabat gælder ikke wkKr, natKr, transKr, pauseKr
  const r1 = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:1, wk:1, nat:true, transport:1});
  const r2 = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, rabat:0, wk:1, nat:true, transport:1});
  near(r1.rabatKr, -DS2750 * 0.10, 'rabat: kun på normal+ot, ikke wk/nat/trans');
  near(r1.wkKr, r2.wkKr, 'rabat: wkKr uændret');
}

// ─── 15. Diæter og personligt tillæg ────────────────────────────────────────
suite('rekl · diæter og personligt tillæg');
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, diaeter:1});
  near(r.diaetKr, 172.20, '1 diæt = 172.20 kr');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, diaeter:3});
  near(r.diaetKr, 3 * 172.20, '3 diæter = 3×172.20 kr');
}
{
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS2750, 4, {...INGEN, persontillaeg:500});
  near(r.persontillaegKr, 500, 'personligt tillæg 500 kr');
  near(r.total, DS2750 + 500, 'total inkl. personligt tillæg');
}
{
  // Diæter lægges til efter garanti
  const r = calcReklame('optagelse', h(10,0), h(13,0), DS2750, 4, {...INGEN, diaeter:2});
  near(r.total, DS2750 + 2 * 172.20, '3t + diæter: total=garanti+diæter');
}

// ─── 16. Nat-skift (e < s) ───────────────────────────────────────────────────
suite('rekl · nat-skift krydsende midnat');
{
  const r = calcReklame('optagelse', h(22,0), h(6,0), DS2750, 4, INGEN);
  near(r.raaTimer, 8, '22-06: 8t nat-skift');
  near(r.normalKr, 8 * TS2750, '22-06: normalKr = 8×ts');
}
{
  const r = calcReklame('optagelse', h(20,0), h(5,0), DS2750, 4, INGEN);
  near(r.raaTimer, 9, '20-05: 9t nat-skift');
  near(r.bI, 1, '20-05: bI=1 OT');
}
{
  const r = calcReklame('optagelse', h(18,0), h(8,0), DS2750, 4, INGEN);
  near(r.raaTimer, 14, '18-08: 14t nat-skift');
  near(r.bK, 2, '18-08: bK=2');
}

// ─── 17. Null-check ─────────────────────────────────────────────────────────
suite('rekl · null-check');
{
  ok(calcReklame('optagelse', null, h(16,0), DS2750, 4, INGEN) === null, 'manglende start → null');
  ok(calcReklame('optagelse', h(8,0), null, DS2750, 4, INGEN) === null, 'manglende slut → null');
  ok(calcReklame('optagelse', null, null, DS2750, 4, INGEN) === null, 'begge null → null');
}
{
  // Samme tidspunkt: 0t
  const r = calcReklame('optagelse', h(8,0), h(8,0), DS2750, 4, INGEN);
  near(r.raaTimer, 0, 'start=slut: 0 timer');
}

// ═══════════════════════════════════════════════════════════════════════════
// APP.HTML TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 18. calcTimer ───────────────────────────────────────────────────────────
suite('app · calcTimer');
{
  // Normal dagvagt
  const t = calcTimer(h(8,0), h(16,0));
  near(t, 7.5, '08-16 = 8t - 0.5t pause = 7.5t');
}
{
  near(calcTimer(h(8,0), h(16,30)), 8.0, '08-16:30 = 8.5t - 0.5 = 8t');
}
{
  near(calcTimer(h(9,0), h(17,0)), 7.5, '09-17 = 8t - 0.5 = 7.5t');
}
{
  near(calcTimer(h(6,0), h(19,0)), 12.5, '06-19 = 13t - 0.5 = 12.5t');
}
{
  // Nat-skift
  near(calcTimer(h(22,0), h(6,0)), 7.5, '22-06 = 8t - 0.5 = 7.5t');
}
{
  near(calcTimer(h(20,0), h(4,0)), 7.5, '20-04 = 8t - 0.5 = 7.5t');
}
{
  near(calcTimer(h(0,0), h(12,0)), 11.5, '00-12 = 12t - 0.5 = 11.5t');
}
{
  // Null-check
  ok(calcTimer(null, h(16,0)) === null, 'null start → null');
  ok(calcTimer(h(8,0), null) === null, 'null slut → null');
  ok(calcTimer(null, null) === null, 'begge null → null');
}
{
  // 30 min vagt → max(0, 0-0.5) = 0
  near(calcTimer(h(8,0), h(8,30)), 0, '30min vagt → 0 efter pause-fradrag');
}
{
  near(calcTimer(h(8,0), h(8,0)), -0.5 < 0 ? 0 : -0.5, 'start=slut: 0t');
  // Actually max(0, -0.5) = 0
  ok(calcTimer(h(8,0), h(8,0)) === 0, 'start=slut: calcTimer=0');
}
{
  near(calcTimer(h(8,0), h(12,0)), 3.5, '08-12 = 4t - 0.5 = 3.5t');
}
{
  near(calcTimer(h(7,30), h(15,30)), 7.5, '07:30-15:30 = 8t - 0.5 = 7.5t');
}

// ─── 19. calcForskudt ────────────────────────────────────────────────────────
suite('app · calcForskudt §7');
{
  // Lørdag/søndag: altid 0
  near(calcForskudt(h(5,0), h(23,0), 6), 0, 'lørdag: calcForskudt=0');
  near(calcForskudt(h(5,0), h(23,0), 0), 0, 'søndag: calcForskudt=0');
}
{
  // Mandag-fredag inden for 06-19: 0
  near(calcForskudt(h(6,0), h(19,0), 2), 0, 'tirs 06-19: ingen §7');
  near(calcForskudt(h(8,0), h(16,0), 3), 0, 'ons 08-16: ingen §7');
}
{
  // Tidlig start under 06:00 (onsdag)
  near(calcForskudt(h(5,0), h(19,0), 3), 1, 'ons 05-19: 1t §7 (05-06)');
  near(calcForskudt(h(4,0), h(19,0), 3), 2, 'ons 04-19: 2t §7 (04-06)');
  near(calcForskudt(h(0,0), h(19,0), 3), 6, 'ons 00-19: 6t §7 (00-06)');
}
{
  // Sen afslutning efter 19:00 (onsdag)
  near(calcForskudt(h(6,0), h(20,0), 3), 1, 'ons 06-20: 1t §7 (19-20)');
  near(calcForskudt(h(6,0), h(22,0), 3), 3, 'ons 06-22: 3t §7 (19-22)');
  near(calcForskudt(h(6,0), h(0,0), 3), 5, 'ons 06-00: 5t §7 (19-24)');
}
{
  // Både tidlig og sen (onsdag)
  near(calcForskudt(h(5,0), h(20,0), 3), 2, 'ons 05-20: 2t §7 (05-06 + 19-20)');
  near(calcForskudt(h(4,0), h(22,0), 3), 5, 'ons 04-22: 5t §7 (04-06 + 19-22)');
}
{
  // Fredag: 20:00-24:00 er §8 weekend, ikke §7
  near(calcForskudt(h(6,0), h(21,0), 5), 1, 'fre 06-21: 1t §7 (19-20), ikke 19-21');
  near(calcForskudt(h(6,0), h(20,0), 5), 1, 'fre 06-20: 1t §7 (19-20)');
  near(calcForskudt(h(6,0), h(19,0), 5), 0, 'fre 06-19: ingen §7');
  near(calcForskudt(h(20,0), h(0,0), 5), 0, 'fre 20-00: kun §8, ingen §7');
}
{
  // Mandag: 00:00-06:00 er §8 weekend, ikke §7
  near(calcForskudt(h(3,0), h(19,0), 1), 0, 'man 03-19: 00-06 er §8, ingen §7');
  // Man: aFsk = max(3, 6) = 6. Ingen tidlig del. Ingen sen del (slut=19).
  near(calcForskudt(h(3,0), h(20,0), 1), 1, 'man 03-20: 00-06=§8, 19-20=§7');
}
{
  // Nat-skift (torsdag 22-06)
  // tor 22-06: [22,24]→2t §7 (efter 19) + [0,6]→6t §7 (før 06) = 8t
  // §8 starter først fredag 20:00 — [0,6] på tors nat er §7, ikke §8
  near(calcForskudt(h(22,0), h(6,0), 4), 8, 'tor 22-06: 8t §7 (2t aften + 6t nat)');
}

// ─── 20. calcWeekendTimer §8 ─────────────────────────────────────────────────
suite('app · calcWeekendTimer §8');
{
  // Lørdag: hele vagten
  near(calcWeekendTimer(h(8,0), h(16,0), 6), 8, 'lør 08-16: 8t §8');
  near(calcWeekendTimer(h(0,0), h(8,0), 6), 8, 'lør 00-08: 8t §8');
  near(calcWeekendTimer(h(22,0), h(6,0), 6), 8, 'lør 22-06 nat-skift: 8t §8');
}
{
  // Søndag: hele vagten
  near(calcWeekendTimer(h(8,0), h(16,0), 0), 8, 'søn 08-16: 8t §8');
  near(calcWeekendTimer(h(0,0), h(12,0), 0), 12, 'søn 00-12: 12t §8');
}
{
  // Fredag: fra 20:00
  near(calcWeekendTimer(h(21,0), h(23,0), 5), 2, 'fre 21-23: 2t §8');
  near(calcWeekendTimer(h(20,0), h(0,0), 5), 4, 'fre 20-00: 4t §8');
  near(calcWeekendTimer(h(18,0), h(22,0), 5), 2, 'fre 18-22: 2t §8 (kun 20-22)');
  near(calcWeekendTimer(h(18,0), h(19,0), 5), 0, 'fre 18-19: 0t §8 (slut før 20)');
  near(calcWeekendTimer(h(8,0), h(16,0), 5), 0, 'fre 08-16: 0t §8');
  near(calcWeekendTimer(h(20,0), h(6,0), 5), 10, 'fre 20-06 nat-skift: 10t §8');
}
{
  // Mandag: til 06:00
  near(calcWeekendTimer(h(0,0), h(6,0), 1), 6, 'man 00-06: 6t §8');
  near(calcWeekendTimer(h(3,0), h(8,0), 1), 3, 'man 03-08: 3t §8 (03-06)');
  near(calcWeekendTimer(h(7,0), h(15,0), 1), 0, 'man 07-15: 0t §8');
  near(calcWeekendTimer(h(0,0), h(4,0), 1), 4, 'man 00-04: 4t §8');
}
{
  // Tirsdag-torsdag: 0
  near(calcWeekendTimer(h(8,0), h(16,0), 2), 0, 'tirs: 0t §8');
  near(calcWeekendTimer(h(8,0), h(16,0), 3), 0, 'ons: 0t §8');
  near(calcWeekendTimer(h(8,0), h(16,0), 4), 0, 'tor: 0t §8');
}

// ─── 21. calcLon — 5-dags uge normal ─────────────────────────────────────────
suite('app · 5-dags uge normal calcLon');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
const TS = 10380 / 40; // = 259.5 kr/t
{
  // 8t uvarslet: kun normal
  const l = calcLon(7.5, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  near(l.total, Math.round(TS * 7.5), '7.5t: total=normalKr');
  near(l.normal, Math.round(TS * 7.5), '7.5t: normal=ts×7.5');
  eq(l.ot1, 0, '7.5t: ot1=0');
  eq(l.wk, 0, '7.5t: wk=0');
}
{
  const l = calcLon(8, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  near(l.total, Math.round(TS * 8), '8t: total=normalKr');
  eq(l.ot1H, 0, '8t: ingen OT');
}
{
  // 9t uvarslet: ot1=1t
  const l = calcLon(9, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot1H, 1, '9t: ot1H=1');
  eq(l.ot2H, 0, '9t: ot2H=0');
  near(l.ot1, Math.round(TS * 1.75 * 1), '9t uvarslet: ot1=ts×1.75');
  near(l.total, Math.round(TS*8 + TS*1.75), '9t uvarslet: total');
}
{
  // 10t uvarslet: ot1+ot2
  const l = calcLon(10, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot1H, 1, '10t: ot1H=1');
  near(l.ot2H, 1, '10t: ot2H=1');
  near(l.ot2, Math.round(TS * 2.00 * 1), '10t uvarslet: ot2=ts×2.00');
  near(l.total, Math.round(TS*8 + TS*1.75 + TS*2.00), '10t uvarslet: total');
}
{
  // 11t uvarslet: ot1+ot2+ot3
  const l = calcLon(11, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot3H, 1, '11t: ot3H=1');
  near(l.ot3, Math.round(TS * 2.35 * 1), '11t uvarslet: ot3=ts×2.35');
  near(l.total, Math.round(TS*8 + TS*1.75 + TS*2.00 + TS*2.35), '11t uvarslet: total');
}
{
  // 12t uvarslet: ot3H=2
  const l = calcLon(12, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot3H, 2, '12t: ot3H=2');
  near(l.total, Math.round(TS*8 + TS*1.75 + TS*2.00 + TS*2.35*2), '12t uvarslet: total');
}

// ─── 22. Varslet OT ──────────────────────────────────────────────────────────
suite('app · varslet OT');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  const l = calcLon(9, { varslet:true, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  near(l.ot1, Math.round(TS * 1.50 * 1), '9t varslet: ot1=ts×1.50');
}
{
  const l = calcLon(10, { varslet:true, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  near(l.ot2, Math.round(TS * 1.60 * 1), '10t varslet: ot2=ts×1.60');
  near(l.total, Math.round(TS*8 + TS*1.50 + TS*1.60), '10t varslet: total');
}
{
  const l = calcLon(11, { varslet:true, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  near(l.ot3, Math.round(TS * 2.35 * 1), '11t varslet: ot3=ts×2.35');
}
{
  // Uvarslet vs varslet OT: uvarslet betaler mere
  const lV = calcLon(10, { varslet:true, helligdag:false, frokost:false, pause10:false });
  const lU = calcLon(10, { uvarslet:true, helligdag:false, frokost:false, pause10:false });
  ok(lU.total > lV.total, 'uvarslet OT betaler mere end varslet OT');
}

// ─── 23. Ingen OT-type (§6e default uvarslet) ────────────────────────────────
suite('app · ingen OT-type → uvarslet som default');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  const lNone = calcLon(9, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  const lU    = calcLon(9, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  eq(lNone.total, lU.total, 'ingen type = uvarslet (§6e)');
}

// ─── 24. Helligdag ───────────────────────────────────────────────────────────
suite('app · helligdag §8.2');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  // 8t helligdag, wkRate=0.75: wk=8×ts×0.75
  const l = calcLon(8, { helligdag:true, frokost:false, pause10:false }, 0, 0.75);
  near(l.wk, Math.round(TS * 0.75 * 8), 'helligdag 8t: wk=ts×0.75×8');
  near(l.normal, Math.round(TS * 8), 'helligdag 8t: normal betalt');
  near(l.total, Math.round(TS*8 + TS*0.75*8), 'helligdag 8t total');
}
{
  // Minimum 4 timer wk-basis ved helligdag
  const l = calcLon(2, { helligdag:true, frokost:false, pause10:false }, 0, 0.75);
  near(l.wk, Math.round(TS * 0.75 * 4), 'helligdag 2t: wk betales for min. 4t');
}
{
  const l = calcLon(4, { helligdag:true, frokost:false, pause10:false }, 0, 0.75);
  near(l.wk, Math.round(TS * 0.75 * 4), 'helligdag 4t: wk basis=4');
}
{
  // wkRate=1.0 (2.+ weekenddag)
  const l = calcLon(8, { helligdag:true, frokost:false, pause10:false }, 0, 1.0);
  near(l.wk, Math.round(TS * 1.0 * 8), 'helligdag wkRate=1.0: wk=ts×1.0×8');
}
{
  // Helligdag OT (varslet)
  const l = calcLon(9, { helligdag:true, varslet:true, frokost:false, pause10:false }, 0, 0.75);
  // ot1 = tsWk × (1 + wkRate + 0.50) × 1 = TS × 1.75 × 1... men inkl. enkeltdag osv.
  // Tjek at OT er beregnet
  ok(l.ot1 > 0, 'helligdag 9t varslet: ot1 betalt');
  near(l.ot1, Math.round(TS * (1 + 0.75 + 0.50) * 1), 'helligdag 9t varslet: ot1=ts×2.25');
}
{
  // Helligdag OT uvarslet
  const l = calcLon(10, { helligdag:true, uvarslet:true, frokost:false, pause10:false }, 0, 0.75);
  near(l.ot2, Math.round(TS * (1 + 0.75 + 0.60) * 1), 'helligdag 10t uvarslet: ot2=ts×2.35');
}

// ─── 25. Enkeltdag §3.10 ────────────────────────────────────────────────────
suite('app · enkeltdag +10%');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  const l = calcLon(8, { enkeltdag:true, varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  const tsNormEnk = (10380/40) * 1.1; // = 285.45
  near(l.normal, Math.round(tsNormEnk * 8), 'enkeltdag 8t: normal+10%');
}
{
  // Enkeltdag +10% gælder OT-grundlag (tsWk) men ikke pers
  const l = calcLon(9, { enkeltdag:true, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  const tsWkEnk = TS * 1.1; // = 285.45
  near(l.ot1, Math.round(tsWkEnk * 1.75 * 1), 'enkeltdag OT: tsWk+10%');
}
{
  // cfg.tillæg=true fungerer som enkeltdag
  setCfg({ ugelon: 10380, pers: 0, 'tillæg': true, model: '5dag' });
  const l = calcLon(8, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  const tsNormEnk = (10380/40) * 1.1;
  near(l.normal, Math.round(tsNormEnk * 8), 'cfg.tillæg=true: +10% på normal');
  setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
}

// ─── 26. Personligt tillæg ────────────────────────────────────────────────────
suite('app · personligt tillæg §3');
setCfg({ ugelon: 10380, pers: 400, 'tillæg': false, model: '5dag' });
{
  const l = calcLon(8, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  const tsNorm = (10380/40) + (400/40); // = 259.5 + 10 = 269.5
  near(l.normal, Math.round(tsNorm * 8), 'pers 400: normal inkl. pers/40');
}
{
  // Pers indgår IKKE i OT-grundlag
  const l = calcLon(9, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot1, Math.round(TS * 1.75 * 1), 'pers 400: OT-sats er ts (uden pers)');
}
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });

// ─── 27. Frokost og pause10 ────────────────────────────────────────────────
suite('app · extras frokost og pause10');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  const l = calcLon(8, { frokost:true, pause10:false, helligdag:false });
  eq(l.ext, 94, 'frokost: ext=94 kr');
}
{
  // pause10 kræver h>10
  const l = calcLon(11, { frokost:false, pause10:true, helligdag:false });
  near(l.ext, Math.round(TS * (15/60)), 'pause10 med 11t: ext=ts×0.25');
}
{
  // pause10 med h≤10: ingen bonus
  const l = calcLon(10, { frokost:false, pause10:true, helligdag:false });
  eq(l.ext, 0, 'pause10 med h=10: ingen bonus (kræver h>10)');
}
{
  const l = calcLon(9, { frokost:false, pause10:true, helligdag:false });
  eq(l.ext, 0, 'pause10 med h=9: ingen bonus');
}
{
  // Begge
  const l = calcLon(11, { frokost:true, pause10:true, helligdag:false });
  near(l.ext, 94 + Math.round(TS * 0.25), 'frokost + pause10: combined');
}

// ─── 28. Weekend auto §8 ────────────────────────────────────────────────────
suite('app · weekend auto wkAutoH');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  // 2t wkAutoH, wkRate=0.75, normal dag
  const l = calcLon(8, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false }, 2, 0.75);
  near(l.wk, Math.round(TS * 0.75 * 2), 'wkAutoH=2 wkRate=0.75: wk=ts×0.75×2');
}
{
  const l = calcLon(8, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false }, 4, 1.0);
  near(l.wk, Math.round(TS * 1.0 * 4), 'wkAutoH=4 wkRate=1.0: wk=ts×1.0×4');
}
{
  // wkAutoH=0: ingen weekend
  const l = calcLon(8, { helligdag:false, frokost:false, pause10:false }, 0, 0.75);
  eq(l.wk, 0, 'wkAutoH=0: ingen wk');
}
{
  // helligdag overstyrer wkAutoH-logikken (helligdag-sti bruger wkAutoH uanset)
  // Men faktisk: helligdag=true bruger max(4,normalH), ikke wkAutoH
  const l = calcLon(8, { helligdag:true, frokost:false, pause10:false }, 4, 0.75);
  // Helligdag: betaltH=max(4,8)=8 → wk=ts×0.75×8, ignorerer wkAutoH
  near(l.wk, Math.round(TS * 0.75 * 8), 'helligdag + wkAutoH: helligdag vinder (8t min 4t)');
}

// ─── 29. 4-dags uge (§5 særtid) ─────────────────────────────────────────────
suite('app · 4-dags uge §5 særtid');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: 'saertid' });
{
  // dagMax=10: OT starter efter 10t
  const l = calcLon(10, { varslet:false, uvarslet:false, helligdag:false, frokost:false, pause10:false });
  near(l.normalH, 10, 'saertid 10t: normalH=10');
  eq(l.ot1H, 0, 'saertid 10t: ingen OT');
  near(l.normal, Math.round(TS * 10), 'saertid 10t: normal=ts×10');
}
{
  const l = calcLon(11, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot1H, 1, 'saertid 11t: ot1H=1');
  near(l.ot1, Math.round(TS * 1.75 * 1), 'saertid 11t uvarslet: ot1=ts×1.75');
}
{
  const l = calcLon(12, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot1H, 1, 'saertid 12t: ot1H=1');
  near(l.ot2H, 1, 'saertid 12t: ot2H=1');
}
{
  const l = calcLon(13, { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false });
  near(l.ot3H, 1, 'saertid 13t: ot3H=1');
}
{
  // Saertid 9t: normalH=9 (under dagMax=10), ingen OT
  const l = calcLon(9, { helligdag:false, frokost:false, pause10:false });
  eq(l.ot1H, 0, 'saertid 9t: ingen OT');
  near(l.normalH, 9, 'saertid 9t: normalH=9');
}
{
  // pause10 med saertid: h>10 kræver stadig >10t
  const l = calcLon(11, { frokost:false, pause10:true, helligdag:false });
  near(l.ext, Math.round(TS * (15/60)), 'saertid pause10 med 11t: bonus aktiv');
}
{
  const l10 = calcLon(10, { frokost:false, pause10:true, helligdag:false });
  eq(l10.ext, 0, 'saertid pause10 med 10t: ingen bonus (kræver >10)');
}
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });

// ─── 30. 0-timer edge case ──────────────────────────────────────────────────
suite('app · nul timer');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  const l = calcLon(0, { helligdag:false, frokost:false, pause10:false });
  eq(l.total, 0, '0t: total=0');
  eq(l.normal, 0, '0t: normal=0');
}
{
  const l = calcLon(null, { helligdag:false });
  eq(l.total, 0, 'null timer: total=0');
}
{
  const l = calcLon(-1, { helligdag:false });
  eq(l.total, 0, 'negative timer: total=0');
}

// ─── 31. Kombinerede scenarier ────────────────────────────────────────────────
suite('app · kombinerede scenarier');
setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
{
  // Weekend + OT + frokost
  const l = calcLon(10, { uvarslet:true, helligdag:false, frokost:true, pause10:false }, 3, 0.75);
  ok(l.wk > 0, 'wkAutoH=3: wk>0');
  ok(l.ot1 > 0, '10t: ot1>0');
  eq(l.ext, 94, 'frokost: ext=94');
  ok(l.total > 0, 'kombineret: total>0');
}
{
  // Helligdag + enkeltdag + pers + frokost
  setCfg({ ugelon: 10380, pers: 500, 'tillæg': true, model: '5dag' });
  const l = calcLon(8, { enkeltdag:false, helligdag:true, frokost:true, pause10:false }, 0, 1.0);
  ok(l.total > 0, 'helligdag + pers + frokost: total>0');
  eq(l.ext, 94, 'helligdag + frokost: ext=94');
  ok(l.wk > 0, 'helligdag: wk>0');
  setCfg({ ugelon: 10380, pers: 0, 'tillæg': false, model: '5dag' });
}

// ─── 32. Rekl: Kombinerede scenarier ─────────────────────────────────────────
suite('rekl · kombinerede scenarier');
{
  // Weekend + nat + OT + transport
  const r = calcReklame('optagelse', h(18,0), h(6,0), DS2750, 4, {
    ...INGEN, wk:1, nat:true, transport:1
  });
  // 12t raa, ts=343.75
  near(r.raaTimer, 12, 'kombineret: 12t raaTimer');
  ok(r.wkKr > 0, 'kombineret: wkKr>0');
  ok(r.natKr > 0, 'kombineret: natKr>0');
  ok(r.transKr > 0, 'kombineret: transKr>0');
  ok(r.otKr > 0, 'kombineret: otKr>0');
}
{
  // Helligdag + rabat + diæter + persontillæg
  const r = calcReklame('optagelse', h(8,0), h(16,0), DS4100, 2, {
    ...INGEN, helligdag:true, wk:0, rabat:1, diaeter:2, persontillaeg:1000
  });
  ok(r.wkKr > 0, 'helligdag+rabat: wkKr>0');
  near(r.diaetKr, 2 * 172.20, 'helligdag+diæter: diaetKr');
  near(r.persontillaegKr, 1000, 'persontillæg: 1000kr');
  ok(r.rabatKr < 0, 'rabat: negativ rabatKr');
}
{
  // Alle pauser + nat + helligdag
  const r = calcReklame('optagelse', h(20,0), h(4,0), DS2750, 4, {
    ...INGEN, nat:true, wk:0, helligdag:true,
    pauseForsinketFrokost:true, pause5:true, pause10:true
  });
  ok(r.natKr > 0, 'nat+helligdag: natKr>0');
  ok(r.pauseKr > 0, 'pauser aktive');
  ok(r.wkKr > 0, 'helligdag: wkKr>0');
}

// ═══════════════════════════════════════════════════════════════════════════
// RAPPORT
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
const total = passed + failed;
console.log(`Tests kørt: ${total}  ✓ ${passed}  ✗ ${failed}`);
if (failed > 0) {
  console.log('\nFejlede tests:');
  failLog.forEach(l => console.log(l));
  process.exit(1);
} else {
  console.log('\nAlle tests bestod! ✓');
  process.exit(0);
}
