
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
};

const el = id=>document.getElementById(id);

// Settings bind
el('mass-kg').value = STATE.massKg;
el('lt1').value = STATE.LT1;
el('lt2').value = STATE.LT2;
['mass-kg','lt1','lt2'].forEach(k=>{
  el(k).addEventListener('change',()=>{
    if(k==='mass-kg'){ STATE.massKg = Number(el('mass-kg').value)||75; localStorage.setItem('massKg', STATE.massKg); }
    if(k==='lt1'){ STATE.LT1 = Number(el('lt1').value)||135; localStorage.setItem('LT1', STATE.LT1); }
    if(k==='lt2'){ STATE.LT2 = Number(el('lt2').value)||160; localStorage.setItem('LT2', STATE.LT2); }
  });
});

// ---- BLE: Heart Rate ----
async function connectHR(){
  try {
    if(!('bluetooth' in navigator)){
      alert('Nettleseren støtter ikke Web Bluetooth');
      return;
    }
    const device = await navigator.bluetooth.requestDevice({ filters:[{services:['heart_rate']}] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const char = await service.getCharacteristic('heart_rate_measurement');
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', ev=>{
      const dv = ev.target.value;
      const flags = dv.getUint8(0);
      const hr16 = flags & 0x01;
      let idx = 1;
      const bpm = hr16 ? dv.getUint16(idx,true) : dv.getUint8(idx);
      idx += hr16 ? 2 : 1;
      STATE.hr = bpm;
    });
  } catch(err){ console.error(err); alert('Kunne ikke koble til pulsbelte: '+err); }
}

document.getElementById('connect-hr').addEventListener('click', connectHR);

// ---- BLE: FTMS (Treadmill) READ-ONLY in this step ----
async function connectTreadmill(){
  try{
    if(!('bluetooth' in navigator)){
      alert('Nettleseren støtter ikke Web Bluetooth');
      return;
    }
    // Request a device exposing the Fitness Machine Service (0x1826)
    const device = await navigator.bluetooth.requestDevice({
      filters:[{ services:[0x1826] }]
    });
    const server = await device.gatt.connect();
    const ftms = await server.getPrimaryService(0x1826);

    // Treadmill Data characteristic UUID = 0x2ACD
    const tdc = await ftms.getCharacteristic('00002ACD-0000-1000-8000-00805F9B34FB');
    await tdc.startNotifications();

    const status = document.getElementById('ftms-status');
    status.textContent = 'FTMS: Tilkoblet';
    status.classList.add('connected');

    tdc.addEventListener('characteristicvaluechanged', ev=>{
      const dv = ev.target.value; // DataView
      let idx = 0;
      const flags = dv.getUint16(idx, true); idx += 2;

      const FLAG_INST_SPEED = 1<<0;   // instantaneous speed present
      const FLAG_AVG_SPEED  = 1<<1;   // average speed present
      const FLAG_TOTAL_DIST = 1<<2;   // total distance present (uint24)
      const FLAG_INCLINE    = 1<<3;   // inclination and ramp angle present

      // Instantaneous speed (uint16, 0.01 m/s) per FTMS; convert to km/h
      if(flags & FLAG_INST_SPEED){
        const raw = dv.getUint16(idx, true); idx += 2;
        const ms = raw / 100; // m/s
        const kmh = ms * 3.6;
        STATE.speedKmh = Math.max(0, Math.round(kmh*100)/100);
        el('manual-speed').value = String(STATE.speedKmh);
      }
      if(flags & FLAG_AVG_SPEED){ idx += 2; }
      if(flags & FLAG_TOTAL_DIST){ idx += 3; }
      if(flags & FLAG_INCLINE){
        const rawIncl = dv.getInt16(idx, true); idx += 2; // 0.1%
        const rawRamp  = dv.getInt16(idx, true); idx += 2; // skip ramp angle setting
        const grade = rawIncl / 10; // %
        STATE.gradePct = Math.round(grade*10)/10;
        el('manual-grade').value = String(STATE.gradePct);
      }
    });

    device.addEventListener('gattserverdisconnected', ()=>{
      status.textContent = 'FTMS: Frakoblet';
      status.classList.remove('connected');
    });
  }catch(err){
    console.error(err);
    alert('Kunne ikke koble til tredemølle: '+err);
  }
}

