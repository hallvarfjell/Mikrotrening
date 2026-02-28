
// ---- App State ----
const STATE = {
  hr: null,
  rr: [],
  speedKmh: 0,
  gradePct: 0,
  massKg: Number(localStorage.getItem('massKg')||75),
  LT1: Number(localStorage.getItem('LT1')||135),
  LT2: Number(localStorage.getItem('LT2')||160),
  series:{hr:[], speed:[], watt:[], rpe:[]},
  windowSec: 900,
  workout:null,
  ticker:null,
  wakeLock:null,
  rpe: 0,
  rpeByRep: {},
  logger: { active:false, points:[], startTs:null, dist:0 },
  ghost: { enabled:false, ids:new Set(), avg:null },
  cal: { K: Number(localStorage.getItem('calK')||1.0), Crun: Number(localStorage.getItem('cRun')||1.0) }
};
const el=id=>document.getElementById(id);
const getPref=(k,def)=>{ const v=localStorage.getItem(k); return v==null?def:JSON.parse(v); };

// ---- Wake Lock ----
async function requestWakeLock(){ try{ if('wakeLock' in navigator){ STATE.wakeLock = await navigator.wakeLock.request('screen'); STATE.wakeLock.addEventListener('release', ()=>{ STATE.wakeLock=null; }); } }catch(e){ console.warn('WakeLock failed', e); }}
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && !STATE.wakeLock){ requestWakeLock(); }});
requestWakeLock();

// ---- Settings wiring ----
['mass-kg','lt1','lt2','cal-k','c-run'].forEach(k=>{
  if(!el(k)) return; const map={ 'mass-kg':'massKg','lt1':'LT1','lt2':'LT2','cal-k':'calK','c-run':'cRun' };
  let init = getPref(map[k], (k==='cal-k'?1.0:(k==='c-run'?1.0:STATE[ map[k] ])) );
  el(k).value = init;
  el(k).addEventListener('change',()=>{
    const v = Number(el(k).value);
    if(k==='cal-k'){ STATE.cal.K = isNaN(v)?STATE.cal.K:v; localStorage.setItem('calK', STATE.cal.K); }
    else if(k==='c-run'){ STATE.cal.Crun = isNaN(v)?STATE.cal.Crun:v; localStorage.setItem('cRun', STATE.cal.Crun); }
    else { const key=map[k]; STATE[key] = isNaN(v)?STATE[key]:v; localStorage.setItem(key, STATE[key]); }
  });
});

