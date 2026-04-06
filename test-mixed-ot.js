#!/usr/bin/env node
/**
 * Test: Mixed varslet/uvarslet OT på samme dag
 * ═══════════════════════════════════════════════
 *
 * Fiktionsoverenskomst §6:
 *   Varslet OT:   1. time +50%, 2. time +60%
 *   Uvarslet OT:  1. time +75%, 2. time +100%
 *   3.+ time:     altid +135% (uanset type)
 *
 * Scenarie: Instruktøren varsler 1 times OT inden kl 12.
 *   → 1. OT-time: varslet (+50%)
 *   Så løber det over med 2 timer mere (uvarslet):
 *   → 2. OT-time: uvarslet (+75%)
 *   → 3. OT-time: +135%
 *
 * Ny parameter: opt.varsletTimer = antal varslet OT-timer (0, 1 eller 2)
 *   - Bruges KUN når BEGGE varslet+uvarslet er true
 *   - Default: 0 (= alt er uvarslet, bagudkompatibelt)
 *
 * Regler:
 *   OT time 1: varslet-sats hvis varsletTimer >= 1, ellers uvarslet-sats
 *   OT time 2: varslet-sats hvis varsletTimer >= 2, ellers uvarslet-sats
 *   OT time 3+: altid +135%
 */

'use strict';

// ─── Engine (copy from app.html) ───
function timesats(ugelon) { return ugelon / 40; }
function dagMax(model) { return model === 'saertid' ? 10 : 8; }
function rnd(v) { return Math.round(v); }

const DIÆT = 94;

// ─── NUVÆRENDE calcLon (uændret fra app.html) ───
function calcLon_current(h, opt, ugelon, pers, tillæg, model, wkAutoH, wkRate) {
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0 };
  const ts   = timesats(ugelon);
  const dMax = dagMax(model);
  const { varslet, helligdag, frokost, pause10, enkeltdag } = opt;

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
  if (frokost)          ext += DIÆT;
  if (pause10 && h > 10) ext += ts * (15/60);

  return {
    total:  rnd(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: rnd(normal), ot1: rnd(ot1), ot2: rnd(ot2), ot3: rnd(ot3),
    wk: rnd(wk), ext: rnd(ext),
    normalH, ot1H, ot2H, ot3H, ts, tsNorm, tsWk,
  };
}

// ─── NY calcLon med mixed OT support ───
function calcLon_mixed(h, opt, ugelon, pers, tillæg, model, wkAutoH, wkRate) {
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0 };
  const ts   = timesats(ugelon);
  const dMax = dagMax(model);
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

    // ── MIXED OT: varslet + uvarslet på samme dag ──
    // varsletTimer angiver hvor mange OT-timer der er varslet (0, 1 eller 2)
    // De varslet-timer bruger lavere satser, resten bruger uvarslet-satser
    // 3.+ time er ALTID +135% uanset type
    const vt = (varslet && uvarslet && typeof varsletTimer === 'number') ? varsletTimer : null;

    if (vt !== null) {
      // Mixed mode: varslet-timer kan være delvis (fx 0.5 = 30 min)
      // Splitter varslet/uvarslet INDEN for hvert OT-band
      const v1 = Math.min(vt, ot1H);               // varslet del af 1. time
      const u1 = ot1H - v1;                          // uvarslet del af 1. time
      const v2 = Math.min(Math.max(0, vt - 1), ot2H); // varslet del af 2. time
      const u2 = ot2H - v2;                          // uvarslet del af 2. time
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
  if (frokost)          ext += DIÆT;
  if (pause10 && h > 10) ext += ts * (15/60);

  return {
    total:  rnd(normal + ot1 + ot2 + ot3 + wk + ext),
    normal: rnd(normal), ot1: rnd(ot1), ot2: rnd(ot2), ot3: rnd(ot3),
    wk: rnd(wk), ext: rnd(ext),
    normalH, ot1H, ot2H, ot3H, ts, tsNorm, tsWk,
  };
}

// ═════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════

let passed = 0, failed = 0;
const failures = [];

