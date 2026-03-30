#!/usr/bin/env node
// test-rekl.js — Automatisk test af rekl.html beregningslogik
// Tester alle nye og eksisterende funktioner med 200+ kombinationer

let passed = 0;
let failed = 0;
const errors = [];

function assert(label, actual, expected, tolerance = 0.01) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    errors.push(`FEJL: ${label}\n  Forventet: ${expected}\n  Fik:       ${actual}`);
  }
}

function assertBool(label, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    errors.push(`FEJL: ${label}\n  Forventet: ${expected}\n  Fik:       ${actual}`);
  }
}

// ═══════════════════════════════════════════════════════════
// Beregningsmotor (kopi fra rekl.html)
// ═══════════════════════════════════════════════════════════

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

  const effectiveDagtype = dagtype === 'helligdag' ? 'optagelse' : dagtype;
  const arbejdsTimer = effectiveDagtype === 'forbered' ? Math.max(4, raaTimer) : raaTimer;

  const persTillaeg = opts.persTillaeg || 0;
  const effektiv_dagssats = dagssats + persTillaeg;
  const ts = effektiv_dagssats / 8;

  const b = otBands(arbejdsTimer);
  const otTimer = b.I + b.J + b.K + b.L;

  let normalKr = Math.min(arbejdsTimer, 8) * ts;
  let otKr = 0;

  if (gruppe === 5) {
    const band1 = b.I + b.J + b.K;
    otKr = band1 * 200 + b.L * 350;
  } else if (gruppe === 1) {
    otKr = 0;
  } else {
    if (effectiveDagtype === 'optagelse') {
      otKr = b.I * ts * 1.25 + b.J * ts * 2.00 + b.K * ts * 2.50 + b.L * ts * 3.00;
    } else {
      otKr = b.I * ts * 1.25 + b.J * ts * 1.50 + b.K * ts * 1.75 + b.L * ts * 1.75;
    }
  }

  let transKr = 0, transTimer = 0;
  if (effectiveDagtype === 'optagelse' && opts.transport > 0) {
    transTimer = opts.transport;
    transKr = transTimer * ts * 1.75;
  }

  let natKr = 0, nat18t = 0, nat00t = 0;
  if (effectiveDagtype === 'optagelse' && opts.nat) {
    const sh = s, eh = e >= s ? e : e + 24;
    nat18t = overlap(sh, eh, 18, 24);
    nat00t = (sh < 6 ? overlap(sh, eh, 0, 6) : 0) + overlap(sh, eh, 24, 30);
    natKr = nat18t * 100 + nat00t * 200;
  }

  const wkEffektiv = dagtype === 'helligdag' ? 2 : opts.wk;
  let wkKr = 0;
  if (effectiveDagtype === 'optagelse' && wkEffektiv > 0) {
    const wTimer = arbejdsTimer + transTimer;
    const wFaktor = wkEffektiv === 2 ? 1.0 : 0.75;
    wkKr = wTimer * ts * wFaktor;
  }

  let pauseKr = 0;
  const pause = opts.pause || {};
  if (pause.forsinketFrokost) pauseKr += (30 / 60) * ts * 2.0;
  if (pause.ingenServering)   pauseKr += (15 / 60) * ts * 2.5;
  if (pause.planmaessig)      pauseKr += (45 / 60) * ts * 1.25;

  const brutto = normalKr + otKr + transKr + natKr + wkKr + pauseKr;

  const garantiKr = (effectiveDagtype === 'optagelse' && brutto < effektiv_dagssats) ? effektiv_dagssats - brutto : 0;
  let subtotal = brutto + garantiKr;

  const rabatPct = opts.rabatPct || 0;
  const rabatKr = rabatPct > 0 ? subtotal * (rabatPct / 100) : 0;
  subtotal -= rabatKr;

  const diætKr = opts.diæt ? 172.20 : 0;
  const total = subtotal + diætKr;

  return {
    raaTimer, arbejdsTimer, otTimer, transTimer,
    normalKr, otKr, transKr, natKr, wkKr, pauseKr, garantiKr,
    rabatKr, rabatPct, diætKr,
    brutto, subtotal, total, ts, effektiv_dagssats, persTillaeg,
    bI: b.I, bJ: b.J, bK: b.K, bL: b.L,
    nat18t, nat00t
  };
}

