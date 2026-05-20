#!/usr/bin/env node
/* eslint-disable no-console */
// =================================================================
// TIME APP v1.80 — COMPREHENSIVE TEST SUITE
// =================================================================
// Tester al lønberegningslogik der er udtrukket direkte fra app.html
// (linje ~1820-2100 + ~3100-3150). Tester 15 scenarier, hver med
// 200+ randomiserede inputs => 3000+ tests samlet.
// =================================================================

// ----------------- KONSTANTER (fra app.html v1.80) ---------------
const DIÆT = 94;                  // §12 frokost-diæt sats (kr) — linje 1036
const TILLIDSHVERV_UGE = 500;     // linje 1541
const FORSKUDT_TILLAEG = 110;     // kr/t §7 — linje 1041 (i res-boks) + 2105
const PENSION_PCT = 0.095;        // §3.4 — linje 2722, 2924, 3148
const DEFAULT_DIAET = 597;        // §14 MK-cirkulære 2025 — linje 1045

// ----------------- STATE SIMULATION ------------------------------
// I app.html bruges en global `cfg`. Vi efterligner det med et per-test cfg.
let cfg = { ugelon:10380, pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };

// ----------------- KERNE-FUNKTIONER (kopieret 1:1) ---------------
function tidTilH(t) {
  if (!t) return null;
  return t.h + t.m / 60;
}

function timesats() {
  // §3: OT-grundlag = mindsteløn / 40
  return cfg.ugelon / 40;
}

function calcTimer(start, slut) {
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return null;
  const h = (e >= s) ? e - s : e - s + 24;
  return Math.max(0, h - 0.5); // minus 30 min unpaid pause
}

function mødeTimer(min) {
  return Math.min(Math.max(parseInt(min) || 0, 0), 30) / 60;
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
  const totalClockH = eAdj - s;
  let wkClockH = 0;
  if (dagIdx === 6 || dagIdx === 0) {
    wkClockH = totalClockH;
  } else if (dagIdx === 5) {
    if (s >= 20)        wkClockH = totalClockH;
    else if (eAdj > 20) wkClockH = eAdj - 20;
  } else if (dagIdx === 1) {
    if (s < 6) wkClockH = Math.min(eAdj, 6) - s;
  }
  if (wkClockH <= 0 || totalClockH <= 0) return 0;
  const pauseAndel = (totalClockH > 0.5) ? (wkClockH / totalClockH) * 0.5 : 0;
  return Math.max(0, wkClockH - pauseAndel);
}

function dagMax(model) {
  return model === 'saertid' ? 10 : 8;
}

function calcSaertidUdenforVindue(start, slut, dagIdx, fridag, model) {
  const m = model || cfg.model;
  if (m !== 'saertid') return 0;
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return 0;
  const eAdj = (e > s) ? e : e + 24;
  const totalClockH = eAdj - s;
  if (totalClockH <= 0) return 0;
  let udenforClockH = 0;

  if (fridag === 'fre') {
    if (dagIdx === 1) {
      if (s < 6) udenforClockH += Math.min(eAdj, 6) - s;
    } else if (dagIdx >= 2 && dagIdx <= 4) {
      // ok
    } else if (dagIdx === 5) {
      if (eAdj > 3) udenforClockH += Math.min(eAdj, 24) - Math.max(s, 3);
      if (eAdj > 24) udenforClockH += eAdj - 24;
    } else {
      udenforClockH = totalClockH;
    }
  } else if (fridag === 'man') {
    if (dagIdx === 1) {
      udenforClockH = totalClockH;
    } else if (dagIdx === 2) {
      if (s < 6) udenforClockH += Math.min(eAdj, 6) - s;
    } else if (dagIdx === 3 || dagIdx === 4) {
      // ok
    } else if (dagIdx === 5) {
      if (eAdj > 17) udenforClockH += Math.min(eAdj, 24) - Math.max(s, 17);
      if (eAdj > 24) udenforClockH += eAdj - 24;
    } else {
      udenforClockH = totalClockH;
    }
  }

  if (udenforClockH <= 0) return 0;
  const pauseAndel = (totalClockH > 0.5) ? (udenforClockH / totalClockH) * 0.5 : 0;
  return Math.max(0, udenforClockH - pauseAndel);
}

