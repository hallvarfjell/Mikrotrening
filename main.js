
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
  // chart window (seconds)
  windowSec: 900, // 15 min
  running: false,
  workout:null,
  phase:'',
  t0: Date.now(),
};

// ---- DOM ----
const el = id=>document.getElementById(id);

// Bind settings
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
    const device = await navigator.bluetooth.requestDevice({
      filters:[{services:['heart_rate']}]
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const char = await service.getCharacteristic('heart_rate_measurement');
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', ev=>{
      const dv = ev.target.value; // DataView
      // Parse per Bluetooth Heart Rate Measurement (0x2A37)
      const flags = dv.getUint8(0);
      const hr16 = flags & 0x01;
      const sensorContactSupported = flags & 0x04;
      const sensorContactDetected = flags & 0x02;
      let index = 1;
      let bpm = hr16 ? dv.getUint16(index, /*littleEndian*/true) : dv.getUint8(index);
      index += hr16 ? 2 : 1;
      STATE.hr = bpm;
      // RR-intervals present?
      const rrPresent = flags & 0x10;
      if(rrPresent){
        const rrVals = [];
        while(index + 1 < dv.byteLength){
          rrVals.push(dv.getUint16(index, true));
          index += 2;
        }
        STATE.rr = rrVals; // in ms/1024 units typically, but we'll just keep raw for now
      }
    });
  } catch(err){
    console.error(err);
    alert('Kunne ikke koble til pulsbelte: '+err);
  }
}

async function connectTreadmill(){
  alert('FTMS for tredemølle kommer i neste steg.');
}

document.getElementById('connect-hr').addEventListener('click', connectHR);
document.getElementById('connect-treadmill').addEventListener('click', connectTreadmill);

// ---- Controls: speed/grade ----
for (const btn of document.querySelectorAll('.speed-btn')){
  btn.addEventListener('click', ()=>{
    const v = Number(btn.dataset.speed);
    STATE.speedKmh = v;
    el('manual-speed').value = String(v);
  });
}
el('manual-speed').addEventListener('change',()=>{
  STATE.speedKmh = Number(el('manual-speed').value)||0;
});
el('manual-grade').addEventListener('change',()=>{
  STATE.gradePct = Number(el('manual-grade').value)||0;
});

// ---- Estimert Watt (førsteordens modell) ----
function estimateWatt(speedKmh, gradePct, massKg){
  // Enkel modell: W ≈ m*g*v*stigning. v i m/s, stigning i brøk (%, ikke grader).
  // Aerodynamikk og rullemotstand neglisjeres i første omgang.
  const g = 9.81;
  const v = speedKmh/3.6; // m/s
  const grade = (gradePct||0)/100;
  const w = massKg * g * v * grade;
  return Math.max(0, Math.round(w));
}

// ---- Slope (endring siste 2 min) ----
function calcSlope(){
  const hrSeries = STATE.series.hr;
  if(hrSeries.length === 0) return null;
  const now = Date.now();
  const cutoff = now - 120_000; // 2 min
  const latest = hrSeries[hrSeries.length-1].y;
  // Finn første punkt eldre enn cutoff
  for(let i=hrSeries.length-1; i>=0; i--){
    if(hrSeries[i].t <= cutoff){
      return Math.round(latest - hrSeries[i].y);
    }
  }
  return null; // ikke nok data enda
}

// ---- Series append & UI update loop ----
function tick(){
  const t = Date.now();
  // Append HR
  if(STATE.hr!=null){ STATE.series.hr.push({t, y: STATE.hr}); }
  // Append speed
  STATE.series.speed.push({t, y: STATE.speedKmh});
  // Append watt
  const w = estimateWatt(STATE.speedKmh, STATE.gradePct, STATE.massKg);
  STATE.series.watt.push({t, y: w});

  // Trim to window
  const cutoff = t - STATE.windowSec*1000;
  for(const k of ['hr','speed','watt']){
    const arr = STATE.series[k];
    while(arr.length && arr[0].t < cutoff) arr.shift();
  }

  // UI
  el('pulse').textContent = STATE.hr!=null ? STATE.hr : '--';
  el('watt').textContent = w || '--';
  const s = calcSlope();
  el('slope').textContent = s!=null ? (s>0?`+${s}`:`${s}`) : '--';

  draw();
}
setInterval(tick, 1000);