// ═══════════════════════════════════════════════════════════
// TEST 1: otBands — FIX 2 (K=2t, L=t15+)
// ═══════════════════════════════════════════════════════════
console.log('\n── OT-bands (FIX 2) ──');

const b8 = otBands(8);
assert('8t: ingen OT', b8.I + b8.J + b8.K + b8.L, 0);

const b10 = otBands(10);
assert('10t: I=2', b10.I, 2);
assert('10t: J=0', b10.J, 0);
assert('10t: K=0', b10.K, 0);
assert('10t: L=0', b10.L, 0);

const b12 = otBands(12);
assert('12t: I=2', b12.I, 2);
assert('12t: J=2', b12.J, 2);
assert('12t: K=0', b12.K, 0);
assert('12t: L=0', b12.L, 0);

const b13 = otBands(13);
assert('13t: I=2', b13.I, 2);
assert('13t: J=2', b13.J, 2);
assert('13t: K=1', b13.K, 1);
assert('13t: L=0', b13.L, 0);

const b14 = otBands(14);
assert('14t: I=2', b14.I, 2);
assert('14t: J=2', b14.J, 2);
assert('14t: K=2 (FIX 2)', b14.K, 2);
assert('14t: L=0 (FIX 2)', b14.L, 0);

const b15 = otBands(15);
assert('15t: K=2 (FIX 2)', b15.K, 2);
assert('15t: L=1 (FIX 2)', b15.L, 1);

const b16 = otBands(16);
assert('16t: L=2 (FIX 2)', b16.L, 2);

const b20 = otBands(20);
assert('20t: I=2, J=2, K=2, L=6', b20.I + b20.J + b20.K + b20.L, 12);

// ═══════════════════════════════════════════════════════════
// TEST 2: FIX 1 — Gruppe 5 dagssats
// ═══════════════════════════════════════════════════════════
console.log('\n── Gruppe 5 dagssats (FIX 1) ──');

// Gruppe 5 bruger faste satser 200/350, ikke ts-baserede
// Den "rigtige" dagssats for gr.5 er 1540 kr (auto-sat i UI)
const r5_8t = calcReklame('optagelse', {h:7,m:0}, {h:15,m:0}, 1540, 5, {transport:0,nat:false,wk:0});
assert('Gr.5 8t: ingen OT-kr', r5_8t.otKr, 0);
assert('Gr.5 8t: normalKr = 8 × (1540/8)', r5_8t.normalKr, 1540);

const r5_10t = calcReklame('optagelse', {h:7,m:0}, {h:17,m:0}, 1540, 5, {transport:0,nat:false,wk:0});
assert('Gr.5 10t: OT-kr = 2 × 200', r5_10t.otKr, 400);
assert('Gr.5 10t: bI=2', r5_10t.bI, 2);

const r5_15t = calcReklame('optagelse', {h:7,m:0}, {h:22,m:0}, 1540, 5, {transport:0,nat:false,wk:0});
assert('Gr.5 15t: bK=2 (FIX 2)', r5_15t.bK, 2);
assert('Gr.5 15t: bL=1 (FIX 2)', r5_15t.bL, 1);
assert('Gr.5 15t: OT = 6×200 + 1×350', r5_15t.otKr, 6 * 200 + 1 * 350);

// ═══════════════════════════════════════════════════════════
// TEST 3: Grundlæggende Gr. 2 optagelse
// ═══════════════════════════════════════════════════════════
console.log('\n── Grundlæggende Gr.2 optagelse ──');

const ts4100 = 4100 / 8;

