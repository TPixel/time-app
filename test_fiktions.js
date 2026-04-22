// ── Test §3.10 fix + gem/hent ──
const fs = require('fs');
const src = fs.readFileSync('app.html', 'utf8');

// Byg testmiljø
const code = `
const cfg = { ugelon: 5500, pers: 0, model: 'normal', tillaeg: false };
const DIÆT = 94;
function timesats() { return cfg.ugelon / 40 + (cfg.pers||0)/40; }
function dagMax() { return cfg.model === 'saertid' ? 10 : 8; }
` + src.match(/function calcLon[\s\S]*?\nreturn \{[\s\S]*?\};\n\}/)[0];

let pass = 0, fail = 0;
function test(navn, faktisk, forventet, tol=1) {
  const ok = Math.abs(faktisk - forventet) <= tol;
  if (ok) { console.log('  ✅', navn); pass++; }
  else { console.log('  ❌', navn, '→ fik', Math.round(faktisk), 'forventet', Math.round(forventet)); fail++; }
}

const fn = new Function('require', code + '\nreturn calcLon;')(require);
const ts = 5500/40; // 137.5

console.log('\n── §3.10 ENKELTDAG MINIMUM 4T ──');
// Under minimum
const r2e = fn(2, {enkeltdag:true});
test('2t enkeltdag → betales som 4t', r2e.normal, Math.round(4 * ts * 1.1));

const r3e = fn(3, {enkeltdag:true});
test('3t enkeltdag → betales som 4t', r3e.normal, Math.round(4 * ts * 1.1));

// Præcis minimum
const r4e = fn(4, {enkeltdag:true});
test('4t enkeltdag → præcis 4t (ingen oprunding)', r4e.normal, Math.round(4 * ts * 1.1));

// Over minimum
const r6e = fn(6, {enkeltdag:true});
test('6t enkeltdag → 6t normal (over minimum)', r6e.normal, Math.round(6 * ts * 1.1));

const r8e = fn(8, {enkeltdag:true});
test('8t enkeltdag → 8t normal', r8e.normal, Math.round(8 * ts * 1.1));

console.log('\n── UGEANSAT: INGEN 4T MINIMUM ──');
const r2u = fn(2, {enkeltdag:false});
test('Ugeansat 2t → betales for 2t (ingen minimum)', r2u.normal, Math.round(2 * ts));

const r4u = fn(4, {enkeltdag:false});
test('Ugeansat 4t → betales for 4t', r4u.normal, Math.round(4 * ts));

console.log('\n── WEEKEND §8 MINIMUM 4T ──');
const r2w = fn(2, {helligdag:true}, 0, 0.75);
test('Weekend 2t → minimum 4t wk-tillæg', r2w.wk, Math.round(4 * ts * 0.75));

const r6w = fn(6, {helligdag:true}, 0, 0.75);
test('Weekend 6t → 6t wk-tillæg', r6w.wk, Math.round(6 * ts * 0.75));

console.log('\n── OT PÅ ENKELTDAG ──');
const r10e = fn(10, {enkeltdag:true, varslet:true});
test('10t enkeltdag varslet: 8t normal + 2t OT', r10e.normal, Math.round(8 * ts * 1.1));
test('10t enkeltdag varslet: ot1=1t +50%', r10e.ot1, Math.round(ts * 1.1 * 1.50));
test('10t enkeltdag varslet: ot2=1t +60%', r10e.ot2, Math.round(ts * 1.1 * 1.60));

console.log('\n── RESULTAT ──');
console.log(`${pass}/${pass+fail} tests bestået ${fail===0?'🎉':'⚠️'}`);
