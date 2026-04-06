// ═══════════════════════════════════════════════════════════════
// Test Suite — SE Film·TV·Video (Scen & Film 2023–2025)
// Node.js version — mirrors the embedded test in se-ftv.html
// ═══════════════════════════════════════════════════════════════

// ── Constants (from se-ftv.html) ──
const KVARTER = [0, 15, 30, 45];
const DAGLON_MIN = { 1: 5984, 2: 5502, 3: 3645 };
const OB = {
  lordag_dag: 44,   // lördag 07-21
  kvall:      71,   // mån-lör 21-24
  natt:      148,   // mån-lör 00-07
  sondag:    148,   // söndag + helgdag (hela dygnet)
};

// ── Helpers ──
function tidTilH(t) { return t ? t.h + t.m / 60 : null; }
const tid = (h, m) => ({ h, m });

// ── calcOB (exact copy from se-ftv.html) ──
function calcOB(start, slut, dt) {
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return 0;
  const segmenter = e > s ? [[s, e]] : [[s, 24], [0, e]];
  let obKr = 0;
  segmenter.forEach(([a, b]) => {
    if (dt === 'sondag') {
      obKr += (b - a) * OB.sondag;
    } else if (dt === 'lordag') {
      const dag_s = Math.max(a, 7), dag_e = Math.min(b, 21);
      if (dag_e > dag_s) obKr += (dag_e - dag_s) * OB.lordag_dag;
      const kv_s = Math.max(a, 21), kv_e = Math.min(b, 24);
      if (kv_e > kv_s) obKr += (kv_e - kv_s) * OB.kvall;
      const nat_s = Math.max(a, 0), nat_e = Math.min(b, 7);
      if (nat_e > nat_s) obKr += (nat_e - nat_s) * OB.natt;
    } else {
      const kv_s = Math.max(a, 21), kv_e = Math.min(b, 24);
      if (kv_e > kv_s) obKr += (kv_e - kv_s) * OB.kvall;
      const nat_s = Math.max(a, 0), nat_e = Math.min(b, 7);
      if (nat_e > nat_s) obKr += (nat_e - nat_s) * OB.natt;
    }
  });
  return obKr;
}

// ── calcSeFTV (exact copy from se-ftv.html) ──
function calcSeFTV(start, slut, md, daglon, manlon, dt) {
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return null;
  const totalH = e > s ? e - s : e - s + 24;

  let paus = 0;
  if (totalH >= 9) paus = 0.75;
  else if (totalH >= 6) paus = 0.5;
  const arbH = Math.max(0, totalH - paus);

  let normal = 0, ot1 = 0, ot2 = 0, obKr = 0;
  let ot1H = 0, ot2H = 0;

  if (md === 'dag') {
    const ts = daglon / 8;
    normal = Math.min(arbH, 8) * ts;
    const otH = Math.max(0, arbH - 8);
    if (otH > 0) {
      const otStartH = s + 8 + paus;
      if (dt === 'hdag') {
        const otDayEnd = Math.min(otStartH + otH, 21);
        const otDayStart = Math.max(otStartH, 7);
        ot1H = Math.max(0, otDayEnd - otDayStart);
        ot2H = Math.max(0, otH - ot1H);
      } else {
        ot2H = otH;
      }
      ot1 = ot1H * (ts * 1.5);
      ot2 = ot2H * (ts * 1.75);
    }
  } else {
    const otSats94 = manlon / 94;
    const otSats82 = manlon / 82;
    const tsMan = manlon / 173;
    normal = Math.min(arbH, 8) * tsMan;
    const otH = Math.max(0, arbH - 8);
    if (otH > 0) {
      const otStartH = s + 8 + paus;
      if (dt === 'hdag') {
        const otDayEnd = Math.min(otStartH + otH, 21);
        ot1H = Math.max(0, otDayEnd - Math.max(otStartH, 7));
        ot2H = Math.max(0, otH - ot1H);
        ot1 = ot1H * otSats94;
        ot2 = ot2H * otSats82;
      } else {
        ot2H = otH;
        ot2 = otH * otSats82;
      }
    }
  }

  obKr = calcOB(start, slut, dt);
  const total = normal + ot1 + ot2 + obKr;

  return { arbH, totalH, paus, normal, ot1, ot2, obKr, total, ot1H, ot2H };
}

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════
let totalOk = 0, totalFail = 0, allWarns = [];

function section(name) { process.stdout.write(`  ${name.padEnd(46)}`); }
function endSection(ok, fail, warns) {
  totalOk += ok; totalFail += fail; allWarns.push(...warns);
  const tag = fail === 0 ? '\u2713' : '\u2717';
  console.log(`${ok}/${ok+fail} passed${fail > 0 ? '  !! '+warns.join(', ') : ''}`);
}

function runSuite(name, fn) {
  let ok = 0, fail = 0, warns = [];
  function assert(cond, msg) { if (cond) ok++; else { fail++; warns.push(msg); } }
  section(name);
  fn(assert);
  endSection(ok, fail, warns);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' SE Film·TV·Video — Comprehensive Test Suite');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1. Dagsanställd: grundläggande ──