// ---- Canvas drawing ----
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width*dpr);
  canvas.height = Math.floor(rect.height*dpr);
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 0);

function draw(){
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  // Padding
  const padL=60*dpr, padR=20*dpr, padT=20*dpr, padB=30*dpr;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const now = Date.now();
  const xmin = now - STATE.windowSec*1000;
  const xmax = now;
  // Axes helpers
  const showHR = el('show-hr').checked;
  const showWatt = el('show-watt').checked;
  const showSpeed = el('show-speed').checked;

  // HR axis
  const hrMin = Number(el('hr-min').value)||80;
  const hrMax = Number(el('hr-max').value)||200;

  // Background: HR zones (roughly based on LT1/LT2: under, mellom, over)
  const z1 = hrMin;
  const z2 = STATE.LT1;
  const z3 = STATE.LT2;
  const z4 = hrMax;
  function yHR(v){ return padT + (1 - (v-hrMin)/(hrMax-hrMin)) * plotH; }

  // Zone bands
  function band(y0, y1, color){ ctx.fillStyle=color; ctx.fillRect(padL, y1, plotW, y0-y1); }
  band(yHR(z1), yHR(z2), '#153e2a'); // under LT1
  band(yHR(z2), yHR(z3), '#1c3d5a'); // LT1-LT2
  band(yHR(z3), yHR(z4), '#5a2d2d'); // over LT2

  // Grid X (time)
  ctx.strokeStyle = '#243142'; ctx.lineWidth = 1; ctx.beginPath();
  for(let sec=0; sec<=STATE.windowSec; sec+=60){
    const t = xmin + sec*1000;
    const x = padL + (t - xmin)/(xmax - xmin) * plotW;
    ctx.moveTo(x, padT); ctx.lineTo(x, padT+plotH);
  }
  ctx.stroke();

  // Grid Y (HR)
  ctx.strokeStyle = '#2a3a4f'; ctx.beginPath();
  for(let v=hrMin; v<=hrMax; v+=10){
    const y = yHR(v);
    ctx.moveTo(padL, y); ctx.lineTo(padL+plotW, y);
  }
  ctx.stroke();

  // Series draw helpers
  function xTime(t){ return padL + (t - xmin)/(xmax - xmin) * plotW; }
  function drawLine(arr, color, ymap){
    if(arr.length<2) return;
    ctx.strokeStyle=color; ctx.lineWidth=2*dpr; ctx.beginPath();
    let moved=false;
    for(const p of arr){
      if(p.t < xmin) continue;
      const x = xTime(p.t), y = ymap(p.y);
      if(!moved){ ctx.moveTo(x,y); moved=true; } else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  if(showHR) drawLine(STATE.series.hr, '#22c55e', yHR);

  // Secondary axes: map speed and watt to HR scale using linear mapping per last mins for visibility
  // Compute dynamic ranges
  const sp = STATE.series.speed.slice(-STATE.series.speed.length);
  const wt = STATE.series.watt.slice(-STATE.series.watt.length);
  const spVals = sp.map(p=>p.y); const wtVals = wt.map(p=>p.y);
  const smin = Math.min( ...(spVals.length?spVals:[0]) );
  const smax = Math.max( ...(spVals.length?spVals:[1]) );
  const wmin = Math.min( ...(wtVals.length?wtVals:[0]) );
  const wmax = Math.max( ...(wtVals.length?wtVals:[1]) );
  const mapSpeedToHR = v => yHR( hrMin + (hrMax-hrMin) * ( (v - smin) / Math.max(1e-6, (smax-smin)) ) );
  const mapWattToHR  = v => yHR( hrMin + (hrMax-hrMin) * ( (v - wmin) / Math.max(1e-6, (wmax-wmin)) ) );

  if(showSpeed) drawLine(STATE.series.speed, '#0ea5e9', mapSpeedToHR);
  if(showWatt) drawLine(STATE.series.watt, '#f59e0b', mapWattToHR);

  // Axes labels
  ctx.fillStyle = '#9fb0c6'; ctx.font = `${12*dpr}px system-ui`;
  ctx.fillText('bpm', 8*dpr, 14*dpr);
  // HR ticks
  for(let v=hrMin; v<=hrMax; v+=20){ ctx.fillText(String(v), 20*dpr, yHR(v)+4*dpr); }

  // Legend
  const legend = [['Puls','#22c55e', showHR], ['Watt','#f59e0b', showWatt], ['Fart','#0ea5e9', showSpeed]];
  let lx = padL+10*dpr, ly = padT+10*dpr;
  for(const [name,color,vis] of legend){
    ctx.globalAlpha = vis?1:0.25;
    ctx.fillStyle = color; ctx.fillRect(lx, ly-8*dpr, 14*dpr, 4*dpr); ctx.globalAlpha=1;
    ctx.fillStyle = '#c6d0df'; ctx.fillText(name, lx+20*dpr, ly);
    lx += 90*dpr;
  }
}

// ---- Workout engine (basic) ----
const PRESETS = {
  '6x5': { name:'6×5 min', reps:6, workSec:300, restSec:60 },
  '10x4':{ name:'10×4 min', reps:10, workSec:240, restSec:60 },
  '6x6': { name:'6×6 min', reps:6, workSec:360, restSec:60 },
  '8x6': { name:'8×6 min', reps:8, workSec:360, restSec:60 },
};

for(const btn of document.querySelectorAll('.preset')){
  btn.addEventListener('click', ()=>{
    const key = btn.dataset.set;
    const p = PRESETS[key];
    STATE.workout = { ...p, rep:1, phase:'work', tLeft:p.workSec };
    updateWorkoutUI();
    localStorage.setItem('lastPreset', key);
  });
}

function updateWorkoutUI(){
  if(!STATE.workout){ el('current-interval').textContent = 'Ingen økt valgt'; el('phase').textContent='–'; el('timer').textContent='00:00'; return; }
  const w = STATE.workout;
  el('current-interval').textContent = `${w.name} (pause ${fmtMMSS(w.restSec)})`;
  el('phase').textContent = `${w.phase==='work'?'Drag':'Pause'} – rep ${w.rep}/${w.reps}`;
  el('timer').textContent = fmtMMSS(w.tLeft);
  const total = (w.phase==='work'?w.workSec:w.restSec);
  const pct = 100 * (1 - w.tLeft/total);
  document.getElementById('progress').style.width = `${pct}%`;
}

function fmtMMSS(s){ const m = Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }

let workoutTicker = null;

el('start-workout').addEventListener('click', ()=>{
  if(!STATE.workout){ const lp = localStorage.getItem('lastPreset'); if(lp && PRESETS[lp]){ document.querySelector(`.preset[data-set="${lp}"]`).click(); } else { document.querySelector('.preset').click(); } }
  if(workoutTicker) return; // already running
  workoutTicker = setInterval(()=>{
    if(!STATE.workout) return;
    STATE.workout.tLeft -= 1;
    if(STATE.workout.tLeft <= 0){
      advanceWorkout();
    }
    updateWorkoutUI();
  }, 1000);
});

el('pause-workout').addEventListener('click', ()=>{
  if(workoutTicker){ clearInterval(workoutTicker); workoutTicker=null; }
});

el('reset-workout').addEventListener('click', ()=>{
  if(workoutTicker){ clearInterval(workoutTicker); workoutTicker=null; }
  STATE.workout = null; updateWorkoutUI();
});

function advanceWorkout(){
  const w = STATE.workout; if(!w) return;
  if(w.phase==='work'){
    w.phase='rest'; w.tLeft=w.restSec;
  } else {
    if(w.rep < w.reps){ w.rep+=1; w.phase='work'; w.tLeft=w.workSec; } else { // done
      el('phase').textContent='Ferdig!';
      if(workoutTicker){ clearInterval(workoutTicker); workoutTicker=null; }
    }
  }
}

// ---- PWA: Service worker ----
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  });
}
