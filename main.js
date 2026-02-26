
// ---- App State ----
const STATE = {
  hr: null,
  rr: [],
  speedKmh: 0,
  gradePct: 0,
  massKg: Number(localStorage.getItem('massKg')||75),
  LT1: Number(localStorage.getItem('LT1')||135),
  LT2: Number(localStorage.getItem('LT2')||160),
  series:{hr:[], speed:[], watt:[]},
  windowSec: 900,
  workout:null,
  ticker:null,
};
const el=id=>document.getElementById(id);

// ---- Settings ----
['mass-kg','lt1','lt2'].forEach(k=>{
  const map={ 'mass-kg':'massKg','lt1':'LT1','lt2':'LT2' }[k];
  if(map) el(k).value = STATE[map];
  el(k).addEventListener('change',()=>{
    const v = Number(el(k).value);
    STATE[map] = isNaN(v)?STATE[map]:v;
    localStorage.setItem(map, STATE[map]);
  });
});

// ---- BLE: Heart Rate ----
async function connectHR(){
  try{
    if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth');
    const device = await navigator.bluetooth.requestDevice({ filters:[{ services:['heart_rate'] }] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const char = await service.getCharacteristic('heart_rate_measurement');
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', ev=>{
      const dv=ev.target.value; const flags=dv.getUint8(0); const hr16=flags & 0x01; let i=1; const bpm = hr16? dv.getUint16(i,true): dv.getUint8(i); STATE.hr=bpm;
    });
  }catch(e){ console.error(e); alert('Kunne ikke koble til pulsbelte: '+e); }
}

document.getElementById('connect-hr').addEventListener('click', connectHR);

// ---- BLE: FTMS (read-only) ----
async function connectTreadmill(){
  try{
    if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth');
    const device = await navigator.bluetooth.requestDevice({ filters:[{ services:[0x1826] }] });
    const server = await device.gatt.connect();
    const ftms = await server.getPrimaryService(0x1826);
    const tdc = await ftms.getCharacteristic('00002ACD-0000-1000-8000-00805F9B34FB');
    await tdc.startNotifications();
    const status = el('ftms-status');
    status.textContent = 'FTMS: Tilkoblet'; status.classList.add('connected');
    tdc.addEventListener('characteristicvaluechanged', ev=>{
      const dv=ev.target.value; let idx=0; const flags=dv.getUint16(idx,true); idx+=2;
      const INST=1<<0, AVG=1<<1, DIST=1<<2, INCL=1<<3;
      if(flags & INST){ const ms = dv.getUint16(idx,true)/100; idx+=2; const kmh=ms*3.6; STATE.speedKmh = Math.round(kmh*100)/100; el('manual-speed').value=String(STATE.speedKmh); }
      if(flags & AVG){ idx+=2; }
      if(flags & DIST){ idx+=3; }
      if(flags & INCL){ const rawIncl=dv.getInt16(idx,true); idx+=2; idx+=2; const grade=rawIncl/10; STATE.gradePct = Math.round(grade*10)/10; el('manual-grade').value=String(STATE.gradePct); }
    });
    device.addEventListener('gattserverdisconnected', ()=>{ status.textContent='FTMS: Frakoblet'; status.classList.remove('connected'); });
  }catch(e){ console.error(e); alert('Kunne ikke koble til tredemølle: '+e); }
}

document.getElementById('connect-treadmill').addEventListener('click', connectTreadmill);

// ---- Manual overrides ----
for(const btn of document.querySelectorAll('.speed-btn')){
  btn.addEventListener('click', ()=>{ const v=Number(btn.dataset.speed); STATE.speedKmh=v; el('manual-speed').value=String(v); });
}
el('manual-speed').addEventListener('change',()=>{ STATE.speedKmh = Number(el('manual-speed').value)||0; });
el('manual-grade').addEventListener('change',()=>{ STATE.gradePct = Number(el('manual-grade').value)||0; });

// ---- Power estimate ----
function estimateWatt(speedKmh, gradePct, massKg){ const g=9.81, v=speedKmh/3.6, grade=(gradePct||0)/100; return Math.max(0, Math.round(massKg*g*v*grade)); }

// ---- Slope (2 min delta) ----
function calcSlope(){ const s=STATE.series.hr; if(!s.length) return null; const now=Date.now(); const cutoff=now-120000; const latest=s[s.length-1].y; for(let i=s.length-1;i>=0;i--){ if(s[i].t<=cutoff) return Math.round(latest - s[i].y);} return null; }

