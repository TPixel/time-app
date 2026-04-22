#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
// TEST SUITE: rekl.html — Reklamefilmsoverenskomst 2024
// Port af calcReklame() fra rekl.html til Node.js
// ════════════════════════════════════════════════════════════

// ── KONSTANTER (fra rekl.html) ─────────────────────────────
const GR_SATSER = { 1: 0, 2: 4100, 3: 3300, 4: 2750, 5: 1540 };
const GR_NAVNE = {
  1: 'Fri forhandling',
  2: '4.100 kr/dag',
  3: '3.300 kr/dag',
  4: '2.750 kr/dag',
  5: 'Fast OT-sats'
};
const FAGGRUPPER = [
  { gr: 1, titel: 'Kameraoperatør' },
  { gr: 1, titel: 'Steadicam operatør' },
  { gr: 1, titel: 'Food styling' },
  { gr: 1, titel: 'Stylist (kostume og sminke)' },
  { gr: 1, titel: 'Sound designer' },
  { gr: 2, titel: 'Indspilningsleder' },
  { gr: 2, titel: 'Location manager' },
  { gr: 2, titel: 'Tonemester på optagelse' },
  { gr: 2, titel: '1. AC / B-foto' },
  { gr: 2, titel: 'Belysningsmester' },
  { gr: 2, titel: 'SFX Supervisor' },
  { gr: 2, titel: 'Key grip' },
  { gr: 2, titel: 'Chefkostume' },
  { gr: 2, titel: 'Chefrekvisitør' },
  { gr: 2, titel: 'Chefsminkør' },
  { gr: 3, titel: 'Statistkoordinator' },
  { gr: 3, titel: '2. AC' },
  { gr: 3, titel: 'B-tonemester / Boomer' },
  { gr: 3, titel: 'Q-take operatør' },
  { gr: 3, titel: 'DIT' },
  { gr: 3, titel: 'Scripter' },
  { gr: 3, titel: 'Board operator' },
  { gr: 3, titel: 'Belyser' },
  { gr: 3, titel: 'Best boy grip' },
  { gr: 3, titel: 'Kostumier' },
  { gr: 3, titel: 'Rekvisitør' },
  { gr: 3, titel: 'Sminkør / Hår' },
  { gr: 3, titel: 'SFX Tekniker' },
  { gr: 4, titel: 'Indspilningslederassistant' },
  { gr: 4, titel: 'Videoassistent' },
  { gr: 4, titel: 'Data Wrangler' },
  { gr: 4, titel: 'Belysningsassistent' },
  { gr: 4, titel: 'Toneassistent' },
  { gr: 4, titel: 'Grip assistent' },
  { gr: 4, titel: 'Kostumierassistent' },
  { gr: 4, titel: 'Rekvisitørassistent' },
  { gr: 4, titel: 'Sminkørassistent' },
  { gr: 4, titel: 'SFX-assistent' },
  { gr: 4, titel: 'Locationassistent' },
  { gr: 5, titel: 'Runner' },
  { gr: 5, titel: 'Trainee' }
];

// ── BEREGNINGSMOTOR (porteret fra rekl.html) ───────────────
function otBands(t) {
  const ot = Math.max(0, t - 8);
  return {
    I: Math.min(ot, 2),
    J: Math.min(Math.max(ot - 2, 0), 2),
    K: Math.min(Math.max(ot - 4, 0), 1),
    L: Math.max(ot - 5, 0)
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
    otKr = 0;
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
  if (dagtype === 'optagelse' && opts.wk > 0) {
    const wTimer = arbejdsTimer + transTimer;
    const wFaktor = opts.wk === 2 ? 1.0 : 0.75;
    wkKr = wTimer * ts * wFaktor;
  }

  const brutto = normalKr + otKr + transKr + natKr + wkKr;
  const garantiKr = (dagtype === 'optagelse' && brutto < dagssats) ? dagssats - brutto : 0;
  const total = brutto + garantiKr;

  return {
    raaTimer, arbejdsTimer, otTimer, transTimer,
    normalKr, otKr, transKr, natKr, wkKr, garantiKr,
    brutto, total, ts,
    bI: b.I, bJ: b.J, bK: b.K, bL: b.L,
    nat18t, nat00t
  };
}

// ── TEST INFRASTRUKTUR ──────────────────────────────────────
let passCount = 0;
let failCount = 0;
let warnCount = 0;
const failures = [];
const warnings = [];

function assert(condition, name, detail = '') {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    failures.push({ name, detail });
    process.stdout.write(`  ✗ FEJL: ${name} — ${detail}\n`);
  }
}

