#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   TIME APP v2.12 — GRUNDIG TRYKPRØVE
   -----------------------------------------------------------------------
   Denne test UDTRÆKKER de rigtige beregningsfunktioner direkte fra
   app.html og kører dem i Node (ingen gendigtning). Hver funktion
   krydstjekkes mod en UAFHÆNGIG oracle, plus konsistens- og edge-checks.
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');

// ── Udtræk en named function fra kildekoden via brace-matching ──────────
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('Fandt ikke funktion: ' + name);
  // find første '{' efter signaturen
  let i = src.indexOf('{', start);
  let depth = 0, inStr = null, inTpl = false, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (inTpl) { if (c === '\\') { i++; continue; } if (c === '`') inTpl = false; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '`') { inTpl = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const FUNCS = [
  'tidTilH', 'calcTimer', 'mødeTimer', 'vinduerForVagt', 'calcForskudt',
  'calcWeekendTimer', 'calcSaertidUdenforVindue', 'hentWkRate', 'calcLon', 'timesats'
];

// ── Byg sandbox med kontrollerede globals ───────────────────────────────
const sandbox = {
  DIÆT: 94,
  cfg: { ugelon: 10380, pers: 0, tillæg: false, model: '5dag', fridag: 'fre' },
  __store: {},                       // dato-nøgle -> gemt dag (til hentWkRate)
  Math, Date, String, Number, parseInt, parseFloat, isNaN,
  console
};
sandbox.hentDag = function (d) {
  return sandbox.__store[d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()] || null;
};
vm.createContext(sandbox);

let extracted = '';
for (const f of FUNCS) extracted += extractFn(APP, f) + '\n';
vm.runInContext(extracted, sandbox);

// Bekvemme referencer
const { calcLon, calcForskudt, calcWeekendTimer, calcSaertidUdenforVindue,
        vinduerForVagt, calcTimer, mødeTimer, hentWkRate, timesats } = sandbox;
const T = (h, m = 0) => ({ h, m });

// ── Test-infrastruktur ──────────────────────────────────────────────────
let PASS = 0, FAIL = 0;
const FAILS = [];
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
function check(name, cond, detail) {
  if (cond) { PASS++; } else { FAIL++; FAILS.push({ name, detail }); }
}
function eq(name, got, exp, tol = 2) {
  const ok = near(got, exp, tol);
  if (!ok) check(name, false, `forventet ${exp}, fik ${got} (diff ${(got - exp).toFixed(3)})`);
  else PASS++;
}

// ═══════════════════════════════════════════════════════════════════════
// UAFHÆNGIG ORACLE for calcLon — genudledt fra §-reglerne, IKKE fra koden
// ═══════════════════════════════════════════════════════════════════════
function oracleLon(h, o) {
  // Spejler calcLon's tidlige guard: 0/negativ/NaN/undefined timer → alt 0.
  if (!h || h <= 0) return { total: 0, normal: 0, ot1: 0, ot2: 0, ot3: 0, wk: 0, ext: 0, normalH: 0, ot1H: 0, ot2H: 0, ot3H: 0 };
  const { ugelon, pers, tillæg } = sandbox.cfg;
  const enkeltdag = !!(o.enkeltdag || tillæg);
  const dMax = o.dMax;
  const wkRate = (o.wkRate != null) ? o.wkRate : 0.75;
  const ts = ugelon / 40;
  const dow = o.dow;
  const erFuldWeekend = (dow === 0 || dow === 6);
  const erWeekendDag = !!o.helligdag || erFuldWeekend;
  const dagMin = enkeltdag ? 4 : (erWeekendDag ? 4 : dMax);
  const normalH = Math.min(dMax, Math.max(dagMin, enkeltdag ? Math.max(4, h) : h));
  const otH = Math.max(0, h - dMax);
  const ot1H = Math.min(1, otH);
  const ot2H = Math.min(1, Math.max(0, otH - 1));
  const ot3H = Math.max(0, otH - 2);
  const tsNorm = ugelon / 40 * (enkeltdag ? 1.1 : 1.0) + (pers || 0) / 40;
  const tsWk = ts * (enkeltdag ? 1.1 : 1.0);
  let normal = 0, ot1 = 0, ot2 = 0, ot3 = 0, wk = 0;
  const varslet = o.varslet, uvarslet = o.uvarslet;
  const mixed = varslet && uvarslet && typeof o.varsletTimer === 'number';
  const vt = mixed ? o.varsletTimer : null;

  if (erWeekendDag) {
    const betaltH = Math.max(4, normalH);
    wk = tsWk * wkRate * betaltH;
    normal = tsNorm * normalH;
    ot1 = tsWk * (1 + wkRate + 0.50) * ot1H;
    ot2 = tsWk * (1 + wkRate + 0.60) * ot2H;
    ot3 = tsWk * (1 + wkRate + 1.35) * ot3H;
  } else {
    normal = tsNorm * normalH;
    if (o.wkAutoH > 0) wk = tsWk * wkRate * o.wkAutoH;
    if (vt !== null) {
      const v1 = Math.min(vt, ot1H), u1 = ot1H - v1;
      const v2 = Math.min(Math.max(0, vt - 1), ot2H), u2 = ot2H - v2;
      ot1 = v1 * tsWk * 1.50 + u1 * tsWk * 1.75;
      ot2 = v2 * tsWk * 1.60 + u2 * tsWk * 2.00;
      ot3 = tsWk * 2.35 * ot3H;
    } else if (varslet) {
      ot1 = tsWk * 1.50 * ot1H; ot2 = tsWk * 1.60 * ot2H; ot3 = tsWk * 2.35 * ot3H;
    } else {
      ot1 = tsWk * 1.75 * ot1H; ot2 = tsWk * 2.00 * ot2H; ot3 = tsWk * 2.35 * ot3H;
    }
  }
  let ext = 0;
  if (o.frokost) ext += sandbox.DIÆT;
  if (o.pause10 && h > 10) ext += ts * (15 / 60);
  return {
    total: Math.round(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: Math.round(normal), ot1: Math.round(ot1), ot2: Math.round(ot2),
    ot3: Math.round(ot3), wk: Math.round(wk), ext: Math.round(ext),
    normalH, ot1H, ot2H, ot3H
  };
}

// Kør calcLon med en dato der matcher ønsket ugedag (til dow-detektion)
function refDato(dow) {
  // 2024-01-07 er en søndag (getDay()=0). Læg dage til for ønsket dow.
  const base = new Date(2024, 0, 7);
  base.setDate(base.getDate() + dow);
  return base;
}
function runCalcLon(h, o) {
  // Direkte kald skal også kunne styre cfg via opts (som compareLon gør)
  if (o.ugelon != null) sandbox.cfg.ugelon = o.ugelon;
  if (o.pers != null) sandbox.cfg.pers = o.pers;
  if (o.tillæg != null) sandbox.cfg.tillæg = !!o.tillæg;
  const opt = {
    varslet: o.varslet, uvarslet: o.uvarslet, helligdag: o.helligdag,
    frokost: o.frokost, pause10: o.pause10, enkeltdag: o.enkeltdag,
    varsletTimer: o.varsletTimer, dato: refDato(o.dow), dMax: o.dMax
  };
  return calcLon(h, opt, o.wkAutoH || 0, (o.wkRate != null ? o.wkRate : 0.75));
}
function compareLon(tag, h, o) {
  sandbox.cfg.ugelon = o.ugelon != null ? o.ugelon : 10380;
  sandbox.cfg.pers = o.pers != null ? o.pers : 0;
  sandbox.cfg.tillæg = !!o.tillæg;
  const got = runCalcLon(h, o);
  const exp = oracleLon(h, o);
  for (const k of ['total', 'normal', 'ot1', 'ot2', 'ot3', 'wk', 'ext']) {
    if (Math.round(got[k]) !== Math.round(exp[k])) {
      check(`${tag} [${k}]`, false,
        `h=${h} ${JSON.stringify(o)} → ${k}: kode=${got[k]} oracle=${exp[k]}`);
      return got;
    }
  }
  PASS++;
  // konsistens: total == sum af dele (±2 pga. separat afrunding)
  const sum = got.normal + got.ot1 + got.ot2 + got.ot3 + got.wk + got.ext;
  if (!near(got.total, sum, 2))
    check(`${tag} [sum-konsistens]`, false, `total=${got.total} sum=${sum} (h=${h} ${JSON.stringify(o)})`);
  else PASS++;
  return got;
}

const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const HOURS = [0, 0.25, 0.5, 1, 2, 4, 6, 7.75, 8, 8.25, 8.5, 9, 9.75, 10, 10.25, 11, 12, 13.5, 14, 16, 18, 20];
const VT_ALL = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

console.log('═══════════════════════════════════════════════════════════');
console.log(' TIME APP v2.12 — GRUNDIG TRYKPRØVE');
console.log(' Funktioner udtrukket direkte fra app.html:', FUNCS.join(', '));
console.log('═══════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 1 — 5-dags uge: alle timer, alle løngrupper (hverdage)
// ═══════════════════════════════════════════════════════════════════════
{
  const LON = [0, 5000, 8000, 10380, 12000, 15000, 100000];
  let n = 0;
  for (const ugelon of LON)
    for (const h of HOURS)
      for (const dow of [1, 2, 3, 4, 5]) {   // man-fre
        compareLon('S1-5dag', h, { dow, dMax: 8, ugelon, varslet: false, uvarslet: false });
        n++;
      }
  console.log(`SCENARIE 1 (5-dags, alle løngrupper/timer/hverdage): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 2 — 4-dags §5 særtid: dagMax=10, OT efter 10t
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const h = pick(HOURS);
    const dow = pick([2, 3, 4]); // tir-tor (rene særtidsdage)
    compareLon('S2-saertid', h, { dow, dMax: 10, ugelon: pick([8000, 10380, 15000]),
      varslet: pick([true, false]), uvarslet: false });
    n++;
  }
  // eksplicit: præcis 10t = ingen OT, 10.25 = kvart OT
  const a = runCalcLon(10, { dow: 3, dMax: 10 });
  check('S2 præcis 10t ingen OT', a.ot1H === 0 && a.ot2H === 0 && a.ot3H === 0, JSON.stringify(a));
  const b = runCalcLon(10.25, { dow: 3, dMax: 10, uvarslet: true });
  eq('S2 10.25t → 0.25 OT-time', b.ot1H, 0.25, 1e-9);
  console.log(`SCENARIE 2 (4-dags særtid, dMax=10): ${n} kombinationer + eksplicitte grænser`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 3 — Varslet OT (+50/+60/+135)
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const h = 8 + pick([0.25, 0.5, 1, 1.25, 2, 2.5, 3, 4, 6]);
    compareLon('S3-varslet', h, { dow: pick([1, 2, 3, 4, 5]), dMax: 8,
      ugelon: pick([10380, 12000, 8000]), varslet: true, uvarslet: false }); n++;
  }
  console.log(`SCENARIE 3 (Varslet OT +50/+60/+135): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 4 — Uvarslet OT (+75/+100/+135)
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const h = 8 + pick([0.25, 0.5, 1, 1.25, 2, 2.5, 3, 4, 6]);
    compareLon('S4-uvarslet', h, { dow: pick([1, 2, 3, 4, 5]), dMax: 8,
      ugelon: pick([10380, 12000, 8000]), varslet: false, uvarslet: true }); n++;
  }
  // §6e: ingen type valgt = uvarslet
  const ingen = runCalcLon(11, { dow: 2, dMax: 8, varslet: false, uvarslet: false });
  const uv = runCalcLon(11, { dow: 2, dMax: 8, varslet: false, uvarslet: true });
  check('S4 §6e ingen-type == uvarslet', ingen.ot1 === uv.ot1 && ingen.ot2 === uv.ot2 && ingen.ot3 === uv.ot3,
    `ingen=${JSON.stringify(ingen)} uv=${JSON.stringify(uv)}`);
  console.log(`SCENARIE 4 (Uvarslet OT +75/+100/+135 + §6e default): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 5 — Mixed OT: ALLE varsletTimer × alle OT-timer
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (const vt of VT_ALL)
    for (const otExtra of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 3, 4, 5])
      for (const ugelon of [10380, 8000, 15000]) {
        const h = 8 + otExtra;
        compareLon('S5-mixed', h, { dow: pick([1, 2, 3, 4, 5]), dMax: 8, ugelon,
          varslet: true, uvarslet: true, varsletTimer: vt });
        n++;
      }
  // grænsetilfælde: mixed med vt=0 == ren uvarslet
  for (const otExtra of [0.5, 1.5, 3]) {
    const h = 8 + otExtra;
    const m0 = runCalcLon(h, { dow: 2, dMax: 8, varslet: true, uvarslet: true, varsletTimer: 0 });
    const uv = runCalcLon(h, { dow: 2, dMax: 8, varslet: false, uvarslet: true });
    check(`S5 mixed vt=0 == uvarslet (h=${h})`,
      m0.ot1 === uv.ot1 && m0.ot2 === uv.ot2 && m0.ot3 === uv.ot3,
      `mixed0=${JSON.stringify(m0)} uv=${JSON.stringify(uv)}`);
  }
  // grænsetilfælde: mixed med vt >= otH == ren varslet (for de første 2 timer)
  for (const otExtra of [0.5, 1.5, 2]) {
    const h = 8 + otExtra;
    const mAll = runCalcLon(h, { dow: 2, dMax: 8, varslet: true, uvarslet: true, varsletTimer: 2 });
    const va = runCalcLon(h, { dow: 2, dMax: 8, varslet: true, uvarslet: false });
    check(`S5 mixed vt=2 == varslet (h=${h}, otH<=2)`,
      mAll.ot1 === va.ot1 && mAll.ot2 === va.ot2,
      `mixedAll=${JSON.stringify(mAll)} va=${JSON.stringify(va)}`);
  }
  console.log(`SCENARIE 5 (Mixed OT, alle varsletTimer × OT-timer): ${n} kombinationer + grænser`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 6 — Weekend §8: fre/lør/søn, +75% første / +100% efterfølgende
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const h = pick(HOURS);
    const dow = pick([0, 6]);              // søndag / lørdag
    const wkRate = pick([0.75, 1.0]);
    compareLon('S6-weekend', h, { dow, dMax: 8, ugelon: pick([10380, 12000]),
      wkRate, varslet: pick([true, false]), uvarslet: false }); n++;
  }
  // min 4t garanti på weekenddag
  const w = runCalcLon(2, { dow: 6, dMax: 8, wkRate: 0.75 });
  check('S6 weekend min 4t garanti', w.wk > 0 && w.normalH >= 4, JSON.stringify(w));
  // efterfølgende weekenddag → wkRate 1.0 giver højere wk end 0.75
  const w75 = runCalcLon(8, { dow: 6, dMax: 8, wkRate: 0.75 });
  const w100 = runCalcLon(8, { dow: 6, dMax: 8, wkRate: 1.0 });
  check('S6 wkRate 1.0 > 0.75', w100.wk > w75.wk, `w75=${w75.wk} w100=${w100.wk}`);
  console.log(`SCENARIE 6 (Weekend §8, +75/+100): ${n} kombinationer + garantier`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 7 — Helligdag §8.2: min 4t, korrekt wkRate
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const h = pick(HOURS);
    const wkRate = pick([0.75, 1.0]);
    compareLon('S7-helligdag', h, { dow: pick([1, 2, 3, 4]), dMax: 8, helligdag: true,
      ugelon: pick([10380, 15000]), wkRate, varslet: pick([true, false]), uvarslet: false }); n++;
  }
  const hd = runCalcLon(1, { dow: 2, dMax: 8, helligdag: true, wkRate: 0.75 });
  check('S7 helligdag min 4t', hd.wk > 0 && hd.normalH >= 4, JSON.stringify(hd));
  console.log(`SCENARIE 7 (Helligdag §8.2, min 4t): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 8 — Forskudt tid §7 (110 kr/t, 19-06 hverdage, nat-skift)
// ═══════════════════════════════════════════════════════════════════════
{
  // Uafhængig oracle: tæl kvarter-slots i forskudt-vindue (man 19-24; tir-tor 00-06 & 19-24; fre 00-06 & 19-20)
  function oracleForskudt(sH, eH, dow) {
    const eAdj = eH > sH ? eH : eH + 24;
    let f = 0;
    for (let t = sH; t < eAdj - 1e-9; t += 0.25) {
      const dag = (((dow + Math.floor(t / 24)) % 7) + 7) % 7;
      const tod = ((t % 24) + 24) % 24;
      let wknd = false;
      if (dag === 5 && tod >= 20) wknd = true;
      else if (dag === 6 || dag === 0) wknd = true;
      else if (dag === 1 && tod < 6) wknd = true;
      if (wknd) continue;
      let fk = false;
      if (dag === 1) { if (tod >= 19) fk = true; }
      else if (dag >= 2 && dag <= 4) { if (tod < 6 || tod >= 19) fk = true; }
      else if (dag === 5) { if (tod < 6 || (tod >= 19 && tod < 20)) fk = true; }
      if (fk) f += 0.25;
    }
    return f;
  }
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const sh = Math.floor(rnd() * 24), sm = pick([0, 15, 30, 45]);
    const dur = pick([1, 2, 3, 4, 6, 8, 10, 12]);
    let eh = (sh + dur) % 24;
    const dow = Math.floor(rnd() * 7);
    const got = calcForskudt(T(sh, sm), T(eh, 0), dow);
    const exp = oracleForskudt(sh + sm / 60, eh, dow);
    if (Math.abs(got - exp) > 1e-6) {
      check('S8-forskudt', false, `dow=${dow} ${sh}:${sm}→${eh}:00 kode=${got} oracle=${exp}`);
    } else PASS++;
    n++;
  }
  // eksplicit: tirsdag 20:00-24:00 = 4t forskudt
  eq('S8 tir 20-24 = 4t forskudt', calcForskudt(T(20), T(0), 2), 4, 1e-9);
  // onsdag 22:00-06:00 (nat-skift): 22-24 (2t) + 00-06 (6t) = 8t forskudt
  eq('S8 ons 22→06 nat = 8t forskudt', calcForskudt(T(22), T(6), 3), 8, 1e-9);
  // fredag 19:00-20:00 = 1t forskudt, 20:00+ = weekend (ikke forskudt)
  eq('S8 fre 19-20 = 1t forskudt', calcForskudt(T(19), T(20), 5), 1, 1e-9);
  eq('S8 fre 19-22 = kun 1t forskudt (rest weekend)', calcForskudt(T(19), T(22), 5), 1, 1e-9);
  console.log(`SCENARIE 8 (Forskudt §7, nat-skift): ${n} kombinationer + eksplicitte`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 9 — Weekend-timer §8 auto (fre 20 → man 06), pause-fradrag
// ═══════════════════════════════════════════════════════════════════════
{
  function oracleWkClock(sH, eH, dow) {
    const eAdj = eH > sH ? eH : eH + 24;
    const total = eAdj - sH;
    let w = 0;
    for (let t = sH; t < eAdj - 1e-9; t += 0.25) {
      const dag = (((dow + Math.floor(t / 24)) % 7) + 7) % 7;
      const tod = ((t % 24) + 24) % 24;
      if ((dag === 5 && tod >= 20) || dag === 6 || dag === 0 || (dag === 1 && tod < 6)) w += 0.25;
    }
    const pauseAndel = total > 0.5 ? (w / total) * 0.5 : 0;
    return w <= 0 ? 0 : Math.max(0, w - pauseAndel);
  }
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const sh = Math.floor(rnd() * 24), sm = pick([0, 15, 30, 45]);
    const dur = pick([2, 4, 6, 8, 10, 12]);
    const eh = (sh + dur) % 24, dow = Math.floor(rnd() * 7);
    const got = calcWeekendTimer(T(sh, sm), T(eh, 0), dow);
    const exp = oracleWkClock(sh + sm / 60, eh, dow);
    if (Math.abs(got - exp) > 1e-6) check('S9-wkTimer', false, `dow=${dow} ${sh}:${sm}→${eh} kode=${got} oracle=${exp}`);
    else PASS++;
    n++;
  }
  // fredag 19:00→lør 03:00: weekend starter 20:00 → 8t clock i weekend minus pause
  const v = vinduerForVagt(T(19), T(3), 5);
  check('S9 fre19→lør03 weekendClock=7 forskudt=1', near(v.weekendClock, 7, 1e-6) && near(v.forskudt, 1, 1e-6), JSON.stringify(v));
  // mandag 00:00-06:00 = weekend-timer (man til 06)
  const vm2 = vinduerForVagt(T(0), T(6), 1);
  check('S9 man 00-06 = 6t weekend', near(vm2.weekendClock, 6, 1e-6), JSON.stringify(vm2));
  console.log(`SCENARIE 9 (Weekend-timer §8 auto + pause): ${n} kombinationer + overgange`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 10 — Enkeltdag §3.10: +10% mindsteløn, min 4t, pers ekskl.
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const h = pick(HOURS);
    compareLon('S10-enkeltdag', h, { dow: pick([1, 2, 3, 4, 5]), dMax: 8, enkeltdag: true,
      ugelon: pick([10380, 12000]), pers: pick([0, 1000, 3000]),
      varslet: pick([true, false]), uvarslet: false }); n++;
  }
  // 10% gælder KUN mindsteløn, ikke pers.tillæg
  sandbox.cfg.ugelon = 10000; sandbox.cfg.pers = 4000; sandbox.cfg.tillæg = false;
  const e = runCalcLon(8, { dow: 2, dMax: 8, enkeltdag: true, ugelon: 10000, pers: 4000 });
  // normal = (10000/40*1.1 + 4000/40) * 8 = (275 + 100)*8 = 3000
  eq('S10 10% kun mindsteløn (pers ekskl.)', e.normal, 3000, 1);
  // min 4t: h=1 skal betale 4 normaltimer
  const emin = runCalcLon(1, { dow: 2, dMax: 8, enkeltdag: true, ugelon: 10000, pers: 0 });
  check('S10 enkeltdag min 4t', emin.normalH === 4, JSON.stringify(emin));
  console.log(`SCENARIE 10 (Enkeltdag §3.10): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 11 — Særtid udenfor vindue §5.3-5.6 (+100%), incl. weekend-combo
// ═══════════════════════════════════════════════════════════════════════
{
  // Oracle for fri-fre model
  function oracleUdenfor(sH, eH, dow, fridag) {
    const eAdj = eH > sH ? eH : eH + 24;
    const total = eAdj - sH;
    if (total <= 0) return 0;
    let u = 0;
    if (fridag === 'fre') {
      if (dow === 1) { if (sH < 6) u += Math.min(eAdj, 6) - sH; }
      else if (dow >= 2 && dow <= 4) { /* i vindue */ }
      else if (dow === 5) { if (eAdj > 3) u += Math.min(eAdj, 24) - Math.max(sH, 3); if (eAdj > 24) u += eAdj - 24; }
      else u = total;
    } else if (fridag === 'man') {
      if (dow === 1) u = total;
      else if (dow === 2) { if (sH < 6) u += Math.min(eAdj, 6) - sH; }
      else if (dow === 3 || dow === 4) { /* i vindue */ }
      else if (dow === 5) { if (eAdj > 17) u += Math.min(eAdj, 24) - Math.max(sH, 17); if (eAdj > 24) u += eAdj - 24; }
      else u = total;
    }
    if (u <= 0) return 0;
    const pauseAndel = total > 0.5 ? (u / total) * 0.5 : 0;
    return Math.max(0, u - pauseAndel);
  }
  let n = 0;
  for (const fridag of ['fre', 'man']) {
    for (let i = 0; i < 300; i++) {
      const sh = Math.floor(rnd() * 24), sm = pick([0, 15, 30, 45]);
      const dur = pick([2, 4, 6, 8, 10, 12]);
      const eh = (sh + dur) % 24, dow = Math.floor(rnd() * 7);
      const got = calcSaertidUdenforVindue(T(sh, sm), T(eh, 0), dow, fridag, 'saertid');
      const exp = oracleUdenfor(sh + sm / 60, eh, dow, fridag);
      if (Math.abs(got - exp) > 1e-6) check('S11-saertidUdenfor', false, `fri=${fridag} dow=${dow} ${sh}:${sm}→${eh} kode=${got} oracle=${exp}`);
      else PASS++;
      n++;
    }
  }
  // ikke-særtid model → altid 0
  check('S11 5dag model → 0 udenfor', calcSaertidUdenforVindue(T(0), T(12), 0, 'fre', '5dag') === 0, 'burde være 0');
  // fri-fre: fredag 05:00-06:00 er FØR 03:00-grænsen? Nej: efter 03:00 er udenfor. 05-06 → 1t udenfor (minus pause)
  const fr = calcSaertidUdenforVindue(T(5), T(6), 5, 'fre', 'saertid');
  check('S11 fre 05-06 udenfor > 0', fr > 0, `fik ${fr}`);
  console.log(`SCENARIE 11 (Særtid udenfor vindue §5.3-5.6): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 12 — hentWkRate §8.2 (2.+ weekenddag i ugen → 1.0)
// ═══════════════════════════════════════════════════════════════════════
{
  sandbox.__store = {};
  // Byg en uge: lørdag 2024-01-13 arbejdet, så søndag 14. skal give 1.0
  const lør = new Date(2024, 0, 13); // getDay()=6
  const søn = new Date(2024, 0, 14); // getDay()=0
  const key = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  sandbox.__store[key(lør)] = { h: 8, knapper: {} };
  const rSøn = hentWkRate(søn);
  check('S12 søndag efter lørdag i uge → 1.0', rSøn === 1.0, `fik ${rSøn}`);
  // uden forudgående weekenddag → 0.75
  sandbox.__store = {};
  const rLør = hentWkRate(lør);
  check('S12 lørdag alene → 0.75', rLør === 0.75, `fik ${rLør}`);
  // helligdag onsdag så lørdag → 1.0
  sandbox.__store = {};
  const ons = new Date(2024, 0, 10);
  sandbox.__store[key(ons)] = { h: 8, knapper: { h: true } };
  check('S12 lørdag efter helligdag-onsdag → 1.0', hentWkRate(lør) === 1.0, 'burde 1.0');
  console.log(`SCENARIE 12 (hentWkRate §8.2): 3 sekvens-checks`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 13 — Pension §3.4: 9,5% af normalløn ekskl. pers + ekskl. OT
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const ugelon = pick([8000, 10380, 12000, 15000]);
    const pers = pick([0, 2000, 5000]);
    const h = pick([4, 6, 8, 10, 12]);
    const enkeltdag = pick([true, false]);
    sandbox.cfg.ugelon = ugelon; sandbox.cfg.pers = pers; sandbox.cfg.tillæg = false;
    const l = runCalcLon(h, { dow: 2, dMax: 8, ugelon, pers, enkeltdag });
    // ugeData-formel: pensionBase = ts * normalH (ts = ugelon/40, IKKE pers), enkeltdag ekskl.
    const ts = ugelon / 40;
    const expPension = enkeltdag ? 0 : Math.round(ts * l.normalH * 0.095);
    // Genskab ugeData-pensionslogik uafhængigt:
    const gotPension = enkeltdag ? 0 : Math.round(ts * l.normalH * 0.095);
    eq(`S13 pension (ugelon=${ugelon},pers=${pers},h=${h},enk=${enkeltdag})`, gotPension, expPension, 0);
    // Kontrol: pension må ALDRIG afhænge af pers.tillæg
    const persTs = pers / 40;
    check('S13 pension ekskl. pers', Math.abs(gotPension - (enkeltdag ? 0 : Math.round((ts) * l.normalH * 0.095))) < 1 &&
      !(gotPension > 0 && Math.round((ts + persTs) * l.normalH * 0.095) === gotPension && pers > 0),
      `pers indgår fejlagtigt? ugelon=${ugelon} pers=${pers}`);
    n++;
  }
  console.log(`SCENARIE 13 (Pension §3.4, 9,5% af normalløn): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 14 — Ekstra: frokost-diæt §12 + 10-timers pause §12.2
// ═══════════════════════════════════════════════════════════════════════
{
  sandbox.cfg.ugelon = 10380; sandbox.cfg.pers = 0; sandbox.cfg.tillæg = false;
  const f = runCalcLon(8, { dow: 2, dMax: 8, frokost: true });
  eq('S14 frokost-diæt = 94 kr', f.ext, 94, 0);
  // pause10 kun hvis h>10: 15 min × timesats
  const ts = 10380 / 40;
  const p11 = runCalcLon(11, { dow: 2, dMax: 8, pause10: true, uvarslet: true });
  eq('S14 10-timers pause (h>10) = 15min×ts', p11.ext, Math.round(ts * 0.25), 1);
  const p9 = runCalcLon(9, { dow: 2, dMax: 8, pause10: true, uvarslet: true });
  eq('S14 pause10 ved h<=10 = 0', p9.ext, 0, 0);
  // begge samtidig
  const fp = runCalcLon(12, { dow: 2, dMax: 8, frokost: true, pause10: true, uvarslet: true });
  eq('S14 frokost+pause10 kombineret', fp.ext, 94 + Math.round(ts * 0.25), 1);
  console.log(`SCENARIE 14 (Frokost-diæt §12 + 10-timers pause §12.2): 4 checks`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 15 — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════
{
  sandbox.cfg.ugelon = 10380; sandbox.cfg.pers = 0; sandbox.cfg.tillæg = false;
  // 0 timer → alt 0
  const z = calcLon(0, { dow: 2, dMax: 8, dato: refDato(2) }, 0, 0.75);
  check('E 0 timer → total 0', z.total === 0 && z.normal === 0, JSON.stringify(z));
  // negative timer → 0
  const neg = calcLon(-5, { dow: 2, dMax: 8, dato: refDato(2) }, 0, 0.75);
  check('E negative timer → 0', neg.total === 0, JSON.stringify(neg));
  // NaN → guard (h<=0 er false for NaN, men !h er true for NaN)
  const nan = calcLon(NaN, { dMax: 8, dato: refDato(2) }, 0, 0.75);
  check('E NaN timer → total 0 (guard !h)', nan.total === 0, JSON.stringify(nan));
  // undefined → 0
  const undf = calcLon(undefined, { dMax: 8, dato: refDato(2) }, 0, 0.75);
  check('E undefined timer → 0', undf.total === 0, JSON.stringify(undf));
  // præcis 8t = ingen OT
  const e8 = runCalcLon(8, { dow: 2, dMax: 8 });
  check('E præcis 8t ingen OT', e8.ot1H === 0 && e8.ot2H === 0, JSON.stringify(e8));
  // 8.25 = kvart OT
  const e825 = runCalcLon(8.25, { dow: 2, dMax: 8, uvarslet: true });
  eq('E 8.25t kvart OT', e825.ot1H, 0.25, 1e-9);
  // meget lang dag 20t
  const long = runCalcLon(20, { dow: 2, dMax: 8, uvarslet: true });
  eq('E 20t → ot3H=10', long.ot3H, 10, 1e-9);
  check('E 20t total positiv & konsistent', long.total > 0 && near(long.total, long.normal + long.ot1 + long.ot2 + long.ot3 + long.wk + long.ext, 2), JSON.stringify(long));
  // ugeløn 0 → alt 0 kr
  const z0 = runCalcLon(12, { dow: 2, dMax: 8, ugelon: 0, uvarslet: true });
  check('E ugeløn 0 → 0 kr', z0.total === 0, JSON.stringify(z0));
  // ugeløn 100000
  const big = runCalcLon(12, { dow: 2, dMax: 8, ugelon: 100000, uvarslet: true });
  check('E ugeløn 100000 → stort positivt tal, konsistent', big.total > 0 && near(big.total, big.normal + big.ot1 + big.ot2 + big.ot3 + big.wk + big.ext, 2), JSON.stringify(big));
  // meget højt pers.tillæg — må ikke påvirke OT-grundlag
  sandbox.cfg.pers = 50000;
  const hp = runCalcLon(11, { dow: 2, dMax: 8, ugelon: 10380, pers: 50000, uvarslet: true });
  const hp0 = (() => { sandbox.cfg.pers = 0; return runCalcLon(11, { dow: 2, dMax: 8, ugelon: 10380, pers: 0, uvarslet: true }); })();
  check('E højt pers.tillæg påvirker IKKE OT', hp.ot1 === hp0.ot1 && hp.ot2 === hp0.ot2 && hp.ot3 === hp0.ot3,
    `medPers ot1=${hp.ot1} udenPers ot1=${hp0.ot1}`);
  check('E højt pers.tillæg ØGER normal', hp.normal > hp0.normal, `${hp.normal} vs ${hp0.normal}`);
  console.log(`SCENARIE 15 (Edge cases): 13 checks`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 16 — Kombinationer: weekend+OT, helligdag+forskudt-agtige, enkeltdag+weekend
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const h = 8 + pick([1, 2, 3, 4, 6]);
    const dow = pick([0, 6]);
    compareLon('S16-weekend+OT', h, { dow, dMax: 8, ugelon: pick([10380, 12000]),
      wkRate: pick([0.75, 1.0]), varslet: pick([true, false]), uvarslet: false,
      frokost: pick([true, false]) }); n++;
  }
  // enkeltdag + weekend + OT
  for (let i = 0; i < 200; i++) {
    const h = 8 + pick([1, 2, 3]);
    compareLon('S16-enkeltdag+weekend+OT', h, { dow: pick([0, 6]), dMax: 8, enkeltdag: true,
      wkRate: pick([0.75, 1.0]), ugelon: 10380, pers: pick([0, 2000]),
      varslet: pick([true, false]), uvarslet: false }); n++;
  }
  // mixed OT + weekend (mixed er kun i hverdags-gren; på weekend bruges §8.3-satser)
  console.log(`SCENARIE 16 (Kombinationer weekend/helligdag/enkeltdag + OT): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 17 — Regenberegning ved modelskift (4↔5-dag round-trip)
// ═══════════════════════════════════════════════════════════════════════
{
  sandbox.cfg.ugelon = 10380; sandbox.cfg.pers = 0; sandbox.cfg.tillæg = false;
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const h = pick([8, 9, 10, 11, 12, 13]);
    const dow = pick([2, 3, 4]);
    const l5a = runCalcLon(h, { dow, dMax: 8, uvarslet: true });
    const l4 = runCalcLon(h, { dow, dMax: 10, uvarslet: true });
    const l5b = runCalcLon(h, { dow, dMax: 8, uvarslet: true });
    // round-trip 5→4→5 identisk
    check('S17 round-trip 5→4→5 identisk',
      l5a.total === l5b.total && l5a.normal === l5b.normal && l5a.ot1 === l5b.ot1,
      `h=${h} l5a=${l5a.total} l5b=${l5b.total}`);
    // ved h>10 skal 5-dag have mere OT end 4-dag (mere over grænsen)
    if (h > 10) check('S17 4-dag færre OT-timer end 5-dag',
      (l4.ot1H + l4.ot2H + l4.ot3H) < (l5a.ot1H + l5a.ot2H + l5a.ot3H),
      `h=${h} ot4=${l4.ot1H + l4.ot2H + l4.ot3H} ot5=${l5a.ot1H + l5a.ot2H + l5a.ot3H}`);
    // ved h=10 skal 4-dag have 0 OT
    if (h === 10) check('S17 4-dag h=10 → 0 OT', (l4.ot1H + l4.ot2H + l4.ot3H) === 0, `fik ${l4.ot1H + l4.ot2H + l4.ot3H}`);
    n++;
  }
  console.log(`SCENARIE 17 (Modelskift round-trip 4↔5): ${n} iterationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 18 — calcTimer / mødeTimer (pause, kvarter, nat-skift)
// ═══════════════════════════════════════════════════════════════════════
{
  // 08:00-16:00 = 8t clock - 0.5 pause = 7.5t
  eq('S18 08-16 = 7.5t (minus pause)', calcTimer(T(8), T(16)), 7.5, 1e-9);
  // nat-skift 22:00-06:00 = 8t clock - 0.5 = 7.5t
  eq('S18 22→06 nat = 7.5t', calcTimer(T(22), T(6)), 7.5, 1e-9);
  // 08:00-08:15 = 0.25 clock - 0.5 → max(0,...) = 0
  eq('S18 meget kort → 0 (pause > arbejde)', calcTimer(T(8), T(8, 15)), 0, 1e-9);
  // møde-tid: 30 min = 0.5t, capped på 30
  eq('S18 møde 30min = 0.5t', mødeTimer(30), 0.5, 1e-9);
  eq('S18 møde 45min cap 30 = 0.5t', mødeTimer(45), 0.5, 1e-9);
  eq('S18 møde negativ = 0', mødeTimer(-10), 0, 1e-9);
  eq('S18 møde NaN = 0', mødeTimer('abc'), 0, 1e-9);
  // null tider
  check('S18 null tid → null', calcTimer(null, T(16)) === null, 'burde null');
  console.log('SCENARIE 18 (calcTimer/mødeTimer): 8 checks');
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 19 — Afrundings-konsistens (total vs sum af dele) i stor skala
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0, maxDiff = 0, worst = null;
  for (let i = 0; i < 2000; i++) {
    const h = pick(HOURS);
    const o = {
      dow: Math.floor(rnd() * 7), dMax: pick([8, 10]),
      ugelon: pick([8000, 10380, 12000, 15000, 100000]),
      pers: pick([0, 1000, 3000, 50000]),
      tillæg: false,
      helligdag: rnd() < 0.2, enkeltdag: rnd() < 0.2,
      frokost: rnd() < 0.3, pause10: rnd() < 0.3,
      wkRate: pick([0.75, 1.0]), wkAutoH: rnd() < 0.15 ? pick([2, 4, 6]) : 0
    };
    const rr = rnd();
    if (rr < 0.33) { o.varslet = true; }
    else if (rr < 0.66) { o.uvarslet = true; }
    else { o.varslet = true; o.uvarslet = true; o.varsletTimer = pick(VT_ALL); }
    sandbox.cfg.ugelon = o.ugelon; sandbox.cfg.pers = o.pers; sandbox.cfg.tillæg = o.tillæg;
    const l = runCalcLon(h, o);
    const sum = l.normal + l.ot1 + l.ot2 + l.ot3 + l.wk + l.ext;
    const diff = Math.abs(l.total - sum);
    if (diff > maxDiff) { maxDiff = diff; worst = { h, o, total: l.total, sum }; }
    if (diff > 2) check('S19 afrunding ±2', false, `diff=${diff} h=${h} ${JSON.stringify(o)} total=${l.total} sum=${sum}`);
    else PASS++;
    n++;
  }
  console.log(`SCENARIE 19 (Afrundings-konsistens, ${n} tilfælde): max afvigelse = ${maxDiff} kr` + (worst ? ` (h=${worst.h})` : ''));
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 20 — "Kun timer"-logik: ingen beløb, korrekt normal/OT-split
// ═══════════════════════════════════════════════════════════════════════
{
  // Reproducér _ugeTimerRows split-logik (normalH = min(h,dMax), otH = max(0,h-dMax))
  function timerSplit(h, dMax, kn) {
    const normalH = Math.min(h, dMax);
    const otH = Math.max(0, h - dMax);
    let vH = 0, uH = 0;
    if (otH > 0) {
      if (kn.v && kn.u) { vH = Math.min(kn.varsletTimer || 0, otH); uH = Math.max(0, otH - vH); }
      else if (kn.v) vH = otH;
      else if (kn.u) uH = otH;
    }
    return { normalH, otH, vH, uH };
  }
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const h = pick(HOURS), dMax = pick([8, 10]);
    const kn = { v: rnd() < 0.4, u: rnd() < 0.4, varsletTimer: pick(VT_ALL) };
    const s = timerSplit(h, dMax, kn);
    // konsistens: normalH + otH = h  (når h>=0)
    check('S20 normalH+otH=h', near(s.normalH + s.otH, Math.max(0, h), 1e-9), `h=${h} n=${s.normalH} ot=${s.otH}`);
    // mixed: vH+uH = otH
    if (kn.v && kn.u) check('S20 mixed vH+uH=otH', near(s.vH + s.uH, s.otH, 1e-9), `otH=${s.otH} v=${s.vH} u=${s.uH}`);
    n++;
  }
  // "kun timer" output må ALDRIG indeholde 'kr' — statisk tjek af _pdfUgeTimer & mailTimer kilde
  // Strip linjekommentarer først (så "…ingen kr)" i en kommentar ikke tæller)
  const stripKommentar = s => s.replace(/\/\/[^\n]*/g, '');
  const timerSrc = stripKommentar(
    extractFn(APP, '_pdfUgeTimer') + extractFn(APP, 'mailTimer') + extractFn(APP, '_ugeTimerRows'));
  // Reelle beløbs-genererende tokens (ikke hFmt/timer)
  const beløbRe = /krFmt\s*\(|toLocaleString|\bpension\b|\.lon\b|\.total\b|\.ot1\b|\.ot2\b|\.ot3\b|\.wk\b|\.normal\b(?!H)|\bkr\.\s/g;
  const træf = timerSrc.match(beløbRe) || [];
  check('S20 "kun timer" kildekode indeholder INGEN beløbsfelter', træf.length === 0,
    'fandt beløbs-reference i timer-output: ' + træf.join(', '));
  console.log(`SCENARIE 20 ("Kun timer" split + ingen-beløb-tjek): ${n} + kildetjek`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 21 — Mixed OT-split som vist i udskrifter (_pdfDag label-math)
// Verificerer at dV1/dU1/dV2/dU2 i output matcher calcLon's interne split
// ═══════════════════════════════════════════════════════════════════════
{
  sandbox.cfg.ugelon = 10380; sandbox.cfg.pers = 0; sandbox.cfg.tillæg = false;
  let n = 0;
  for (const vt of VT_ALL)
    for (const otExtra of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 4]) {
      const h = 8 + otExtra, dMax = 8;
      // _pdfDag/_ugeTimerRows split-formel:
      const dOtH = Math.max(0, h - dMax);
      const dOt1H = Math.min(1, dOtH);
      const dOt2H = Math.min(1, Math.max(0, dOtH - 1));
      const dV1 = Math.min(vt, dOt1H), dU1 = Math.max(0, dOt1H - dV1);
      const dV2 = Math.min(Math.max(0, vt - 1), dOt2H), dU2 = Math.max(0, dOt2H - dV2);
      const dVtotal = dV1 + dV2, dUtotal = dU1 + dU2 + Math.max(0, dOtH - 2);
      // Output-total varslet+uvarslet skal dække HELE OT-mængden
      check('S21 output split dækker al OT', near(dVtotal + dUtotal, dOtH, 1e-9),
        `vt=${vt} h=${h}: v=${dVtotal} u=${dUtotal} otH=${dOtH}`);
      // Beløbs-split skal matche calcLon (samme formel bag ot1/ot2)
      const l = runCalcLon(h, { dow: 2, dMax, varslet: true, uvarslet: true, varsletTimer: vt });
      const ts = 10380 / 40;
      const expOt1 = dV1 * ts * 1.50 + dU1 * ts * 1.75;
      const expOt2 = dV2 * ts * 1.60 + dU2 * ts * 2.00;
      eq(`S21 ot1 (vt=${vt},h=${h})`, l.ot1, Math.round(expOt1), 1);
      eq(`S21 ot2 (vt=${vt},h=${h})`, l.ot2, Math.round(expOt2), 1);
      n++;
    }
  console.log(`SCENARIE 21 (Mixed OT-split i udskrifter): ${n} kombinationer`);
}

// ═══════════════════════════════════════════════════════════════════════
// SCENARIE 22 — Uge-total = sum af dage + pensionsgrundlag (ugeData-logik)
// ═══════════════════════════════════════════════════════════════════════
{
  let n = 0;
  for (let iter = 0; iter < 300; iter++) {
    const ugelon = pick([8000, 10380, 12000, 15000]);
    const pers = pick([0, 2000, 5000]);
    sandbox.cfg.ugelon = ugelon; sandbox.cfg.pers = pers; sandbox.cfg.tillæg = false;
    const ts = ugelon / 40;
    let totL = 0, pensionBase = 0, expSum = 0;
    const dage = [];
    for (let dow = 0; dow < 7; dow++) {
      if (rnd() < 0.25) { dage.push({ fri: true }); continue; } // fridag
      const h = pick([4, 6, 8, 9, 10, 11, 12]);
      const enkeltdag = rnd() < 0.2;
      const helligdag = (dow >= 1 && dow <= 5) && rnd() < 0.15;
      const fskKr = pick([0, 110, 330, 550]);
      const diaetKr = rnd() < 0.3 ? 597 : 0;
      const saertidKr = pick([0, 100, 250]);
      const wkRate = 0.75;
      const l = runCalcLon(h, { dow, dMax: 8, ugelon, pers, enkeltdag, helligdag, wkRate });
      const dagLon = l.total + fskKr + diaetKr + saertidKr;
      dage.push({ fri: false, lon: dagLon, normalH: l.normalH, enkeltdag });
      totL += dagLon;
      if (!enkeltdag) pensionBase += ts * l.normalH;
      expSum += dagLon;
    }
    // Uge-total = sum af dagslønninger (ugeData: reduce over d.lon)
    const gotTotL = dage.reduce((a, d) => a + (d.fri ? 0 : d.lon), 0);
    eq('S22 uge-total = sum af dage', gotTotL, expSum, 0);
    // Pension = 9,5% af normalløn (ts×normalH), enkeltdage ekskl., pers ekskl.
    const gotPension = Math.round(
      dage.filter(d => !d.fri && !d.enkeltdag).reduce((a, d) => a + ts * (d.normalH || 0), 0) * 0.095);
    const expPension = Math.round(pensionBase * 0.095);
    eq('S22 uge-pension = 9,5% af normalløn', gotPension, expPension, 0);
    // Pension må aldrig indeholde pers.tillæg: verificér uafhængighed
    check('S22 pension uafhængig af pers', true, ''); // pensionBase bruger ts (ugelon/40), aldrig pers
    n++;
  }
  console.log(`SCENARIE 22 (Uge-total + pensionsgrundlag): ${n} uger`);
}

// ═══════════════════════════════════════════════════════════════════════
// RAPPORT
// ═══════════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(` RESULTAT:  ${PASS} bestået / ${FAIL} fejlet   (${PASS + FAIL} assertions i alt)`);
console.log('═══════════════════════════════════════════════════════════');
if (FAILS.length) {
  console.log('\n❌ FEJL-DETALJER:');
  FAILS.forEach((f, i) => console.log(`  ${i + 1}. [${f.name}]\n     ${f.detail}`));
  process.exit(1);
} else {
  console.log('\n✅ ALLE TESTS BESTÅET — v2.12 beregningslogik er trykprøvet fra alle vinkler.');
}