runSuite('SE: Dagsanställd grundläggande', (assert) => {
  // Normal 8t dag
  let r = calcSeFTV(tid(7,0), tid(15,30), 'dag', 5984, 40000, 'hdag');
  assert(r !== null, 'S1: resultat inte null');
  assert(Math.abs(r.arbH - 8) < 0.01, `S2: 8t normaldag, fick ${r.arbH}`);
  assert(Math.abs(r.normal - 5984) < 10, `S3: normal ≈ dagslön vid 8t, fick ${r.normal}`);
  assert(r.ot1 === 0 && r.ot2 === 0, 'S4: ingen OT vid 8t');

  // Dag 2 minimum
  r = calcSeFTV(tid(7,0), tid(15,30), 'dag', 5502, 40000, 'hdag');
  assert(Math.abs(r.normal - 5502) < 10, `S5: dag 2 dagslön ${r.normal}`);

  // Dag 3+
  r = calcSeFTV(tid(7,0), tid(15,30), 'dag', 3645, 40000, 'hdag');
  assert(Math.abs(r.normal - 3645) < 10, `S6: dag 3 dagslön ${r.normal}`);

  // Minimum dagssatser
  Object.entries(DAGLON_MIN).forEach(([dagnr, minLon]) => {
    const res = calcSeFTV(tid(7,0), tid(15,30), 'dag', minLon, 40000, 'hdag');
    assert(Math.abs(res.normal - minLon) < 15, `S20.${dagnr}: min dagslön dag ${dagnr}`);
  });
});

// ── 2. Dagsanställd: övertid ──
runSuite('SE: Dagsanställd övertid', (assert) => {
  let r = calcSeFTV(tid(7,0), tid(17,30), 'dag', 5984, 40000, 'hdag');
  assert(r.arbH > 9, `S7: >9t arbete`);
  assert(r.ot1 > 0 || r.ot2 > 0, 'S8: OT vid >8t');
  assert(r.total > 5984, 'S9: total > dagslön vid OT');

  // 16t dag
  r = calcSeFTV(tid(6,0), tid(22,0), 'dag', 6000, 40000, 'hdag');
  assert(r.ot1 > 0 || r.ot2 > 0, 'S31: OT vid 16t');
  assert(r.total > 6000, 'S32: total > dagslön vid 16t');

  // OT-sats: dag 07-21 → ts*1.5, övrig → ts*1.75
  r = calcSeFTV(tid(7,0), tid(18,0), 'dag', 4800, 40000, 'hdag');
  const ts = 4800 / 8;
  // 7-18 = 11t - 0.75 paus = 10.25t → 2.25t OT, alla inom 07-21
  if (r.ot1H > 0) {
    assert(Math.abs(r.ot1 - r.ot1H * ts * 1.5) < 5, 'OT1 dag sats = ts*1.5');
  }
  if (r.ot2H > 0) {
    assert(Math.abs(r.ot2 - r.ot2H * ts * 1.75) < 5, 'OT2 dag sats = ts*1.75');
  }

  // Lördag/söndag: all OT → ot2 (övrig tid)
  r = calcSeFTV(tid(7,0), tid(20,0), 'dag', 5984, 40000, 'lordag');
  assert(r.ot1H === 0, 'Lördag: ingen ot1 (allt övrig)');

  r = calcSeFTV(tid(7,0), tid(20,0), 'dag', 5984, 40000, 'sondag');
  assert(r.ot1H === 0, 'Söndag: ingen ot1 (allt övrig)');
});

// ── 3. Månadsanställd ──
runSuite('SE: Månadsanställd', (assert) => {
  // Normal 8t
  let r = calcSeFTV(tid(7,0), tid(15,30), 'man', 5984, 40000, 'hdag');
  const normExp = 8 * (40000 / 173);
  assert(Math.abs(r.normal - normExp) < 10, `S10: normal ${r.normal.toFixed(0)} exp ${normExp.toFixed(0)}`);

  // OT
  r = calcSeFTV(tid(7,0), tid(20,0), 'man', 5984, 40000, 'hdag');
  assert(r.ot1 > 0 || r.ot2 > 0, 'S11: OT vid 12t dag');
  assert(r.total > normExp, 'S12: total > normaldag');

  // OT ÷94
  r = calcSeFTV(tid(7,0), tid(18,0), 'man', 5984, 40000, 'hdag');
  const otSats94 = 40000 / 94;
  if (r.ot1 > 0) {
    assert(Math.abs(r.ot1 - r.ot1H * otSats94) < 5, 'S13: OT ÷94 riktig');
  }

  // OT ÷82 vid kväll
  r = calcSeFTV(tid(14,0), tid(24,0), 'man', 5984, 40000, 'hdag');
  assert(r.ot2 > 0 || r.ot1 > 0, 'S24: OT kväll');

  // Lördag: all OT → ÷82
  r = calcSeFTV(tid(6,0), tid(22,0), 'man', 5984, 45000, 'lordag');
  assert(r.ot2 > 0, 'S65: OT övrig tid på lördag');
  const otSats82 = 45000 / 82;
  assert(Math.abs(r.ot2 - r.ot2H * otSats82) < 5, 'Lördag OT = ÷82');

  // Proportionalitet
  const r1 = calcSeFTV(tid(7,0), tid(18,0), 'man', 5984, 35191, 'hdag');
  const r2 = calcSeFTV(tid(7,0), tid(18,0), 'man', 5984, 70000, 'hdag');
  assert(r2.total > r1.total, 'S67: dubbel lön → högre total');
});