function warn(condition, name, detail = '') {
  if (!condition) {
    warnCount++;
    warnings.push({ name, detail });
    process.stdout.write(`  ⚠ ADVARSEL: ${name} — ${detail}\n`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function approx(a, b, tol = 0.01) {
  return Math.abs(a - b) < tol;
}

// ── SEKTION 1: GRUNDLÆGGENDE SANITY ─────────────────────────
section('1. GRUNDLÆGGENDE SANITY CHECKS');

// null-checks
{
  const r = calcReklame('optagelse', null, { h: 17, m: 0 }, 4100, 2, { transport: 0, nat: false, wk: 0 });
  assert(r === null, 'null-start returnerer null');
}
{
  const r = calcReklame('optagelse', { h: 7, m: 0 }, null, 4100, 2, { transport: 0, nat: false, wk: 0 });
  assert(r === null, 'null-slut returnerer null');
}

// 8 timers normal dag, gr. 2
{
  const r = calcReklame('optagelse', { h: 7, m: 0 }, { h: 15, m: 0 }, 4100, 2, { transport: 0, nat: false, wk: 0 });
  assert(r !== null, '8t optagelse gr.2: returnerer resultat');
  assert(!isNaN(r.total), '8t optagelse gr.2: total er ikke NaN');
  assert(r.total >= 0, '8t optagelse gr.2: total er ikke negativ');
  // Præcis 8t = dagssats (ingen OT, garantiKr = 0)
  assert(approx(r.total, 4100, 1), `8t optagelse gr.2: total = dagssats (forventet 4100, fik ${r.total.toFixed(2)})`);
  assert(approx(r.otKr, 0), `8t: ingen OT (forventet 0, fik ${r.otKr.toFixed(2)})`);
  assert(r.bI === 0 && r.bJ === 0 && r.bK === 0 && r.bL === 0, '8t: alle OT-bands = 0');
}

// Alle grupper, 8t normal: ingen NaN/negativ
for (const [gr, sats] of Object.entries(GR_SATSER)) {
  const dagssats = sats > 0 ? sats : 5000;
  const r = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, parseInt(gr), { transport: 0, nat: false, wk: 0 });
  assert(r !== null, `Gr.${gr}: returnerer resultat ved 8t`);
  assert(!isNaN(r.total), `Gr.${gr}: total er ikke NaN`);
  assert(r.total >= 0, `Gr.${gr}: total er ikke negativ`);
}

// ── SEKTION 2: OT-BANDS LOGIK ───────────────────────────────
section('2. OT-BANDS LOGIK (otBands)');

const bandTests = [
  { t: 8,  I: 0, J: 0, K: 0, L: 0 },
  { t: 9,  I: 1, J: 0, K: 0, L: 0 },
  { t: 10, I: 2, J: 0, K: 0, L: 0 },
  { t: 11, I: 2, J: 1, K: 0, L: 0 },
  { t: 12, I: 2, J: 2, K: 0, L: 0 },
  { t: 13, I: 2, J: 2, K: 1, L: 0 },
  { t: 14, I: 2, J: 2, K: 1, L: 1 },
  { t: 15, I: 2, J: 2, K: 1, L: 2 },
  { t: 16, I: 2, J: 2, K: 1, L: 3 },
];
for (const bt of bandTests) {
  const b = otBands(bt.t);
  assert(b.I === bt.I && b.J === bt.J && b.K === bt.K && b.L === bt.L,
    `otBands(${bt.t}t)`,
    `forventet I=${bt.I} J=${bt.J} K=${bt.K} L=${bt.L}, fik I=${b.I} J=${b.J} K=${b.K} L=${b.L}`);
}

// Bands summer korrekt
for (let t = 8; t <= 16; t++) {
  const b = otBands(t);
  const sum = b.I + b.J + b.K + b.L;
  assert(sum === Math.max(0, t - 8), `otBands(${t}t): sum = ${sum}, forventet ${Math.max(0, t-8)}`);
}

// ── SEKTION 3: OT-SATSER OPTAGELSE (GR. 2–4) ───────────────
section('3. OT-SATSER OPTAGELSE (Gr. 2–4)');

// Overenskomst: OT = +25%/+100%/+150%/+200% af timesats
// Det betyder: 1.25x / 2.00x / 2.50x / 3.00x
for (const gr of [2, 3, 4]) {
  const dagssats = GR_SATSER[gr];
  const ts = dagssats / 8;

  // 10t: 2 OT-timer på band I (+25%)
  const r10 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 17, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const expected10 = 8 * ts + 2 * ts * 1.25;
  assert(approx(r10.total, expected10, 1),
    `Gr.${gr} 10t optagelse: OT band I`,
    `forventet ${expected10.toFixed(0)}, fik ${r10.total.toFixed(0)}`);

  // 12t: 2 OT-timer band I + 2 band J (+100%)
  const r12 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 19, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const expected12 = 8 * ts + 2 * ts * 1.25 + 2 * ts * 2.00;
  assert(approx(r12.total, expected12, 1),
    `Gr.${gr} 12t optagelse: OT band I+J`,
    `forventet ${expected12.toFixed(0)}, fik ${r12.total.toFixed(0)}`);

  // 13t: +1 band K (+150%)
  const r13 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 20, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const expected13 = 8 * ts + 2 * ts * 1.25 + 2 * ts * 2.00 + 1 * ts * 2.50;
  assert(approx(r13.total, expected13, 1),
    `Gr.${gr} 13t optagelse: OT band I+J+K`,
    `forventet ${expected13.toFixed(0)}, fik ${r13.total.toFixed(0)}`);

  // 14t: +1 band L (+200%)
  const r14 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 21, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const expected14 = 8 * ts + 2 * ts * 1.25 + 2 * ts * 2.00 + 1 * ts * 2.50 + 1 * ts * 3.00;
  assert(approx(r14.total, expected14, 1),
    `Gr.${gr} 14t optagelse: OT band I+J+K+L`,
    `forventet ${expected14.toFixed(0)}, fik ${r14.total.toFixed(0)}`);
}

// ── SEKTION 4: OT-SATSER FORBERED (GR. 2–4) ─────────────────
section('4. OT-SATSER FORBERED (Gr. 2–4)');

// Overenskomst: +25%/+50%/+75%/+75%
for (const gr of [2, 3, 4]) {
  const dagssats = GR_SATSER[gr];
  const ts = dagssats / 8;

  // 4t minimum kald (selvom vi arbejder kun 2t)
  const rMin = calcReklame('forbered', { h: 8, m: 0 }, { h: 10, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  assert(approx(rMin.arbejdsTimer, 4),
    `Gr.${gr} forbered minimum 4t kald`,
    `forventet 4t, fik ${rMin.arbejdsTimer}`);
  assert(approx(rMin.total, 4 * ts, 1),
    `Gr.${gr} forbered 2t → beregnes som 4t`,
    `forventet ${(4*ts).toFixed(0)}, fik ${rMin.total.toFixed(0)}`);

  // 10t forbered: 2 OT band I (+25%)
  const r10 = calcReklame('forbered', { h: 7, m: 0 }, { h: 17, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const exp10 = 8 * ts + 2 * ts * 1.25;
  assert(approx(r10.total, exp10, 1),
    `Gr.${gr} 10t forbered: OT +25%`,
    `forventet ${exp10.toFixed(0)}, fik ${r10.total.toFixed(0)}`);

  // 12t forbered: band I (+25%) + band J (+50%)
  const r12 = calcReklame('forbered', { h: 7, m: 0 }, { h: 19, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const exp12 = 8 * ts + 2 * ts * 1.25 + 2 * ts * 1.50;
  assert(approx(r12.total, exp12, 1),
    `Gr.${gr} 12t forbered: OT +25%/+50%`,
    `forventet ${exp12.toFixed(0)}, fik ${r12.total.toFixed(0)}`);

  // 13t forbered: + band K (+75%)
  const r13 = calcReklame('forbered', { h: 7, m: 0 }, { h: 20, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const exp13 = 8 * ts + 2 * ts * 1.25 + 2 * ts * 1.50 + 1 * ts * 1.75;
  assert(approx(r13.total, exp13, 1),
    `Gr.${gr} 13t forbered: OT +25%/+50%/+75%`,
    `forventet ${exp13.toFixed(0)}, fik ${r13.total.toFixed(0)}`);

  // 14t forbered: + band L (+75% igen)
  const r14 = calcReklame('forbered', { h: 7, m: 0 }, { h: 21, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
  const exp14 = 8 * ts + 2 * ts * 1.25 + 2 * ts * 1.50 + 1 * ts * 1.75 + 1 * ts * 1.75;
  assert(approx(r14.total, exp14, 1),
    `Gr.${gr} 14t forbered: OT +75% på 14. time`,
    `forventet ${exp14.toFixed(0)}, fik ${r14.total.toFixed(0)}`);

  // Ingen nat/wk/transport på forbered
  const rNat = calcReklame('forbered', { h: 20, m: 0 }, { h: 23, m: 0 }, dagssats, gr, { transport: 2, nat: true, wk: 1 });
  assert(approx(rNat.natKr, 0), `Gr.${gr} forbered: ingen nat-gene selvom nat=true`);
  assert(approx(rNat.wkKr, 0), `Gr.${gr} forbered: ingen weekend-tillæg selvom wk=1`);
  assert(approx(rNat.transKr, 0), `Gr.${gr} forbered: ingen transport selvom transport=2`);
}

// ── SEKTION 5: GRUPPE 5 (FAST OT-SATS) ─────────────────────
section('5. GRUPPE 5 — Fast OT-sats (Runner/Trainee)');

// Gr. 5: OT = 200 kr/t (band I+J+K), 350 kr/t (band L)
// Normal løn er stadig dagssats/8 per time
{
  const dagssats = GR_SATSER[5]; // 1540
  const ts = dagssats / 8; // 192.5

  // 10t: normal + 2 × 200
  const r10 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 17, m: 0 }, dagssats, 5, { transport: 0, nat: false, wk: 0 });
  const exp10 = 8 * ts + 2 * 200;
  assert(approx(r10.total, exp10, 1),
    `Gr.5 10t: 8×ts + 2×200`,
    `forventet ${exp10.toFixed(0)}, fik ${r10.total.toFixed(0)}`);

  // 13t: 5 timer OT × 200 kr
  const r13 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 20, m: 0 }, dagssats, 5, { transport: 0, nat: false, wk: 0 });
  const exp13 = 8 * ts + 5 * 200;
  assert(approx(r13.total, exp13, 1),
    `Gr.5 13t: 8×ts + 5×200`,
    `forventet ${exp13.toFixed(0)}, fik ${r13.total.toFixed(0)}`);

  // 14t: 5 × 200 + 1 × 350
  const r14 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 21, m: 0 }, dagssats, 5, { transport: 0, nat: false, wk: 0 });
  const exp14 = 8 * ts + 5 * 200 + 1 * 350;
  assert(approx(r14.total, exp14, 1),
    `Gr.5 14t: 8×ts + 5×200 + 1×350`,
    `forventet ${exp14.toFixed(0)}, fik ${r14.total.toFixed(0)}`);

  // 16t: 5 × 200 + 3 × 350
  const r16 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 23, m: 0 }, dagssats, 5, { transport: 0, nat: false, wk: 0 });
  const exp16 = 8 * ts + 5 * 200 + 3 * 350;
  assert(approx(r16.total, exp16, 1),
    `Gr.5 16t: 8×ts + 5×200 + 3×350`,
    `forventet ${exp16.toFixed(0)}, fik ${r16.total.toFixed(0)}`);
}

// ── SEKTION 6: GRUPPE 1 (FRI FORHANDLING) ──────────────────
section('6. GRUPPE 1 — Fri forhandling');

// OT = 0 (ingen definerede satser), normal løn løber videre
{
  const dagssats = 6000; // fri forhandling
  const ts = dagssats / 8;

  const r10 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 17, m: 0 }, dagssats, 1, { transport: 0, nat: false, wk: 0 });
  assert(approx(r10.otKr, 0), `Gr.1 10t: otKr = 0 (fri forhandling)`);
  // Total = normalKr (kun 8t) + garantiKr ?
  // Normal: 8 × ts = dagssats
  // OT = 0, total = dagssats (garantiKr = 0 da brutto >= dagssats)
  assert(approx(r10.total, dagssats, 1),
    `Gr.1 10t: total = dagssats (OT ikke beregnet)`,
    `forventet ${dagssats}, fik ${r10.total.toFixed(0)}`);

  // 5t (under minimum): normal
  const r5 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 13, m: 0 }, dagssats, 1, { transport: 0, nat: false, wk: 0 });
  assert(!isNaN(r5.total), `Gr.1 5t: ikke NaN`);
  // brutto = 5×ts < dagssats → garantiKr aktiv
  const exp5 = dagssats;
  assert(approx(r5.total, exp5, 1),
    `Gr.1 5t: garantiKr løfter til dagssats`,
    `forventet ${exp5.toFixed(0)}, fik ${r5.total.toFixed(0)}`);
}