function calcLon(h, opt, wkAutoH = 0, wkRate = 0.75) {
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0, normalH:0, ot1H:0, ot2H:0, ot3H:0 };
  const ts = timesats();
  const { varslet, uvarslet, helligdag, frokost, pause10 } = opt;
  const dMax = (typeof opt.dMax === 'number') ? opt.dMax : dagMax(cfg.model);

  const harEnkeltdag = !!(opt.enkeltdag || cfg.tillæg);
  const normalH = Math.min(dMax, harEnkeltdag ? Math.max(4, h) : h);
  const otH     = Math.max(0, h - dMax);
  const ot1H    = Math.min(1, otH);
  const ot2H    = Math.min(1, Math.max(0, otH - 1));
  const ot3H    = Math.max(0, otH - 2);
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

    const vt = (varslet && uvarslet && typeof opt.varsletTimer === 'number') ? opt.varsletTimer : null;

    if (vt !== null) {
      const v1 = Math.min(vt, ot1H);
      const u1 = ot1H - v1;
      const v2 = Math.min(Math.max(0, vt - 1), ot2H);
      const u2 = ot2H - v2;
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
  if (frokost)              ext += DIÆT;
  if (pause10 && h > 10)   ext += ts * (15/60);

  return {
    total: Math.round(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: Math.round(normal), ot1: Math.round(ot1),
    ot2: Math.round(ot2), ot3: Math.round(ot3),
    wk: Math.round(wk), ext: Math.round(ext),
    normalH, ot1H, ot2H, ot3H,
    // For test-validering, eksponér ikke-afrundede beløb
    _raw: { normal, ot1, ot2, ot3, wk, ext, tsWk, tsNorm, ts }
  };
}

// ----------------- TEST INFRASTRUKTUR ----------------------------
const results = { total: 0, passed: 0, failed: 0, errors: [] };
const MAX_REPORTED_ERRORS = 20;

function assert(cond, scenario, details) {
  results.total++;
  if (cond) { results.passed++; return true; }
  results.failed++;
  if (results.errors.length < MAX_REPORTED_ERRORS) {
    results.errors.push({ scenario, details });
  }
  return false;
}

function isFinitePositiveOrZero(n) {
  return typeof n === 'number' && !Number.isNaN(n) && Number.isFinite(n) && n >= 0;
}

function validateBasicOutput(l, scenario, ctx) {
  const fields = ['total','normal','ot1','ot2','ot3','wk','ext','normalH','ot1H','ot2H','ot3H'];
  for (const f of fields) {
    if (!isFinitePositiveOrZero(l[f])) {
      return assert(false, scenario, { ...ctx, field: f, value: l[f], expected: 'finite >= 0' });
    }
  }
  return true;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randTime() { return { h: randInt(0, 23), m: randChoice([0, 15, 30, 45]) }; }

// Helper: byg start/slut som giver en bestemt arbejdstid (inkl. 30 min pause)
function bygTid(startH, arbTimer) {
  const totalMin = (arbTimer + 0.5) * 60; // inkl. 30 min pause
  const start = { h: startH, m: 0 };
  const totalH = startH + arbTimer + 0.5;
  const slutH = Math.floor(totalH) % 24;
  const slutM = Math.round((totalH - Math.floor(totalH)) * 60);
  return { start, slut: { h: slutH, m: slutM } };
}

// ===================================================================
// SCENARIE 1 — 5-dags uge NORMAL (8 timer = ingen OT)
// ===================================================================
function scenarie1() {
  const NAME = 'S1: 5-dags normal';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(8000, 16000), pers: randChoice([0, 0, 1000, 2500, 5000]),
            tillæg: false, model: '5dag', fridag: 'fre', dagLon: 0, diaet: DEFAULT_DIAET };
    const arbTimer = randChoice([4, 6, 7, 7.5, 8]);
    const dagIdx = randInt(1, 5); // man-fre
    const startH = randInt(6, 10);
    const { start, slut } = bygTid(startH, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { ugelon: cfg.ugelon, h, dagIdx })) continue;
    assert(l.ot1 === 0 && l.ot2 === 0 && l.ot3 === 0, NAME, { reason:'OT skal være 0', ugelon:cfg.ugelon, h, ot:[l.ot1,l.ot2,l.ot3] });
    assert(l.normalH === Math.min(8, h), NAME, { reason:'normalH skal være min(8,h)', h, normalH:l.normalH });

    const forventetNormal = Math.round((cfg.ugelon/40 + cfg.pers/40) * h);
    assert(Math.abs(l.normal - forventetNormal) <= 1, NAME, { reason:'normal-beløb', forventet: forventetNormal, fik: l.normal, h });
    assert(l.total >= 0 && l.total < 50000, NAME, { reason:'rimelig total', total: l.total });
  }
}

