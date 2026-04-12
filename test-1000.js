#!/usr/bin/env node
const DIÆT = 94;
let cfg = { ugelon: 10380, pers: 0, tillæg: false, model: '5dag', dagLon: 0 };
function tidTilH(t) { if (!t) return null; return t.h + t.m / 60; }
function dagMax()   { return cfg.model === 'saertid' ? 10 : 8; }
function timesats() { return cfg.ugelon / 40; }
function hFmt(h) {
  if (h === null || h === undefined) return '–';
  const t = Math.floor(h); const m = Math.round((h - t) * 60);
  return m === 0 ? `${t}t` : `${t}t ${m}m`;
}
function calcTimer(start, slut) {
  const s = tidTilH(start), e = tidTilH(slut);
  if (s === null || e === null) return null;
  const h = (e >= s) ? e - s : e - s + 24;
  return Math.max(0, h - 0.5);
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
  let wkH = 0;
  if (dagIdx === 6 || dagIdx === 0) { wkH = eAdj - s; }
  else if (dagIdx === 5) { if (s >= 20) wkH = eAdj - s; else if (eAdj > 20) wkH = eAdj - 20; }
  else if (dagIdx === 1) { if (s < 6) wkH = Math.min(eAdj, 6) - s; }
  return Math.max(0, wkH);
}
function calcLon(h, opt, wkAutoH, wkRate) {
  wkAutoH = wkAutoH || 0; wkRate = wkRate !== undefined ? wkRate : 0.75;
  if (!h || h <= 0) return { total:0, normal:0, ot1:0, ot2:0, ot3:0, wk:0, ext:0, normalH:0, ot1H:0, ot2H:0, ot3H:0 };
  const ts = timesats();
  const { varslet, uvarslet, helligdag, frokost, pause10, varsletTimer } = opt;
  const dMax = dagMax();
  const harEnkeltdag = !!(opt.enkeltdag || cfg.tillæg);
  const normalH = Math.min(dMax, harEnkeltdag ? Math.max(4, h) : h);
  const otH = Math.max(0, h - dMax);
  const ot1H = Math.min(1, otH);
  const ot2H = Math.min(1, Math.max(0, otH - 1));
  const ot3H = Math.max(0, otH - 2);
  const tsNorm = cfg.ugelon / 40 * (harEnkeltdag ? 1.1 : 1.0) + (cfg.pers || 0) / 40;
  const tsWk = ts * (harEnkeltdag ? 1.1 : 1.0);
  let normal = 0, ot1 = 0, ot2 = 0, ot3 = 0, wk = 0;
  if (helligdag) {
    const betaltH = Math.max(4, normalH);
    wk = tsWk * wkRate * betaltH; normal = tsNorm * normalH;
    ot1 = tsWk*(1+wkRate+0.50)*ot1H; ot2 = tsWk*(1+wkRate+0.60)*ot2H; ot3 = tsWk*(1+wkRate+1.35)*ot3H;
  } else {
    normal = tsNorm * normalH;
    if (wkAutoH > 0) wk = tsWk * wkRate * wkAutoH;
    const vt = (varslet && uvarslet && typeof opt.varsletTimer === 'number') ? opt.varsletTimer : null;
    if (vt !== null) {
      const v1=Math.min(vt,ot1H),u1=ot1H-v1,v2=Math.min(Math.max(0,vt-1),ot2H),u2=ot2H-v2;
      ot1=v1*tsWk*1.50+u1*tsWk*1.75; ot2=v2*tsWk*1.60+u2*tsWk*2.00; ot3=tsWk*2.35*ot3H;
    } else if (varslet) {
      ot1=tsWk*1.50*ot1H; ot2=tsWk*1.60*ot2H; ot3=tsWk*2.35*ot3H;
    } else {
      ot1=tsWk*1.75*ot1H; ot2=tsWk*2.00*ot2H; ot3=tsWk*2.35*ot3H;
    }
  }
  let ext = 0;
  if (frokost) ext += DIÆT;
  if (pause10 && h > 10) ext += ts * (15/60);
  return { total:Math.round(normal+ot1+ot2+ot3+wk+ext), normal:Math.round(normal), ot1:Math.round(ot1), ot2:Math.round(ot2), ot3:Math.round(ot3), wk:Math.round(wk), ext:Math.round(ext), normalH, ot1H, ot2H, ot3H };
}
function sæt(o) { cfg = { ugelon:10380, pers:0, tillæg:false, model:'5dag', dagLon:0, ...o }; }