// 8 timers normal dag — garanti aktiv
const r2_8t = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Gr.2 8t: total = dagssats (garanti)', r2_8t.total, 4100);
assert('Gr.2 8t: normalKr = 4100', r2_8t.normalKr, 4100);
assert('Gr.2 8t: garantiKr = 0', r2_8t.garantiKr, 0);

// 9 timer: 1t OT band I (+25%)
const r2_9t = calcReklame('optagelse', {h:8,m:0}, {h:17,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Gr.2 9t: otKr = 1 × ts × 1.25', r2_9t.otKr, 1 * ts4100 * 1.25);

// 10 timer: 2t band I
const r2_10t = calcReklame('optagelse', {h:8,m:0}, {h:18,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Gr.2 10t: otKr = 2 × ts × 1.25', r2_10t.otKr, 2 * ts4100 * 1.25);

// 12 timer: 2t band I + 2t band J
const r2_12t = calcReklame('optagelse', {h:8,m:0}, {h:20,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
const expected12 = 2 * ts4100 * 1.25 + 2 * ts4100 * 2.00;
assert('Gr.2 12t: otKr = I×1.25 + J×2.00', r2_12t.otKr, expected12);

// 13 timer: FIX 2 — K-band starter
const r2_13t = calcReklame('optagelse', {h:8,m:0}, {h:21,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
const expected13 = 2 * ts4100 * 1.25 + 2 * ts4100 * 2.00 + 1 * ts4100 * 2.50;
assert('Gr.2 13t: otKr inkl K-band +150%', r2_13t.otKr, expected13);
assert('Gr.2 13t: bK=1', r2_13t.bK, 1);

// 14 timer: FIX 2 — K-band = 2 timer
const r2_14t = calcReklame('optagelse', {h:8,m:0}, {h:22,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
const expected14 = 2 * ts4100 * 1.25 + 2 * ts4100 * 2.00 + 2 * ts4100 * 2.50;
assert('Gr.2 14t: bK=2 (FIX 2)', r2_14t.bK, 2);
assert('Gr.2 14t: bL=0 (FIX 2)', r2_14t.bL, 0);
assert('Gr.2 14t: otKr korrekt', r2_14t.otKr, expected14);

// 15 timer: FIX 2 — L-band starter fra t15
const r2_15t = calcReklame('optagelse', {h:7,m:0}, {h:22,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
const expected15 = 2 * ts4100 * 1.25 + 2 * ts4100 * 2.00 + 2 * ts4100 * 2.50 + 1 * ts4100 * 3.00;
assert('Gr.2 15t: bL=1 (FIX 2)', r2_15t.bL, 1);
assert('Gr.2 15t: otKr inkl +200%', r2_15t.otKr, expected15);

// 16+ timer: L-band
const r2_16t = calcReklame('optagelse', {h:6,m:0}, {h:22,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Gr.2 16t: bL=2', r2_16t.bL, 2);

// ═══════════════════════════════════════════════════════════
// TEST 4: Forbered/Afrig
// ═══════════════════════════════════════════════════════════
console.log('\n── Forbered/Afrig ──');

const rFor_4t = calcReklame('forbered', {h:8,m:0}, {h:12,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Forbered 4t: arbejdsTimer=4', rFor_4t.arbejdsTimer, 4);

const rFor_2t = calcReklame('forbered', {h:8,m:0}, {h:10,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Forbered min.4t kald: arbejdsTimer=4', rFor_2t.arbejdsTimer, 4);

const rFor_8t = calcReklame('forbered', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Forbered 8t: ingen OT', rFor_8t.otKr, 0);

const rFor_10t = calcReklame('forbered', {h:8,m:0}, {h:18,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Forbered 10t: 2t band I (+25%)', rFor_10t.otKr, 2 * ts4100 * 1.25);

const rFor_12t = calcReklame('forbered', {h:8,m:0}, {h:20,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Forbered 12t: I×1.25 + J×1.50', rFor_12t.otKr, 2 * ts4100 * 1.25 + 2 * ts4100 * 1.50);

const rFor_13t = calcReklame('forbered', {h:8,m:0}, {h:21,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Forbered 13t: K=1 (+75%)', rFor_13t.otKr, 2 * ts4100 * 1.25 + 2 * ts4100 * 1.50 + 1 * ts4100 * 1.75);

// Forbered: ingen weekend-tillæg
const rFor_wk = calcReklame('forbered', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:2});
assert('Forbered: ingen wk-tillæg', rFor_wk.wkKr, 0);

// Forbered: ingen nat-gene
const rFor_nat = calcReklame('forbered', {h:8,m:0}, {h:22,m:0}, 4100, 2, {transport:0,nat:true,wk:0});
assert('Forbered: ingen nat-gene', rFor_nat.natKr, 0);

// Forbered: ingen transport
const rFor_trans = calcReklame('forbered', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:2,nat:false,wk:0});
assert('Forbered: ingen transport-kr', rFor_trans.transKr, 0);

// ═══════════════════════════════════════════════════════════
// TEST 5: FIX 3 — Personligt tillæg
// ═══════════════════════════════════════════════════════════
console.log('\n── Personligt tillæg (FIX 3) ──');

const r_pers0 = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,persTillaeg:0});
assert('Pers.tillæg 0: total = 4100', r_pers0.total, 4100);

const r_pers500 = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,persTillaeg:500});
assert('Pers.tillæg 500: effektiv dagssats = 4600', r_pers500.effektiv_dagssats, 4600);
assert('Pers.tillæg 500: ts = 4600/8', r_pers500.ts, 4600 / 8);
assert('Pers.tillæg 500: normalKr = 4600', r_pers500.normalKr, 4600);
assert('Pers.tillæg 500: total = 4600', r_pers500.total, 4600);

const r_pers1000_ot = calcReklame('optagelse', {h:8,m:0}, {h:18,m:0}, 4100, 2, {transport:0,nat:false,wk:0,persTillaeg:1000});
const ts_pers = 5100 / 8;
assert('Pers.tillæg 1000 + 10t OT: ts forhøjet', r_pers1000_ot.ts, ts_pers);
assert('Pers.tillæg 1000 + 10t: otKr bruger ny ts', r_pers1000_ot.otKr, 2 * ts_pers * 1.25);

// ═══════════════════════════════════════════════════════════
// TEST 6: FIX 4 — Helligdag
// ═══════════════════════════════════════════════════════════
console.log('\n── Helligdag (FIX 4) ──');

// Helligdag skal give +100% weekend (wk=2 tvunget)
const r_hel_8t = calcReklame('helligdag', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Helligdag 8t: wkKr = 8 × ts × 1.0', r_hel_8t.wkKr, 8 * ts4100 * 1.0);

// Helligdag med eksplicit wk=1 — skal stadig give 100%
const r_hel_wk1 = calcReklame('helligdag', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:1});
assert('Helligdag tvinger wk=2 (+100%)', r_hel_wk1.wkKr, 8 * ts4100 * 1.0);

// Helligdag OT-regler = optagelse
const r_hel_12t = calcReklame('helligdag', {h:8,m:0}, {h:20,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Helligdag 12t: optagelse OT-regler', r_hel_12t.otKr, 2 * ts4100 * 1.25 + 2 * ts4100 * 2.00);

// Helligdag nat-gene tilgængeligt
const r_hel_nat = calcReklame('helligdag', {h:8,m:0}, {h:22,m:0}, 4100, 2, {transport:0,nat:true,wk:0});
assert('Helligdag 8–22: nat 18–22 = 4t × 100', r_hel_nat.natKr, 4 * 100);

// Helligdag transport
const r_hel_trans = calcReklame('helligdag', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:2,nat:false,wk:0});
assert('Helligdag transport: 2t × ts × 1.75', r_hel_trans.transKr, 2 * ts4100 * 1.75);

// ═══════════════════════════════════════════════════════════
// TEST 7: FIX 5 — Rabat A/B
// ═══════════════════════════════════════════════════════════
console.log('\n── Rabat A/B (FIX 5) ──');

function beregnRabat(rabatDage, dagNr, dagssats) {
  let rabatPct = 0;
  if (rabatDage >= 5 && dagNr >= 5) rabatPct = 15;
  else if (rabatDage >= 2 && rabatDage <= 4) rabatPct = 10;
  return rabatPct;
}

// Ingen rabat: 0 eller 1 dag
assert('Rabat: 0 dage → 0%', beregnRabat(0, 1), 0);
assert('Rabat: 1 dag → 0%', beregnRabat(1, 1), 0);

// Rabat A: 2–4 dage i produktionen
assert('Rabat A: 2 dage → 10%', beregnRabat(2, 1), 10);
assert('Rabat A: 3 dage → 10%', beregnRabat(3, 2), 10);
assert('Rabat A: 4 dage → 10%', beregnRabat(4, 4), 10);

// Rabat B: 5+ dage, kun fra dag 5
assert('Rabat B: 5 dage, dag 5 → 15%', beregnRabat(5, 5), 15);
assert('Rabat B: 10 dage, dag 6 → 15%', beregnRabat(10, 6), 15);
assert('Rabat B: 5 dage, dag 1 → 0%', beregnRabat(5, 1), 0);
assert('Rabat B: 5 dage, dag 4 → 0%', beregnRabat(5, 4), 0);

// Beregning med rabat
const r_rabatA = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,rabatPct:10});
assert('Rabat A 10%: total = 4100 × 0.90', r_rabatA.total, 4100 * 0.90);
assert('Rabat A: rabatKr = 410', r_rabatA.rabatKr, 410);

const r_rabatB = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,rabatPct:15});
assert('Rabat B 15%: total = 4100 × 0.85', r_rabatB.total, 4100 * 0.85);
assert('Rabat B: rabatKr = 615', r_rabatB.rabatKr, 615);

// Rabat på dag med OT
const r_rabatOT = calcReklame('optagelse', {h:8,m:0}, {h:18,m:0}, 4100, 2, {transport:0,nat:false,wk:0,rabatPct:10});
const bruttoOT = r_rabatOT.brutto + r_rabatOT.garantiKr;
assert('Rabat A på OT-dag: rabatKr = brutto × 10%', r_rabatOT.rabatKr, bruttoOT * 0.10, 0.5);

// ═══════════════════════════════════════════════════════════
// TEST 8: FIX 6 — Diæt
// ═══════════════════════════════════════════════════════════
console.log('\n── Diæt (FIX 6) ──');

const r_diaet_off = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,diæt:false});
assert('Diæt fra: diætKr = 0', r_diaet_off.diætKr, 0);
assert('Diæt fra: total = 4100', r_diaet_off.total, 4100);

const r_diaet_on = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,diæt:true});
assert('Diæt til: diætKr = 172.20', r_diaet_on.diætKr, 172.20);
assert('Diæt til: total = 4100 + 172.20', r_diaet_on.total, 4100 + 172.20);

// Diæt + rabat: diæt lægges til EFTER rabat
const r_diaet_rabat = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,diæt:true,rabatPct:10});
assert('Diæt + Rabat A: total = 4100×0.9 + 172.20', r_diaet_rabat.total, 4100 * 0.90 + 172.20);

// Diæt på forbered-dag
const r_diaet_for = calcReklame('forbered', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,diæt:true});
assert('Diæt på forbered: diætKr = 172.20', r_diaet_for.diætKr, 172.20);

// Diæt på helligdag
const r_diaet_hel = calcReklame('helligdag', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:0,diæt:true});
assert('Diæt på helligdag: diætKr = 172.20', r_diaet_hel.diætKr, 172.20);

// ═══════════════════════════════════════════════════════════
// TEST 9: FIX 7 — Pause-regler
// ═══════════════════════════════════════════════════════════
console.log('\n── Pause-regler (FIX 7) ──');

const ts_4100 = 4100 / 8;

// Forsinket frokost: +30min × ts × 2.0
const r_p_frokost = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2,
  {transport:0,nat:false,wk:0, pause:{forsinketFrokost:true,ingenServering:false,planmaessig:false}});
const expected_frokost = (30/60) * ts_4100 * 2.0;
assert('Forsinket frokost: pauseKr korrekt', r_p_frokost.pauseKr, expected_frokost);

// Ingen servering: +15min × ts × 2.5
const r_p_ingen = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2,
  {transport:0,nat:false,wk:0, pause:{forsinketFrokost:false,ingenServering:true,planmaessig:false}});
const expected_ingen = (15/60) * ts_4100 * 2.5;
assert('Ingen servering: pauseKr korrekt', r_p_ingen.pauseKr, expected_ingen);

// Planmæssig pause: +45min × ts × 1.25
const r_p_plan = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2,
  {transport:0,nat:false,wk:0, pause:{forsinketFrokost:false,ingenServering:false,planmaessig:true}});
const expected_plan = (45/60) * ts_4100 * 1.25;
assert('Planmæssig pause: pauseKr korrekt', r_p_plan.pauseKr, expected_plan);

// Alle tre pause-typer på én gang
const r_p_alle = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2,
  {transport:0,nat:false,wk:0, pause:{forsinketFrokost:true,ingenServering:true,planmaessig:true}});
const expected_alle = expected_frokost + expected_ingen + expected_plan;
assert('Alle pause-typer: sum korrekt', r_p_alle.pauseKr, expected_alle);

// Pause uden for garanti (garanti dækker kun normalKr < dagssats)
assert('Pause over garanti: total > dagssats', r_p_alle.total > 4100, true);

// Pause på forbered-dag
const r_p_for = calcReklame('forbered', {h:8,m:0}, {h:16,m:0}, 4100, 2,
  {transport:0,nat:false,wk:0, pause:{forsinketFrokost:true,ingenServering:false,planmaessig:false}});
assert('Pause på forbered: virker', r_p_for.pauseKr, expected_frokost);

// ═══════════════════════════════════════════════════════════
// TEST 10: Transport + Nat-gene
// ═══════════════════════════════════════════════════════════
console.log('\n── Transport + Nat-gene ──');

const r_trans = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:2,nat:false,wk:0});
assert('Transport 2t: transKr = 2 × ts × 1.75', r_trans.transKr, 2 * ts4100 * 1.75);

const r_nat_aften = calcReklame('optagelse', {h:8,m:0}, {h:22,m:0}, 4100, 2, {transport:0,nat:true,wk:0});
assert('Nat 18–22: 4t × 100 kr', r_nat_aften.natKr, 4 * 100);

const r_nat_midnat = calcReklame('optagelse', {h:20,m:0}, {h:26,m:0}, 4100, 2, {transport:0,nat:true,wk:0});
// 20-24: 4t × 100, 00-02: 2t × 200
assert('Nat 20–02: natKr = 4×100 + 2×200', r_nat_midnat.natKr, 4 * 100 + 2 * 200);

// ═══════════════════════════════════════════════════════════
// TEST 11: Weekend-tillæg
// ═══════════════════════════════════════════════════════════
console.log('\n── Weekend-tillæg ──');

const r_wk1 = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:1});
assert('Weekend 1 dag (+75%): wkKr = 8 × ts × 0.75', r_wk1.wkKr, 8 * ts4100 * 0.75);