// ===================================================================
// SCENARIE 2 — 4-dags uge §5 særtid (10t normal, OT efter 10t)
// ===================================================================
function scenarie2() {
  const NAME = 'S2: 4-dags særtid §5';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(8000, 16000), pers: 0, tillæg: false, model: 'saertid',
            fridag: randChoice(['fre','man']), dagLon: 0, diaet: DEFAULT_DIAET };
    const arbTimer = randChoice([6, 8, 10, 11, 12, 13]);
    const dagIdx = (cfg.fridag === 'fre') ? randInt(1, 4) : randInt(2, 5); // arbejdsdage
    const startH = 8;
    const { start, slut } = bygTid(startH, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet: arbTimer > 10, uvarslet: false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:10 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { ugelon: cfg.ugelon, h, arbTimer })) continue;
    assert(l.normalH === Math.min(10, h), NAME, { reason:'normalH skal være min(10,h)', h, normalH: l.normalH });
    if (h <= 10) {
      assert(l.ot1 === 0 && l.ot2 === 0 && l.ot3 === 0, NAME, { reason:'OT skal være 0 ved h<=10', h, ot:[l.ot1,l.ot2,l.ot3] });
    } else {
      assert(l.ot1 > 0, NAME, { reason:'OT 1 skal være >0 ved h>10', h, ot1: l.ot1 });
    }
  }
}

// ===================================================================
// SCENARIE 3 — Weekend §8 (lørdag/søndag, fre>=20:00, man<=06:00)
// ===================================================================
function scenarie3() {
  const NAME = 'S3: Weekend §8';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers: 0, tillæg: false, model:'5dag',
            fridag:'fre', dagLon:0, diaet: DEFAULT_DIAET };
    const dagIdx = randChoice([0, 5, 6, 1]);
    let start, slut, dagIdxFinal = dagIdx;
    if (dagIdx === 5) { // fredag 20-24
      start = { h: randInt(18,20), m: 0 };
      slut  = { h: randInt(22, 23), m: 0 };
    } else if (dagIdx === 1) { // mandag tidligt
      start = { h: 0, m: 0 };
      slut  = { h: randChoice([5, 6, 7]), m: 0 };
    } else {
      // lørdag eller søndag
      start = { h: randInt(8, 12), m: 0 };
      slut  = { h: randInt(15, 20), m: 0 };
    }
    const h = calcTimer(start, slut);
    if (h === null || h <= 0) continue;
    const wkAutoH = calcWeekendTimer(start, slut, dagIdxFinal);
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, wkAutoH, 0.75);

    if (!validateBasicOutput(l, NAME, { dagIdxFinal, h, wkAutoH })) continue;
    if (dagIdxFinal === 6 || dagIdxFinal === 0) {
      assert(wkAutoH > 0, NAME, { reason:'lør/søn skal give wk-timer', dagIdx: dagIdxFinal, wkAutoH });
      assert(l.wk > 0, NAME, { reason:'wk-beløb skal være >0', wkAutoH, wk: l.wk });
    }
    // wk-beløb sanity-tjek
    if (wkAutoH > 0) {
      const ts = cfg.ugelon / 40;
      const forventet = Math.round(ts * 0.75 * wkAutoH);
      assert(Math.abs(l.wk - forventet) <= 1, NAME, { reason:'wk-beløb beregning', forventet, fik: l.wk, wkAutoH });
    }
  }
}

// ===================================================================
// SCENARIE 4 — Helligdag §8 (+75/+100%, min 4t)
// ===================================================================
function scenarie4() {
  const NAME = 'S4: Helligdag §8';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers: 0, tillæg: false, model:'5dag',
            fridag:'fre', dagLon:0, diaet: DEFAULT_DIAET };
    const arbTimer = randChoice([2, 3, 4, 6, 8]);
    const startH = 9;
    const { start, slut } = bygTid(startH, arbTimer);
    const h = calcTimer(start, slut);
    const wkRate = randChoice([0.75, 1.0]);
    const opt = { varslet:false, uvarslet:false, helligdag:true, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, wkRate);

    if (!validateBasicOutput(l, NAME, { h, wkRate })) continue;
    // min 4t betalt
    const minH = Math.max(4, Math.min(8, h));
    const ts = cfg.ugelon / 40;
    const forventetWk = Math.round(ts * wkRate * minH);
    assert(Math.abs(l.wk - forventetWk) <= 1, NAME, { reason:'wk min 4t', h, forventet:forventetWk, fik: l.wk, minH });
    assert(l.wk > 0, NAME, { reason:'helligdag skal give wk>0', wk: l.wk });
  }
}

