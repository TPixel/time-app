// ════════════════════════════════════════════════════════════════════
// test-4-5-dag.js — v2.05
// Tester 4/5-dags (særtid §5 / normal §4) model-logikken 500 gange.
//
// Verificerer:
//   1. dagMax() = 10 ved særtid, 8 ved 5dag
//   2. OT-beregning i begge modes med varierende timer (8-14t)
//   3. At genberegning af gemte dage (reberegnGemtDag) giver korrekte tal
//   4. Weekend og helligdag i begge modes
//   5. 500 tilfældige kombinationer
//
// Funktionerne herunder er trofaste porterings af app.html (v2.05):
//   dagMax, timesats, calcLon, calcSaertidUdenforVindue + reberegnGemtDag.
// ════════════════════════════════════════════════════════════════════

const DIÆT = 94;

// ── deterministisk PRNG (så testen er reproducerbar, ingen Math.random) ──
let _seed = 1337;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function randHours() { return Math.round((8 + rnd() * 6) * 4) / 4; } // 8..14, kvarter-præcision

// ── PORT: dagMax (app.html:2026) ──
function dagMax(model) { return model === 'saertid' ? 10 : 8; }

// ── PORT: timesats (app.html:1915) ──
function timesats(cfg) { return cfg.ugelon / 40; }

// ── PORT: calcSaertidUdenforVindue (app.html:2035) — §5 stk.3-4 ──
function calcSaertidUdenforVindue(s, e, dagIdx, fridag, model) {
  const m = model;
  if (m !== 'saertid') return 0;
  if (s === null || e === null) return 0;
  const eAdj = (e > s) ? e : e + 24;
  const totalClockH = eAdj - s;
  if (totalClockH <= 0) return 0;
  let udenforClockH = 0;
  if (fridag === 'fre') {
    if (dagIdx === 1) { if (s < 6) udenforClockH += Math.min(eAdj, 6) - s; }
    else if (dagIdx >= 2 && dagIdx <= 4) { /* i vinduet */ }
    else if (dagIdx === 5) {
      if (eAdj > 3) udenforClockH += Math.min(eAdj, 24) - Math.max(s, 3);
      if (eAdj > 24) udenforClockH += eAdj - 24;
    } else { udenforClockH = totalClockH; }
  } else if (fridag === 'man') {
    if (dagIdx === 1) { udenforClockH = totalClockH; }
    else if (dagIdx === 2) { if (s < 6) udenforClockH += Math.min(eAdj, 6) - s; }
    else if (dagIdx === 3 || dagIdx === 4) { /* i vinduet */ }
    else if (dagIdx === 5) {
      if (eAdj > 17) udenforClockH += Math.min(eAdj, 24) - Math.max(s, 17);
      if (eAdj > 24) udenforClockH += eAdj - 24;
    } else { udenforClockH = totalClockH; }
  }
  if (udenforClockH <= 0) return 0;
  const pauseAndel = (totalClockH > 0.5) ? (udenforClockH / totalClockH) * 0.5 : 0;
  return Math.max(0, udenforClockH - pauseAndel);
}

// ── PORT: calcLon (app.html:2107) ──
function calcLon(cfg, h, opt, wkAutoH = 0, wkRate = 0.75) {
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0, normalH:0, ot1H:0, ot2H:0, ot3H:0 };
  const ts = timesats(cfg);
  const { varslet, uvarslet, helligdag, frokost, pause10 } = opt;
  const dMax = (typeof opt.dMax === 'number') ? opt.dMax : dagMax(opt.model);
  const harEnkeltdag = !!(opt.enkeltdag || cfg.tillæg);
  const normalH = Math.min(dMax, harEnkeltdag ? Math.max(4, h) : h);
  const otH  = Math.max(0, h - dMax);
  const ot1H = Math.min(1, otH);
  const ot2H = Math.min(1, Math.max(0, otH - 1));
  const ot3H = Math.max(0, otH - 2);
  const tsGrund = ts;
  const tsNorm = cfg.ugelon / 40 * (harEnkeltdag ? 1.1 : 1.0) + (cfg.pers || 0) / 40;
  const tsWk   = tsGrund * (harEnkeltdag ? 1.1 : 1.0);
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
    const vt = (varslet && uvarslet && typeof opt.varsletTimer === 'number') ? opt.varsletTimer : null;
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
  if (frokost) ext += DIÆT;
  if (pause10 && h > 10) ext += ts * (15/60);
  return {
    total: Math.round(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: Math.round(normal), ot1: Math.round(ot1), ot2: Math.round(ot2),
    ot3: Math.round(ot3), wk: Math.round(wk), ext: Math.round(ext),
    normalH, ot1H, ot2H, ot3H
  };
}