// ── SEKTION 7: NAT-GENE (§5) ─────────────────────────────────
section('7. NAT-GENE §5 (kun Optagelse)');

// 18-24: 100 kr/t, 00-06: 200 kr/t
{
  const dagssats = 4100;
  const ts = dagssats / 8;

  // Dag 08:00–20:00 med nat=true → 2 natimer (18-20)
  const r_aft = calcReklame('optagelse', { h: 8, m: 0 }, { h: 20, m: 0 }, dagssats, 2, { transport: 0, nat: true, wk: 0 });
  assert(approx(r_aft.nat18t, 2, 0.01),
    `Nat 08-20: 2 timer 18-20 genetillæg`,
    `forventet 2, fik ${r_aft.nat18t}`);
  assert(approx(r_aft.natKr, 200, 1),
    `Nat 08-20: natKr = 200 (2t × 100 kr)`,
    `forventet 200, fik ${r_aft.natKr.toFixed(0)}`);

  // 18:00–00:00: 6 natimer × 100 kr
  const r_nat = calcReklame('optagelse', { h: 18, m: 0 }, { h: 0, m: 0 }, dagssats, 2, { transport: 0, nat: true, wk: 0 });
  assert(approx(r_nat.nat18t, 6, 0.01),
    `Nat 18:00-00:00: 6 timer i 18-24`,
    `forventet 6, fik ${r_nat.nat18t}`);
  assert(approx(r_nat.natKr, 600, 1),
    `Nat 18:00-00:00: natKr = 600`,
    `forventet 600, fik ${r_nat.natKr.toFixed(0)}`);

  // 00:00–06:00: 6 natimer × 200 kr
  const r_midnat = calcReklame('optagelse', { h: 0, m: 0 }, { h: 6, m: 0 }, dagssats, 2, { transport: 0, nat: true, wk: 0 });
  assert(approx(r_midnat.nat00t, 6, 0.01),
    `Nat 00:00-06:00: 6 timer i 00-06`,
    `forventet 6, fik ${r_midnat.nat00t}`);
  assert(approx(r_midnat.natKr, 1200, 1),
    `Nat 00:00-06:00: natKr = 1200`,
    `forventet 1200, fik ${r_midnat.natKr.toFixed(0)}`);

  // Nat OFF → ingen natKr
  const r_no_nat = calcReklame('optagelse', { h: 18, m: 0 }, { h: 23, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r_no_nat.natKr, 0), `Nat OFF: natKr = 0`);

  // Nat på forbered = ingen gene
  const r_for_nat = calcReklame('forbered', { h: 18, m: 0 }, { h: 23, m: 0 }, dagssats, 2, { transport: 0, nat: true, wk: 0 });
  assert(approx(r_for_nat.natKr, 0), `Forbered + nat: natKr = 0`);
}