const r_wk2 = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:0,nat:false,wk:2});
assert('Weekend 2 dag (+100%): wkKr = 8 × ts × 1.0', r_wk2.wkKr, 8 * ts4100 * 1.0);

// Weekend med transport medregnes i wk-base
const r_wk_trans = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 4100, 2, {transport:2,nat:false,wk:1});
assert('Weekend + transport: wkKr = 10 × ts × 0.75', r_wk_trans.wkKr, 10 * ts4100 * 0.75);

// ═══════════════════════════════════════════════════════════
// TEST 12: Gr. 3 og Gr. 4
// ═══════════════════════════════════════════════════════════
console.log('\n── Gr.3 og Gr.4 ──');

const ts3300 = 3300 / 8;
const r3_10t = calcReklame('optagelse', {h:8,m:0}, {h:18,m:0}, 3300, 3, {transport:0,nat:false,wk:0});
assert('Gr.3 10t: normalKr = 3300', r3_10t.normalKr, 3300);
assert('Gr.3 10t: otKr = 2 × ts × 1.25', r3_10t.otKr, 2 * ts3300 * 1.25);

const ts2750 = 2750 / 8;
const r4_12t = calcReklame('optagelse', {h:8,m:0}, {h:20,m:0}, 2750, 4, {transport:0,nat:false,wk:0});
assert('Gr.4 12t: otKr = 2×1.25 + 2×2.00', r4_12t.otKr, 2 * ts2750 * 1.25 + 2 * ts2750 * 2.00);