// ---- BLE: Heart Rate ----
async function connectHR(){ try{ if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth'); const device=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]}); const server=await device.gatt.connect(); const service=await server.getPrimaryService('heart_rate'); const ch=await service.getCharacteristic('heart_rate_measurement'); await ch.startNotifications(); ch.addEventListener('characteristicvaluechanged', ev=>{ const dv=ev.target.value; const flags=dv.getUint8(0); const hr16=flags&1; let i=1; const bpm=hr16? dv.getUint16(i,true):dv.getUint8(i); STATE.hr=bpm; }); }catch(e){ console.error(e); alert('Kunne ikke koble til pulsbelte: '+e);} }
el('connect-hr')?.addEventListener('click', connectHR);

// ---- BLE: FTMS (read-only) ----
async function connectTreadmill(){ try{ if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth'); const device=await navigator.bluetooth.requestDevice({filters:[{services:[0x1826]}]}); const server=await device.gatt.connect(); const ftms=await server.getPrimaryService(0x1826); const tdc=await ftms.getCharacteristic('00002ACD-0000-1000-8000-00805F9B34FB'); await tdc.startNotifications(); const status=el('ftms-status'); if(status){ status.textContent='FTMS: Tilkoblet'; status.classList.add('connected'); }
  tdc.addEventListener('characteristicvaluechanged', ev=>{ const dv=ev.target.value; let idx=0; const flags=dv.getUint16(idx,true); idx+=2; const INST=1<<0, AVG=1<<1, DIST=1<<2, INCL=1<<3; if(flags&INST){ const ms=dv.getUint16(idx,true)/100; idx+=2; const kmh=ms*3.6; setSpeed(kmh); } if(flags&AVG){ idx+=2;} if(flags&DIST){ idx+=3;} if(flags&INCL){ const rawIncl=dv.getInt16(idx,true); idx+=2; idx+=2; setGrade(rawIncl/10);} }); device.addEventListener('gattserverdisconnected', ()=>{ if(status){ status.textContent='FTMS: Frakoblet'; status.classList.remove('connected'); } }); }catch(e){ console.error(e); alert('Kunne ikke koble til tredemølle: '+e);} }
el('connect-treadmill')?.addEventListener('click', connectTreadmill);

// ---- Manual overrides & steppers ----
function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
function setSpeed(v){ STATE.speedKmh = Math.max(0, Number(v)||0); el('manual-speed') && (el('manual-speed').value = STATE.speedKmh.toFixed(1)); }
function setGrade(v){ STATE.gradePct = Number(v)||0; el('manual-grade') && (el('manual-grade').value = STATE.gradePct.toFixed(1)); }
for(const btn of document.querySelectorAll('.speed-btn')){ btn.addEventListener('click', ()=> setSpeed(Number(btn.dataset.speed))); }
el('manual-speed')?.addEventListener('change',()=> setSpeed(el('manual-speed').value));
el('manual-grade')?.addEventListener('change',()=> setGrade(el('manual-grade').value));
el('speed-dec')?.addEventListener('click', ()=> setSpeed(STATE.speedKmh-0.1));
el('speed-inc')?.addEventListener('click', ()=> setSpeed(STATE.speedKmh+0.1));
el('grade-dec')?.addEventListener('click', ()=> setGrade(STATE.gradePct-0.5));
el('grade-inc')?.addEventListener('click', ()=> setGrade(STATE.gradePct+0.5));

// ---- RPE nå (±0.5) ----
function applyRPEChange(delta){ STATE.rpe = clamp((Number(el('rpe-now').value)||0)+delta,0,10); el('rpe-now').value = STATE.rpe.toFixed(1); }
el('rpe-dec')?.addEventListener('click', ()=> applyRPEChange(-0.5));
el('rpe-inc')?.addEventListener('click', ()=> applyRPEChange(+0.5));
el('rpe-now')?.addEventListener('change', ()=> applyRPEChange(0));

// ---- External work power model ----
function estimateWattExternal(speedKmh, gradePct, massKg, Crun, K){
  const g=9.81, v=(speedKmh||0)/3.6, grade=(gradePct||0)/100; // v in m/s
  const mech = massKg * (g * v * grade + Crun * v);
  return Math.max(0, Math.round(mech * (K||1)));
}

// ---- Display speed override during REST for visual only ----
function displaySpeedKmh(){ if(STATE.workout && (STATE.workout.phase==='rest' || STATE.workout.phase==='seriesrest')) return 0; return STATE.speedKmh; }

// ---- Logger helpers ----
function startLogger(){ STATE.logger.active=true; STATE.logger.startTs=Date.now(); STATE.logger.points=[]; STATE.logger.dist=0; // write initial sample immediately
  writeSample(STATE.logger.startTs);
}
function stopLogger(){ STATE.logger.active=false; }

function writeSample(t){ const dispSpeed=displaySpeedKmh(); const speed_ms=dispSpeed/3.6; const w=estimateWattExternal(dispSpeed, STATE.gradePct, STATE.massKg, STATE.cal.Crun, STATE.cal.K); const wstate=STATE.workout; // ensure phase/rep captured
  STATE.logger.dist += speed_ms * (STATE.logger.points.length? (t-STATE.logger.points[STATE.logger.points.length-1].ts)/1000 : 0);
  STATE.logger.points.push({ ts:t, iso:new Date(t).toISOString(), hr:STATE.hr||0, speed_ms, grade:STATE.gradePct||0, dist_m:STATE.logger.dist, rpe:STATE.rpe, phase:wstate?wstate.phase:'', rep:wstate&&wstate.phase==='work'?wstate.rep:0, watt:w });
}

// ---- Ghost dropdown (unchanged scaffolding) ----
function buildGhostMenu(){ const list=el('ghost-list'); if(!list) return; list.innerHTML=''; const sessions = JSON.parse(localStorage.getItem('sessions')||'[]'); if(!sessions.length){ list.innerHTML='<div class="muted">Ingen lagrede økter</div>'; return; } sessions.slice().reverse().forEach(s=>{ const dt=new Date(s.startedAt||Date.now()); const id=s.id; const row=document.createElement('label'); row.className='menu-item'; const cb=document.createElement('input'); cb.type='checkbox'; cb.value=id; cb.checked=STATE.ghost.ids.has(id); const span=document.createElement('span'); span.textContent=`${s.name||'Økt'} – ${dt.toLocaleString()}`; row.appendChild(cb); row.appendChild(span); list.appendChild(row); }); }
function openGhostMenu(){ el('ghost-menu')?.classList.remove('hidden'); buildGhostMenu(); }
function closeGhostMenu(){ el('ghost-menu')?.classList.add('hidden'); }
el('ghost-picker')?.addEventListener('click', (e)=>{ e.stopPropagation(); openGhostMenu(); });
document.addEventListener('click', (e)=>{ const menu=el('ghost-menu'); if(menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target!==el('ghost-picker')) closeGhostMenu(); });
el('ghost-select-all')?.addEventListener('click', (e)=>{ e.preventDefault(); const checks=el('ghost-list').querySelectorAll('input[type=checkbox]'); checks.forEach(c=>c.checked=true); });
el('ghost-clear-all')?.addEventListener('click', (e)=>{ e.preventDefault(); const checks=el('ghost-list').querySelectorAll('input[type=checkbox]'); checks.forEach(c=>c.checked=false); });
el('ghost-apply')?.addEventListener('click', ()=>{ const checks=el('ghost-list').querySelectorAll('input[type=checkbox]'); STATE.ghost.ids=new Set(Array.from(checks).filter(c=>c.checked).map(c=>c.value)); closeGhostMenu(); });
el('ghost-enable')?.addEventListener('change', e=>{ STATE.ghost.enabled=e.target.checked; });

// ---- Workout Engine ----
const PRESETS={ '6x5':{name:'6×5 min',series:[{reps:6,workSec:300,restSec:60,seriesRestSec:0}], warmupSec:600, cooldownSec:600 }, '10x4':{name:'10×4 min',series:[{reps:10,workSec:240,restSec:60,seriesRestSec:0}], warmupSec:600, cooldownSec:600 }, '6x6':{name:'6×6 min',series:[{reps:6,workSec:360,restSec:60,seriesRestSec:0}], warmupSec:600, cooldownSec:600 }, '8x6':{name:'8×6 min',series:[{reps:8,workSec:360,restSec:60,seriesRestSec:0}], warmupSec:600, cooldownSec:600 } };

function createWorkoutFromCustom(cw){ return { name:cw.name||'Custom', phase:'warmup', startedAt:null, endedAt:null, warmupSec:Number(cw.warmupSec)||0, cooldownSec:Number(cw.cooldownSec)||0, target:{speed:cw.targetSpeed, grade:cw.targetGrade}, series:cw.series||[], sIdx:-1, rep:0, tLeft:Number(cw.warmupSec)||0 } }

const BUILDER_KEY='custom_workouts_v2';
function loadCustomWorkouts(){ try{ return JSON.parse(localStorage.getItem(BUILDER_KEY)||'[]'); }catch(e){ return []; } }
function renderCustomPresetButtons(){ const row=document.getElementById('preset-row'); if(!row) return; const customs=loadCustomWorkouts(); row.querySelectorAll('button.preset[data-custom="1"]').forEach(b=>b.remove()); customs.forEach((cw,idx)=>{ const b=document.createElement('button'); b.className='preset'; b.dataset.custom='1'; b.dataset.set='c'+idx; b.textContent=cw.name||('Mal '+(idx+1)); b.addEventListener('click', ()=>{ STATE.workout=createWorkoutFromCustom(cw); updateWorkoutUI(); localStorage.setItem('lastPreset','custom:'+idx); }); row.appendChild(b); }); }
renderCustomPresetButtons();

for(const btn of document.querySelectorAll('.preset')){ btn.addEventListener('click', ()=>{ const key=btn.dataset.set; const p=PRESETS[key]; if(p){ const cw={ name:p.name, warmupSec:p.warmupSec, cooldownSec:p.cooldownSec, series:p.series }; STATE.workout=createWorkoutFromCustom(cw); updateWorkoutUI(); localStorage.setItem('lastPreset', key); } }); }

function startTicker(){ if(STATE.ticker) return; // set startedAt defensively here too
  if(STATE.workout && !STATE.workout.startedAt){ STATE.workout.startedAt=new Date().toISOString(); if(!STATE.logger.active) startLogger(); }
  STATE.ticker=setInterval(tickWorkout,1000);
}
function stopTicker(){ if(STATE.ticker){ clearInterval(STATE.ticker); STATE.ticker=null; } }

function nextPhase(){ const w=STATE.workout; if(!w) return; if(w.phase==='warmup'){ if(w.series && w.series.length){ w.phase='work'; w.sIdx=0; w.rep=1; w.tLeft=w.series[0].workSec; } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } return; }
 if(w.phase==='work'){ const s=w.series[w.sIdx]; if(w.rep < s.reps){ w.phase='rest'; w.tLeft=s.restSec||0; return; } if(w.sIdx < w.series.length-1){ const sr=s.seriesRestSec||0; if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; return; } w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec; return; } w.phase='cooldown'; w.tLeft=w.cooldownSec; return; }
 if(w.phase==='rest'){ const s=w.series[w.sIdx]; w.rep++; w.phase='work'; w.tLeft=s.workSec; return; }
 if(w.phase==='seriesrest'){ w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec; return; }
 if(w.phase==='cooldown'){ w.phase='done'; w.tLeft=0; w.endedAt=new Date().toISOString(); // write a final sample at end
  writeSample(Date.now()); stopLogger(); finishSession(); return; }
}