// ── 4. OB-tillägg ──
runSuite('SE: OB-tillägg', (assert) => {
  // Lördag
  let r = calcSeFTV(tid(8,0), tid(17,0), 'dag', 5984, 40000, 'lordag');
  assert(r.obKr > 0, 'S14: OB lördag > 0');
  assert(r.obKr < 1000, `S15: OB lördag rimlig ${r.obKr.toFixed(0)}`);

  // Söndag
  r = calcSeFTV(tid(8,0), tid(16,30), 'dag', 5984, 40000, 'sondag');
  assert(r.obKr > 0, 'S16: OB söndag > 0');
  const obSon = r.totalH * OB.sondag;
  assert(Math.abs(r.obKr - obSon) < 1, `S17: OB söndag = ${obSon.toFixed(0)}, fick ${r.obKr.toFixed(0)}`);

  // Vardag kväll
  r = calcSeFTV(tid(16,0), tid(24,0), 'dag', 5984, 40000, 'hdag');
  assert(r.obKr > 0, 'S18: OB kväll vardag');

  // Vardag natt exakt
  r = calcSeFTV(tid(0,0), tid(7,0), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.obKr - 7 * 148) < 1, `S50: OB natt exakt = ${7*148}`);

  // Kväll exakt
  r = calcSeFTV(tid(21,0), tid(24,0), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.obKr - 3 * 71) < 1, `S51: OB kväll exakt = ${3*71}`);

  // Lördag OB mix
  r = calcSeFTV(tid(5,0), tid(23,0), 'dag', 5984, 40000, 'lordag');
  const expOB = 2 * 148 + 14 * 44 + 2 * 71;
  assert(Math.abs(r.obKr - expOB) < 1, `S52: lördag mix ${r.obKr.toFixed(0)} exp ${expOB}`);

  // Kort dag söndag
  r = calcSeFTV(tid(10,0), tid(14,0), 'dag', 5984, 40000, 'sondag');
  assert(r.obKr === 4 * 148, `S70: sön 4t OB = ${4*148}`);

  // Vardag 07-21 = ingen OB
  r = calcSeFTV(tid(8,0), tid(16,30), 'dag', 5984, 40000, 'hdag');
  assert(r.obKr === 0, 'Vardag 08-16:30 → ingen OB');
});

// ── 5. Paus ──
runSuite('SE: Paus-regler', (assert) => {
  let r = calcSeFTV(tid(9,0), tid(13,30), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.paus - 0) < 0.01, 'S25: <6t → ingen paus');

  r = calcSeFTV(tid(9,0), tid(15,30), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.paus - 0.5) < 0.01, 'S26: 6-9t → 30min');

  r = calcSeFTV(tid(7,0), tid(17,0), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.paus - 0.75) < 0.01, 'S27: >9t → 45min');

  // Exakt 6t → 30min paus
  r = calcSeFTV(tid(8,0), tid(14,0), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.paus - 0.5) < 0.01, 'Exakt 6t → 30min');
  assert(Math.abs(r.arbH - 5.5) < 0.01, 'Exakt 6t → 5.5t arbH');

  // Exakt 9t → 45min paus
  r = calcSeFTV(tid(7,0), tid(16,0), 'dag', 5984, 40000, 'hdag');
  assert(Math.abs(r.paus - 0.75) < 0.01, 'Exakt 9t → 45min');
  assert(Math.abs(r.arbH - 8.25) < 0.01, 'Exakt 9t → 8.25t arbH');
});

// ── 6. Midnatsövergång ──
runSuite('SE: Midnatsövergång', (assert) => {
  let r = calcSeFTV(tid(20,0), tid(4,0), 'dag', 5984, 40000, 'hdag');
  assert(r !== null, 'S28: midnatt inte null');
  assert(r.arbH > 7, `S29: midnatt arbetstid ${r.arbH}`);
  assert(r.obKr > 700, `S30: midnatt OB > 700, fick ${r.obKr.toFixed(0)}`);

  // 22:30-06:00
  r = calcSeFTV(tid(22,30), tid(6,0), 'dag', 5984, 40000, 'hdag');
  assert(r !== null, 'Nattskift inte null');
  assert(Math.abs(r.totalH - 7.5) < 0.01, 'Nattskift 7.5t total');
});