document.getElementById('connect-treadmill').addEventListener('click', connectTreadmill);

// ---- Controls: manual override ----
for (const btn of document.querySelectorAll('.speed-btn')){
  btn.addEventListener('click', ()=>{
    const v = Number(btn.dataset.speed);
    STATE.speedKmh = v;
    el('manual-speed').value = String(v);
  });
}
el('manual-speed').addEventListener('change',()=>{ STATE.speedKmh = Number(el('manual-speed').value)||0; });
el('manual-grade').addEventListener('change',()=>{ STATE.gradePct = Number(el('manual-grade').value)||0; });

// ---- Estimert Watt (førsteordens modell) ----
function estimateWatt(speedKmh, gradePct, massKg){
  const g = 9.81; const v = speedKmh/3.6; const grade = (gradePct||0)/100; const w = massKg*g*v*grade; return Math.max(0, Math.round(w));
}

// ---- Slope (endring siste 2 min) ----
function calcSlope(){
  const hrS = STATE.series.hr; if(hrS.length===0) return null; const now=Date.now(), cutoff=now-120000; const latest=hrS[hrS.length-1].y; for(let i=hrS.length-1;i>=0;i--){ if(hrS[i].t<=cutoff) return Math.round(latest-hrS[i].y);} return null;
}

// ---- Tick loop ----
function tick(){
  const t = Date.now();
  if(STATE.hr!=null){ STATE.series.hr.push({t, y: STATE.hr}); }
  STATE.series.speed.push({t, y: STATE.speedKmh});
  const w = estimateWatt(STATE.speedKmh, STATE.gradePct, STATE.massKg); STATE.series.watt.push({t, y: w});
  const cutoff = t - STATE.windowSec*1000; for(const k of ['hr','speed','watt']){ const arr=STATE.series[k]; while(arr.length && arr[0].t<cutoff) arr.shift(); }
  el('pulse').textContent = STATE.hr!=null?STATE.hr:'--'; el('watt').textContent = w||'--';
  const s=calcSlope(); el('slope').textContent = s!=null ? (s>0?`+${s}`:`${s}`) : '--';
  draw();
}
setInterval(tick, 1000);

// ---- Canvas drawing ----
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
function resizeCanvas(){ const rect=canvas.getBoundingClientRect(); canvas.width=Math.floor(rect.width*dpr); canvas.height=Math.floor(rect.height*dpr);} window.addEventListener('resize', resizeCanvas); setTimeout(resizeCanvas, 0);