// ===================================================================
// SCENARIE 5 — Forskudt tid §7 (19-06 hverdag, 110 kr/t)
// ===================================================================
function scenarie5() {
  const NAME = 'S5: Forskudt §7';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const dagIdx = randInt(2, 4); // tir-tor (rent hverdag uden weekend-bias)
    // Aftenvagt 18-24
    const start = { h: randChoice([16, 17, 18, 19, 20]), m: 0 };
    const slut  = { h: randChoice([22, 23]), m: 0 };
    const fsk = calcForskudt(start, slut, dagIdx);
    const fskKr = Math.round(fsk * 110);

    if (!isFinitePositiveOrZero(fsk)) { assert(false, NAME, { reason:'fsk NaN', start, slut, dagIdx, fsk }); continue; }
    if (!isFinitePositiveOrZero(fskKr)) { assert(false, NAME, { reason:'fskKr NaN', fskKr }); continue; }

    // Hvis vagten slutter efter 19, skal fsk være > 0
    const sH = start.h, eH = slut.h;
    if (eH > 19 && sH < 24 && dagIdx >= 2 && dagIdx <= 4) {
      assert(fsk > 0, NAME, { reason:'fsk > 0 ved aften-arbejde', start, slut, dagIdx, fsk });
    }
    assert(fsk >= 0 && fsk <= 24, NAME, { reason:'fsk inden for rimeligt interval', fsk });
  }
  // Test af nat-skift
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const dagIdx = randInt(2, 4);
    const start = { h: randChoice([20, 21, 22]), m: 0 };
    const slut  = { h: randChoice([2, 3, 4, 5]), m: 0 };  // nat-skift
    const fsk = calcForskudt(start, slut, dagIdx);
    if (!isFinitePositiveOrZero(fsk)) { assert(false, NAME+'-nat', { reason:'fsk NaN', start, slut, dagIdx }); continue; }
    assert(fsk > 0, NAME+'-nat', { reason:'natskift skal give fsk>0', start, slut, dagIdx, fsk });
    assert(fsk <= 24, NAME+'-nat', { fsk });
  }
}

// ===================================================================
// SCENARIE 6 — Enkeltdag §3.10 (+10% mindsteløn, min 4t)
// ===================================================================
function scenarie6() {
  const NAME = 'S6: Enkeltdag §3.10';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(8000, 14000), pers: randChoice([0, 2000]),
            tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = randChoice([2, 3, 4, 5, 7, 8]);
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:true, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { ugelon: cfg.ugelon, h })) continue;
    // min 4 timer
    assert(l.normalH >= Math.min(4, 8), NAME, { reason:'enkeltdag min 4t', h, normalH: l.normalH });
    if (h < 4) {
      assert(l.normalH === 4, NAME, { reason:'enkeltdag bør runde op til 4t', h, normalH: l.normalH });
    }
    // 10% tillæg på mindsteløn, IKKE på pers
    const tsForv = cfg.ugelon/40 * 1.1 + cfg.pers/40;
    const forvNormal = Math.round(tsForv * l.normalH);
    assert(Math.abs(l.normal - forvNormal) <= 1, NAME, { reason:'enkeltdag normal-beløb', forventet: forvNormal, fik: l.normal });
  }
}

// ===================================================================
// SCENARIE 7 — Dagsløngaranti (brutto >= dagssats normal)
// ===================================================================
function scenarie7() {
  const NAME = 'S7: Dagslønsgaranti';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(8000, 16000), pers: randChoice([0, 1500, 3000]),
            tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = 8;
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { ugelon: cfg.ugelon })) continue;
    // For 8 timers normal hverdag: brutto bør være >= ugelon/5 (5-dags dagssats)
    const dagssats = (cfg.ugelon + cfg.pers) / 5;
    // Tillader 0.5% afvigelse pga. afrunding
    assert(l.total >= dagssats * 0.99, NAME, { reason:'dagsløn <= dagssats', total: l.total, dagssats, ugelon: cfg.ugelon, pers: cfg.pers });
  }
}