function assert(cond, label, got, expected, extra) {
  if (cond) passed++;
  else { failed++; failures.push({ label, got, expected, extra }); }
}

const UGL = 10380;  // standard ugeløn
const TS  = UGL / 40; // = 259.50 kr/t
const p = 0;        // ingen pers. tillæg
const t = false;    // ingen enkeltdag
const m = '5dag';   // normal 5-dags uge

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Mixed Varslet/Uvarslet OT — Test Suite');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log(`  Timesats: ${TS} kr/t (ugeløn ${UGL})`);
console.log(`  Varslet:  +50% = ${rnd(TS*1.50)} | +60% = ${rnd(TS*1.60)}`);
console.log(`  Uvarslet: +75% = ${rnd(TS*1.75)} | +100% = ${rnd(TS*2.00)}`);
console.log(`  3.+ time: +135% = ${rnd(TS*2.35)}`);
console.log('');

// ─── 1. BAGUDKOMPATIBILITET: kun varslet (som i dag) ───
console.log('  ── Bagudkompatibilitet ──');

{
  const h = 11; // 8 normal + 3 OT
  const optV = { varslet:true, uvarslet:false, helligdag:false, frokost:false, pause10:false, enkeltdag:false };
  const cur = calcLon_current(h, optV, UGL, p, t, m, 0, 0.75);
  const mix = calcLon_mixed(h, optV, UGL, p, t, m, 0, 0.75);
  assert(cur.total === mix.total, 'compat/varslet_only', mix.total, cur.total, 'h=11 varslet');
  assert(cur.ot1 === mix.ot1, 'compat/varslet_ot1', mix.ot1, cur.ot1, '');
  assert(cur.ot2 === mix.ot2, 'compat/varslet_ot2', mix.ot2, cur.ot2, '');
  assert(cur.ot3 === mix.ot3, 'compat/varslet_ot3', mix.ot3, cur.ot3, '');
}

{
  const h = 11;
  const optU = { varslet:false, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false };
  const cur = calcLon_current(h, optU, UGL, p, t, m, 0, 0.75);
  const mix = calcLon_mixed(h, optU, UGL, p, t, m, 0, 0.75);
  assert(cur.total === mix.total, 'compat/uvarslet_only', mix.total, cur.total, 'h=11 uvarslet');
  assert(cur.ot1 === mix.ot1, 'compat/uvarslet_ot1', mix.ot1, cur.ot1, '');
  assert(cur.ot2 === mix.ot2, 'compat/uvarslet_ot2', mix.ot2, cur.ot2, '');
}

{
  // Helligdag: mixed OT bør ikke påvirke
  const h = 10;
  const optH = { varslet:true, uvarslet:true, helligdag:true, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 };
  const cur = calcLon_current(h, { ...optH, varslet:true }, UGL, p, t, m, 0, 0.75);
  const mix = calcLon_mixed(h, optH, UGL, p, t, m, 0, 0.75);
  assert(cur.total === mix.total, 'compat/helligdag_unchanged', mix.total, cur.total, 'helligdag mixed');
}

console.log(`    ${passed} bagudkompatibilitetstests bestået`);
const compatCount = passed;

// ─── 2. MIXED OT SCENARIER ───
console.log('');
console.log('  ── Mixed varslet/uvarslet scenarier ──');