// ── SEKTION 8: WEEKEND-TILLÆG (§6) ──────────────────────────
section('8. WEEKEND-TILLÆG §6 (kun Optagelse)');

{
  const dagssats = 4100;
  const ts = dagssats / 8;

  // wk=1 (+75%): 8t × ts × 0.75
  const r_wk1 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 1 });
  const exp_wk1 = 8 * ts * 0.75;
  assert(approx(r_wk1.wkKr, exp_wk1, 1),
    `WK +75%: wkKr = ${exp_wk1.toFixed(0)}`,
    `fik ${r_wk1.wkKr.toFixed(0)}`);

  // wk=2 (+100%): 8t × ts × 1.0
  const r_wk2 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 2 });
  const exp_wk2 = 8 * ts * 1.0;
  assert(approx(r_wk2.wkKr, exp_wk2, 1),
    `WK +100%: wkKr = ${exp_wk2.toFixed(0)}`,
    `fik ${r_wk2.wkKr.toFixed(0)}`);

  // wk=0: ingen weekend tillæg
  const r_wk0 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r_wk0.wkKr, 0), `WK=0: wkKr = 0`);

  // Weekend-tillæg inkluderer transport-timer (§6 stk. 3)
  const r_wk_trans = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 2, nat: false, wk: 1 });
  const exp_wkt = (8 + 2) * ts * 0.75;
  assert(approx(r_wk_trans.wkKr, exp_wkt, 1),
    `WK +75% med 2t transport: (8+2)×ts×0.75`,
    `forventet ${exp_wkt.toFixed(0)}, fik ${r_wk_trans.wkKr.toFixed(0)}`);

  // Forbered + wk = ingen tillæg
  const r_for_wk = calcReklame('forbered', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 2 });
  assert(approx(r_for_wk.wkKr, 0), `Forbered + WK: wkKr = 0`);
}