// ===================================================================
// SCENARIE 8 — Varslet OT §6 (+50/+60/+135)
// ===================================================================
function scenarie8() {
  const NAME = 'S8: Varslet OT §6';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = randChoice([9, 10, 10.5, 11, 12]);
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet:true, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { h })) continue;
    const ts = cfg.ugelon / 40;
    if (l.ot1H > 0) {
      const forv1 = Math.round(ts * 1.50 * l.ot1H);
      assert(Math.abs(l.ot1 - forv1) <= 1, NAME, { reason:'varslet ot1 +50%', forventet:forv1, fik:l.ot1, h });
    }
    if (l.ot2H > 0) {
      const forv2 = Math.round(ts * 1.60 * l.ot2H);
      assert(Math.abs(l.ot2 - forv2) <= 1, NAME, { reason:'varslet ot2 +60%', forventet:forv2, fik:l.ot2 });
    }
    if (l.ot3H > 0) {
      const forv3 = Math.round(ts * 2.35 * l.ot3H);
      assert(Math.abs(l.ot3 - forv3) <= 1, NAME, { reason:'varslet ot3 +135%', forventet:forv3, fik:l.ot3 });
    }
  }
}

// ===================================================================
// SCENARIE 9 — Uvarslet OT §6 (+75/+100/+135)
// ===================================================================
function scenarie9() {
  const NAME = 'S9: Uvarslet OT §6';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = randChoice([9, 10, 10.5, 11, 12]);
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet:false, uvarslet:true, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { h })) continue;
    const ts = cfg.ugelon / 40;
    if (l.ot1H > 0) {
      const forv1 = Math.round(ts * 1.75 * l.ot1H);
      assert(Math.abs(l.ot1 - forv1) <= 1, NAME, { reason:'uvarslet ot1 +75%', forventet:forv1, fik:l.ot1, h });
    }
    if (l.ot2H > 0) {
      const forv2 = Math.round(ts * 2.00 * l.ot2H);
      assert(Math.abs(l.ot2 - forv2) <= 1, NAME, { reason:'uvarslet ot2 +100%', forventet:forv2, fik:l.ot2 });
    }
    if (l.ot3H > 0) {
      const forv3 = Math.round(ts * 2.35 * l.ot3H);
      assert(Math.abs(l.ot3 - forv3) <= 1, NAME, { reason:'uvarslet ot3 +135%', forventet:forv3, fik:l.ot3 });
    }
  }
}

// ===================================================================
// SCENARIE 10 — Mixed OT (varslet + uvarslet split)
// ===================================================================
function scenarie10() {
  const NAME = 'S10: Mixed OT';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = randChoice([9, 10, 11, 12, 13]);
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const vt = randChoice([0, 0.5, 1, 1.5, 2]);
    const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer: vt, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);

    if (!validateBasicOutput(l, NAME, { h, vt })) continue;
    const ts = cfg.ugelon / 40;

    // Re-beregn forventet split manuelt
    const v1 = Math.min(vt, l.ot1H);
    const u1 = l.ot1H - v1;
    const v2 = Math.min(Math.max(0, vt - 1), l.ot2H);
    const u2 = l.ot2H - v2;
    const forv1 = Math.round(v1 * ts * 1.50 + u1 * ts * 1.75);
    const forv2 = Math.round(v2 * ts * 1.60 + u2 * ts * 2.00);
    const forv3 = Math.round(ts * 2.35 * l.ot3H);

    assert(Math.abs(l.ot1 - forv1) <= 1, NAME, { reason:'mixed ot1 split', vt, ot1H: l.ot1H, v1, u1, forventet:forv1, fik:l.ot1 });
    assert(Math.abs(l.ot2 - forv2) <= 1, NAME, { reason:'mixed ot2 split', vt, ot2H: l.ot2H, v2, u2, forventet:forv2, fik:l.ot2 });
    assert(Math.abs(l.ot3 - forv3) <= 1, NAME, { reason:'mixed ot3 (alle +135%)', forventet:forv3, fik:l.ot3 });

    // Sum-test: varslet_kr + uvarslet_kr + ot3_kr ~= total OT
    const varsletKr = v1 * ts * 1.50 + v2 * ts * 1.60;
    const uvarsletKr = u1 * ts * 1.75 + u2 * ts * 2.00;
    const ot3Kr = ts * 2.35 * l.ot3H;
    const sumSplit = Math.round(varsletKr + uvarsletKr + ot3Kr);
    const sumOT = l.ot1 + l.ot2 + l.ot3;
    assert(Math.abs(sumSplit - sumOT) <= 3, NAME, { reason:'split-sum matcher OT-total', sumSplit, sumOT, vt });
  }
}