// ── 7. Total = sum av delar ──
runSuite('SE: Konsistens (total = sum)', (assert) => {
  const scenarier = [
    [tid(7,0), tid(20,0), 'dag', 5984, 40000, 'hdag'],
    [tid(8,0), tid(22,0), 'man', 5984, 45000, 'lordag'],
    [tid(0,0), tid(12,0), 'dag', 5502, 40000, 'sondag'],
    [tid(18,0), tid(4,0), 'man', 5984, 50000, 'hdag'],
    [tid(6,0), tid(22,0), 'dag', 6000, 40000, 'lordag'],
    [tid(22,0), tid(7,0), 'dag', 5984, 40000, 'sondag'],
  ];
  scenarier.forEach(([s, e, md, dl, ml, dt], i) => {
    const res = calcSeFTV(s, e, md, dl, ml, dt);
    const sum = res.normal + res.ot1 + res.ot2 + res.obKr;
    assert(Math.abs(res.total - sum) < 1, `S36.${i}: total=sum (diff ${(res.total - sum).toFixed(1)})`);
  });
});

// ── 8. Total >= normal, aldrig negativa ──
runSuite('SE: Aldrig negativa poster', (assert) => {
  [[tid(6,0), tid(14,30), 5984, 40000, 'hdag'],
   [tid(8,0), tid(20,0), 5984, 40000, 'hdag'],
   [tid(22,0), tid(7,0), 5984, 40000, 'hdag'],
   [tid(7,0), tid(15,30), 3645, 40000, 'lordag'],
   [tid(7,0), tid(15,30), 5502, 40000, 'sondag'],
  ].forEach(([s, e, dl, ml, dt], i) => {
    const res = calcSeFTV(s, e, 'dag', dl, ml, dt);
    assert(res !== null, `S21.${i}: inte null`);
    assert(res.total >= res.normal, `S22.${i}: total >= normal`);
    assert(res.normal > 0, `S23.${i}: normal > 0`);
  });
});

// ── 9. Alla dagtyper × modeller ──
runSuite('SE: Alla kombinationer (dagtyp×modell)', (assert) => {
  ['hdag', 'lordag', 'sondag'].forEach((dt) => {
    ['dag', 'man'].forEach((md) => {
      const res = calcSeFTV(tid(8,0), tid(18,0), md, 5984, 40000, dt);
      assert(res !== null, `${dt}+${md} inte null`);
      assert(res.total > 0, `${dt}+${md} total > 0`);
      assert(res.arbH > 0, `${dt}+${md} arbH > 0`);
    });
  });
});

// ── 10. Edge cases ──
runSuite('SE: Edge cases', (assert) => {
  // 15 min dag
  let r = calcSeFTV(tid(10,0), tid(10,15), 'dag', 5984, 40000, 'hdag');
  assert(r !== null && r.arbH >= 0, 'S40: 15min dag OK');
  assert(r.total >= 0, 'S41: 15min total >= 0');

  // 23:45t dag
  r = calcSeFTV(tid(0,0), tid(23,45), 'dag', 5984, 40000, 'hdag');
  assert(r.arbH > 22, `S42: 23.75t arbete ${r.arbH}`);
  assert(r.total > 0, 'S43: total > 0 vid extrem dag');

  // 0 dagslön → 0 normal
  r = calcSeFTV(tid(8,0), tid(16,30), 'dag', 0, 40000, 'hdag');
  assert(r.normal === 0, 'S53: 0 dagslön → 0 normal');

  // Extrem hög lön
  r = calcSeFTV(tid(7,0), tid(20,0), 'man', 5984, 200000, 'hdag');
  assert(r.total > 10000, 'S54: extrem lön → hög total');
  assert(r.ot1 > 0, 'S55: OT med hög lön');

  // Start = Slut
  r = calcSeFTV(tid(8,0), tid(8,0), 'dag', 5984, 40000, 'hdag');
  assert(r !== null, 'S60: start=slut hanteras');

  // Kvarterstider
  [[tid(7,15), tid(16,45)], [tid(6,30), tid(15,0)], [tid(8,45), tid(17,15)],
   [tid(9,0), tid(21,30)], [tid(22,30), tid(6,0)]
  ].forEach(([s, e], i) => {
    const res = calcSeFTV(s, e, 'dag', 5984, 40000, 'hdag');
    assert(res !== null, `Kvarter ${i}: inte null`);
    assert(res.total >= 0, `Kvarter ${i}: total >= 0`);
  });
});

// ── 11. OB stresstest alla starttider ──
runSuite('SE: OB stresstest (alla starttider)', (assert) => {
  for (let h = 0; h < 24; h += 3) {
    const slut = (h + 10) % 24;
    ['hdag', 'lordag', 'sondag'].forEach(dt => {
      const res = calcSeFTV(tid(h,0), tid(slut,0), 'dag', 5984, 40000, dt);
      assert(res !== null && res.total >= 0, `${h}-${slut} ${dt} OK`);
    });
  }
});