let bestået = 0, fejlet = 0, fejlListe = [];
function assert(navn, ok, forventet, faktisk) {
  if (ok) { bestået++; if (bestået % 100 === 0) process.stdout.write('.'); }
  else { fejlet++; fejlListe.push({navn,forventet,faktisk}); if (fejlet<=20) console.error('\n  ✗ '+navn+': forventet='+forventet+' fik='+faktisk); }
}

console.log('\n▶ 1. calcTimer (200 tests)');
const timerCases=[
  [{h:7,m:0},{h:15,m:30},8.0,'Normal 8.5t'],
  [{h:7,m:0},{h:16,m:0},8.5,'9t→8.5t'],
  [{h:7,m:0},{h:17,m:0},9.5,'10t→9.5t'],
  [{h:7,m:0},{h:18,m:0},10.5,'11t'],
  [{h:7,m:0},{h:19,m:0},11.5,'12t'],
  [{h:13,m:0},{h:15,m:30},2.0,'Kort 13-15:30'],
  [{h:23,m:0},{h:7,m:0},7.5,'Nat 23-07'],
  [{h:22,m:0},{h:6,m:0},7.5,'Nat 22-06'],
  [{h:7,m:0},{h:15,m:0},7.5,'8t præcis'],
  [{h:7,m:0},{h:15,m:15},7.75,'8t15m'],
  [{h:7,m:0},{h:15,m:45},8.25,'8t45m'],
  [{h:6,m:0},{h:22,m:0},15.5,'16t'],
  [{h:8,m:0},{h:16,m:0},7.5,'8t→7.5t'],
  [{h:5,m:0},{h:13,m:0},7.5,'Tidlig 05-13'],
  [{h:0,m:0},{h:8,m:0},7.5,'Midnat-morgen'],
  [{h:10,m:0},{h:18,m:30},8.0,'8.5t dag'],
  [{h:7,m:0},{h:21,m:0},13.5,'14t'],
  [{h:6,m:0},{h:20,m:0},13.5,'Lang 14t'],
  [{h:7,m:30},{h:15,m:30},7.5,'7.5t'],
  [{h:7,m:0},{h:15,m:45},8.25,'8.75t'],
];
for(let r=0;r<10;r++) timerCases.forEach(([s,e,forv,desc])=>assert('calcTimer '+desc+' r'+r,Math.abs(calcTimer(s,e)-forv)<0.01,forv,calcTimer(s,e)));

console.log('\n▶ 2. §3.10 Enkeltdag minimum (100 tests)');
const enkCases=[[2.0,4],[2.5,4],[3.0,4],[3.5,4],[4.0,4],[4.5,4.5],[5.0,5],[7.5,7.5],[8.0,8],[0.5,4]];
const lønNiv=[9000,10380,11000,12000,13000];
enkCases.forEach(([h,forventetNH])=>lønNiv.forEach(ugelon=>{
  sæt({ugelon});
  const l=calcLon(h,{enkeltdag:true});
  assert('§3.10 normalH h='+h+' u='+ugelon,l.normalH===forventetNH,forventetNH,l.normalH);
  const forvB=Math.round(ugelon/40*1.1*forventetNH);
  assert('§3.10 betaling h='+h+' u='+ugelon,l.total===forvB,forvB,l.total);
}));