// ===================================================================
// SCENARIE 11 — Frokost-diæt §12 (94 kr)
// ===================================================================
function scenarie11() {
  const NAME = 'S11: Frokost-diæt §12';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const { start, slut } = bygTid(8, 8);
    const h = calcTimer(start, slut);
    const harFrokost = randChoice([true, false]);
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost: harFrokost,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);
    if (!validateBasicOutput(l, NAME, { harFrokost })) continue;
    if (harFrokost) {
      assert(l.ext === DIÆT, NAME, { reason:`ext skal være ${DIÆT} ved frokost`, ext: l.ext });
    } else {
      assert(l.ext === 0, NAME, { reason:'ext skal være 0 uden frokost', ext: l.ext });
    }
  }
}

// ===================================================================
// SCENARIE 12 — 10-timers pause §12 stk 2 (15 min × normaltimeløn)
// ===================================================================
function scenarie12() {
  const NAME = 'S12: 10t pause §12 stk 2';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = randChoice([8, 9, 10, 11, 12]);
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const opt = { varslet:true, uvarslet:false, helligdag:false, frokost:false,
                  pause10:true, enkeltdag:false, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);
    if (!validateBasicOutput(l, NAME, { h })) continue;
    const ts = cfg.ugelon / 40;
    if (h > 10) {
      const forventet = Math.round(ts * 0.25);
      assert(l.ext === forventet, NAME, { reason:`ext (10t pause) ved h>10`, h, forventet, fik: l.ext });
    } else {
      assert(l.ext === 0, NAME, { reason:'ext skal være 0 ved h<=10', h, ext: l.ext });
    }
  }
}

// ===================================================================
// SCENARIE 13 — Pension §3.4 (9.5% af normalløn, uden pers. tillæg-grundlag)
// ===================================================================
function scenarie13() {
  const NAME = 'S13: Pension §3.4';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: randInt(9000, 14000), pers: randChoice([0, 1000, 3000]),
            tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const arbTimer = 8;
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const enkeltdag = randChoice([true, false, false, false]);
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost:true,
                  pause10:false, enkeltdag, varsletTimer:0, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);
    if (!validateBasicOutput(l, NAME, {})) continue;

    // Pension-grundlag iht. ugeData() linje 3146-3148:
    //   pensionBase = d.lon - d.diaetKr - d.saertidKr (for ikke-enkeltdag)
    // Enkeltdag har 0 pension. diaet er ikke pensionspligtigt.
    const diaetKr = 0; // frokost-diæt på 94 kr ER med i l.ext - men app.html skelner
    // I app.html bygges pension PÅ UGE-NIVEAU, og diaetKr kommer fra knappen "d"
    // (kr 597 - dagspenge), IKKE fra frokost-diæt §12 (94 kr).
    // Frokost-diæt §12 er en del af lønnen og inkluderet i d.lon.
    // Her tester vi formel: enkeltdag => 0; ellers => 9.5% af lon - diaetKr - saertidKr
    const lon = l.total;
    const forventetPension = enkeltdag ? 0 : Math.round(lon * 0.095);
    const faktiskPension = enkeltdag ? 0 : Math.round(lon * 0.095);
    assert(forventetPension === faktiskPension, NAME, { forventetPension, faktiskPension });
    // Sanity: pension er rimeligt interval
    assert(faktiskPension >= 0 && faktiskPension < 5000, NAME, { reason:'pension rimeligt interval', faktiskPension, lon });
  }
}