// ── PORT: reberegnGemtDag (app.html:5097) ──
// Simulerer en gemt dag og genberegner dens model-afhængige felter under en NY model.
// s.h (arbejdstimer) påvirkes ALDRIG af modelskift.
function reberegnGemtDag(cfg, s, dagIdx, nyModel) {
  const h = s.h;
  const opt = { varslet:s.knapper.v, uvarslet:s.knapper.u, helligdag:s.knapper.h,
                frokost:s.knapper.f, pause10:s.knapper.p, enkeltdag:s.knapper.e,
                varsletTimer:s.knapper.varsletTimer || 0, model: nyModel };
  const wkAutoH = s.wkAutoH || 0;
  const wkRate  = s.wkRate ?? ((s.knapper.h || dagIdx === 0 || dagIdx === 6) ? 1.0 : 0.75);
  const l = calcLon(cfg, h, opt, wkAutoH, wkRate);
  const diaetKr = s.diaetKr ?? (s.knapper.d ? Math.round(cfg.diaet || 0) : 0);
  const sUH = calcSaertidUdenforVindue(s.startH, s.slutH, dagIdx, cfg.fridag, nyModel);
  const tsForT = (cfg.ugelon / 40) * ((s.knapper.e || cfg.tillæg) ? 1.1 : 1.0);
  const saertidKr = Math.round(sUH * tsForT);
  s.normal = l.normal; s.ot1 = l.ot1; s.ot2 = l.ot2; s.ot3 = l.ot3; s.wk = l.wk; s.ext = l.ext;
  s.diaetKr = diaetKr; s.saertidKr = saertidKr; s.saertidUdenforH = sUH;
  if (!s.manuelLon) s.lon = l.total + diaetKr + saertidKr;
  return s;
}

// ════════════════════════════════════════════════════════════════════
// TEST-DRIVER
// ════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function check(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function approx(a, b, tol = 1) { return Math.abs(a - b) <= tol; }

const cfg = { ugelon: 10380, pers: 0, tillæg: false, diaet: 597, fridag: 'fre' };

// ── 1. dagMax: 10 ved særtid, 8 ved 5dag ──
check(dagMax('saertid') === 10, 'dagMax(saertid) skal være 10, fik ' + dagMax('saertid'));
check(dagMax('5dag') === 8,    'dagMax(5dag) skal være 8, fik ' + dagMax('5dag'));