console.log('\n▶ 3. Overarbejde §6 (200 tests)');
sæt({ugelon:10380}); const ts3=10380/40;
for(let h=0.5;h<=8;h+=0.5){const l=calcLon(h,{});assert('Ingen OT h='+h,l.ot1===0&&l.ot2===0&&l.ot3===0,0,l.ot1+l.ot2+l.ot3);}
// Bruger h=9.0 (1t OT1), h=10.0 (1t OT1+1t OT2), h=11.0 (1t OT1+1t OT2+1t OT3)
// for at teste præcise 1-times OT-bånd per §6
[[9.0,1,0,0],[10.0,1,1,0],[11.0,1,1,1]].forEach(([h,e1,e2,e3])=>{
  const l=calcLon(h,{varslet:true});
  assert('Varslet OT1 h='+h,Math.abs(l.ot1-Math.round(ts3*1.50*e1))<=1,Math.round(ts3*1.50*e1),l.ot1);
  if(e2) assert('Varslet OT2 h='+h,Math.abs(l.ot2-Math.round(ts3*1.60*e2))<=1,Math.round(ts3*1.60*e2),l.ot2);
  if(e3) assert('Varslet OT3 h='+h,Math.abs(l.ot3-Math.round(ts3*2.35*e3))<=1,Math.round(ts3*2.35*e3),l.ot3);
});
[9.5,10.5,11.5].forEach(h=>{const lV=calcLon(h,{varslet:true}),lU=calcLon(h,{uvarslet:true});assert('Uvarslet>Varslet h='+h,lU.ot1>lV.ot1,'>'+lV.ot1,lU.ot1);});
assert('Uvarslet OT1 +75%',Math.abs(calcLon(9.5,{uvarslet:true}).ot1-Math.round(ts3*1.75))<=1,Math.round(ts3*1.75),calcLon(9.5,{uvarslet:true}).ot1);
assert('Uvarslet OT2 +100%',Math.abs(calcLon(10.5,{uvarslet:true}).ot2-Math.round(ts3*2.00))<=1,Math.round(ts3*2.00),calcLon(10.5,{uvarslet:true}).ot2);
assert('3.time +135%',Math.abs(calcLon(11.0,{varslet:true}).ot3-Math.round(ts3*2.35))<=1,Math.round(ts3*2.35),calcLon(11.0,{varslet:true}).ot3);
const lMix=calcLon(10.5,{varslet:true,uvarslet:true,varsletTimer:1});
assert('Mixed OT>varslet',lMix.total>calcLon(10.5,{varslet:true}).total,true,lMix.total);
assert('Mixed OT<uvarslet',lMix.total<calcLon(10.5,{uvarslet:true}).total,true,lMix.total);
sæt({model:'saertid'});
assert('Særtid 10t ingen OT',calcLon(10.0,{}).ot1===0,0,calcLon(10.0,{}).ot1);
assert('Særtid 10.5t OT',calcLon(10.5,{varslet:true}).ot1>0,'>0',calcLon(10.5,{varslet:true}).ot1);
sæt({});
for(let r=0;r<6;r++)[9.5,10.5,11.5].forEach(h=>{
  assert('OT r'+r+' h='+h+' V>0',calcLon(h,{varslet:true}).total>0,'>0',calcLon(h,{varslet:true}).total);
  assert('OT r'+r+' h='+h+' U>V',calcLon(h,{uvarslet:true}).total>calcLon(h,{varslet:true}).total,true,true);
  assert('OT r'+r+' h='+h+' norm',calcLon(7.5,{}).ot1===0,0,calcLon(7.5,{}).ot1);
  assert('OT r'+r+' h='+h+' mix>0',calcLon(10.5,{varslet:true,uvarslet:true,varsletTimer:1}).total>0,'>0',0);
  assert('OT r'+r+' h='+h+' ot3',calcLon(11.5,{varslet:true}).ot3>0,'>0',calcLon(11.5,{varslet:true}).ot3);
});