// ── SEKTION 9: TRANSPORT-TILLÆG ──────────────────────────────
section('9. TRANSPORT-TILLÆG (1.75 × timesats)');

{
  const dagssats = 4100;
  const ts = dagssats / 8;

  // 2t transport
  const r_t2 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 2, nat: false, wk: 0 });
  const exp_t2 = 2 * ts * 1.75;
  assert(approx(r_t2.transKr, exp_t2, 1),
    `Transport 2t: transKr = ${exp_t2.toFixed(0)}`,
    `fik ${r_t2.transKr.toFixed(0)}`);

  // 0.5t transport
  const r_t05 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0.5, nat: false, wk: 0 });
  const exp_t05 = 0.5 * ts * 1.75;
  assert(approx(r_t05.transKr, exp_t05, 1),
    `Transport 0.5t: transKr = ${exp_t05.toFixed(0)}`,
    `fik ${r_t05.transKr.toFixed(0)}`);

  // 0t transport
  const r_t0 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r_t0.transKr, 0), `Transport 0t: transKr = 0`);

  // Forbered + transport = ingen betaling
  const r_for_t = calcReklame('forbered', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 2, nat: false, wk: 0 });
  assert(approx(r_for_t.transKr, 0), `Forbered + transport: transKr = 0`);
}

// ── SEKTION 10: DAGSLØNGARANTI ───────────────────────────────
section('10. DAGSLØNGARANTI (kun Optagelse)');