// ---- Workout Engine (Option A: Warmup + Intervals + Cooldown) ----
const PRESETS = {
  '6x5': { name:'6×5 min', reps:6, workSec:300, restSec:60 },
  '10x4':{ name:'10×4 min', reps:10, workSec:240, restSec:60 },
  '6x6': { name:'6×6 min', reps:6, workSec:360, restSec:60 },
  '8x6': { name:'8×6 min', reps:8, workSec:360, restSec:60 },
};
const DEFAULTS = { warmupSec:600, cooldownSec:600 };

for(const btn of document.querySelectorAll('.preset')){
  btn.addEventListener('click', ()=>{
    const key = btn.dataset.set; const p = PRESETS[key];
    STATE.workout = {
      name: p.name,
      reps: p.reps,
      workSec: p.workSec,
      restSec: p.restSec,
      warmupSec: DEFAULTS.warmupSec,
      cooldownSec: DEFAULTS.cooldownSec,
      phase: 'warmup',
      rep: 0,
      tLeft: DEFAULTS.warmupSec,
    };
    updateWorkoutUI();
    localStorage.setItem('lastPreset', key);
  });
}

function startTicker(){ if(STATE.ticker) return; STATE.ticker = setInterval(tickWorkout, 1000); }
function stopTicker(){ if(STATE.ticker){ clearInterval(STATE.ticker); STATE.ticker=null; } }

function tickWorkout(){
  if(!STATE.workout) return;
  const w = STATE.workout;
  if(w.phase==='done') { stopTicker(); return; }
  w.tLeft -= 1;
  if(w.tLeft <= 0){ advancePhase(); }
  updateWorkoutUI();
}

function advancePhase(){
  const w = STATE.workout; if(!w) return;
  switch(w.phase){
    case 'warmup':
      w.phase='work'; w.rep=1; w.tLeft=w.workSec; break;
    case 'work':
      if(w.rep < w.reps){ w.phase='rest'; w.tLeft=w.restSec; } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; }
      break;
    case 'rest':
      w.rep += 1; w.phase='work'; w.tLeft=w.workSec; break;
    case 'cooldown':
      w.phase='done'; w.tLeft=0; break;
  }
}

function skipWarmup(){ const w=STATE.workout; if(!w) return; if(w.phase==='warmup'){ w.phase='work'; w.rep=1; w.tLeft=w.workSec; updateWorkoutUI(); }}
function skipCooldown(){ const w=STATE.workout; if(!w) return; if(w.phase==='cooldown'){ w.phase='done'; w.tLeft=0; updateWorkoutUI(); stopTicker(); }}

el('skip-warmup').addEventListener('click', skipWarmup);
el('skip-cooldown').addEventListener('click', skipCooldown);

el('start-workout').addEventListener('click', ()=>{
  if(!STATE.workout){ const lp=localStorage.getItem('lastPreset'); const k=(lp && PRESETS[lp])?lp:'6x5'; document.querySelector(`.preset[data-set="${k}"]`).click(); }
  startTicker();
});

el('pause-workout').addEventListener('click', ()=>{ if(STATE.ticker){ stopTicker(); } else { startTicker(); } });

el('reset-workout').addEventListener('click', ()=>{ stopTicker(); STATE.workout=null; updateWorkoutUI(); });

function fmtMMSS(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }

function updateWorkoutUI(){
  const ci = el('current-interval'); const ph = el('phase'); const tmr = el('timer'); const bar = el('progress');
  if(!STATE.workout){ ci.textContent='Ingen økt valgt'; ph.textContent='–'; tmr.textContent='00:00'; bar.style.width='0%'; return; }
  const w = STATE.workout;
  ci.textContent = `${w.name} (pause ${fmtMMSS(w.restSec)})`;
  let label=''; let total=0; let repText='';
  if(w.phase==='warmup'){ label='Oppvarming'; total=w.warmupSec; }
  else if(w.phase==='work'){ label='Drag'; total=w.workSec; repText=` – rep ${w.rep}/${w.reps}`; }
  else if(w.phase==='rest'){ label='Pause'; total=w.restSec; repText=` – rep ${w.rep}/${w.reps}`; }
  else if(w.phase==='cooldown'){ label='Nedkjøling'; total=w.cooldownSec; }
  else if(w.phase==='done'){ label='Ferdig!'; total=1; }
  ph.textContent = `${label}${repText}`;
  tmr.textContent = fmtMMSS(w.tLeft);
  const pct = Math.min(100, Math.max(0, 100*(1 - (w.tLeft/Math.max(1,total)))));
  bar.style.width = `${pct}%`;
}