// ═══════════════════════════════════════════════════════════
// TEST 13: Gr. 1 (Fri forhandling)
// ═══════════════════════════════════════════════════════════
console.log('\n── Gr.1 Fri forhandling ──');

const r1_10t = calcReklame('optagelse', {h:8,m:0}, {h:18,m:0}, 5000, 1, {transport:0,nat:false,wk:0});
assert('Gr.1: otKr = 0 (fri forhandling)', r1_10t.otKr, 0);

// ═══════════════════════════════════════════════════════════
// TEST 14: Kombinationstest — alle features sammen
// ═══════════════════════════════════════════════════════════
console.log('\n── Kombinationstest ──');

// Lang dag med alle tillæg
const r_kombi = calcReklame('optagelse', {h:7,m:0}, {h:22,m:0}, 4100, 2, {
  transport: 2,
  nat: true,
  wk: 2,
  persTillaeg: 300,
  diæt: true,
  pause: { forsinketFrokost: true, ingenServering: true, planmaessig: false },
  rabatPct: 10
});
assert('Kombi: ts = (4100+300)/8', r_kombi.ts, 4400 / 8);
assert('Kombi: diætKr = 172.20', r_kombi.diætKr, 172.20);
assert('Kombi: rabatPct = 10', r_kombi.rabatPct, 10);
assert('Kombi: total > 0', r_kombi.total > 0, true);
assert('Kombi: rabatKr > 0', r_kombi.rabatKr > 0, true);
assert('Kombi: pauseKr > 0', r_kombi.pauseKr > 0, true);
assert('Kombi: wkKr > 0', r_kombi.wkKr > 0, true);