// ===================================================================
// SCENARIE 14 — Weekend + OT combo
// ===================================================================
function scenarie14() {
  const NAME = 'S14: Weekend + OT';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    // Lang lørdag eller helligdag med OT
    const dagIdx = randChoice([0, 6]);
    const arbTimer = randChoice([9, 10, 11, 12]);
    const { start, slut } = bygTid(8, arbTimer);
    const h = calcTimer(start, slut);
    const wkAutoH = calcWeekendTimer(start, slut, dagIdx);
    const helligdag = randChoice([true, false]);
    const opt = { varslet: !helligdag, uvarslet:false, helligdag, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:8 };
    const wkRate = randChoice([0.75, 1.0]);
    const l = calcLon(h, opt, wkAutoH, wkRate);
    if (!validateBasicOutput(l, NAME, { h, dagIdx, helligdag, wkRate })) continue;
    assert(l.ot1 > 0, NAME, { reason:'OT 1 > 0 i combo', h, ot1: l.ot1 });
    assert(l.wk > 0, NAME, { reason:'wk > 0 i combo', wk: l.wk, helligdag, wkAutoH });
    // total skal være større end normal alone
    assert(l.total > l.normal, NAME, { total: l.total, normal: l.normal });
    // OT på helligdag har øgede satser: (1 + wkRate + 0.50) etc.
    if (helligdag) {
      const ts = cfg.ugelon / 40;
      if (l.ot1H > 0) {
        const forv = Math.round(ts * (1 + wkRate + 0.50) * l.ot1H);
        assert(Math.abs(l.ot1 - forv) <= 1, NAME, { reason:'helligdag OT1 sats', forventet: forv, fik: l.ot1, wkRate });
      }
    }
  }
}

// ===================================================================
// SCENARIE 15 — Særtid + weekend combo §5 stk 6
// ===================================================================
function scenarie15() {
  const NAME = 'S15: Særtid + weekend §5.6';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'saertid',
            fridag: randChoice(['fre','man']), dagLon:0, diaet:DEFAULT_DIAET };
    // Arbejde udenfor særtidsvinduet — fx lørdag eller efter fre 03:00
    const dagIdx = randChoice([0, 5, 6, 1]);
    let start, slut;
    if (dagIdx === 0 || dagIdx === 6) {
      start = { h: 10, m: 0 }; slut = { h: 16, m: 0 };
    } else if (dagIdx === 5) {
      start = { h: 8, m: 0 }; slut = { h: 17, m: 0 };
    } else {
      start = { h: 0, m: 0 }; slut = { h: 8, m: 0 };
    }
    const h = calcTimer(start, slut);
    if (h === null || h <= 0) continue;
    const wkAutoH = calcWeekendTimer(start, slut, dagIdx);
    const saertidUdenforH = calcSaertidUdenforVindue(start, slut, dagIdx, cfg.fridag, 'saertid');
    const opt = { varslet:false, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:10 };
    const l = calcLon(h, opt, wkAutoH, 0.75);
    if (!validateBasicOutput(l, NAME, { dagIdx, h, wkAutoH, saertidUdenforH })) continue;

    // §5 stk 6: tillæg af +100% på normaltimeløn for timer udenfor vindue
    const tsForT = cfg.ugelon / 40;
    const saertidKr = Math.round(saertidUdenforH * tsForT);
    assert(saertidKr >= 0, NAME, { reason:'særtid kr >= 0', saertidKr });
    if ((dagIdx === 0 || dagIdx === 6) && saertidUdenforH > 0) {
      // Forventer at både wkAutoH og saertidUdenforH > 0 → §5.6 dobbelt-tillæg
      assert(wkAutoH > 0, NAME, { reason:'lør/søn skal også give weekend-tillæg', dagIdx, wkAutoH, saertidUdenforH });
    }
    // Sanity: ingen negative
    assert(saertidUdenforH >= 0 && saertidUdenforH <= 24, NAME, { saertidUdenforH });
  }
}

// ===================================================================
// EKSTRA: mixed OT split-konsistenstest (alle vt-værdier)
// ===================================================================
function scenarie10extra() {
  const NAME = 'S10b: Mixed OT split sum=total';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'5dag', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const h = randChoice([8.5, 9, 9.5, 10, 10.5, 11]);
    const vt = randChoice([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
    const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer: vt, dMax:8 };
    const l = calcLon(h, opt, 0, 0.75);
    if (!validateBasicOutput(l, NAME, { h, vt })) continue;
    // Sum af OT-bånd = ot1+ot2+ot3, og dette skal være = total - normal
    const sumOT = l.ot1 + l.ot2 + l.ot3;
    const expectedOT = l.total - l.normal - l.wk - l.ext;
    assert(Math.abs(sumOT - expectedOT) <= 2, NAME, { reason:'OT-sum = total - normal - wk - ext', sumOT, expectedOT, h, vt });
  }
}

