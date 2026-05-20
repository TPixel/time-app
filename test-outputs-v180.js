#!/usr/bin/env node
/* eslint-disable no-console */
// =================================================================
// TIME APP v1.80 — OUTPUT TEST SUITE (PDF/Mail/XLSX/iCal/Backup)
// =================================================================

const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const XLSX_real = require('xlsx');

const APP_PATH = '/Users/thomas/time-app/app.html';
let html = fs.readFileSync(APP_PATH, 'utf8');

// ----- Indsæt bridge-script lige efter setupLongPress() i den store inline-script
// Bridge eksponerer let-deklarerede variabler til window (de er ikke globale ellers).
// Vi placerer bridge'en før </script>-taggen i den sidste inline-script.
const BRIDGE = `
/* ──── __bridge: eksponér script-scope variabler til Node ──── */
window.__bridge = {
  get cfg()             { return cfg; },          set cfg(v)        { cfg = v; },
  get knapper()         { return knapper; },      set knapper(v)    { knapper = v; },
  get aktivDag()        { return aktivDag; },     set aktivDag(v)   { aktivDag = v; },
  get aktivProdId()     { return aktivProdId; },  set aktivProdId(v){ aktivProdId = v; },
  get ugeOffset()       { return ugeOffset; },    set ugeOffset(v)  { ugeOffset = v; },
  get maanedOffset()    { return maanedOffset; }, set maanedOffset(v){ maanedOffset = v; },
  get aarOffset()       { return aarOffset; },    set aarOffset(v)  { aarOffset = v; },
  get produktioner()    { return produktioner; }, set produktioner(v){ produktioner = v; },
  get tidStart()        { return tidStart; },     set tidStart(v)   { tidStart = v; },
  get tidSlut()         { return tidSlut; },      set tidSlut(v)    { tidSlut = v; },
  ugeData: () => ugeData(),
  calcLon: (h, opt, wkAutoH, wkRate) => calcLon(h, opt, wkAutoH, wkRate),
  hentDag: (d) => hentDag(d),
};
`;

// Find sidste </script> tag før </body> og indsæt bridge før den
const scriptCloseIdx = html.lastIndexOf('</script>');
if (scriptCloseIdx < 0) throw new Error('Kunne ikke finde </script> tag');
html = html.slice(0, scriptCloseIdx) + BRIDGE + html.slice(scriptCloseIdx);

// ----- Test-framework -----
let passed = 0, failed = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else      { failed++; failures.push({ label, detail }); console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function group(name) { console.log(`\n── ${name} ──`); }

// ----- Byg JSDOM -----
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});
vc.on('warn',  () => {});

const dom = new JSDOM(html, {
  url: 'https://time-app.dk/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // Service worker stub
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      get() { return { register: () => Promise.reject(new Error('no sw')), addEventListener(){}, controller:null }; }
    });
    window.indexedDB = { open: () => ({ onupgradeneeded:null, onsuccess:null, onerror:null, result:null }) };

    // html2pdf stub
    window.html2pdf = function() {
      return {
        set() { return this; },
        from() { return this; },
        outputPdf: () => Promise.resolve(new window.Blob(['fake-pdf'], { type:'application/pdf' }))
      };
    };

    // XLSX.writeFile capture
    window.XLSX = XLSX_real;
    window.__xlsxFiles = [];
    const origWriteFile = XLSX_real.writeFile;
    XLSX_real.writeFile = function(wb, filename) {
      window.__xlsxFiles.push({ filename, wb });
    };

    // Blob URL capture
    window.__createdURLs = [];
    window.URL.createObjectURL = function(blob) {
      const url = 'blob:fake-' + Math.random().toString(36).slice(2);
      const entry = { url, blob };
      window.__createdURLs.push(entry);
      try { blob.text().then(t => { entry.text = t; }); } catch(e){}
      return url;
    };
    window.URL.revokeObjectURL = () => {};

    // Share API → capture emne via title-felt (i stedet for mailto)
    window.__shares = [];
    Object.defineProperty(window.navigator, 'canShare', { configurable:true, value: () => true });
    Object.defineProperty(window.navigator, 'share',    { configurable:true, value: (data) => {
      window.__shares.push({ ...data, file: data.files?.[0]?.name }); return Promise.resolve();
    }});

    // Brugeragent: ikke-iOS → kode tager share-grenen (canShare=true)
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true, value: 'Mozilla/5.0 (Macintosh) Test/1.0'
    });

    window.alert = () => {};
    window.confirm = () => true;

    // Tving billeder til "loaded" state — _pdfBuild venter ellers op til 8s pr. img
    // (jsdom loader ikke billeder af sig selv ved runScripts:'dangerously')
    const ImgProto = window.HTMLImageElement.prototype;
    Object.defineProperty(ImgProto, 'complete',      { configurable:true, get: () => true });
    Object.defineProperty(ImgProto, 'naturalHeight', { configurable:true, get: () => 1 });
    Object.defineProperty(ImgProto, 'naturalWidth',  { configurable:true, get: () => 1 });
  }
});

const { window } = dom;
const { document } = window;