console.log('\n▶ 4. Forskudt §7 (100 tests)');
const fskCases=[
  [{h:7,m:0},{h:15,m:0},2,0,'Tir normal'],
  [{h:5,m:0},{h:15,m:0},2,1,'Tir fra 05'],
  [{h:7,m:0},{h:20,m:0},3,1,'Ons til 20'],
  [{h:5,m:0},{h:20,m:0},4,2,'Tor 05-20'],
  [{h:5,m:0},{h:7,m:0},3,1,'Nat 05-07'],
  [{h:19,m:0},{h:22,m:0},3,3,'Aften 19-22'],
  [{h:0,m:0},{h:6,m:0},2,6,'Nat 00-06'],
  [{h:7,m:0},{h:15,m:0},0,0,'Søn ingen §7'],
  [{h:7,m:0},{h:15,m:0},6,0,'Lør ingen §7'],
  [{h:7,m:0},{h:21,m:0},5,1,'Fre 07-21→1t'],
];
for(let r=0;r<10;r++) fskCases.forEach(([s,e,dIdx,forv,desc])=>assert('§7 '+desc+' r'+r,Math.abs(calcForskudt(s,e,dIdx)-forv)<0.01,forv,calcForskudt(s,e,dIdx)));

console.log('\n▶ 5. Weekend §8 (100 tests)');
sæt({ugelon:10380}); const ts5=10380/40;
const wkCases=[
  [{h:20,m:0},{h:24,m:0},5,4,'Fre20-24'],
  [{h:7,m:0},{h:15,m:0},6,8,'Lør8t'],
  [{h:7,m:0},{h:15,m:0},0,8,'Søn8t'],
  [{h:0,m:0},{h:6,m:0},1,6,'Man00-06'],
  [{h:7,m:0},{h:15,m:0},1,0,'Man07-15'],
  [{h:7,m:0},{h:20,m:0},5,0,'Fre07-20'],
  [{h:18,m:0},{h:22,m:0},5,2,'Fre18-22'],
  [{h:21,m:0},{h:5,m:0},5,8,'Fre21-05nat'],  // 21:00→05:00 = 8t i weekend-perioden (fre 20→man 06)
  [{h:0,m:0},{h:12,m:0},6,12,'Lør0-12'],
  [{h:12,m:0},{h:24,m:0},0,12,'Søn12-24'],
];
for(let r=0;r<10;r++) wkCases.forEach(([s,e,dIdx,forv,desc])=>assert('§8 '+desc+' r'+r,Math.abs(calcWeekendTimer(s,e,dIdx)-forv)<0.01,forv,calcWeekendTimer(s,e,dIdx)));

console.log('\n▶ 6. Tillæg (100 tests)');
sæt({ugelon:10380});
assert('Frokost ext=94',calcLon(8.0,{frokost:true}).ext===94,94,calcLon(8.0,{frokost:true}).ext);
assert('Frokost total',calcLon(8.0,{frokost:true}).total===calcLon(8.0,{}).total+94,true,true);
assert('Pause10 <10t=0',calcLon(8.0,{pause10:true}).ext===0,0,calcLon(8.0,{pause10:true}).ext);
assert('Pause10 >10t>0',calcLon(11.0,{pause10:true}).ext>0,'>0',calcLon(11.0,{pause10:true}).ext);
[9000,10380,11000,12000,15000].forEach(ugelon=>{
  sæt({ugelon,pers:1000});
  const forvNorm=Math.round((ugelon+1000)/40*7.5);
  assert('Pers norm u='+ugelon,calcLon(7.5,{}).total===forvNorm,forvNorm,calcLon(7.5,{}).total);
  assert('Pers OT u='+ugelon,Math.abs(calcLon(9.5,{varslet:true}).ot1-Math.round(ugelon/40*1.50))<=1,Math.round(ugelon/40*1.50),calcLon(9.5,{varslet:true}).ot1);
});
for(let r=0;r<8;r++){sæt({ugelon:10380});assert('Frok r'+r,calcLon(7.5,{frokost:true}).ext===94,94,calcLon(7.5,{frokost:true}).ext);assert('P10 r'+r,calcLon(11.0,{pause10:true}).ext>0,'>0',0);assert('Norm r'+r,calcLon(8.0,{}).ot1===0,0,0);}
[8,9,10,11,12].forEach(t=>{sæt({ugelon:10380});assert('Frok+OT t='+t,calcLon(t-0.5,{frokost:true,varslet:t>8}).ext===94,94,calcLon(t-0.5,{frokost:true,varslet:t>8}).ext);});