function tickWorkout(){ if(!STATE.workout) return; const w=STATE.workout; if(w.phase==='done'){ stopTicker(); return; } w.tLeft=Math.max(0,(w.tLeft||0)-1); if(w.tLeft<=0){ nextPhase(); } updateWorkoutUI(); }

function skipWarmup(){ const w=STATE.workout; if(w && w.phase==='warmup'){ w.tLeft=0; nextPhase(); updateWorkoutUI(); }}
function skipCooldown(){ const w=STATE.workout; if(w && w.phase==='cooldown'){ w.phase='done'; w.tLeft=0; w.endedAt=new Date().toISOString(); writeSample(Date.now()); stopLogger(); finishSession(); }}
function skipInterval(){ const w=STATE.workout; if(!w) return; if(w.phase==='warmup'){ skipWarmup(); return;} if(w.phase==='cooldown'){ skipCooldown(); return;} if(w.phase==='work'){ const s=w.series[w.sIdx]; if(w.rep < s.reps){ w.phase='rest'; w.tLeft=s.restSec||0; } else { if(w.sIdx < w.series.length-1){ const sr=w.series[w.sIdx].seriesRestSec||0; if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; } else { w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec; } } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } } }
 else if(w.phase==='rest'){ const s=w.series[w.sIdx]; if(w.rep < s.reps){ w.rep++; w.phase='work'; w.tLeft=s.workSec; } else { if(w.sIdx < w.series.length-1){ const sr=w.series[w.sIdx].seriesRestSec||0; if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; } else { w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec; } } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } } }
 else if(w.phase==='seriesrest'){ w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec; }