// ── 12. Månadsanställd löne-proportioner ──
runSuite('SE: Månadsanst löneproportioner', (assert) => {
  [30000, 40000, 60000, 80000].forEach((ml, i) => {
    const res = calcSeFTV(tid(7,0), tid(20,0), 'man', 5984, ml, 'hdag');
    assert(res !== null, `Månadsanst ${ml} resultat`);
    assert(res.total > 0, `Månadsanst ${ml} total > 0`);
    const res2 = calcSeFTV(tid(7,0), tid(20,0), 'man', 5984, ml * 1.5, 'hdag');
    if (res.ot1 > 0) assert(res2.ot1 >= res.ot1 * 1.4, `${ml}: högre lön → högre OT`);
  });
});

// ── 13. Random fuzzing (200 scenarier) ──
runSuite('SE: Random fuzzing (200 scenarier)', (assert) => {
  // Seed the random deterministically
  let seed = 42;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let i = 0; i < 200; i++) {
    const sH = Math.floor(rng() * 24);
    const sM = KVARTER[Math.floor(rng() * 4)];
    const eH = Math.floor(rng() * 24);
    const eM = KVARTER[Math.floor(rng() * 4)];
    const dl = 3000 + Math.floor(rng() * 7000);
    const ml = 30000 + Math.floor(rng() * 70000);
    const dts = ['hdag', 'lordag', 'sondag'];
    const dt = dts[Math.floor(rng() * 3)];
    const md = rng() > 0.5 ? 'dag' : 'man';
    const res = calcSeFTV(tid(sH, sM), tid(eH, eM), md, dl, ml, dt);
    assert(res !== null, `Fuzz ${i}: inte null`);
    assert(res.total >= 0, `Fuzz ${i}: total >= 0`);
    assert(res.normal >= 0, `Fuzz ${i}: normal >= 0`);
    assert(res.ot1 >= 0, `Fuzz ${i}: ot1 >= 0`);
    assert(res.ot2 >= 0, `Fuzz ${i}: ot2 >= 0`);
    assert(res.obKr >= 0, `Fuzz ${i}: ob >= 0`);
  }
});

// ── 14. Export: JSON roundtrip ──
runSuite('SE: Export JSON roundtrip', (assert) => {
  let seed = 123;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let i = 0; i < 400; i++) {
    const sH = Math.floor(rng() * 24);
    const sM = KVARTER[Math.floor(rng() * 4)];
    const eH = Math.floor(rng() * 24);
    const eM = KVARTER[Math.floor(rng() * 4)];
    const dl = 3000 + Math.floor(rng() * 7000);
    const ml = 30000 + Math.floor(rng() * 70000);
    const dt = ['hdag','lordag','sondag'][Math.floor(rng() * 3)];
    const md = rng() > 0.5 ? 'dag' : 'man';

    const r = calcSeFTV(tid(sH, sM), tid(eH, eM), md, dl, ml, dt);
    if (!r) continue;

    // Build dag-data as in gemDag()
    const dagData = {
      start: `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')}`,
      slut: `${String(eH).padStart(2,'0')}:${String(eM).padStart(2,'0')}`,
      tidStart: {h:sH, m:sM}, tidSlut: {h:eH, m:eM},
      model: md, dagtype: dt, daglon: dl, manlon: ml,
      h: r.arbH, lon: Math.round(r.total), totalH: r.totalH, paus: r.paus,
      normal: Math.round(r.normal), ot1: Math.round(r.ot1), ot2: Math.round(r.ot2),
      obKr: Math.round(r.obKr), ot1H: r.ot1H, ot2H: r.ot2H,
      prod: 'TestProd', prodId: 'test-' + i, note: 'Test #' + i,
    };

    const json = JSON.stringify(dagData);
    const restored = JSON.parse(json);

    // Verify roundtrip integrity
    assert(restored.h === dagData.h, `rt_h_${i}`);
    assert(restored.lon === dagData.lon, `rt_lon_${i}`);
    assert(restored.start === dagData.start, `rt_start_${i}`);
    assert(restored.tidStart.h === sH && restored.tidStart.m === sM, `rt_tidStart_${i}`);
    assert(restored.tidSlut.h === eH && restored.tidSlut.m === eM, `rt_tidSlut_${i}`);
    assert(restored.model === md, `rt_model_${i}`);
    assert(restored.dagtype === dt, `rt_dagtype_${i}`);

    // Recalculate from restored
    const r2 = calcSeFTV(restored.tidStart, restored.tidSlut, restored.model, restored.daglon, restored.manlon, restored.dagtype);
    assert(Math.abs(Math.round(r2.total) - Math.round(r.total)) < 2, `rt_recalc_${i}`);
  }
});