// Scenarie A: 1t varslet + 2t uvarslet (total 3t OT)
// OT band 1: 1t varslet +50% = 259.50 × 1.50 = 389.25
// OT band 2: 1t uvarslet +100% = 259.50 × 2.00 = 519.00
// OT band 3: 1t +135% = 259.50 × 2.35 = 609.83
{
  const h = 11;
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);

  const expOt1 = rnd(1 * TS * 1.50);  // 1t varslet i band 1
  const expOt2 = rnd(1 * TS * 2.00);  // 1t uvarslet i band 2
  const expOt3 = rnd(TS * 2.35 * 1);  // 1t +135%

  assert(r.ot1 === expOt1, 'mixA/ot1_varslet+50%', r.ot1, expOt1, '1t varslet');
  assert(r.ot2 === expOt2, 'mixA/ot2_uvarslet+100%', r.ot2, expOt2, '1t uvarslet');
  assert(r.ot3 === expOt3, 'mixA/ot3_+135%', r.ot3, expOt3, '1t +135%');

  const pureV = calcLon_mixed(h, { ...opt, uvarslet:false, varsletTimer:undefined }, UGL, p, t, m, 0, 0.75);
  const pureU = calcLon_mixed(h, { ...opt, varslet:false, varsletTimer:undefined }, UGL, p, t, m, 0, 0.75);
  assert(r.total > pureV.total, 'mixA/total > ren_varslet', r.total, `>${pureV.total}`, 'mixed dyrere end varslet');
  assert(r.total < pureU.total, 'mixA/total < ren_uvarslet', r.total, `<${pureU.total}`, 'mixed billigere end uvarslet');

  console.log(`    Scenarie A (1t v + 2t u): OT1=${r.ot1} OT2=${r.ot2} OT3=${r.ot3} Total=${r.total}`);
  console.log(`      vs ren varslet: ${pureV.total} | ren uvarslet: ${pureU.total}`);
}

// Scenarie A½: 30 min varslet + resten uvarslet (3t OT)
// OT band 1: 0.5t varslet +50% + 0.5t uvarslet +75%
// OT band 2: 1t uvarslet +100%
// OT band 3: 1t +135%
{
  const h = 11;
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:0.5 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);

  const expOt1 = rnd(0.5 * TS * 1.50 + 0.5 * TS * 1.75);  // split i band 1
  const expOt2 = rnd(1 * TS * 2.00);                         // alt uvarslet i band 2
  const expOt3 = rnd(TS * 2.35 * 1);

  assert(r.ot1 === expOt1, 'mixA½/ot1_split', r.ot1, expOt1, '30m v + 30m u i band 1');
  assert(r.ot2 === expOt2, 'mixA½/ot2_uvarslet', r.ot2, expOt2, '');

  const pure1t = calcLon_mixed(h, { ...opt, varsletTimer:1 }, UGL, p, t, m, 0, 0.75);
  assert(r.total > pure1t.total, 'mixA½/30m dyrere end 1t varslet', r.total, `>${pure1t.total}`, '');

  console.log(`    Scenarie A½ (30m v + 2½t u): OT1=${r.ot1} OT2=${r.ot2} OT3=${r.ot3} Total=${r.total}`);
}

// Scenarie B: 2t varslet + 1t uvarslet (total 3t OT)
// OT time 1: varslet +50%
// OT time 2: varslet +60%
// OT time 3: +135% (altid)
{
  const h = 11;
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:2 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);

  const expOt1 = rnd(TS * 1.50 * 1);
  const expOt2 = rnd(TS * 1.60 * 1);  // 2. time er stadig varslet
  const expOt3 = rnd(TS * 2.35 * 1);

  assert(r.ot1 === expOt1, 'mixB/ot1_varslet+50%', r.ot1, expOt1, '');
  assert(r.ot2 === expOt2, 'mixB/ot2_varslet+60%', r.ot2, expOt2, '2t varslet → +60% for 2. time');
  assert(r.ot3 === expOt3, 'mixB/ot3_+135%', r.ot3, expOt3, '');

  // Med 2 varslet timer = identisk med ren varslet
  const pureV = calcLon_mixed(h, { ...opt, uvarslet:false, varsletTimer:undefined }, UGL, p, t, m, 0, 0.75);
  assert(r.total === pureV.total, 'mixB/2v_same_as_pureV', r.total, pureV.total, '2 varslet timer = ren varslet');

  console.log(`    Scenarie B (2v+1u): OT1=${r.ot1} OT2=${r.ot2} OT3=${r.ot3} Total=${r.total}`);
}

// Scenarie C: 0t varslet + 3t uvarslet (varsletTimer=0)
// = identisk med ren uvarslet
{
  const h = 11;
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:0 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);
  const pureU = calcLon_mixed(h, { ...opt, varslet:false, varsletTimer:undefined }, UGL, p, t, m, 0, 0.75);
  assert(r.total === pureU.total, 'mixC/0v_same_as_pureU', r.total, pureU.total, '0 varslet = ren uvarslet');

  console.log(`    Scenarie C (0v+3u): Total=${r.total} = ren uvarslet ${pureU.total}`);
}