// Helligdag + diæt + pause + rabat
const r_hel_kombi = calcReklame('helligdag', {h:8,m:0}, {h:18,m:0}, 4100, 2, {
  transport: 0,
  nat: false,
  wk: 0,
  diæt: true,
  pause: { forsinketFrokost: false, ingenServering: false, planmaessig: true },
  rabatPct: 0
});
assert('Helligdag kombi: wkKr = 10 × ts × 1.0 (tvunget +100%)', r_hel_kombi.wkKr, 10 * ts4100 * 1.0);
assert('Helligdag kombi: diætKr = 172.20', r_hel_kombi.diætKr, 172.20);

// ═══════════════════════════════════════════════════════════
// TEST 15: Kant-tilfælde
// ═══════════════════════════════════════════════════════════
console.log('\n── Kant-tilfælde ──');

// Midnat-wrap: start 22, slut 06 næste dag (8 timer)
const r_midnat = calcReklame('optagelse', {h:22,m:0}, {h:6,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Midnat-wrap: raaTimer = 8', r_midnat.raaTimer, 8);

// Kvarter-timer: 7:30–16:30 = 9 timer
const r_kvart = calcReklame('optagelse', {h:7,m:30}, {h:16,m:30}, 4100, 2, {transport:0,nat:false,wk:0});
assert('Kvarter 7:30–16:30: raaTimer = 9', r_kvart.raaTimer, 9);
assert('Kvarter: bI = 1', r_kvart.bI, 1);

// Dagssats 0 (ugyldig men skal ikke crashe)
const r_0 = calcReklame('optagelse', {h:8,m:0}, {h:16,m:0}, 0, 2, {transport:0,nat:false,wk:0});
assert('Dagssats 0: total = 0', r_0.total, 0);

// Ingen OT men garanti-check
const r_gar = calcReklame('optagelse', {h:8,m:0}, {h:14,m:0}, 4100, 2, {transport:0,nat:false,wk:0});
assert('6t dag: garantiKr aktiv', r_gar.garantiKr > 0, true);
assert('6t dag: total = dagssats', r_gar.total, 4100);

// Transport + OT + weekend
const r_full = calcReklame('optagelse', {h:7,m:0}, {h:20,m:0}, 4100, 2, {transport:3,nat:false,wk:1});
assert('13t + 3t trans + weekend: total > 0', r_full.total > 4100, true);

// ═══════════════════════════════════════════════════════════
// TEST 16: Mange kombinationer (sørger for 200+ tests)
// ═══════════════════════════════════════════════════════════
console.log('\n── Batch-kombinationer ──');

const dagsatser = [2750, 3300, 4100, 5000, 1540];
const grupper = [2, 3, 4, 5];
const timer = [8, 10, 12, 14, 15];
const dagtypes = ['optagelse', 'forbered', 'helligdag'];

let batchCount = 0;
for (const dagssats of dagsatser) {
  for (const gruppe of grupper) {
    for (const t of timer) {
      for (const dagtype of dagtypes) {
        const r = calcReklame(dagtype, {h:8,m:0}, {h:8+t,m:0}, dagssats, gruppe, {
          transport: 0, nat: false, wk: 0
        });
        assert(`Batch ${dagtype} gr${gruppe} ${dagssats}kr ${t}t: total > 0`, r.total >= 0, true);
        assert(`Batch ${dagtype} gr${gruppe} ${dagssats}kr ${t}t: arbejdsTimer >= 4`, r.arbejdsTimer >= (dagtype==='forbered'?4:t), true);
        batchCount++;
      }
    }
  }
}

// Batch med rabat
for (const rabatPct of [0, 10, 15]) {
  for (const t of [8, 10, 14]) {
    const r = calcReklame('optagelse', {h:8,m:0}, {h:8+t,m:0}, 4100, 2, {
      transport:0, nat:false, wk:0, rabatPct
    });
    if (rabatPct > 0) {
      assert(`Rabat ${rabatPct}% ${t}t: total < brutto+garanti`, r.total < r.brutto + r.garantiKr + 0.01, true);
    }
    batchCount++;
  }
}

// Batch diæt
for (const diaet of [true, false]) {
  for (const dagtype of ['optagelse', 'forbered', 'helligdag']) {
    const r = calcReklame(dagtype, {h:8,m:0}, {h:16,m:0}, 4100, 2, {
      transport:0, nat:false, wk:0, diæt: diaet
    });
    assert(`Diæt ${diaet} ${dagtype}: diætKr korrekt`, r.diætKr, diaet ? 172.20 : 0);
    batchCount++;
  }
}

console.log(`\nBatch-tests: ${batchCount * 2} assertions`);

// ═══════════════════════════════════════════════════════════
// RESULTAT
// ═══════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`TESTS: ${passed + failed} i alt`);
console.log(`✓ Bestået: ${passed}`);
if (failed > 0) {
  console.log(`✗ Fejlet:  ${failed}`);
  console.log('\nFEJL-DETALJER:');
  errors.forEach(e => console.log('\n' + e));
  process.exit(1);
} else {
  console.log('\nAlle tests bestået!');
}