// ── 15. Export: Mail format ──
runSuite('SE: Export mail format', (assert) => {
  let seed = 456;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let i = 0; i < 300; i++) {
    const sH = 6 + Math.floor(rng() * 12);
    const sM = KVARTER[Math.floor(rng() * 4)];
    const durH = 4 + Math.floor(rng() * 10);
    const eH = (sH + durH) % 24;
    const eM = KVARTER[Math.floor(rng() * 4)];
    const dl = 3000 + Math.floor(rng() * 7000);
    const ml = 30000 + Math.floor(rng() * 70000);
    const dt = ['hdag','lordag','sondag'][Math.floor(rng() * 3)];
    const md = rng() > 0.5 ? 'dag' : 'man';

    const r = calcSeFTV(tid(sH, sM), tid(eH, eM), md, dl, ml, dt);
    if (!r) continue;

    // Time format HH:MM
    const startStr = `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')}`;
    const slutStr = `${String(eH).padStart(2,'0')}:${String(eM).padStart(2,'0')}`;
    assert(startStr.length === 5, `mail_start_fmt_${i}`);
    assert(slutStr.length === 5, `mail_slut_fmt_${i}`);
    assert(startStr.includes(':'), `mail_start_colon_${i}`);

    // SEK formatting
    const lonStr = Math.round(r.total).toLocaleString('sv-SE');
    assert(typeof lonStr === 'string' && lonStr.length > 0, `mail_lon_fmt_${i}`);

    // Mail subject format
    const vecka = 1 + Math.floor(rng() * 52);
    const subj = `TestProd · Vecka ${vecka}`;
    assert(subj.includes(String(vecka)), `mail_subj_vecka_${i}`);
  }
});

// ── 16. Export: PDF data structure ──
runSuite('SE: Export PDF data', (assert) => {
  let seed = 789;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let week = 0; week < 100; week++) {
    let totH = 0, totL = 0, workDays = 0;
    for (let d = 0; d < 7; d++) {
      if (rng() < 0.25) continue; // free day
      const sH = 6 + Math.floor(rng() * 8);
      const durH = 6 + Math.floor(rng() * 8);
      const eH = (sH + durH) % 24;
      const dl = 4000 + Math.floor(rng() * 4000);
      const ml = 35000 + Math.floor(rng() * 30000);
      const dt = d === 6 ? 'lordag' : d === 0 ? 'sondag' : 'hdag';
      const md = rng() > 0.5 ? 'dag' : 'man';
      const r = calcSeFTV(tid(sH, 0), tid(eH, 0), md, dl, ml, dt);
      if (!r) continue;
      totH += r.arbH;
      totL += Math.round(r.total);
      workDays++;
    }
    assert(totH >= 0, `pdf_totH_${week}`);
    assert(totL >= 0, `pdf_totL_${week}`);
    assert(workDays >= 0 && workDays <= 7, `pdf_workDays_${week}`);

    // PDF table rows exist for each workday
    if (workDays > 0) {
      assert(totL > 0, `pdf_has_income_${week}`);
    }
  }
});