function draw(){
  const W=canvas.width,H=canvas.height; ctx.clearRect(0,0,W,H);
  const padL=60*dpr, padR=20*dpr, padT=20*dpr, padB=30*dpr; const plotW=W-padL-padR, plotH=H-padT-padB; const now=Date.now(); const xmin=now-STATE.windowSec*1000, xmax=now;
  const showHR=el('show-hr').checked, showWatt=el('show-watt').checked, showSpeed=el('show-speed').checked;
  const hrMin=Number(el('hr-min').value)||80, hrMax=Number(el('hr-max').value)||200; const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin))*plotH;
  // Zones
  function band(y0,y1,color){ ctx.fillStyle=color; ctx.fillRect(padL,y1,plotW,y0-y1);} band(yHR(hrMin), yHR(STATE.LT1), '#153e2a'); band(yHR(STATE.LT1), yHR(STATE.LT2), '#1c3d5a'); band(yHR(STATE.LT2), yHR(hrMax), '#5a2d2d');
  // Grid
  ctx.strokeStyle='#243142'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=STATE.windowSec; sec+=60){ const t=xmin+sec*1000; const x=padL+(t-xmin)/(xmax-xmin)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke();
  ctx.strokeStyle='#2a3a4f'; ctx.beginPath(); for(let v=hrMin; v<=hrMax; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke();
  // Series
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
  // Labels
  ctx.fillStyle='#9fb0c6'; ctx.font=`${12*dpr}px system-ui`; ctx.fillText('bpm', 8*dpr, 14*dpr); for(let v=hrMin; v<=hrMax; v+=20){ ctx.fillText(String(v), 20*dpr, yHR(v)+4*dpr);} const legend=[['Puls','#22c55e',showHR],['Watt','#f59e0b',showWatt],['Fart','#0ea5e9',showSpeed]]; let lx=padL+10*dpr, ly=padT+10*dpr; for(const [name,color,vis] of legend){ ctx.globalAlpha=vis?1:0.25; ctx.fillStyle=color; ctx.fillRect(lx, ly-8*dpr, 14*dpr, 4*dpr); ctx.globalAlpha=1; ctx.fillStyle='#c6d0df'; ctx.fillText(name, lx+20*dpr, ly); lx+=90*dpr; }
}

// ---- Workout engine (unchanged) ----
const PRESETS = {
  '6x5': { name:'6×5 min', reps:6, workSec:300, restSec:60 },
  '10x4':{ name:'10×4 min', reps:10, workSec:240, restSec:60 },
  '6x6': { name:'6×6 min', reps:6, workSec:360, restSec:60 },
  '8x6': { name:'8×6 min', reps:8, workSec:360, restSec:60 },
};
for(const btn of document.querySelectorAll('.preset')){ btn.addEventListener('click', ()=>{ const key=btn.dataset.set; const p=PRESETS[key]; STATE.workout={...p, rep:1, phase:'work', tLeft:p.workSec}; updateWorkoutUI(); localStorage.setItem('lastPreset', key); }); }
function updateWorkoutUI(){ if(!STATE.workout){ el('current-interval').textContent='Ingen økt valgt'; el('phase').textContent='–'; el('timer').textContent='00:00'; return;} const w=STATE.workout; el('current-interval').textContent=`${w.name} (pause ${fmtMMSS(w.restSec)})`; el('phase').textContent=`${w.phase==='work'?'Drag':'Pause'} – rep ${w.rep}/${w.reps}`; el('timer').textContent=fmtMMSS(w.tLeft); const total=(w.phase==='work'?w.workSec:w.restSec); const pct=100*(1-w.tLeft/total); document.getElementById('progress').style.width=`${pct}%`; }
function fmtMMSS(s){ const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
let workoutTicker=null; el('start-workout').addEventListener('click', ()=>{ if(!STATE.workout){ const lp=localStorage.getItem('lastPreset'); if(lp && PRESETS[lp]){ document.querySelector(`.preset[data-set="${lp}"]`).click(); } else { document.querySelector('.preset').click(); } } if(workoutTicker) return; workoutTicker=setInterval(()=>{ if(!STATE.workout) return; STATE.workout.tLeft-=1; if(STATE.workout.tLeft<=0){ advanceWorkout(); } updateWorkoutUI(); },1000); }); el('pause-workout').addEventListener('click', ()=>{ if(workoutTicker){ clearInterval(workoutTicker); workoutTicker=null; } }); el('reset-workout').addEventListener('click', ()=>{ if(workoutTicker){ clearInterval(workoutTicker); workoutTicker=null; } STATE.workout=null; updateWorkoutUI(); });
function advanceWorkout(){ const w=STATE.workout; if(!w) return; if(w.phase==='work'){ w.phase='rest'; w.tLeft=w.restSec; } else { if(w.rep<w.reps){ w.rep+=1; w.phase='work'; w.tLeft=w.workSec; } else { document.getElementById('phase').textContent='Ferdig!'; if(workoutTicker){ clearInterval(workoutTicker); workoutTicker=null; } } } }

// ---- PWA SW ----
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./service-worker.js').catch(console.error); }); }