{
  const dagssats = 4100;
  const ts = dagssats / 8;

  // Under 8t → garantiKr aktiv (optagelse)
  const r_5t = calcReklame('optagelse', { h: 8, m: 0 }, { h: 13, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  const brutto5 = 5 * ts;
  const expGaranti5 = dagssats - brutto5;
  assert(approx(r_5t.garantiKr, expGaranti5, 1),
    `5t optagelse: garantiKr = ${expGaranti5.toFixed(0)}`,
    `fik ${r_5t.garantiKr.toFixed(0)}`);
  assert(approx(r_5t.total, dagssats, 1),
    `5t optagelse: total = dagssats (${dagssats})`,
    `fik ${r_5t.total.toFixed(0)}`);

  // Over 8t → ingen garantiKr
  const r_10t = calcReklame('optagelse', { h: 8, m: 0 }, { h: 18, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r_10t.garantiKr, 0), `10t optagelse: ingen garantiKr`);

  // Forbered under 8t: ingen garantiKr (men minimum 4t kald)
  const r_3t_for = calcReklame('forbered', { h: 8, m: 0 }, { h: 11, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r_3t_for.garantiKr, 0), `3t forbered: ingen garantiKr`);
  assert(approx(r_3t_for.arbejdsTimer, 4), `3t forbered: arbejdsTimer = 4 (min. kald)`);

  // Gr. 5 dagssats = 1540: test garantiKr ikke trigger unødigt
  const r_gr5_8t = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, 1540, 5, { transport: 0, nat: false, wk: 0 });
  const brutto5_8t = 8 * (1540/8); // = 1540
  assert(approx(r_gr5_8t.garantiKr, 0), `Gr.5 8t: garantiKr = 0 (brutto = dagssats)`);
}

// ── SEKTION 11: MIDNATSOVERSKRIDELSE ─────────────────────────
section('11. MIDNATSOVERSKRIDELSE (arbejde over midnat)');

{
  const dagssats = 4100;
  const ts = dagssats / 8;

  // 22:00–02:00 = 4 timer (over midnat)
  const r_mid = calcReklame('optagelse', { h: 22, m: 0 }, { h: 2, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r_mid.raaTimer, 4, 0.01),
    `22:00-02:00: 4 timer`,
    `fik ${r_mid.raaTimer}`);
  assert(!isNaN(r_mid.total), `22:00-02:00: ikke NaN`);
  assert(r_mid.total >= 0, `22:00-02:00: ikke negativ`);

  // Nat 22:00–02:00 med nat=true: 2t i 22-24 + 2t i 00-02
  const r_mid_nat = calcReklame('optagelse', { h: 22, m: 0 }, { h: 2, m: 0 }, dagssats, 2, { transport: 0, nat: true, wk: 0 });
  assert(approx(r_mid_nat.nat18t, 2, 0.01),
    `22-02 nat: 2t i 18-24 zone`,
    `fik ${r_mid_nat.nat18t}`);
  assert(approx(r_mid_nat.nat00t, 2, 0.01),
    `22-02 nat: 2t i 00-06 zone`,
    `fik ${r_mid_nat.nat00t}`);
  const expNat = 2 * 100 + 2 * 200;
  assert(approx(r_mid_nat.natKr, expNat, 1),
    `22-02 nat: natKr = ${expNat}`,
    `fik ${r_mid_nat.natKr.toFixed(0)}`);
}

// ── SEKTION 12: ALLE FAGGRUPPER × ALLE LØNGRUPPER ────────────
section('12. ALLE FAGGRUPPER × ALLE LØNGRUPPER (systematisk)');

let fagFejl = 0;
for (const fag of FAGGRUPPER) {
  const dagssats = fag.gr === 1 ? 5000 : GR_SATSER[fag.gr];
  for (const dagtype of ['optagelse', 'forbered']) {
    const r = calcReklame(dagtype, { h: 7, m: 0 }, { h: 15, m: 0 }, dagssats, fag.gr, { transport: 0, nat: false, wk: 0 });
    const navn = `${fag.titel} (Gr.${fag.gr}) ${dagtype}`;
    if (isNaN(r.total) || r.total < 0 || r.total === null) {
      fagFejl++;
      assert(false, navn, `total = ${r.total}`);
    } else {
      passCount++;
    }
  }
}
if (fagFejl === 0) console.log(`  ✓ Alle ${FAGGRUPPER.length * 2} faggruppe-kombinationer OK`);

// ── SEKTION 13: 200 RANDOM KOMBINATIONER ─────────────────────
section('13. 200 TILFÆLDIGE TEST-KOMBINATIONER');

// Deterministisk pseudo-random for reproducerbarhed
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xFFFFFFFF; return (s >>> 0) / 0xFFFFFFFF; };
}
const rand = lcg(42);

let randomFejl = 0;
const randomResults = [];