// Scenarie D: 1t varslet + 0t uvarslet (kun 1t OT total)
// Kun 1 OT-time der er varslet
{
  const h = 9; // 8+1
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);

  const expOt1 = rnd(TS * 1.50 * 1);
  assert(r.ot1 === expOt1, 'mixD/1t_varslet', r.ot1, expOt1, 'kun 1 OT-time, varslet');
  assert(r.ot2 === 0, 'mixD/no_ot2', r.ot2, 0, '');
  assert(r.ot3 === 0, 'mixD/no_ot3', r.ot3, 0, '');

  console.log(`    Scenarie D (1v, 1t OT): OT1=${r.ot1} Total=${r.total}`);
}

// Scenarie E: 1t varslet + 1t uvarslet (2t OT)
{
  const h = 10; // 8+2
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);

  const expOt1 = rnd(TS * 1.50 * 1);  // varslet
  const expOt2 = rnd(TS * 2.00 * 1);  // uvarslet
  assert(r.ot1 === expOt1, 'mixE/ot1_varslet', r.ot1, expOt1, '');
  assert(r.ot2 === expOt2, 'mixE/ot2_uvarslet', r.ot2, expOt2, '');
  assert(r.ot3 === 0, 'mixE/no_ot3', r.ot3, 0, '');

  console.log(`    Scenarie E (1v+1u): OT1=${r.ot1} OT2=${r.ot2} Total=${r.total}`);
}

// ─── 3. SÆRTID (10t dag) ───
console.log('');
console.log('  ── Særtid (10t normaldag) med mixed OT ──');

{
  const h = 13; // 10 normal + 3t OT
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 };
  const r = calcLon_mixed(h, opt, UGL, p, t, 'saertid', 0, 0.75);

  assert(r.normalH === 10, 'saertid/normalH', r.normalH, 10, '');
  const expOt1 = rnd(TS * 1.50 * 1);
  const expOt2 = rnd(TS * 2.00 * 1);
  assert(r.ot1 === expOt1, 'saertid/ot1_varslet', r.ot1, expOt1, '');
  assert(r.ot2 === expOt2, 'saertid/ot2_uvarslet', r.ot2, expOt2, '');

  console.log(`    Særtid 13t (1v+2u): OT1=${r.ot1} OT2=${r.ot2} OT3=${r.ot3} Total=${r.total}`);
}

// ─── 4. ENKELTDAG §3.10 + MIXED OT ───
console.log('');
console.log('  ── Enkeltdag §3.10 + mixed OT ──');

{
  const h = 11;
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:true, varsletTimer:1 };
  const r = calcLon_mixed(h, opt, UGL, p, t, m, 0, 0.75);

  // Med enkeltdag: tsWk = ts * 1.1
  const tsWk = TS * 1.1;
  const expOt1 = rnd(tsWk * 1.50 * 1);
  const expOt2 = rnd(tsWk * 2.00 * 1);
  assert(r.ot1 === expOt1, 'enkeltdag_mix/ot1', r.ot1, expOt1, '');
  assert(r.ot2 === expOt2, 'enkeltdag_mix/ot2', r.ot2, expOt2, '');

  console.log(`    Enkeltdag mixed (1v+2u): OT1=${r.ot1} OT2=${r.ot2} Total=${r.total}`);
}

// ─── 5. PERSONLIGT TILLÆG + MIXED OT ───
console.log('');
console.log('  ── Pers. tillæg + mixed OT ──');