updateWorkoutUI(); }

el('skip-warmup')?.addEventListener('click', skipWarmup);
el('skip-cooldown')?.addEventListener('click', skipCooldown);
el('skip-interval')?.addEventListener('click', skipInterval);

el('start-workout')?.addEventListener('click', ()=>{ if(!STATE.workout){ const lp=localStorage.getItem('lastPreset'); if(lp && lp.startsWith('custom:')){ renderCustomPresetButtons(); const idx=lp.split(':')[1]; const customs=loadCustomWorkouts(); const cw=customs[Number(idx)]; if(cw){ STATE.workout=createWorkoutFromCustom(cw); updateWorkoutUI(); } }
  else { const k=(lp && PRESETS[lp])?lp:'6x5'; const presetBtn=document.querySelector(`.preset[data-set="${k}"]`); if(presetBtn) presetBtn.click(); }
} if(STATE.workout && !STATE.workout.startedAt){ STATE.workout.startedAt=new Date().toISOString(); if(!STATE.logger.active) startLogger(); } startTicker(); });
el('pause-workout')?.addEventListener('click', ()=>{ if(STATE.ticker){ stopTicker(); } else { startTicker(); }});
el('reset-workout')?.addEventListener('click', ()=>{ stopTicker(); STATE.workout=null; STATE.logger.active=false; STATE.logger.points=[]; updateWorkoutUI(); draw(); });
el('finish-now')?.addEventListener('click', ()=>{ if(!STATE.workout) return; if(!STATE.workout.startedAt){ STATE.workout.startedAt=new Date().toISOString(); if(!STATE.logger.active) startLogger(); }
  STATE.workout.endedAt=new Date().toISOString(); writeSample(Date.now()); stopLogger(); finishSession(); });