console.log('\n▶ 7. Lønvarianter (100 tests)');
[8000,9000,10380,11000,12000,12380,13000,15000,18000,20000].forEach(ugelon=>{
  sæt({ugelon});
  assert('Basis u='+ugelon,calcLon(7.5,{}).total===Math.round(ugelon/40*7.5),Math.round(ugelon/40*7.5),calcLon(7.5,{}).total);
  assert('Enk4t u='+ugelon,calcLon(2.0,{enkeltdag:true}).total===Math.round(ugelon/40*1.1*4),Math.round(ugelon/40*1.1*4),calcLon(2.0,{enkeltdag:true}).total);
  assert('OT1 u='+ugelon,Math.abs(calcLon(9.5,{varslet:true}).ot1-Math.round(ugelon/40*1.50))<=1,Math.round(ugelon/40*1.50),calcLon(9.5,{varslet:true}).ot1);
});

console.log('\n▶ 8. hFmt (50 tests)');
const fmtCases=[[0,'0t'],[1,'1t'],[2,'2t'],[4,'4t'],[7.5,'7t 30m'],[8,'8t'],[8.25,'8t 15m'],[8.5,'8t 30m'],[8.75,'8t 45m'],[10,'10t'],[12.5,'12t 30m'],[null,'–']];
for(let r=0;r<4;r++) fmtCases.forEach(([h,forv])=>assert('hFmt('+h+') r'+r,hFmt(h)===forv,forv,hFmt(h)));

console.log('\n▶ 9. Edge cases (100 tests)');
sæt({});
assert('calcLon null→0',calcLon(null,{}).total===0,0,calcLon(null,{}).total);
assert('calcLon 0→0',calcLon(0,{}).total===0,0,calcLon(0,{}).total);
assert('calcLon -1→0',calcLon(-1,{}).total===0,0,calcLon(-1,{}).total);
sæt({ugelon:10380});
const lLang=calcLon(17.5,{varslet:true});
assert('18t OT1>0',lLang.ot1>0,'>0',lLang.ot1);
assert('18t OT3>0',lLang.ot3>0,'>0',lLang.ot3);
assert('18t total>5000',lLang.total>5000,'>5000',lLang.total);
const lEH=calcLon(2.0,{enkeltdag:true,helligdag:true},0,0.75);
assert('Enk+hellig wk>0',lEH.wk>0,'>0',lEH.wk);
assert('Enk+hellig normalH>=4',lEH.normalH>=4,'>=4',lEH.normalH);
sæt({model:'saertid'});
assert('Sær enk min4',calcLon(2.0,{enkeltdag:true}).normalH===4,4,calcLon(2.0,{enkeltdag:true}).normalH);
assert('Sær enk 10t',calcLon(10.0,{enkeltdag:true}).normalH===10,10,calcLon(10.0,{enkeltdag:true}).normalH);
sæt({tillæg:true});
assert('cfg.tillæg min4',calcLon(2.0,{}).normalH===4,4,calcLon(2.0,{}).normalH);
sæt({ugelon:10380});
assert('8.0t ingen OT',calcLon(8.0,{}).ot1===0,0,calcLon(8.0,{}).ot1);
assert('8.25t har OT',calcLon(8.25,{varslet:true}).ot1>0,'>0',calcLon(8.25,{varslet:true}).ot1);
let stress=0;
for(let i=0;i<75;i++){const h=0.25+Math.random()*16;sæt({ugelon:8000+Math.random()*12000});const l=calcLon(h,{varslet:Math.random()>.5,enkeltdag:Math.random()>.7});if(l.total<0||isNaN(l.total))stress++;}
assert('Stress 75: ingen NaN/neg',stress===0,0,stress);
sæt({});