for (let i = 0; i < 200; i++) {
  const gr = Math.ceil(rand() * 5);
  const dagtype = rand() < 0.6 ? 'optagelse' : 'forbered';
  const startH = Math.floor(rand() * 14); // 0-13
  const startM = [0, 15, 30, 45][Math.floor(rand() * 4)];
  const durH = Math.floor(rand() * 14) + 1; // 1-14 timer
  const slut = { h: (startH + durH) % 24, m: startM };
  const dagssats = gr === 1 ? (Math.floor(rand() * 5) + 3) * 1000 : GR_SATSER[gr];
  const nat = rand() < 0.3;
  const wk = Math.floor(rand() * 3);
  const transport = dagtype === 'optagelse' ? Math.round(rand() * 4 * 2) / 2 : 0;

  const r = calcReklame(dagtype, { h: startH, m: startM }, slut, dagssats, gr, { transport, nat, wk });

  let ok = true;
  const errors = [];

  if (r === null) { ok = false; errors.push('returnerede null'); }
  else {
    if (isNaN(r.total)) { ok = false; errors.push('total er NaN'); }
    if (r.total < 0)    { ok = false; errors.push(`total negativ: ${r.total.toFixed(0)}`); }
    if (isNaN(r.normalKr)) { ok = false; errors.push('normalKr er NaN'); }
    if (isNaN(r.otKr))     { ok = false; errors.push('otKr er NaN'); }
    if (r.otKr < 0)        { ok = false; errors.push('otKr negativ'); }
    if (isNaN(r.natKr))    { ok = false; errors.push('natKr er NaN'); }
    if (r.natKr < 0)       { ok = false; errors.push('natKr negativ'); }
    if (isNaN(r.wkKr))     { ok = false; errors.push('wkKr er NaN'); }
    if (r.wkKr < 0)        { ok = false; errors.push('wkKr negativ'); }
    if (isNaN(r.transKr))  { ok = false; errors.push('transKr er NaN'); }
    if (r.transKr < 0)     { ok = false; errors.push('transKr negativ'); }
    if (r.garantiKr < 0)   { ok = false; errors.push('garantiKr negativ'); }
    // brutto + garantiKr = total
    if (!approx(r.brutto + r.garantiKr, r.total, 0.01)) {
      ok = false; errors.push(`brutto(${r.brutto.toFixed(0)})+garantiKr(${r.garantiKr.toFixed(0)}) ≠ total(${r.total.toFixed(0)})`);
    }
    // Forbered: ingen nat/wk/trans
    if (dagtype === 'forbered') {
      if (r.natKr !== 0)   { ok = false; errors.push('forbered: natKr ≠ 0'); }
      if (r.wkKr !== 0)    { ok = false; errors.push('forbered: wkKr ≠ 0'); }
      if (r.transKr !== 0) { ok = false; errors.push('forbered: transKr ≠ 0'); }
      if (r.arbejdsTimer < 4) { ok = false; errors.push(`forbered: arbejdsTimer < 4 (${r.arbejdsTimer})`); }
    }
    // Optagelse garantiKr logik
    if (dagtype === 'optagelse' && r.garantiKr < 0) {
      ok = false; errors.push('optagelse: garantiKr < 0');
    }
    // normalKr ≥ 0
    if (r.normalKr < 0) { ok = false; errors.push('normalKr negativ'); }
  }

  if (!ok) {
    randomFejl++;
    const desc = `Test #${i+1}: Gr.${gr} ${dagtype} ${startH}:${String(startM).padStart(2,'0')}-${slut.h}:${String(slut.m).padStart(2,'0')} sats=${dagssats} nat=${nat} wk=${wk} trans=${transport}`;
    failures.push({ name: desc, detail: errors.join('; ') });
    process.stdout.write(`  ✗ ${desc}\n    ${errors.join('; ')}\n`);
  }
}

if (randomFejl === 0) {
  console.log(`  ✓ Alle 200 tilfældige kombinationer bestod`);
  passCount += 200;
} else {
  failCount += randomFejl;
  passCount += 200 - randomFejl;
  console.log(`  ✗ ${randomFejl} af 200 tilfældige tests fejlede`);
}

// ── SEKTION 14: SPECIFIKKE EDGE CASES ────────────────────────
section('14. EDGE CASES');