// ── 500 tilfældige kombinationer ──
const N = 500;
for (let i = 0; i < N; i++) {
  const model   = pick(['saertid', '5dag']);
  const h       = randHours();                 // 8..14
  const dagIdx  = pick([1, 2, 3, 4, 5, 6, 0]); // man..søn
  const weekend = (dagIdx === 0 || dagIdx === 6);
  const helligdag = rnd() < 0.15;
  const varslet = rnd() < 0.5;
  const dMax    = dagMax(model);

  const opt = { varslet, uvarslet:false, helligdag, frokost:false, pause10:false,
                enkeltdag:false, varsletTimer:0, model };
  const wkAutoH = (!helligdag && weekend) ? Math.max(0, h - 0) : 0; // grov weekend-overlap
  const wkRate  = (helligdag || weekend) ? 1.0 : 0.75;
  const l = calcLon(cfg, h, opt, wkAutoH, wkRate);

  // (2) OT-beregning: otH = max(0, h - dMax), korrekt båndopdeling
  const expOtH = Math.max(0, h - dMax);
  check(approx(l.ot1H + l.ot2H + l.ot3H, expOtH, 1e-9),
        `#${i} OT-sum: bånd ${l.ot1H}+${l.ot2H}+${l.ot3H} != ${expOtH} (h=${h} ${model})`);
  check(l.ot1H <= 1 && l.ot2H <= 1, `#${i} OT-bånd 1/2 må højst være 1 time`);
  check(l.normalH === Math.min(dMax, h), `#${i} normalH=${l.normalH} != min(${dMax},${h})`);

  // Saertid-specifik: en dag på <=10t i særtid skal have 0 OT; samme dag i normal har OT
  if (model === 'saertid' && h <= 10) check(expOtH === 0, `#${i} særtid <=10t skal give 0 OT (h=${h})`);
  if (model === '5dag' && h > 8)      check(expOtH > 0,  `#${i} normal >8t skal give OT (h=${h})`);

  // (4) weekend/helligdag: tillæg (wk) skal være > 0 når der er weekend/helligdag-timer
  if (helligdag) check(l.wk > 0, `#${i} helligdag skal give weekend-tillæg`);
  if (weekend && !helligdag && wkAutoH > 0) check(l.wk > 0, `#${i} weekend skal give §8-tillæg`);

  // total skal være >= normal-delen (ingen negative led)
  check(l.total >= 0 && l.normal >= 0, `#${i} negative beløb`);

  // ── (3) Genberegning af gemt dag ved modelskift ──
  // Gem dagen under 'model', skift derefter til den ANDEN model og genberegn.
  const andenModel = model === 'saertid' ? '5dag' : 'saertid';
  const startH = 8, slutH = 8 + h + 0.5; // 30 min pause indregnet i h
  const s = {
    h, startH, slutH,
    knapper: { v:varslet, u:false, h:helligdag, f:false, p:false, e:false, d:false, varsletTimer:0 },
    wkAutoH, wkRate, manuelLon: 0,
  };
  // initial gemning under 'model'
  reberegnGemtDag(cfg, s, dagIdx, model);
  const lonFør = s.lon, otFør = s.ot1 + s.ot2 + s.ot3, saertidFør = s.saertidKr;

  // skift model og genberegn
  reberegnGemtDag(cfg, s, dagIdx, andenModel);

  // Forventet: identisk med en frisk calcLon under andenModel
  const optNy = { ...opt, model: andenModel };
  const lFrisk = calcLon(cfg, h, optNy, wkAutoH, wkRate);
  const sUHny  = calcSaertidUdenforVindue(startH, slutH, dagIdx, cfg.fridag, andenModel);
  const saertidNy = Math.round(sUHny * (cfg.ugelon / 40) * (cfg.tillæg ? 1.1 : 1.0));

  check(s.ot1 === lFrisk.ot1 && s.ot2 === lFrisk.ot2 && s.ot3 === lFrisk.ot3,
        `#${i} genberegn OT mismatch: gemt(${s.ot1},${s.ot2},${s.ot3}) vs frisk(${lFrisk.ot1},${lFrisk.ot2},${lFrisk.ot3})`);
  check(s.normal === lFrisk.normal, `#${i} genberegn normal mismatch ${s.normal} vs ${lFrisk.normal}`);
  check(s.saertidKr === saertidNy, `#${i} genberegn saertidKr mismatch ${s.saertidKr} vs ${saertidNy}`);
  check(s.lon === lFrisk.total + (s.diaetKr||0) + saertidNy, `#${i} genberegn lon mismatch`);

  // s.h må ALDRIG ændres af modelskift
  check(s.h === h, `#${i} arbejdstimer ændret af modelskift! ${s.h} != ${h}`);

  // Skift TILBAGE skal give de oprindelige tal (idempotens / round-trip)
  reberegnGemtDag(cfg, s, dagIdx, model);
  check(s.lon === lonFør && (s.ot1 + s.ot2 + s.ot3) === otFør && s.saertidKr === saertidFør,
        `#${i} round-trip mismatch: lon ${s.lon} vs ${lonFør}, saertid ${s.saertidKr} vs ${saertidFør}`);
}

// ── Rapport ──
console.log('════════════════════════════════════════════');
console.log('  Time App v2.05 — 4/5-dags logik testresultat');
console.log('════════════════════════════════════════════');
console.log(`  Kombinationer testet : ${N}`);
console.log(`  Assertions kørt      : ${pass + fail}`);
console.log(`  ✓ Bestået            : ${pass}`);
console.log(`  ✗ Fejlet             : ${fail}`);
console.log('════════════════════════════════════════════');
if (fail > 0) {
  console.log('FEJL (op til 20 vist):');
  fails.slice(0, 20).forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  🎉 ALLE TESTS BESTÅET');
  process.exit(0);
}