{
  const persT = 1000;
  const h = 10; // 8+2
  const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 };
  const r = calcLon_mixed(h, opt, UGL, persT, t, m, 0, 0.75);

  // Normal: (ugelon/40 + pers/40) × 8 = (259.50 + 25) × 8
  const expNormal = rnd((UGL/40 + persT/40) * 8);
  assert(r.normal === expNormal, 'pers_mix/normal', r.normal, expNormal, '');

  // OT bruger tsWk = ts (uden pers) — per §3.10 note
  const expOt1 = rnd(TS * 1.50);
  const expOt2 = rnd(TS * 2.00);
  assert(r.ot1 === expOt1, 'pers_mix/ot1', r.ot1, expOt1, '');
  assert(r.ot2 === expOt2, 'pers_mix/ot2', r.ot2, expOt2, '');

  console.log(`    Pers. tillæg ${persT} kr mixed (1v+1u): Normal=${r.normal} OT1=${r.ot1} OT2=${r.ot2} Total=${r.total}`);
}

// ─── 6. STRESS: Alle kombinationer ───
console.log('');
console.log('  ── Stresstest ──');

let stressOk = 0;
for (const model of ['5dag', 'saertid']) {
  for (const ugelon of [9500, 10380, 13500, 15000]) {
    for (const varsletTimer of [0, 0.5, 1, 1.5, 2]) {
      for (let otH = 0; otH <= 6; otH += 0.5) {
        const h = dagMax(model) + otH;
        const opt = { varslet:true, uvarslet:true, helligdag:false, frokost:false,
                      pause10:false, enkeltdag:false, varsletTimer };
        const r = calcLon_mixed(h, opt, ugelon, 0, false, model, 0, 0.75);

        assert(r.total >= 0, `stress/total>=0`, r.total, '>=0',
          `${model} uge=${ugelon} vt=${varsletTimer} otH=${otH}`);
        assert(r.normal >= 0, `stress/normal>=0`, r.normal, '>=0', '');

        // Total = sum
        const sum = r.normal + r.ot1 + r.ot2 + r.ot3 + r.wk + r.ext;
        assert(Math.abs(r.total - sum) <= 1, 'stress/total=sum', r.total, sum,
          `${model} uge=${ugelon} vt=${varsletTimer} otH=${otH}`);

        // Ordering: varsletTimer=0 >= varsletTimer=1 >= varsletTimer=2 (cost)
        if (varsletTimer > 0 && otH >= 1) {
          const rPrev = calcLon_mixed(h,
            { ...opt, varsletTimer: varsletTimer - 1 }, ugelon, 0, false, model, 0, 0.75);
          assert(rPrev.total >= r.total, 'stress/fewer_varslet_more_expensive',
            rPrev.total, `>=${r.total}`,
            `vt=${varsletTimer-1} vs vt=${varsletTimer}`);
        }
        stressOk++;
      }
    }
  }
}
console.log(`    ${stressOk} kombinationer testet`);

// ─── 7. NUVÆRENDE APP FEJLER (beviser behovet) ───
console.log('');
console.log('  ── Bevis: nuværende app kan IKKE mixed OT ──');

{
  const h = 11;
  // I nuværende app: varslet=true → ALT er varslet-sats
  const curV = calcLon_current(h, { varslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false },
    UGL, p, t, m, 0, 0.75);
  // Men i virkeligheden var kun 1 time varslet:
  const mixed = calcLon_mixed(h, { varslet:true, uvarslet:true, helligdag:false, frokost:false, pause10:false, enkeltdag:false, varsletTimer:1 },
    UGL, p, t, m, 0, 0.75);

  const diff = mixed.total - curV.total;
  assert(diff > 0, 'proof/mixed_costs_more_than_pure_varslet', diff, '>0',
    `Nuværende underbetaler med ${diff} kr ved 1v+2u`);

  console.log(`    Nuværende (ren varslet): ${curV.total} kr`);
  console.log(`    Korrekt   (1v + 2u):     ${mixed.total} kr`);
  console.log(`    Underbetaling:            ${diff} kr ← dette er problemet`);
}

// ═════════════════════════════════════════════════════════════
// RESULTAT
// ═════════════════════════════════════════════════════════════

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(` TOTAL: ${passed + failed} tests — ${passed} passed — ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('');
  console.log('FEJL:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    console.log(`    Got:      ${JSON.stringify(f.got)}`);
    console.log(`    Expected: ${JSON.stringify(f.expected)}`);
    if (f.extra) console.log(`    Context:  ${f.extra}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