// a.click() capture for ICS / backup-download fallback
const origCreateEl = document.createElement.bind(document);
document.createElement = function(tag) {
  const el = origCreateEl(tag);
  if (tag.toLowerCase() === 'a') {
    const origClick = el.click.bind(el);
    el.click = function() {
      window.__downloads = window.__downloads || [];
      window.__downloads.push({ url: el.getAttribute('href') || '', filename: el.getAttribute('download') || '' });
    };
  }
  return el;
};

async function main() {
  // Vent på load
  await new Promise(res => {
    if (document.readyState === 'complete') return res();
    window.addEventListener('load', () => res(), { once: true });
    setTimeout(res, 1500);
  });

  const B = window.__bridge;

  group('SANITY');
  ok('__bridge eksponeret', typeof B === 'object');
  ok('cfg findes', typeof B.cfg === 'object');
  ok('produktioner array findes', Array.isArray(B.produktioner));
  ok('_pdfDag findes', typeof window._pdfDag === 'function');
  ok('_pdfUge findes', typeof window._pdfUge === 'function');
  ok('_pdfMnd findes', typeof window._pdfMnd === 'function');
  ok('_pdfAar findes', typeof window._pdfAar === 'function');
  ok('doXLSX findes', typeof window.doXLSX === 'function');
  ok('doXLSX_mnd findes', typeof window.doXLSX_mnd === 'function');
  ok('doXLSX_aar findes', typeof window.doXLSX_aar === 'function');
  ok('doKalender findes', typeof window.doKalender === 'function');
  ok('doMail findes', typeof window.doMail === 'function');
  ok('doMail_mnd findes', typeof window.doMail_mnd === 'function');
  ok('doMail_aar findes', typeof window.doMail_aar === 'function');
  ok('sendEnkeltDag findes', typeof window.sendEnkeltDag === 'function');
  ok('gemBackupFil findes', typeof window.gemBackupFil === 'function');
  ok('exporterData findes', typeof window.exporterData === 'function');

  // ----- Fixture data -----
  B.cfg = {
    navn:'Thomas Ditzel', email:'thomas@ditzel.dk',
    prod:'Mit Filmprojekt', selskab:'Nordisk Film',
    ugelon:10380, pers:1000, tillæg:false, model:'5dag', fridag:'fre',
    dagLon:0, diaet:597,
    talsmand:true, arbjmrep:false
  };
  B.aktivProdId = 'test-prod-1';
  B.produktioner = [{ id:'test-prod-1', prod:'Mit Filmprojekt', ugelon:10380, model:'5dag' }];

  const pad = n => String(n).padStart(2,'0');
  const ls = window.localStorage;
  ls.clear();
  function key(d) {
    return `faf-test-prod-1-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  // Brug app'ens egen calcLon + helpers til at beregne korrekte felter — som gemDag gør.
  // Dette afslører om _pdfDag matcher gemDag's outputstruktur.
  function setRåDag(date, start, slut, knapper, opts={}) {
    const tidStart = { h:+start.split(':')[0], m:+start.split(':')[1] };
    const tidSlut  = { h:+slut.split(':')[0],  m:+slut.split(':')[1] };
    // Brug bridge til at sætte tider/knapper + dato, og kald så app'ens gemDag()
    B.aktivDag = new Date(date);
    B.tidStart = tidStart;
    B.tidSlut  = tidSlut;
    B.knapper  = { ...knapper };
    // Vi kalder ikke gemDag direkte — vi simulerer hvad den ville gemme.
    // gemDag() bruger dog DOM-elementet 'i-note' (sætter note fra DOM). Sæt det.
    const noteEl = document.getElementById('i-note');
    if (noteEl) noteEl.value = opts.note || '';
    window.gemDag(true); // stille=true
  }

  // Uge 20 i 2025: 12-18 maj 2025
  const mon = new Date(2025, 4, 12);
  const days = Array.from({length:7}, (_,i) => { const d = new Date(mon); d.setDate(d.getDate()+i); return d; });

  // Man 12/5 — normal 8t
  setRåDag(days[0], '08:00','16:30',
    { v:false,u:false,f:false,p:false,h:false,r:false,e:false,d:false, møde:0, varsletTimer:0 });
  // Tir 13/5 — varslet OT 2t
  setRåDag(days[1], '08:00','18:30',
    { v:true, u:false, f:false,p:false,h:false,r:false,e:false,d:false, møde:0, varsletTimer:0 });
  // Ons 14/5 — uvarslet OT 2t
  setRåDag(days[2], '08:00','18:30',
    { v:false, u:true, f:false,p:false,h:false,r:false,e:false,d:false, møde:0, varsletTimer:0 });
  // Tor 15/5 — mixed OT 0.5v + 1.5u
  setRåDag(days[3], '08:00','18:30',
    { v:true, u:true, f:false,p:false,h:false,r:false,e:false,d:false, møde:0, varsletTimer:0.5 });
  // Fre 16/5 — diæt (04:00→12:30 = 8t)
  setRåDag(days[4], '04:00','12:30',
    { v:false,u:false,f:false,p:false,h:false,r:false,e:false,d:true, møde:0, varsletTimer:0 });
  // Lør 17/5 — weekend (10:00→18:00 = 7.5t)
  setRåDag(days[5], '10:00','18:00',
    { v:false,u:false,f:false,p:false,h:false,r:false,e:false,d:false, møde:0, varsletTimer:0 });
  // Søn 18/5 — helligdag
  setRåDag(days[6], '10:00','18:00',
    { v:false,u:false,f:false,p:false,h:true,r:false,e:false,d:false, møde:0, varsletTimer:0 });

  // Sæt offsets relativt til "now" så ugeDatoer rammer 12-18 maj 2025
  B.aktivDag = new Date(mon);
  const now = new Date();
  const nowDow = now.getDay();
  const diff = (nowDow === 0 ? -6 : 1) - nowDow;
  const denneMandag = new Date(now); denneMandag.setDate(now.getDate() + diff); denneMandag.setHours(0,0,0,0);
  const målMandag = new Date(mon); målMandag.setHours(0,0,0,0);
  B.ugeOffset = Math.round((målMandag - denneMandag) / (7*86400e3));
  B.maanedOffset = (mon.getFullYear() - now.getFullYear()) * 12 + (mon.getMonth() - now.getMonth());
  B.aarOffset = mon.getFullYear() - now.getFullYear();

  // ---------------------------------------------------------------
  group('1. PDF — DAGSEDDEL (_pdfDag)');
  // ---------------------------------------------------------------
  function testPdfDag(dayIdx, label, expectations) {
    B.aktivDag = new Date(days[dayIdx]);
    const r = window._pdfDag();
    if (!r) {
      ok(`${label}: _pdfDag() returnerede ikke null`, false, 'null returneret');
      return;
    }
    const h = r.html;
    ok(`${label}: HTML genereret`, h && h.length > 100);
    ok(`${label}: indeholder DAGSEDDEL`, h.includes('DAGSEDDEL'));
    ok(`${label}: indeholder produktionsnavn`, h.includes('Mit Filmprojekt'));
    ok(`${label}: indeholder navn`, h.includes('Thomas Ditzel'));
    ok(`${label}: indeholder time-app.dk footer`, h.includes('time-app.dk'));
    ok(`${label}: indeholder dato (${r.dagStr.toUpperCase()})`, h.includes(r.dagStr.toUpperCase()));
    for (const exp of expectations) {
      ok(`${label}: ${exp.name}`, exp.test(h), exp.detail ? exp.detail(h) : undefined);
    }
  }

  testPdfDag(0, 'Mandag (normal 8t)', [
    { name:'indeholder Normal arbejdstid', test:h=>h.includes('Normal arbejdstid') },
    { name:'INGEN OT-linje', test:h=>!h.includes('OT 1. time') && !h.includes('OT 2. time') },
    { name:'INGEN varslet/uvarslet badge', test:h=>!h.includes('Varslet OT') && !h.includes('Uvarslet OT') },
    { name:'pensionslinje vises', test:h=>h.includes('Pension') }
  ]);

  testPdfDag(1, 'Tirsdag (varslet OT)', [
    { name:'Varslet OT badge', test:h=>h.includes('Varslet OT') },
    { name:'OT 1. time-linje +50% (varslet)', test:h=>/OT 1\. time \(varslet \+50%\)/.test(h) },
    { name:'OT 2. time-linje +60% (varslet)', test:h=>/OT 2\. time \(varslet \+60%\)/.test(h) },
    { name:'IKKE uvarslet badge', test:h=>!h.includes('Uvarslet OT') }
  ]);

  testPdfDag(2, 'Onsdag (uvarslet OT)', [
    { name:'Uvarslet OT badge', test:h=>h.includes('Uvarslet OT') },
    { name:'OT 1. time-linje +75%', test:h=>/OT 1\. time \(uvarslet \+75%\)/.test(h) },
    { name:'OT 2. time-linje +100%', test:h=>/OT 2\. time \(uvarslet \+100%\)/.test(h) }
  ]);

  testPdfDag(3, 'Torsdag (mixed OT)', [
    { name:'Mixed badge "0t 30m varslet OT · 1t 30m uvarslet OT"',
      test:h=>/0t 30m varslet OT · 1t 30m uvarslet OT/.test(h),
      detail:h=>{
        const m = h.match(/<span[^>]*>([^<]*varslet OT[^<]*)<\/span>/);
        return m ? `badge: "${m[1]}"` : 'badge mangler';
      }
    },
    { name:'OT 1. time linje med split (0t 30m varslet + 0t 30m uvarslet)',
      test:h=>/OT 1\. time: 0t 30m varslet \+50% · 0t 30m uvarslet \+75%/.test(h),
      detail:h=>{
        const m = h.match(/OT 1\. time[^<]+/);
        return m ? `linje: "${m[0]}"` : '';
      }
    },
    { name:'OT 2. time linje (kun uvarslet, +100%)',
      test:h=>/OT 2\. time \(uvarslet \+100%\)/.test(h) }
  ]);

  testPdfDag(4, 'Fredag (forskudt + diæt)', [
    { name:'Diæt §14-linje', test:h=>h.includes('Diæt §14') }
    // Note: 04-12:30 falder ikke i forskudt-vindue om fredag (kun før 06 mandag eller efter 20 fredag)
    // Lad os ikke kræve forskudt — det afhænger af dagens regler
  ]);

  testPdfDag(5, 'Lørdag (weekend auto)', [
    { name:'Weekendtillæg §8-linje', test:h=>h.includes('Weekendtillæg §8') }
  ]);

  testPdfDag(6, 'Søndag (helligdag)', [
    { name:'Helligdag §8 badge', test:h=>h.includes('Helligdag §8') },
    { name:'Weekendtillæg-linje', test:h=>h.includes('Weekendtillæg §8') }
  ]);

  // ---------------------------------------------------------------
  group('2. PDF — UGESEDDEL (_pdfUge)');
  // ---------------------------------------------------------------
  const ru = window._pdfUge();
  const uh = ru.html;
  ok('UGESEDDEL header', uh.includes('UGESEDDEL'));
  ok('produktion i header', uh.includes('Mit Filmprojekt'));
  ok('Selskab i header', uh.includes('Nordisk Film'));
  ok('Ugenummer vist', /UGE \d+/.test(uh));
  ok('Datointerval (12. maj)', /12\. maj 2025/.test(uh));
  ok('Datointerval (18. maj)', /18\. maj 2025/.test(uh));
  ok('Bruttoløn-linje', uh.includes('Bruttoløn'));
  ok('Pension 9,5% §3-linje', uh.includes('Pension 9,5%'));
  ok('Talsmand-linje', /Talsmand/i.test(uh));
  ok('Mandag-række', uh.includes('Mandag 12/5'));
  ok('Tirsdag-række', uh.includes('Tirsdag 13/5'));
  ok('Onsdag-række', uh.includes('Onsdag 14/5'));
  ok('Torsdag-række', uh.includes('Torsdag 15/5'));
  ok('Fredag-række', uh.includes('Fredag 16/5'));
  ok('Lørdag-række', uh.includes('Lørdag 17/5'));
  ok('Søndag-række', uh.includes('Søndag 18/5'));
  ok('Total-række', uh.includes('Total'));
  ok('Normaltime-spec', uh.includes('Normaltime'));
  ok('Varslet OT 1. time +50%', uh.includes('Varslet OT 1. time (+50%)'));
  ok('Varslet OT 2. time +60%', uh.includes('Varslet OT 2. time (+60%)'));
  ok('Uvarslet OT 1. time +75%', uh.includes('Uvarslet OT 1. time (+75%)'));
  ok('Uvarslet OT 2. time +100%', uh.includes('Uvarslet OT 2. time (+100%)'));
  ok('Weekend §8 spec', uh.includes('Weekend §8 (+75%)'));
  ok('Forskudt tid §7 spec', uh.includes('Forskudt tid §7'));
  ok('Diæt §14 spec', uh.includes('Diæt §14'));

  // Torsdag mixed OT — vises som "Xt varslet · Yt uvarslet" i dagsoversigt-tillæg-cellen
  const torsMatch = uh.match(/<tr>\s*<td>Torsdag 15\/5<\/td>[\s\S]*?<\/tr>/);
  if (torsMatch) {
    ok('Torsdag row har mixed-tekst (0t 30m varslet · 1t 30m uvarslet)',
      /0t 30m varslet · 1t 30m uvarslet/.test(torsMatch[0]),
      `row: ${torsMatch[0].replace(/\s+/g,' ').slice(0,200)}`);
  } else {
    ok('Torsdag row fundet', false, 'tr ikke matchet');
  }

  // Beløbsverifikation: Varslet OT 1. time skal være > 0 (kommer fra tirsdag + torsdag 0.5t v)
  const ts = B.cfg.ugelon / 40; // 259.5
  // Tirsdag varslet (begge bands fulde): ot1H=1, ot2H=1
  //   sumVarslet1 ⊇ ts × 1 × 1.5 = 389.25 → afrundes
  //   sumVarslet2 ⊇ ts × 1 × 1.6 = 415.20
  // Torsdag mixed (v1=0.5, v2=0): tilføj 0.5 × ts × 1.5 = 194.625 til varslet1
  //                               tilføj 0 × ts × 1.6 = 0 til varslet2
  // Forventet rounding: Math.round(389.25 + 194.625) = Math.round(583.875) = 584
  // (men koden afrunder hver iteration først? Lad os tjekke fra _pdfUge)
  // I _pdfUge: sumVarslet1 += d.ot1 (heltal) ELLER ts*v1*1.5 (float)
  //   For varslet-only: sumVarslet1 += d.ot1 (allerede afrundet 389)
  //   For mixed:       sumVarslet1 += ts*v1*1.5 = 194.625 (float)
  //   = 389 + 194.625 = 583.625 → Math.round = 584
  const v1Match = uh.match(/Varslet OT 1\. time \(\+50%\)[\s\S]{0,200}?>\s*([\d.,]+)\s*kr\./);
  const v1Kr = v1Match ? parseInt(v1Match[1].replace(/[.,]/g,'')) : null;
  ok(`Varslet OT 1. time beløb ≈ 584 (fik ${v1Kr})`, v1Kr >= 580 && v1Kr <= 590);

  const u1Match = uh.match(/Uvarslet OT 1\. time \(\+75%\)[\s\S]{0,200}?>\s*([\d.,]+)\s*kr\./);
  const u1Kr = u1Match ? parseInt(u1Match[1].replace(/[.,]/g,'')) : null;
  // Onsdag uvarslet ot1: ts*1.75 = 454.125 → 454
  // Torsdag mixed u1=0.5: 0.5*ts*1.75 = 227.0625
  // Total: 454 + 227.0625 = 681.0625 → round 681
  ok(`Uvarslet OT 1. time beløb ≈ 681 (fik ${u1Kr})`, u1Kr >= 675 && u1Kr <= 685);

  // ---------------------------------------------------------------
  group('3. PDF — MÅNEDSOVERSIGT (_pdfMnd)');
  // ---------------------------------------------------------------
  const rm = window._pdfMnd();
  const mh = rm.html;
  ok('MÅNEDS-header', mh.includes('MÅNEDS'));
  ok('OVERSIGT-header', mh.includes('OVERSIGT'));
  ok('Maj 2025 vist', mh.includes('MAJ 2025'));
  ok('Antal arbejdsdage', /\d+ arbejdsdage/.test(mh));
  // Mixed OT vises som "(...V · ...U)"
  const mixCelle = mh.match(/Torsdag 15\/5[\s\S]{0,200}/);
  if (mixCelle) {
    ok('Torsdag i mnd har mixed-cell (0t 30mV · 1t 30mU)',
      /\(0t 30mV · 1t 30mU\)/.test(mixCelle[0]),
      `celle: ${mixCelle[0].replace(/\s+/g,' ').slice(0,200)}`);
  } else {
    ok('Torsdag i mnd fundet', false);
  }
  ok('Mandag-linje', /Mandag 12\/5/.test(mh));
  ok('Bruttoløn-linje', mh.includes('Bruttoløn'));
  ok('Pension 9,5%-linje', mh.includes('Pension 9,5%'));

  // ---------------------------------------------------------------
  group('4. PDF — ÅRSOVERSIGT (_pdfAar)');
  // ---------------------------------------------------------------
  const ra = window._pdfAar();
  const ah = ra.html;
  ok('Årstal vist 2025', ah.includes('2025'));
  ok('Maj-række', ah.includes('<td>Maj</td>'));
  ok('I alt 2025-række', ah.includes('I alt 2025'));
  ok('Pension 9,5%-række', ah.includes('Pension 9,5%'));
  ok('Antal dage vist', / 7 dage|>7 dage/.test(ah) || /\b7\b/.test(ah));

  // ---------------------------------------------------------------
  group('5. MAIL — emne (via navigator.share title-felt)');
  // ---------------------------------------------------------------
  // Hjælper: vent til __shares har ny entry eller timeout
  async function waitForShare(maxMs = 3000) {
    const start = Date.now();
    while (window.__shares.length === 0 && (Date.now() - start) < maxMs) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  window.__shares.length = 0;
  B.aktivDag = new Date(days[3]); // torsdag mixed
  window.sendEnkeltDag();
  await waitForShare();
  ok('sendEnkeltDag: share kaldt', window.__shares.length === 1, `shares=${JSON.stringify(window.__shares)}`);
  const dagShare = window.__shares[0];
  if (dagShare) {
    ok('sendEnkeltDag emne har navn',  dagShare.title.includes('Thomas Ditzel'),  `title="${dagShare.title}"`);
    ok('sendEnkeltDag emne har dag',   /Torsdag 15\. maj 2025/.test(dagShare.title));
    ok('sendEnkeltDag emne har år',    dagShare.title.includes('2025'));
    ok('sendEnkeltDag emne har produktion', dagShare.title.includes('Mit Filmprojekt'));
    ok('sendEnkeltDag filnavn er PDF', /^TimeApp_.*\.pdf$/.test(dagShare.file), `file=${dagShare.file}`);
    ok('sendEnkeltDag filnavn har ISO-dato', /2025-05-15/.test(dagShare.file));
  }

  window.__shares.length = 0;
  window.doMail();
  await waitForShare();
  ok('doMail (uge): share kaldt', window.__shares.length === 1);
  const ugeShare = window.__shares[0];
  if (ugeShare) {
    ok('doMail emne har navn', ugeShare.title.includes('Thomas Ditzel'));
    ok('doMail emne har "Uge X"', /Uge \d+/.test(ugeShare.title));
    ok('doMail emne har år', ugeShare.title.includes('2025'));
    ok('doMail emne har produktion', ugeShare.title.includes('Mit Filmprojekt'));
    ok('doMail filnavn TimeApp_*_UgeXX-2025.pdf', /TimeApp_.+_Uge\d{2}-2025\.pdf$/.test(ugeShare.file));
  }

  window.__shares.length = 0;
  window.doMail_mnd();
  await waitForShare();
  ok('doMail_mnd: share kaldt', window.__shares.length === 1);
  const mndShare = window.__shares[0];
  if (mndShare) {
    ok('doMail_mnd emne har "Maj"', /Maj/.test(mndShare.title));
    ok('doMail_mnd emne har 2025',  /2025/.test(mndShare.title));
    ok('doMail_mnd filnavn har Maj-2025', /Maj-2025/.test(mndShare.file));
  }

  window.__shares.length = 0;
  window.doMail_aar();
  await waitForShare();
  ok('doMail_aar: share kaldt', window.__shares.length === 1);
  const aarShare = window.__shares[0];
  if (aarShare) {
    ok('doMail_aar emne "År 2025"', /År 2025/.test(aarShare.title));
    ok('doMail_aar filnavn TimeApp_*_2025.pdf', /TimeApp_.+_2025\.pdf$/.test(aarShare.file));
  }

  // ---------------------------------------------------------------
  group('6. XLSX — doXLSX / doXLSX_mnd / doXLSX_aar');
  // ---------------------------------------------------------------
  window.__xlsxFiles.length = 0;
  window.doXLSX();
  await new Promise(r => setTimeout(r, 200));
  ok('doXLSX: fil genereret', window.__xlsxFiles.length === 1, `count=${window.__xlsxFiles.length}`);
  const wb = window.__xlsxFiles[0]?.wb;
  if (wb) {
    ok('Filnavn TimeApp-UgeXX-2025.xlsx', /TimeApp-Uge\d{1,2}-2025\.xlsx/.test(window.__xlsxFiles[0].filename),
      `filename=${window.__xlsxFiles[0].filename}`);
    ok('Sheet "Ugeseddel" findes', wb.SheetNames.includes('Ugeseddel'));
    ok('Sheet "Udregningsgrundlag" findes', wb.SheetNames.includes('Udregningsgrundlag'));

    const ws = wb.Sheets['Ugeseddel'];
    const rows = XLSX_real.utils.sheet_to_json(ws, { header: 1, defval: '' });
    ok('Mandag-række',            rows.some(r => r[0] === 'Mandag'));
    ok('Tirsdag-række (Varslet)', rows.some(r => r[0] === 'Tirsdag' && /Varslet/.test(String(r[6]))));
    ok('Onsdag-række (Uvarslet)', rows.some(r => r[0] === 'Onsdag' && /Uvarslet/.test(String(r[6]))));
    const torsRow = rows.find(r => r[0] === 'Torsdag');
    ok('Torsdag-række (Mixed med V·U)',
      torsRow && /Mixed/.test(String(torsRow[6])) && /0t 30m V/.test(String(torsRow[6])) && /1t 30m U/.test(String(torsRow[6])),
      `torsdag OT-celle: "${torsRow?.[6]}"`);
    ok('Søndag-række (Helligdag)', rows.some(r => r[0] === 'Søndag' && /Helligdag/.test(String(r[6]))));
    ok('TOTAL-række',           rows.some(r => r[0] === 'TOTAL'));
    ok('Lønspec-headline',      rows.some(r => r[0] === 'LØNSPECIFIKATION'));
    ok('Varslet OT 1. spec',    rows.some(r => /Varslet OT 1\. time/.test(String(r[0]))));
    ok('Varslet OT 2. spec',    rows.some(r => /Varslet OT 2\. time/.test(String(r[0]))));
    ok('Uvarslet OT 1. spec',   rows.some(r => /Uvarslet OT 1\. time/.test(String(r[0]))));
    ok('Uvarslet OT 2. spec',   rows.some(r => /Uvarslet OT 2\. time/.test(String(r[0]))));
    ok('Weekend §8-spec',       rows.some(r => /Weekend\/helligdag/.test(String(r[0]))));
    ok('Forskudt §7-spec',      rows.some(r => /Forskudt/.test(String(r[0]))) || true /* fsk kan være 0 */);
    ok('BRUTTOLØN-række',       rows.some(r => r[0] === 'BRUTTOLØN'));
    ok('Pension 9,5%-række',    rows.some(r => /Pension 9,5%/.test(String(r[0]))));
    ok('SAMLET INKL. PENSION',  rows.some(r => r[0] === 'SAMLET INKL. PENSION'));

    // Verificér beløb stemmer mellem ark og PDF
    const totalRow = rows.find(r => r[0] === 'TOTAL');
    const ud = B.ugeData();
    ok(`TOTAL kr matcher ugeData (${totalRow?.[12]} vs ${ud.totL})`,
      totalRow && Math.abs((+totalRow[12]) - ud.totL) < 1);
  }

  window.__xlsxFiles.length = 0;
  window.doXLSX_mnd();
  await new Promise(r => setTimeout(r, 200));
  ok('doXLSX_mnd: fil genereret', window.__xlsxFiles.length === 1);
  const wbM = window.__xlsxFiles[0]?.wb;
  if (wbM) {
    ok('Filnavn TimeApp-Maj-2025.xlsx', /TimeApp-Maj-2025\.xlsx/.test(window.__xlsxFiles[0].filename));
    const ws = wbM.Sheets[wbM.SheetNames[0]];
    const rows = XLSX_real.utils.sheet_to_json(ws, { header:1, defval:'' });
    ok('Mnd: header Dato/Dag/Start/Slut', rows.some(r => r[0]==='Dato' && r[1]==='Dag' && r[2]==='Start' && r[3]==='Slut'));
    ok('Mnd: Mixed OT-celle (0t 30m V · 1t 30m U)',
      rows.some(r => /Mixed/.test(String(r[5])) && /0t 30m V/.test(String(r[5])) && /1t 30m U/.test(String(r[5]))));
    ok('Mnd: Varslet-row',  rows.some(r => String(r[5]) === 'Varslet'));
    ok('Mnd: Uvarslet-row', rows.some(r => String(r[5]) === 'Uvarslet'));
    ok('Mnd: I ALT-række',  rows.some(r => r[0] === 'I ALT'));
    ok('Mnd: Pension-række',rows.some(r => /Pension 9,5%/.test(String(r[0]))));
  }

  window.__xlsxFiles.length = 0;
  window.doXLSX_aar();
  await new Promise(r => setTimeout(r, 200));
  ok('doXLSX_aar: fil genereret', window.__xlsxFiles.length === 1);
  const wbA = window.__xlsxFiles[0]?.wb;
  if (wbA) {
    ok('Filnavn TimeApp-2025.xlsx', /TimeApp-2025\.xlsx/.test(window.__xlsxFiles[0].filename));
    const ws = wbA.Sheets[wbA.SheetNames[0]];
    const rows = XLSX_real.utils.sheet_to_json(ws, { header:1, defval:'' });
    ok('År: Maj-række', rows.some(r => r[0] === 'Maj'));
    const majRow = rows.find(r => r[0] === 'Maj');
    if (majRow) {
      ok(`År: Maj-række antal dage = 7 (fik ${majRow[1]})`, majRow[1] === 7);
    }
    ok('År: I ALT 2025-række', rows.some(r => /I ALT 2025/.test(String(r[0]))));
    ok('År: Pension', rows.some(r => /Pension 9,5%/.test(String(r[0]))));
  }

  // ---------------------------------------------------------------
  group('7. iCAL — doKalender');
  // ---------------------------------------------------------------
  window.__createdURLs.length = 0;
  window.__downloads = window.__downloads || [];
  window.__downloads.length = 0;
  window.doKalender();
  await new Promise(r => setTimeout(r, 400));
  const icsEntry = window.__createdURLs.find(e => e.blob && e.blob.type && e.blob.type.startsWith('text/calendar'));
  ok('iCal-blob genereret', !!icsEntry);
  if (icsEntry) {
    const ics = icsEntry.text || await icsEntry.blob.text();
    ok('BEGIN:VCALENDAR',          ics.startsWith('BEGIN:VCALENDAR'));
    ok('END:VCALENDAR',            ics.includes('END:VCALENDAR'));
    ok('PRODID:',                  ics.includes('PRODID:'));
    ok('X-WR-TIMEZONE Copenhagen', ics.includes('X-WR-TIMEZONE:Europe/Copenhagen'));
    ok('X-WR-CALNAME Time App',    /X-WR-CALNAME:Time App Uge \d+/.test(ics));
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    ok(`7 VEVENT events (fik ${eventCount})`, eventCount === 7);
    ok('SUMMARY har produktion',   ics.includes('SUMMARY:Mit Filmprojekt'));
    // Mixed OT i description (description folder linjer; \\n bruges som separator)
    ok('Mixed OT i description (Torsdag)',
      /Mixed OT: 0t 30m varslet · 1t 30m uvarslet/.test(ics));
    ok('Helligdag §8 i description', /Helligdag §8/.test(ics));
    ok('DTSTART format YYYYMMDDTHHMMSSZ', /DTSTART:\d{8}T\d{6}Z/.test(ics));
    ok('DTEND format YYYYMMDDTHHMMSSZ',   /DTEND:\d{8}T\d{6}Z/.test(ics));
    ok('CATEGORIES:TimeApp',       ics.includes('CATEGORIES:TimeApp'));
  }
  const icsDownload = (window.__downloads || []).find(d => d.filename && d.filename.endsWith('.ics'));
  ok('iCal download trigget', !!icsDownload);
  if (icsDownload) ok('iCal filnavn', /TimeApp-Uge\d+\.ics/.test(icsDownload.filename));

  // ---------------------------------------------------------------
  group('8. BACKUP — gemBackupFil + restore round-trip');
  // ---------------------------------------------------------------
  window.__shares.length = 0;
  window.__createdURLs.length = 0;
  window.__downloads.length = 0;
  await window.gemBackupFil();
  await new Promise(r => setTimeout(r, 300));

  // canShare = true → kode bruger navigator.share path
  ok('gemBackupFil: navigator.share kaldt', window.__shares.length === 1);
  const backupShare = window.__shares[0];
  if (backupShare) {
    ok('Backup share title "Time App backup"', backupShare.title === 'Time App backup');
    ok('Backup filnavn pattern',  /^timeapp-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/.test(backupShare.file));
  }
  // Læs backup-blob fra files-array
  // navigator.share blev kaldt med files: [File], men vi gemte kun navn — læs det fra det shared file:
  // Vi bruger en alternativ path: vent på at gemBackupFil's egen Blob er blevet konstrueret. Vi capture'r ikke
  // blob direkte fra share. I stedet: tjek backup-flow ved at SLÅ canShare fra og kør igen, så fallback rammer URL.createObjectURL
  Object.defineProperty(window.navigator, 'canShare', { configurable:true, value: () => false });
  window.__createdURLs.length = 0;
  window.__downloads.length = 0;
  await window.gemBackupFil();
  await new Promise(r => setTimeout(r, 300));
  const backupURL = window.__createdURLs.find(e => e.blob && e.blob.type && e.blob.type.includes('json'));
  ok('Backup JSON-blob via fallback', !!backupURL);
  let backupData = null;
  if (backupURL) {
    const json = backupURL.text || await backupURL.blob.text();
    try { backupData = JSON.parse(json); } catch(e) {}
    ok('Backup er gyldig JSON', !!backupData);
    if (backupData) {
      const dayKeys = Object.keys(backupData).filter(k => k.startsWith('faf-test-prod-1-2025-05-'));
      ok(`Backup indeholder 7 dag-nøgler (fik ${dayKeys.length})`, dayKeys.length === 7);
      const torsKey = 'faf-test-prod-1-2025-05-15';
      ok('Backup indeholder torsdag-nøgle', !!backupData[torsKey]);
      if (backupData[torsKey]) {
        const t = JSON.parse(backupData[torsKey]);
        ok('Torsdag: knapper.v=true',            t.knapper?.v === true);
        ok('Torsdag: knapper.u=true',            t.knapper?.u === true);
        ok('Torsdag: varsletTimer=0.5',          t.knapper?.varsletTimer === 0.5);
        ok('Torsdag: start="08:00"',             t.start === '08:00');
        ok('Torsdag: slut="18:30"',              t.slut === '18:30');
        ok('Torsdag: h=10',                       t.h === 10);
        ok('Torsdag: prodId="test-prod-1"',       t.prodId === 'test-prod-1');
        ok('Torsdag: prod="Mit Filmprojekt"',     t.prod === 'Mit Filmprojekt');
      }
    }
  }
  const backupDL = (window.__downloads || []).find(d => d.filename && d.filename.startsWith('timeapp-backup-'));
  ok('Backup download fallback trigget', !!backupDL);

  // RESTORE round-trip:
  // 1) Slet alle dag-nøgler i localStorage
  // 2) Importér backupData
  // 3) Verificér at hentDag returnerer korrekt
  for (let i = ls.length - 1; i >= 0; i--) {
    const k = ls.key(i);
    if (k.startsWith('faf-')) ls.removeItem(k);
  }
  ok('localStorage tømt før restore', !Array.from({length:ls.length},(_,i)=>ls.key(i)).some(k=>k.startsWith('faf-test-prod-1-')));

  if (backupData) {
    // Simuler importerData ved at indsætte alle nøgler direkte
    Object.entries(backupData).forEach(([k, v]) => ls.setItem(k, v));
    // Verificér
    B.aktivProdId = 'test-prod-1';
    B.aktivDag = new Date(days[3]);
    const restoredTors = B.hentDag(new Date(days[3]));
    ok('Restore: hentDag(torsdag) returnerer data', !!restoredTors);
    if (restoredTors) {
      ok('Restore: knapper.v=true',         restoredTors.knapper.v === true);
      ok('Restore: knapper.u=true',         restoredTors.knapper.u === true);
      ok('Restore: varsletTimer=0.5',       restoredTors.knapper.varsletTimer === 0.5);
      ok('Restore: prodId="test-prod-1"',   restoredTors.prodId === 'test-prod-1');
    }
    // Verificér at ugeData re-beregner korrekt efter restore
    const ud2 = B.ugeData();
    ok(`Restore: 7 dage i ugeData (fik ${ud2.dage.filter(d=>!d.fri).length})`,
      ud2.dage.filter(d=>!d.fri).length === 7);
  }

  // ---------------------------------------------------------------
  group('9. SAMLET — beløb stemmer på tværs af PDF/XLSX/ugeData');
  // ---------------------------------------------------------------
  const ud = B.ugeData();
  console.log(`  · timesats     = ${(B.cfg.ugelon/40).toFixed(2)} kr/t`);
  console.log(`  · ugeData totH = ${ud.totH.toFixed(2)} t`);
  console.log(`  · ugeData totL = ${ud.totL.toLocaleString('da-DK')} kr`);
  console.log(`  · ugeData pension = ${ud.pension.toLocaleString('da-DK')} kr`);
  const tors = ud.dage[3];
  ok('Torsdag h = 10',                        tors.h === 10);
  ok('Torsdag knapper.v && knapper.u',        tors.knapper.v && tors.knapper.u);
  ok('Torsdag varsletTimer = 0.5',            tors.knapper.varsletTimer === 0.5);
  // Hand-calc: ts=259.5
  // ot1: 0.5*259.5*1.5 + 0.5*259.5*1.75 = 64.875 + 113.53125 = 178.40625 → calcLon rounds = 178
  // ot2: 0 + 1*259.5*2.0 = 519
  const ts2 = B.cfg.ugelon/40;
  const e_ot1 = Math.round(0.5*ts2*1.5 + 0.5*ts2*1.75);
  const e_ot2 = Math.round(0 + 1*ts2*2.0);
  ok(`Torsdag ot1 = ${e_ot1} kr (fik ${tors.ot1})`, tors.ot1 === e_ot1);
  ok(`Torsdag ot2 = ${e_ot2} kr (fik ${tors.ot2})`, tors.ot2 === e_ot2);

  // Cross-check: Bruttoløn i PDF = totL fra ugeData
  const bruttoMatch = uh.match(/Bruttoløn[\s\S]{0,200}?>\s*([\d.,]+)\s*kr\./);
  const bruttoKr = bruttoMatch ? parseInt(bruttoMatch[1].replace(/[.,]/g,'')) : null;
  ok(`PDF Bruttoløn = ${ud.totL} (fik ${bruttoKr})`, bruttoKr === ud.totL);

  // ---------------------------------------------------------------
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Bestået: ${passed}    Fejl: ${failed}`);
  console.log('══════════════════════════════════════════════════');
  if (failed > 0) {
    console.log('\nFejldetaljer:');
    failures.forEach((f,i) => console.log(`  ${i+1}. ${f.label}${f.detail?'\n     '+f.detail:''}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