{
  const dagssats = 4100;

  // 1 minuts arbejde
  const r1m = calcReklame('optagelse', { h: 8, m: 0 }, { h: 8, m: 15 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(r1m !== null, '15 min arbejde: ikke null');
  assert(!isNaN(r1m.total), '15 min arbejde: ikke NaN');
  assert(r1m.total >= 0, '15 min arbejde: ikke negativ');
  // Garantiløft til dagssats
  assert(approx(r1m.total, dagssats, 1), `15 min: garantiløft til ${dagssats}`);

  // Præcis 8t (0 OT)
  const r8exact = calcReklame('optagelse', { h: 0, m: 0 }, { h: 8, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(approx(r8exact.otKr, 0), `Præcis 8t: otKr = 0`);

  // Alle dagtyper + alle grupper + nat + wk + transport kombineret
  let combFejl = 0;
  for (const gr of [1, 2, 3, 4, 5]) {
    const ds = gr === 1 ? 5000 : GR_SATSER[gr];
    const r = calcReklame('optagelse',
      { h: 7, m: 0 }, { h: 22, m: 0 }, ds, gr,
      { transport: 2, nat: true, wk: 2 });
    if (isNaN(r.total) || r.total < 0) combFejl++;
  }
  assert(combFejl === 0, `Alle grupper med alle tillæg kombineret: ingen fejl`);

  // Gr. 5 med personligt tillæg (dagssats højere end standard)
  const r5pt = calcReklame('optagelse', { h: 7, m: 0 }, { h: 17, m: 0 }, 2000, 5, { transport: 0, nat: false, wk: 0 });
  assert(!isNaN(r5pt.total), `Gr.5 med personligt tillæg (2000): ikke NaN`);
  // OT er fast 200 kr/t uanset dagssats for gr 5
  const ts5pt = 2000 / 8;
  const exp5pt = 8 * ts5pt + 2 * 200;
  assert(approx(r5pt.total, exp5pt, 1),
    `Gr.5 personligt tillæg 2000: OT er stadig fast 200 kr/t`,
    `forventet ${exp5pt.toFixed(0)}, fik ${r5pt.total.toFixed(0)}`);
}

// ── SEKTION 15: OVERENSKOMST KONSISTENS ──────────────────────
section('15. OVERENSKOMST KONSISTENS & RATIO-CHECKS');

{
  // Gr. 2 optagelse 10t total > gr.2 optagelse 8t total (OT skal gøre det dyrere)
  for (const gr of [2, 3, 4]) {
    const dagssats = GR_SATSER[gr];
    const r8 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 15, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
    const r10 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 17, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
    const r12 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 19, m: 0 }, dagssats, gr, { transport: 0, nat: false, wk: 0 });
    assert(r10.total > r8.total, `Gr.${gr}: 10t > 8t i løn`);
    assert(r12.total > r10.total, `Gr.${gr}: 12t > 10t i løn`);
  }

  // Forbered OT-satser lavere end optagelse ved samme timer (gr 2)
  const dagssats = 4100;
  const r_opt_12 = calcReklame('optagelse', { h: 7, m: 0 }, { h: 19, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  const r_for_12 = calcReklame('forbered', { h: 7, m: 0 }, { h: 19, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 0 });
  assert(r_opt_12.total > r_for_12.total,
    `Optagelse 12t > Forbered 12t (optagelse OT-satser højere)`,
    `opt=${r_opt_12.total.toFixed(0)}, for=${r_for_12.total.toFixed(0)}`);

  // Gr.2 dagssats > Gr.3 > Gr.4 > Gr.5
  const satser = [2,3,4,5].map(gr => {
    const r = calcReklame('optagelse', { h: 7, m: 0 }, { h: 17, m: 0 }, GR_SATSER[gr], gr, { transport: 0, nat: false, wk: 0 });
    return { gr, total: r.total };
  });
  for (let i = 0; i < satser.length - 1; i++) {
    warn(satser[i].total > satser[i+1].total,
      `Gr.${satser[i].gr} standard sats > Gr.${satser[i+1].gr} standard sats`,
      `${satser[i].total.toFixed(0)} vs ${satser[i+1].total.toFixed(0)}`);
  }

  // Weekend +100% giver mere end +75%
  const ts = dagssats / 8;
  const rWK1 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 1 });
  const rWK2 = calcReklame('optagelse', { h: 8, m: 0 }, { h: 16, m: 0 }, dagssats, 2, { transport: 0, nat: false, wk: 2 });
  assert(rWK2.total > rWK1.total, `WK +100% giver mere end +75%`);
}

// ── FINAL RAPPORT ────────────────────────────────────────────
section('TESTRAPPORT OVERSIGT');

const total = passCount + failCount;
console.log(`\n  Bestået:   ${passCount} / ${total}`);
console.log(`  Fejlet:    ${failCount} / ${total}`);
console.log(`  Advarsler: ${warnCount}`);
console.log(`  Succesrate: ${(passCount/total*100).toFixed(1)}%\n`);

if (failures.length > 0) {
  console.log('FEJL-LISTE:');
  failures.forEach((f, i) => {
    console.log(`  ${i+1}. ${f.name}`);
    if (f.detail) console.log(`     → ${f.detail}`);
  });
}

if (warnings.length > 0) {
  console.log('\nADVARSELS-LISTE:');
  warnings.forEach((w, i) => {
    console.log(`  ${i+1}. ${w.name}`);
    if (w.detail) console.log(`     → ${w.detail}`);
  });
}

// Summarisk oversigt
console.log('\nFUNKTIONELT OVERSIGT:');
const features = [
  { name: 'OT-bands (otBands)',                 ok: failCount === 0 || !failures.some(f => f.name.includes('otBands')) },
  { name: 'OT-satser optagelse gr. 2–4',        ok: !failures.some(f => f.name.includes('optagelse: OT')) },
  { name: 'OT-satser forbered gr. 2–4',         ok: !failures.some(f => f.name.includes('forbered: OT')) },
  { name: 'Gruppe 5 fast OT-sats',              ok: !failures.some(f => f.name.includes('Gr.5')) },
  { name: 'Gruppe 1 fri forhandling',           ok: !failures.some(f => f.name.includes('Gr.1')) },
  { name: 'Nat-gene §5',                        ok: !failures.some(f => f.name.includes('Nat') || f.name.includes('nat')) },
  { name: 'Weekend-tillæg §6',                  ok: !failures.some(f => f.name.includes('WK') || f.name.includes('Weekend')) },
  { name: 'Transport (1.75×)',                  ok: !failures.some(f => f.name.includes('Transport')) },
  { name: 'Dagsløngaranti (optagelse)',         ok: !failures.some(f => f.name.includes('garantiKr') || f.name.includes('garantiløft')) },
  { name: 'Forbered min. 4t kald',             ok: !failures.some(f => f.name.includes('minimum 4t')) },
  { name: 'Forbered: ingen nat/wk/trans',      ok: !failures.some(f => f.name.includes('forbered: ingen')) },
  { name: 'Midnatsoverskridelse',              ok: !failures.some(f => f.name.includes('midnat') || f.name.includes('22:00')) },
  { name: '200 tilfældige kombinationer',      ok: randomFejl === 0 },
  { name: 'Alle 43 faggrupper',                ok: fagFejl === 0 },
];
features.forEach(f => {
  console.log(`  ${f.ok ? '✓' : '✗'} ${f.name}`);
});

if (failCount === 0) {
  console.log('\n  ✓ ALLE TESTS BESTOD\n');
} else {
  console.log(`\n  ✗ ${failCount} TEST(S) FEJLEDE\n`);
  process.exit(1);
}
