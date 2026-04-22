// ── Test gem/hent fuld simulering ──
const fs = require('fs');
const src = fs.readFileSync('app.html', 'utf8');

function extractFn(name) {
  const lines = src.split('\n');
  let start = -1, depth = 0, inFn = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp(`^function ${name}\\b`))) start = i;
    if (start >= 0) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; inFn = true; }
        if (ch === '}') depth--;
      }
      if (inFn && depth === 0) return lines.slice(start, i+1).join('\n');
    }
  }
  return `function ${name}() { throw new Error('${name} ikke fundet'); }`;
}

// Alt kører i ét eval-scope
const program = `
// ── Mock localStorage ──
const _store = {};
const localStorage = {
  getItem: k => _store[k] ?? null,
  setItem: (k,v) => { _store[k]=v; },
  removeItem: k => { delete _store[k]; },
  get length() { return Object.keys(_store).length; },
  key: i => Object.keys(_store)[i]
};

// ── App-tilstand ──
const cfg = { ugelon:5500, pers:0, model:'normal', tillaeg:false, prod:'Test Film', dagLon:0 };
const DIÆT = 94;
let aktivProdId = 'prod123';
let tidStart = null, tidSlut = null;
let knapper = { v:false,u:false,f:false,p:false,h:false,r:false,e:false,varsletTimer:0 };
function timesats() { return cfg.ugelon/40+(cfg.pers||0)/40; }
function dagMax() { return cfg.model==='saertid'?10:8; }
function idbMirrorAll() {}
function toast() {}

${extractFn('p2')}
${extractFn('nøgle')}
${extractFn('hentDag')}
${extractFn('gemDagData')}
${extractFn('tidTilH')}
${extractFn('calcTimer')}
${extractFn('calcForskudt')}
${extractFn('calcWeekendTimer')}
${extractFn('hentWkRate')}
${extractFn('calcLon')}

// ── Testhjælper ──
let pass=0, fail=0;
function test(navn,f,e) {
  const ok = f===e || JSON.stringify(f)===JSON.stringify(e);
  if(ok){console.log('  ✅',navn);pass++;}
  else{console.log('  ❌',navn,'\\n     fik:',JSON.stringify(f),'\\n     forventet:',JSON.stringify(e));fail++;}
}
function testT(navn,f){if(f){console.log('  ✅',navn);pass++;}else{console.log('  ❌',navn,'→',f);fail++;}}
function testN(navn,f,e,tol=1){const ok=Math.abs(f-e)<=tol;if(ok){console.log('  ✅',navn);pass++;}else{console.log('  ❌',navn,'→ fik',Math.round(f),'forventet',Math.round(e));fail++;}}

// ── HELPERS ──
function gemSimuleret(d, tsStart, tsSlut, kn, note='') {
  tidStart=tsStart; tidSlut=tsSlut; knapper={v:false,u:false,f:false,p:false,h:false,r:false,e:false,varsletTimer:0,...kn};
  const h = calcTimer(tidStart, tidSlut);
  const opt = {varslet:kn.v||false,uvarslet:kn.u||false,helligdag:kn.h||false,
                frokost:kn.f||false,pause10:kn.p||false,enkeltdag:kn.e||false,varsletTimer:kn.varsletTimer||0};
  const l = calcLon(h, opt, 0, 0.75);
  gemDagData(d, {
    start: tsStart.h+':'+String(tsStart.m).padStart(2,'0'),
    slut:  tsSlut.h+':'+String(tsSlut.m).padStart(2,'0'),
    tidStart, tidSlut, knapper:{...knapper},
    h, lon:l.total, normal:l.normal, ot1:l.ot1, ot2:l.ot2, ot3:l.ot3, wk:l.wk,
    prod:cfg.prod, prodId:aktivProdId, note
  });
  return hentDag(d);
}

// ══ TEST 1: Normal 8-timers dag ══
console.log('\\n── TEST 1: Normal dag 08:00–16:30 ──');
{
  const d = new Date(2026,3,6); // mandag
  const s = gemSimuleret(d, {h:8,m:0}, {h:16,m:30}, {});
  testT('Dag kan gemmes og hentes',         s!==null);
  test('tidStart korrekt',                  JSON.stringify(s.tidStart), '{"h":8,"m":0}');
  test('tidSlut korrekt',                   JSON.stringify(s.tidSlut),  '{"h":16,"m":30}');
  testN('Timer: 8t (16.5-8.0-0.5 pause)',   s.h, 8);
  testN('Normal løn: 8×ts',                 s.normal, Math.round(8*(5500/40)));
  test('OT: ingen',                         s.ot1, 0);
  test('Produktionsnavn',                   s.prod, 'Test Film');
}

// ══ TEST 2: Lang dag med varslet OT ══
console.log('\\n── TEST 2: Lang dag 08:00–21:00 varslet OT ──');
{
  const d = new Date(2026,3,7);
  const s = gemSimuleret(d, {h:8,m:0}, {h:21,m:0}, {v:true});
  testT('Lang dag gemt',                    s!==null);
  testN('Timer: 12.5t',                     s.h, 12.5);
  testT('OT ot1 > 0',                       s.ot1>0);
  testT('OT ot2 > 0',                       s.ot2>0);
  testT('OT ot3 > 0',                       s.ot3>0);
  test('Varslet-knap bevaret',              s.knapper.v, true);
  testN('ot1 = 1t varslet +50%',            s.ot1, Math.round((5500/40)*1.5));
  testN('ot2 = 1t varslet +60%',            s.ot2, Math.round((5500/40)*1.6));
}

// ══ TEST 3: Enkeltdag 2t → minimum 4t ══
console.log('\\n── TEST 3: Enkeltdag 2t → betales 4t (§3.10) ──');
{
  const d = new Date(2026,3,8);
  // 2t arbejde = 10:00-12:00, men calcTimer trækker 30min pause → 1.5t rå
  // calcLon med enkeltdag: normalH = max(4, 1.5) = 4
  const s = gemSimuleret(d, {h:10,m:0}, {h:12,m:0}, {e:true});
  testT('Enkeltdag 2t gemt',                s!==null);
  test('Enkeltdag-knap bevaret',            s.knapper.e, true);
  testN('Normal løn = 4t × ts × 1.1',      s.normal, Math.round(4*(5500/40)*1.1));
}

// ══ TEST 4: Weekend dag ══
console.log('\\n── TEST 4: Weekenddag 10:00–16:00 ──');
{
  const d = new Date(2026,3,11); // lørdag
  const s = gemSimuleret(d, {h:10,m:0}, {h:16,m:0}, {h:true});
  testT('Weekend dag gemt',                 s!==null);
  testT('Weekend wk-tillæg > 0',            s.wk>0);
  test('Helligdag-knap bevaret',            s.knapper.h, true);
}

// ══ TEST 5: Tom dag returnerer null ══
console.log('\\n── TEST 5: Ingen data = null ──');
{
  const dTom = new Date(2026,3,20);
  test('Tom dag = null',                    hentDag(dTom), null);
}

// ══ TEST 6: nøgle-format ══
console.log('\\n── TEST 6: nøgle-format ──');
{
  const d = new Date(2026,3,6);
  const k = nøgle(d);
  test('Nøgle format', k, 'faf-prod123-2026-04-06');
  testT('Nøgle findes i store', _store[k]!==undefined);
  const parsed = JSON.parse(_store[k]);
  testT('tidStart.h er number',             typeof parsed.tidStart?.h==='number');
  testT('lon er number',                    typeof parsed.lon==='number');
}

// ══ TEST 7: Gem samme dag to gange (overskriver) ══
console.log('\\n── TEST 7: Overskrivning ──');
{
  const d = new Date(2026,3,9);
  gemSimuleret(d, {h:8,m:0}, {h:16,m:0}, {});
  const s1 = hentDag(d);
  gemSimuleret(d, {h:9,m:0}, {h:17,m:30}, {v:true});
  const s2 = hentDag(d);
  test('Anden gem overskriver start-tid',   JSON.stringify(s2.tidStart), '{"h":9,"m":0}');
  test('Anden gem bevarer ny knap-state',   s2.knapper.v, true);
  testN('Ny starttid: timer 8t',            s2.h, 8);
}

// ══ TEST 8: Note bevares ══
console.log('\\n── TEST 8: Note ──');
{
  const d = new Date(2026,3,13);
  const s = gemSimuleret(d, {h:8,m:0}, {h:16,m:0}, {}, 'Optagelse Volby');
  test('Note bevaret korrekt',              s.note, 'Optagelse Volby');
}

console.log('\\n── RESULTAT ──');
console.log(pass+'/'+(pass+fail)+' tests bestået '+(fail===0?'🎉':'⚠️'));
`;

eval(program);