function fmtMMSS(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
function updateWorkoutUI(){ const ci=el('current-interval'), ph=el('phase'), tmr=el('timer'), bar=el('progress'); if(!ci||!ph||!tmr||!bar) return; if(!STATE.workout){ ci.textContent='Ingen økt valgt'; ph.textContent='–'; tmr.textContent='00:00'; bar.style.width='0%'; return;} const w=STATE.workout; let label='', total=1, subtitle=''; if(w.phase==='warmup'){ label='Oppvarming'; total=w.warmupSec; } else if(w.phase==='work'){ const s=w.series[w.sIdx]; label='Drag'; total=s.workSec; subtitle=` – serie ${w.sIdx+1}/${w.series.length} – rep ${w.rep}/${s.reps}`; } else if(w.phase==='rest'){ const s=w.series[w.sIdx]; label='Pause'; total=s.restSec||0; subtitle=` – serie ${w.sIdx+1}/${w.series.length} – rep ${w.rep}/${s.reps}`; } else if(w.phase==='seriesrest'){ label='Serie‑pause'; total=w.series[w.sIdx].seriesRestSec||0; subtitle=` – mot serie ${w.sIdx+2}/${w.series.length}`; } else if(w.phase==='cooldown'){ label='Nedjogg'; total=w.cooldownSec; } else { label='Ferdig!'; }
  ci.textContent=`${w.name}${w.series?` (${w.series.length} serier)`:''}`; ph.textContent=`${label}${subtitle}`; tmr.textContent=fmtMMSS(w.tLeft); const pct=Math.min(100, Math.max(0, 100*(1 - (w.tLeft/Math.max(1,total))))); bar.style.width=`${pct}%`; }

// ---- Series + UI periodic updates (1 Hz) ----
function tick(){ const t=Date.now(); if(STATE.hr!=null) STATE.series.hr.push({t,y:STATE.hr}); const dispSpeed=displaySpeedKmh(); STATE.series.speed.push({t,y:dispSpeed}); const w=estimateWattExternal(dispSpeed, STATE.gradePct, STATE.massKg, STATE.cal.Crun, STATE.cal.K); STATE.series.watt.push({t,y:w}); STATE.series.rpe.push({t,y:STATE.rpe}); const cutoff=t-STATE.windowSec*1000; for(const k of ['hr','speed','watt','rpe']){ const arr=STATE.series[k]; while(arr.length && arr[0].t<cutoff) arr.shift(); }
  // write a sample every second to logger if active
  if(STATE.logger.active){ writeSample(t); }
  draw();
}
setInterval(tick,1000);

// ---- Graph ----
const canvas=el('chart'); const ctx=canvas?.getContext('2d'); const dpr=window.devicePixelRatio||1; function resizeCanvas(){ if(!canvas) return; const rect=canvas.getBoundingClientRect(); canvas.width=Math.floor(rect.width*dpr); canvas.height=Math.floor(rect.height*dpr);} window.addEventListener('resize', resizeCanvas); setTimeout(resizeCanvas,0);

function draw(){ if(!ctx||!canvas) return; const W=canvas.width,H=canvas.height; const padL=60*dpr,padR=60*dpr,padT=30*dpr,padB=30*dpr; const plotW=W-padL-padR, plotH=H-padT-padB; ctx.clearRect(0,0,W,H); if(plotW<=0||plotH<=0) return; const now=Date.now(); const xmin=now-STATE.windowSec*1000, xmax=now; const showHR=el('show-hr')?.checked ?? getPref('defHR',true); const showWatt=el('show-watt')?.checked ?? getPref('defWatt',true); const showSpeed=el('show-speed')?.checked ?? getPref('defSpeed',false); const showRPE=el('show-rpe')?.checked ?? getPref('defRPE',true);
  const hrMin= getPref('hrMin',80), hrMax=getPref('hrMax',200); const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin||1))*plotH;
  const sp = STATE.series.speed.filter(p=>p.t>=xmin); const wt = STATE.series.watt.filter(p=>p.t>=xmin); const rp = STATE.series.rpe.filter(p=>p.t>=xmin);
  const spVals=sp.map(p=>p.y), wtVals=wt.map(p=>p.y);
  const smin=Math.min(...(spVals.length?spVals:[0])), smax=Math.max(...(spVals.length?spVals:[1])); const wmin=Math.min(...(wtVals.length?wtVals:[0])), wmax=Math.max(...(wtVals.length?wtVals:[1]));
  const yWatt=v=> padT + (1 - (v-wmin)/Math.max(1,(wmax-wmin))) * plotH; const yRPE=v => padT + (1 - v/10) * plotH; const xTime=t=> padL + (t-xmin)/(xmax-xmin||1)*plotW;
  // HR zone bands
  ctx.fillStyle='rgba(239,68,68,0.06)'; ctx.fillRect(padL, yHR(STATE.LT2), plotW, yHR(hrMax)-yHR(STATE.LT2));
  ctx.fillStyle='rgba(37,99,235,0.06)'; ctx.fillRect(padL, yHR(STATE.LT1), plotW, yHR(STATE.LT2)-yHR(STATE.LT1));
  ctx.fillStyle='rgba(16,163,74,0.06)'; ctx.fillRect(padL, yHR(hrMin), plotW, yHR(STATE.LT1)-yHR(hrMin));
  // time grid
  ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=STATE.windowSec; sec+=60){ const t=xmin+sec*1000; const x=padL+(t-xmin)/(xmax-xmin||1)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke();
  // HR ticks
  ctx.strokeStyle='#e5e7eb'; ctx.beginPath(); for(let v=hrMin; v<=hrMax; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke();
  ctx.fillStyle='#ef4444'; ctx.font=`${12*dpr}px system-ui`; for(let v=hrMin; v<=hrMax; v+=20){ ctx.fillText(String(v), 8*dpr, yHR(v)+4*dpr); }
  // Right axis Watt
  if(showWatt){ ctx.fillStyle='#16a34a'; ctx.textAlign='right'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=wmin + (wmax-wmin)*i/ticks; const y=yWatt(v); ctx.fillText(String(Math.round(v)), W-8*dpr, y+4*dpr); } ctx.textAlign='left'; }
  // Top axis Speed
  if(showSpeed){ ctx.fillStyle='#2563eb'; ctx.textAlign='center'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=smin + (smax-smin)*i/ticks; const x=padL + plotW*i/ticks; ctx.fillText(String(v.toFixed(1)), x, (padT-8*dpr)); } ctx.textAlign='left'; }
  // Right-inner axis RPE
  if(showRPE){ ctx.fillStyle='#d97706'; ctx.textAlign='right'; for(let v=0; v<=10; v+=2){ const y=yRPE(v); ctx.fillText(String(v), W-40*dpr, y+4*dpr); } ctx.textAlign='left'; }
  function drawLine(arr,color,ymap,alpha=1){ if(!arr || arr.length<2) return; ctx.strokeStyle=color; ctx.globalAlpha=alpha; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ if(p.t<xmin) continue; const x=xTime(p.t), y=ymap(p.y); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); ctx.globalAlpha=1; }
  if(showHR) drawLine(STATE.series.hr, '#ef4444', yHR, 1);
  if(showWatt) drawLine(STATE.series.watt, '#16a34a', yWatt, 1);
  if(showSpeed){ const ySpeed=v=> padT + (1 - (v - smin)/Math.max(1,(smax-smin))) * plotH; drawLine(STATE.series.speed, '#2563eb', ySpeed, 1); }
  if(showRPE) drawLine(STATE.series.rpe, '#d97706', yRPE, 1);
}