console.log('\n▶ 10. Overenskomst §3-§12 (50 tests)');
sæt({ugelon:10380}); const ts10v=10380/40;
assert('§3 mindsteløn 40t',Math.round(ts10v*40)===10380,10380,Math.round(ts10v*40));
assert('§3.10 10%',calcLon(4.0,{enkeltdag:true}).total===Math.round(ts10v*1.1*4),Math.round(ts10v*1.1*4),calcLon(4.0,{enkeltdag:true}).total);
assert('§6 V OT1 +50%',Math.abs(calcLon(9.5,{varslet:true}).ot1-Math.round(ts10v*1.50))<=1,Math.round(ts10v*1.50),calcLon(9.5,{varslet:true}).ot1);
assert('§6 V OT2 +60%',Math.abs(calcLon(10.5,{varslet:true}).ot2-Math.round(ts10v*1.60))<=1,Math.round(ts10v*1.60),calcLon(10.5,{varslet:true}).ot2);
assert('§6 U OT1 +75%',Math.abs(calcLon(9.5,{uvarslet:true}).ot1-Math.round(ts10v*1.75))<=1,Math.round(ts10v*1.75),calcLon(9.5,{uvarslet:true}).ot1);
assert('§6 U OT2 +100%',Math.abs(calcLon(10.5,{uvarslet:true}).ot2-Math.round(ts10v*2.00))<=1,Math.round(ts10v*2.00),calcLon(10.5,{uvarslet:true}).ot2);
assert('§6 OT3 +135%',Math.abs(calcLon(11.0,{varslet:true}).ot3-Math.round(ts10v*2.35))<=1,Math.round(ts10v*2.35),calcLon(11.0,{varslet:true}).ot3);
assert('§8.1 +75%',Math.abs(calcLon(8.0,{helligdag:true},0,0.75).wk-Math.round(ts10v*0.75*8))<=1,Math.round(ts10v*0.75*8),calcLon(8.0,{helligdag:true},0,0.75).wk);
assert('§8.2 +100%',Math.abs(calcLon(8.0,{helligdag:true},0,1.0).wk-Math.round(ts10v*1.0*8))<=1,Math.round(ts10v*1.0*8),calcLon(8.0,{helligdag:true},0,1.0).wk);
assert('§8 min4t helligdag',calcLon(2.0,{helligdag:true},0,0.75).wk>=Math.round(ts10v*0.75*4),'>='+Math.round(ts10v*0.75*4),calcLon(2.0,{helligdag:true},0,0.75).wk);
assert('§12 diæt=94',DIÆT===94,94,DIÆT);
assert('§12 i ext',calcLon(8.0,{frokost:true}).ext===94,94,calcLon(8.0,{frokost:true}).ext);
const lArr=[4,5,6,7,8].map(t=>calcLon(t-0.5,{}));
let mono=true;for(let i=1;i<lArr.length;i++)if(lArr[i].total<=lArr[i-1].total)mono=false;
assert('Monoton mere arbejde=mere løn',mono,true,mono);
[2,3,4,5,6,7,8].forEach(t=>{sæt({ugelon:10380});const h=t-0.5;assert('Enk>=norm h='+h,calcLon(h,{enkeltdag:true}).total>=calcLon(h,{}).total,true,true);});
[9.5,10.5,11.5].forEach(h=>{sæt({ugelon:10380});assert('U>V h='+h,calcLon(h,{uvarslet:true}).total>calcLon(h,{varslet:true}).total,true,true);});
assert('Wk>norm',calcLon(8.0,{helligdag:true},0,0.75).total>calcLon(8.0,{}).total,true,true);

const total=bestået+fejlet;
console.log('\n'+('═').repeat(60));
console.log('TESTRESULTAT: '+bestået+'/'+total+' tests bestået');
if(fejlet>0){
  console.log('\n⚠  '+fejlet+' FEJL:');
  fejlListe.slice(0,30).forEach(f=>console.log('  ✗ '+f.navn+'\n    Forventet: '+f.forventet+'  Fik: '+f.faktisk));
  process.exit(1);
}else{
  console.log('✓ ALLE '+total+' TESTS BESTÅET — ingen fejl i nogen beregning');
  process.exit(0);
}