// ---- Series + UI periodic updates ----
function tick(){
  const t=Date.now();
  if(STATE.hr!=null) STATE.series.hr.push({t,y:STATE.hr});
  STATE.series.speed.push({t,y:STATE.speedKmh});
  const w=estimateWatt(STATE.speedKmh, STATE.gradePct, STATE.massKg); STATE.series.watt.push({t,y:w});
  const cutoff=t-STATE.windowSec*1000; for(const k of ['hr','speed','watt']){ const arr=STATE.series[k]; while(arr.length && arr[0].t<cutoff) arr.shift(); }
  el('pulse').textContent = STATE.hr!=null?STATE.hr:'--';
  el('watt').textContent = w||'--';
  const s=calcSlope(); el('slope').textContent = s!=null ? (s>0?`+${s}`:`${s}`) : '--';
  draw();
}
setInterval(tick, 1000);

// ---- Canvas drawing ----
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
function resizeCanvas(){ const rect = canvas.getBoundingClientRect(); canvas.width = Math.floor(rect.width*dpr); canvas.height = Math.floor(rect.height*dpr); }
window.addEventListener('resize', resizeCanvas); setTimeout(resizeCanvas,0);

function draw(){
  const W=canvas.width,H=canvas.height; ctx.clearRect(0,0,W,H);
  const padL=60*dpr,padR=20*dpr,padT=20*dpr,padB=30*dpr; const plotW=W-padL-padR, plotH=H-padT-padB; const now=Date.now(); const xmin=now-STATE.windowSec*1000, xmax=now;
  const showHR=el('show-hr').checked, showWatt=el('show-watt').checked, showSpeed=el('show-speed').checked;
  const hrMin=Number(el('hr-min').value)||80, hrMax=Number(el('hr-max').value)||200; const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin))*plotH;
  // Zones background (under LT1, LT1-LT2, over LT2)
  function band(y0,y1,color){ ctx.fillStyle=color; ctx.fillRect(padL,y1,plotW,y0-y1); }
  band(yHR(hrMin), yHR(STATE.LT1), '#153e2a');
  band(yHR(STATE.LT1), yHR(STATE.LT2), '#1c3d5a');
  band(yHR(STATE.LT2), yHR(hrMax), '#5a2d2d');
  // Grid X (minute lines)
  ctx.strokeStyle='#243142'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=STATE.windowSec; sec+=60){ const t=xmin+sec*1000; const x=padL+(t-xmin)/(xmax-xmin)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke();
  // Grid Y (HR 10-bpm)
  ctx.strokeStyle='#2a3a4f'; ctx.beginPath(); for(let v=hrMin; v<=hrMax; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke();
  function xTime(t){ return padL + (t-xmin)/(xmax-xmin)*plotW; }
  function drawLine(arr,color,ymap){ if(arr.length<2) return; ctx.strokeStyle=color; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ if(p.t<xmin) continue; const x=xTime(p.t), y=ymap(p.y); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); }
  if(showHR) drawLine(STATE.series.hr, '#22c55e', yHR);
  const sp=STATE.series.speed, wt=STATE.series.watt; const spVals=sp.map(p=>p.y), wtVals=wt.map(p=>p.y);
  const smin=Math.min(...(spVals.length?spVals:[0])), smax=Math.max(...(spVals.length?spVals:[1]));
  const wmin=Math.min(...(wtVals.length?wtVals:[0])), wmax=Math.max(...(wtVals.length?wtVals:[1]));
  const mapSpeed=v=> yHR(hrMin + (hrMax-hrMin) * ((v - smin) / Math.max(1e-6,(smax-smin))));
  const mapWatt=v => yHR(hrMin + (hrMax-hrMin) * ((v - wmin) / Math.max(1e-6,(wmax-wmin))));
  if(showSpeed) drawLine(sp, '#0ea5e9', mapSpeed);
  if(showWatt) drawLine(wt, '#f59e0b', mapWatt);
  // Labels + legend
  ctx.fillStyle='#9fb0c6'; ctx.font=`${12*dpr}px system-ui`; ctx.fillText('bpm', 8*dpr, 14*dpr);
  for(let v=hrMin; v<=hrMax; v+=20){ ctx.fillText(String(v), 20*dpr, yHR(v)+4*dpr); }
  const legend=[['Puls','#22c55e',showHR],['Watt','#f59e0b',showWatt],['Fart','#0ea5e9',showSpeed]]; let lx=padL+10*dpr, ly=padT+10*dpr; for(const [name,color,vis] of legend){ ctx.globalAlpha=vis?1:0.25; ctx.fillStyle=color; ctx.fillRect(lx, ly-8*dpr, 14*dpr, 4*dpr); ctx.globalAlpha=1; ctx.fillStyle='#c6d0df'; ctx.fillText(name, lx+20*dpr, ly); lx+=90*dpr; }
}

// ---- PWA Service Worker ----
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./service-worker.js').catch(console.error); }); }