// ---- Finish session: persist + redirect (robust) ----
function calcTotalReps(w){ if(!w||!w.series) return 0; return w.series.reduce((a,s)=>a+(Number(s.reps)||0),0); }
function finishSession(){ try{ const w=STATE.workout; if(!w) return; // Defensive timestamps
  const nowIso=new Date().toISOString(); if(!w.startedAt) w.startedAt = STATE.logger.startTs? new Date(STATE.logger.startTs).toISOString(): nowIso; if(!w.endedAt) w.endedAt=nowIso;
  // Guarantee at least two points for duration
  if(STATE.logger.points.length<2){ const t0=STATE.logger.startTs || Date.now(); const t1=Date.now(); if(STATE.logger.points.length===0) writeSample(t0); writeSample(t1); }
  const session={ id:'s'+Date.now(), name:w.name||'Økt', reps: calcTotalReps(w), startedAt:w.startedAt, endedAt:w.endedAt, lt1:STATE.LT1, lt2:STATE.LT2, massKg:STATE.massKg, rpeByRep:STATE.rpeByRep, points:STATE.logger.points };
  const key='sessions'; const arr=JSON.parse(localStorage.getItem(key)||'[]'); arr.push(session); localStorage.setItem(key, JSON.stringify(arr));
  window.location.assign('results.html#'+session.id);
} catch(e){ console.error('finishSession failed', e); alert('Klarte ikke å lagre økt: '+e.message); } }

// init toggles defaults
['show-hr','show-watt','show-speed','show-rpe'].forEach(id=>{ if(!el(id)) return; const defKey={ 'show-hr':'defHR','show-watt':'defWatt','show-speed':'defSpeed','show-rpe':'defRPE' }[id]; el(id).checked = getPref(defKey, id!=='show-speed'); el(id).addEventListener('change', ()=> draw()); });