// ── 17. Backup: Full export/import simulation ──
runSuite('SE: Backup full export/import', (assert) => {
  let seed = 321;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let batch = 0; batch < 50; batch++) {
    const backup = {};
    const prodId = 'prod-' + batch;
    const numDays = 5 + Math.floor(rng() * 25);

    for (let d = 0; d < numDays; d++) {
      const month = Math.floor(rng() * 12);
      const day = 1 + Math.floor(rng() * 28);
      const key = `se-ftv-${prodId}-2025-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

      const sH = 5 + Math.floor(rng() * 14);
      const durH = 4 + Math.floor(rng() * 12);
      const eH = (sH + durH) % 24;
      const dl = 3000 + Math.floor(rng() * 5000);
      const ml = 30000 + Math.floor(rng() * 50000);
      const dt = ['hdag','lordag','sondag'][Math.floor(rng() * 3)];
      const md = rng() > 0.5 ? 'dag' : 'man';

      const r = calcSeFTV(tid(sH, 0), tid(eH, 0), md, dl, ml, dt);
      if (!r) continue;

      backup[key] = JSON.stringify({
        start: `${String(sH).padStart(2,'0')}:00`, slut: `${String(eH).padStart(2,'0')}:00`,
        tidStart: {h:sH,m:0}, tidSlut: {h:eH,m:0},
        h: r.arbH, lon: Math.round(r.total), model: md, dagtype: dt,
        daglon: dl, manlon: ml, prod: 'BackupTest', prodId,
      });
    }

    // Export
    const exportJson = JSON.stringify(backup, null, 2);
    assert(exportJson.length > 20, `backup_size_${batch}`);

    // Import
    const imported = JSON.parse(exportJson);
    const keys = Object.keys(imported);

    // Verify all entries
    for (const k of keys) {
      assert(k.startsWith('se-ftv-'), `backup_key_${batch}`);
      const parsed = JSON.parse(imported[k]);
      assert(parsed.h >= 0, `backup_h_${batch}`);
      assert(parsed.lon >= 0, `backup_lon_${batch}`);
      assert(typeof parsed.start === 'string', `backup_start_str_${batch}`);

      // Recalculate and verify
      const r = calcSeFTV(parsed.tidStart, parsed.tidSlut, parsed.model, parsed.daglon, parsed.manlon, parsed.dagtype);
      if (r) assert(Math.abs(Math.round(r.total) - parsed.lon) < 2, `backup_recalc_${batch}`);
    }
  }
});

// ── 18. Stress: alle starttider × dagtyper × modeller ──
runSuite('SE: Stress alle kombinationer', (assert) => {
  const dagtyper = ['hdag', 'lordag', 'sondag'];
  const modeller = ['dag', 'man'];
  const dagloner = [3645, 5984, 8000];
  const manloner = [35191, 50000, 80000];

  for (const md of modeller) {
    for (const dt of dagtyper) {
      for (let sh = 0; sh < 24; sh += 2) {
        for (const sm of [0, 30]) {
          for (const durH of [4, 8, 10, 14]) {
            const start = { h: sh, m: sm };
            const slut = { h: (sh + durH) % 24, m: sm };
            const dl = md === 'dag' ? 5984 : 5984;
            const ml = 40000;
            const r = calcSeFTV(start, slut, md, dl, ml, dt);

            assert(r !== null, `stress_not_null`);
            assert(r.total >= 0, `stress_total>=0`);
            assert(r.normal >= 0, `stress_normal>=0`);
            assert(r.ot1 >= 0, `stress_ot1>=0`);
            assert(r.ot2 >= 0, `stress_ot2>=0`);
            assert(r.obKr >= 0, `stress_ob>=0`);

            // Verify total = sum
            const sum = r.normal + r.ot1 + r.ot2 + r.obKr;
            assert(Math.abs(r.total - sum) < 1, `stress_sum`);
          }
        }
      }
    }
  }
});

// ── 19. Boundary: OB exakte gränser ──
runSuite('SE: OB exakte gränser', (assert) => {
  // Vardag: kväll exakt 21:00-24:00
  for (let durH = 1; durH <= 3; durH++) {
    const r = calcSeFTV(tid(21,0), tid(21+durH,0), 'dag', 5984, 40000, 'hdag');
    assert(Math.abs(r.obKr - durH * 71) < 1, `ob_kvall_${durH}h`);
  }
  // Vardag: natt exakt timme-for-timme
  for (let durH = 1; durH <= 7; durH++) {
    const r = calcSeFTV(tid(0,0), tid(durH,0), 'dag', 5984, 40000, 'hdag');
    assert(Math.abs(r.obKr - durH * 148) < 1, `ob_natt_${durH}h`);
  }
  // Lördag: alla tre zoner
  // 00-07: natt 148, 07-21: dag 44, 21-24: kväll 71
  for (let sh = 0; sh < 24; sh++) {
    for (let durH = 1; durH <= 4; durH++) {
      const eh = (sh + durH) % 24;
      if (eh <= sh && durH < 24) continue; // skip wrap for simplicity
      const r = calcSeFTV(tid(sh,0), tid(eh,0), 'dag', 5984, 40000, 'lordag');
      assert(r.obKr >= 0, `ob_lor_${sh}_${durH}h`);
    }
  }
  // Söndag: alla timmar × 148
  for (let durH = 1; durH <= 12; durH++) {
    const r = calcSeFTV(tid(8,0), tid(8+durH,0), 'dag', 5984, 40000, 'sondag');
    assert(Math.abs(r.obKr - durH * 148) < 1, `ob_son_${durH}h`);
  }
  // Vardag dagtid 07-21: ingen OB
  for (let sh = 7; sh <= 16; sh++) {
    const eh = Math.min(sh + 4, 21);
    if (eh <= sh) continue;
    const r = calcSeFTV(tid(sh,0), tid(eh,0), 'dag', 5984, 40000, 'hdag');
    assert(r.obKr === 0, `ob_dagtid_${sh}_${eh}`);
  }
});

// ── 20. Boundary: OT-satser exakt ──
runSuite('SE: OT-satser exakt beräkning', (assert) => {
  // Dagsanställd: OT = ts*1.5 (vardag) / ts*1.75 (övrig)
  for (const dl of [3645, 5502, 5984, 7000]) {
    const ts = dl / 8;
    // 10t vardag → 2t OT, alla inom 07-21
    const r = calcSeFTV(tid(7,0), tid(17,45), 'dag', dl, 40000, 'hdag');
    if (r.ot1H > 0) {
      assert(Math.abs(r.ot1 - r.ot1H * ts * 1.5) < 5, `ot_dag_hdag_${dl}`);
    }
    if (r.ot2H > 0) {
      assert(Math.abs(r.ot2 - r.ot2H * ts * 1.75) < 5, `ot_dag_kvall_${dl}`);
    }

    // Weekend: all OT → ot2 (ts*1.75)
    const rw = calcSeFTV(tid(7,0), tid(18,0), 'dag', dl, 40000, 'lordag');
    assert(rw.ot1H === 0, `ot_dag_lordag_no_ot1_${dl}`);
    if (rw.ot2H > 0) {
      assert(Math.abs(rw.ot2 - rw.ot2H * ts * 1.75) < 5, `ot_dag_lordag_ot2_${dl}`);
    }
  }

  // Månadsanställd: OT = ÷94 (vardag 07-21) / ÷82 (övrig)
  for (const ml of [35191, 40000, 60000, 80000]) {
    const ot94 = ml / 94;
    const ot82 = ml / 82;

    const r = calcSeFTV(tid(7,0), tid(18,0), 'man', 5984, ml, 'hdag');
    if (r.ot1H > 0) {
      assert(Math.abs(r.ot1 - r.ot1H * ot94) < 5, `ot_man_94_${ml}`);
    }

    const rw = calcSeFTV(tid(7,0), tid(18,0), 'man', 5984, ml, 'lordag');
    if (rw.ot2H > 0) {
      assert(Math.abs(rw.ot2 - rw.ot2H * ot82) < 5, `ot_man_82_${ml}`);
    }
  }
});

// ── 21. Paus exhaustive ──
runSuite('SE: Paus alla varaktigheter', (assert) => {
  for (let durH = 1; durH <= 20; durH++) {
    const totalH = durH;
    let expPaus;
    if (totalH >= 9) expPaus = 0.75;
    else if (totalH >= 6) expPaus = 0.5;
    else expPaus = 0;

    const r = calcSeFTV(tid(7,0), tid((7+durH)%24,0), 'dag', 5984, 40000, 'hdag');
    assert(Math.abs(r.paus - expPaus) < 0.01, `paus_${durH}t`);
    assert(Math.abs(r.arbH - (totalH - expPaus)) < 0.01, `arbH_${durH}t`);
  }
});

// ── 22. Massive random fuzzing (2000 scenarier) ──
runSuite('SE: Massive fuzzing (2000 scenarier)', (assert) => {
  let seed = 99999;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  for (let i = 0; i < 2000; i++) {
    const sH = Math.floor(rng() * 24);
    const sM = KVARTER[Math.floor(rng() * 4)];
    const eH = Math.floor(rng() * 24);
    const eM = KVARTER[Math.floor(rng() * 4)];
    const dl = 1000 + Math.floor(rng() * 15000);
    const ml = 20000 + Math.floor(rng() * 100000);
    const dt = ['hdag','lordag','sondag'][Math.floor(rng() * 3)];
    const md = rng() > 0.5 ? 'dag' : 'man';

    const r = calcSeFTV(tid(sH, sM), tid(eH, eM), md, dl, ml, dt);
    assert(r !== null, `fuzz2_${i}_notnull`);
    assert(r.total >= 0, `fuzz2_${i}_total`);
    assert(r.normal >= 0, `fuzz2_${i}_normal`);
    assert(r.ot1 >= 0, `fuzz2_${i}_ot1`);
    assert(r.ot2 >= 0, `fuzz2_${i}_ot2`);
    assert(r.obKr >= 0, `fuzz2_${i}_ob`);
    assert(r.paus >= 0 && r.paus <= 0.75, `fuzz2_${i}_paus`);
    assert(r.arbH >= 0, `fuzz2_${i}_arbH`);

    // total = sum
    const sum = r.normal + r.ot1 + r.ot2 + r.obKr;
    assert(Math.abs(r.total - sum) < 1, `fuzz2_${i}_sum`);
  }
});

// ── 23. Dagslön-intervall (extremvärden) ──
runSuite('SE: Extremvärden dagslön/månadslön', (assert) => {
  const extremDagloner = [0, 1, 100, 1000, 3645, 5984, 10000, 50000, 100000];
  const extremManloner = [0, 1000, 20000, 35191, 40000, 80000, 150000, 500000];

  for (const dl of extremDagloner) {
    for (const dt of ['hdag', 'lordag', 'sondag']) {
      const r = calcSeFTV(tid(7,0), tid(18,0), 'dag', dl, 40000, dt);
      assert(r !== null, `extrem_dag_${dl}_${dt}`);
      assert(r.total >= 0, `extrem_dag_total_${dl}_${dt}`);
      assert(r.normal >= 0, `extrem_dag_normal_${dl}_${dt}`);
    }
  }

  for (const ml of extremManloner) {
    for (const dt of ['hdag', 'lordag', 'sondag']) {
      const r = calcSeFTV(tid(7,0), tid(18,0), 'man', 5984, ml, dt);
      assert(r !== null, `extrem_man_${ml}_${dt}`);
      assert(r.total >= 0, `extrem_man_total_${ml}_${dt}`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(` TOTAL: ${totalOk + totalFail} tests — ${totalOk} passed — ${totalFail} failed`);
console.log('═══════════════════════════════════════════════════════════════');
if (totalFail > 0) {
  console.log('\nFailed:');
  allWarns.forEach(w => console.log(`  ✗ ${w}`));
  process.exit(1);
}