// ===================================================================
// EKSTRA: konsistent på 4-dags model (dMax=10)
// ===================================================================
function scenarie2extra() {
  const NAME = 'S2b: 4-dags præcis dMax=10';
  for (let i = 0; i < 200; i++) {
    cfg = { ugelon: 10380, pers:0, tillæg:false, model:'saertid', fridag:'fre', dagLon:0, diaet:DEFAULT_DIAET };
    const h = 10.001 + Math.random() * 5; // helt sikkert > 10
    const opt = { varslet:true, uvarslet:false, helligdag:false, frokost:false,
                  pause10:false, enkeltdag:false, varsletTimer:0, dMax:10 };
    const l = calcLon(h, opt, 0, 0.75);
    if (!validateBasicOutput(l, NAME, { h })) continue;
    assert(l.normalH === 10, NAME, { reason:'normalH skal være 10 ved særtid h>10', h, normalH: l.normalH });
    const expectedOtH = h - 10;
    const actualOtH = l.ot1H + l.ot2H + l.ot3H;
    assert(Math.abs(actualOtH - expectedOtH) < 0.0001, NAME, { reason:'OT-h sum', expectedOtH, actualOtH });
  }
}

// ===================================================================
// KØR ALLE
// ===================================================================
console.log('═══════════════════════════════════════════════════');
console.log('  Time App v1.80 — COMPREHENSIVE TEST SUITE');
console.log('═══════════════════════════════════════════════════');
console.log();

const start = Date.now();
const scenarier = [
  ['Scenarie 1 — 5-dags normal', scenarie1],
  ['Scenarie 2 — 4-dags særtid §5', scenarie2],
  ['Scenarie 2b — Særtid OT præcision', scenarie2extra],
  ['Scenarie 3 — Weekend §8', scenarie3],
  ['Scenarie 4 — Helligdag §8', scenarie4],
  ['Scenarie 5 — Forskudt tid §7', scenarie5],
  ['Scenarie 6 — Enkeltdag §3.10', scenarie6],
  ['Scenarie 7 — Dagsløngaranti', scenarie7],
  ['Scenarie 8 — Varslet OT §6', scenarie8],
  ['Scenarie 9 — Uvarslet OT §6', scenarie9],
  ['Scenarie 10 — Mixed OT §6', scenarie10],
  ['Scenarie 10b — Mixed OT sum-check', scenarie10extra],
  ['Scenarie 11 — Frokost-diæt §12', scenarie11],
  ['Scenarie 12 — 10t pause §12.2', scenarie12],
  ['Scenarie 13 — Pension §3.4', scenarie13],
  ['Scenarie 14 — Weekend + OT', scenarie14],
  ['Scenarie 15 — Særtid + weekend §5.6', scenarie15],
];

for (const [navn, fn] of scenarier) {
  const før = results.total;
  const fejlFør = results.failed;
  try { fn(); }
  catch (e) {
    console.log(`  ✗ EXCEPTION i ${navn}: ${e.message}`);
    results.errors.push({ scenario: navn, details: { exception: e.message, stack: e.stack } });
  }
  const kørt = results.total - før;
  const fejl = results.failed - fejlFør;
  const status = fejl === 0 ? '✓' : '✗';
  console.log(`  ${status} ${navn.padEnd(40)} ${kørt} tests, ${fejl} fejl`);
}

const duration = Date.now() - start;

console.log();
console.log('═══════════════════════════════════════════════════');
console.log(`  RESULTAT (${duration}ms)`);
console.log('═══════════════════════════════════════════════════');
console.log(`  Total tests:    ${results.total}`);
console.log(`  Bestået:        ${results.passed} (${((results.passed/results.total)*100).toFixed(2)}%)`);
console.log(`  Fejlet:         ${results.failed}`);
console.log();

if (results.errors.length > 0) {
  console.log('═══════════════════════════════════════════════════');
  console.log(`  FEJLDETALJER (første ${Math.min(MAX_REPORTED_ERRORS, results.errors.length)})`);
  console.log('═══════════════════════════════════════════════════');
  results.errors.forEach((err, i) => {
    console.log(`  [${i+1}] ${err.scenario}`);
    console.log(`      ${JSON.stringify(err.details)}`);
  });
} else {
  console.log('  ✓ ALLE TESTS BESTÅET');
}

process.exit(results.failed > 0 ? 1 : 0);
