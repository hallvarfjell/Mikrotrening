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
  wakeLock:null,
  rpe: 0,
  rpeByRep: {},
  logger: { active:false, points:[], startTs:null, dist:0 },
  ghost: { enabled:false, ids:new Set(), avg:null }
};
const el=id=>document.getElementById(id);

// ---- Wake Lock ----
async function requestWakeLock(){ try{ if('wakeLock' in navigator){ STATE.wakeLock = await navigator.wakeLock.request('screen'); STATE.wakeLock.addEventListener('release', ()=>{ STATE.wakeLock=null; }); } }catch(e){ console.warn('WakeLock failed', e); }}
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && !STATE.wakeLock){ requestWakeLock(); }});
requestWakeLock();

// ---- Settings ----
['mass-kg','lt1','lt2'].forEach(k=>{ const map={ 'mass-kg':'massKg','lt1':'LT1','lt2':'LT2' }[k]; if(map) el(k).value = STATE[map]; el(k).addEventListener('change',()=>{ const v = Number(el(k).value); STATE[map] = isNaN(v)?STATE[map]:v; localStorage.setItem(map, STATE[map]); }); });

// ---- BLE: Heart Rate ----
async function connectHR(){ try{ if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth'); const device=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]}); const server=await device.gatt.connect(); const service=await server.getPrimaryService('heart_rate'); const ch=await service.getCharacteristic('heart_rate_measurement'); await ch.startNotifications(); ch.addEventListener('characteristicvaluechanged', ev=>{ const dv=ev.target.value; const flags=dv.getUint8(0); const hr16=flags&1; let i=1; const bpm=hr16? dv.getUint16(i,true):dv.getUint8(i); STATE.hr=bpm; }); }catch(e){ console.error(e); alert('Kunne ikke koble til pulsbelte: '+e);} }
el('connect-hr').addEventListener('click', connectHR);

// ---- BLE: FTMS (read-only) ----
async function connectTreadmill(){ try{ if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth'); const device=await navigator.bluetooth.requestDevice({filters:[{services:[0x1826]}]}); const server=await device.gatt.connect(); const ftms=await server.getPrimaryService(0x1826); const tdc=await ftms.getCharacteristic('00002ACD-0000-1000-8000-00805F9B34FB'); await tdc.startNotifications(); const status=el('ftms-status'); status.textContent='FTMS: Tilkoblet'; status.classList.add('connected'); tdc.addEventListener('characteristicvaluechanged', ev=>{ const dv=ev.target.value; let idx=0; const flags=dv.getUint16(idx,true); idx+=2; const INST=1<<0, AVG=1<<1, DIST=1<<2, INCL=1<<3; if(flags&INST){ const ms=dv.getUint16(idx,true)/100; idx+=2; const kmh=ms*3.6; setSpeed(kmh); } if(flags&AVG){ idx+=2;} if(flags&DIST){ idx+=3;} if(flags&INCL){ const rawIncl=dv.getInt16(idx,true); idx+=2; idx+=2; setGrade(rawIncl/10);} }); device.addEventListener('gattserverdisconnected', ()=>{ status.textContent='FTMS: Frakoblet'; status.classList.remove('connected');}); }catch(e){ console.error(e); alert('Kunne ikke koble til tredemølle: '+e);} }
el('connect-treadmill').addEventListener('click', connectTreadmill);

// ---- Manual overrides & steppers ----
function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
function setSpeed(v){ STATE.speedKmh = Math.max(0, Number(v)||0); el('manual-speed').value = STATE.speedKmh.toFixed(1); }
function setGrade(v){ STATE.gradePct = Number(v)||0; el('manual-grade').value = STATE.gradePct.toFixed(1); }
for(const btn of document.querySelectorAll('.speed-btn')){ btn.addEventListener('click', ()=> setSpeed(Number(btn.dataset.speed))); }
el('manual-speed').addEventListener('change',()=> setSpeed(el('manual-speed').value));
el('manual-grade').addEventListener('change',()=> setGrade(el('manual-grade').value));
el('speed-dec').addEventListener('click', ()=> setSpeed(STATE.speedKmh-0.1));
el('speed-inc').addEventListener('click', ()=> setSpeed(STATE.speedKmh+0.1));
el('grade-dec').addEventListener('click', ()=> setGrade(STATE.gradePct-0.5));
el('grade-inc').addEventListener('click', ()=> setGrade(STATE.gradePct+0.5));

// ---- RPE nå (±0.5) ----
function applyRPEChange(delta){ STATE.rpe = clamp((Number(el('rpe-now').value)||0)+delta,0,10); el('rpe-now').value = STATE.rpe.toFixed(1); if(STATE.workout){ const w=STATE.workout; if(w.phase==='rest' && w.rep>=1){ STATE.rpeByRep[w.rep]=STATE.rpe; } else if(w.phase==='work' && w.rep>=1){ STATE.rpeByRep[w.rep]=STATE.rpe; } } }
el('rpe-dec').addEventListener('click', ()=> applyRPEChange(-0.5));
el('rpe-inc').addEventListener('click', ()=> applyRPEChange(+0.5));
el('rpe-now').addEventListener('change', ()=> applyRPEChange(0));

// ---- Display speed override during REST ----
function displaySpeedKmh(){ if(STATE.workout && STATE.workout.phase==='rest') return 0; return STATE.speedKmh; }

// ---- Power estimate (metabolic) ----
function estimateWatt(speedKmh, gradePct, massKg){ const g=9.81, v=speedKmh/3.6, grade=(gradePct||0)/100, C=4.186; return Math.max(0, Math.round(massKg * v * (g*grade + C))); }

// ---- Slope (avg 20s − avg 120s) ----
function avgWindow(series, spanMs){ const now=Date.now(); const lo=now-spanMs; let sum=0,cnt=0; for(let i=series.length-1;i>=0;i--){ const p=series[i]; if(p.t<lo) break; sum+=p.y; cnt++; } return cnt? sum/cnt : null; }
function calcSlope(){ const s=STATE.series.hr; if(!s.length) return null; const a20=avgWindow(s,20000), a120=avgWindow(s,120000); if(a20==null||a120==null) return null; return Math.round(a20-a120); }

// ---- Logger helpers ----
function startLogger(){ STATE.logger.active=true; STATE.logger.startTs=Date.now(); STATE.logger.points=[]; STATE.logger.dist=0; if(STATE.ghost.enabled) recomputeGhostAverage(); }
function stopLogger(){ STATE.logger.active=false; }

// ---- Ghost dropdown (checkboxes) & average ----
function buildGhostMenu(){ const list=el('ghost-list'); list.innerHTML=''; const sessions = JSON.parse(localStorage.getItem('sessions')||'[]'); if(!sessions.length){ list.innerHTML='<div class="muted">Ingen lagrede økter</div>'; return; } sessions.slice().reverse().forEach(s=>{ const dt=new Date(s.startedAt||Date.now()); const id=s.id; const row=document.createElement('label'); row.className='menu-item'; const cb=document.createElement('input'); cb.type='checkbox'; cb.value=id; cb.checked=STATE.ghost.ids.has(id); const span=document.createElement('span'); span.textContent=`${s.name||'Økt'} – ${dt.toLocaleString()}`; row.appendChild(cb); row.appendChild(span); list.appendChild(row); }); }
function openGhostMenu(){ el('ghost-menu').classList.remove('hidden'); buildGhostMenu(); }
function closeGhostMenu(){ el('ghost-menu').classList.add('hidden'); }
el('ghost-picker').addEventListener('click', (e)=>{ e.stopPropagation(); openGhostMenu(); });
document.addEventListener('click', (e)=>{ const menu=el('ghost-menu'); if(!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target!==el('ghost-picker')) closeGhostMenu(); });
el('ghost-select-all').addEventListener('click', (e)=>{ e.preventDefault(); const checks=el('ghost-list').querySelectorAll('input[type=checkbox]'); checks.forEach(c=>c.checked=true); });
el('ghost-clear-all').addEventListener('click', (e)=>{ e.preventDefault(); const checks=el('ghost-list').querySelectorAll('input[type=checkbox]'); checks.forEach(c=>c.checked=false); });
el('ghost-apply').addEventListener('click', ()=>{ const checks=el('ghost-list').querySelectorAll('input[type=checkbox]'); STATE.ghost.ids=new Set(Array.from(checks).filter(c=>c.checked).map(c=>c.value)); closeGhostMenu(); if(STATE.ghost.enabled && STATE.logger.startTs) recomputeGhostAverage(); });
el('ghost-enable').addEventListener('change', e=>{ STATE.ghost.enabled=e.target.checked; if(STATE.logger.startTs) recomputeGhostAverage(); });

function recomputeGhostAverage(){ STATE.ghost.avg=null; if(!STATE.ghost.enabled || !STATE.ghost.ids.size || !STATE.logger.startTs) return; const ids=[...STATE.ghost.ids]; const sessions=JSON.parse(localStorage.getItem('sessions')||'[]'); const chosen=sessions.filter(s=>ids.includes(s.id) && s.points && s.points.length); if(!chosen.length) return; const bins=new Map(); for(const s of chosen){ const s0=s.points[0].ts; const offset=STATE.logger.startTs - s0; for(const p of s.points){ const at=p.ts + offset; const dtSec=Math.round((at-STATE.logger.startTs)/1000); if(dtSec<0) continue; let b=bins.get(dtSec); if(!b){ b={hrSum:0,hrCnt:0,wSum:0,wCnt:0}; bins.set(dtSec,b);} if(p.hr){ b.hrSum+=p.hr; b.hrCnt++; } if(typeof p.watt==='number'){ b.wSum+=p.watt; b.wCnt++; } } }
  const hrArr=[], wArr=[]; const keys=[...bins.keys()].sort((a,b)=>a-b); for(const k of keys){ const b=bins.get(k); const t=STATE.logger.startTs + k*1000; if(b.hrCnt) hrArr.push({t,y:b.hrSum/b.hrCnt}); if(b.wCnt) wArr.push({t,y:b.wSum/b.wCnt}); }
  STATE.ghost.avg={hr:hrArr, watt:wArr}; }

// ---- Workout Engine ----
const PRESETS={ '6x5':{name:'6×5 min',reps:6,workSec:300,restSec:60}, '10x4':{name:'10×4 min',reps:10,workSec:240,restSec:60}, '6x6':{name:'6×6 min',reps:6,workSec:360,restSec:60}, '8x6':{name:'8×6 min',reps:8,workSec:360,restSec:60}, };
const DEFAULTS={ warmupSec:600, cooldownSec:600 };
for(const btn of document.querySelectorAll('.preset')){ btn.addEventListener('click', ()=>{ const key=btn.dataset.set; const p=PRESETS[key]; STATE.workout={ name:p.name,reps:p.reps,workSec:p.workSec,restSec:p.restSec,warmupSec:DEFAULTS.warmupSec,cooldownSec:DEFAULTS.cooldownSec,phase:'warmup',rep:0,tLeft:DEFAULTS.warmupSec,startedAt:null,endedAt:null}; updateWorkoutUI(); localStorage.setItem('lastPreset', key); }); }
function startTicker(){ if(STATE.ticker) return; if(STATE.workout && !STATE.workout.startedAt){ STATE.workout.startedAt=new Date().toISOString(); startLogger(); } STATE.ticker=setInterval(tickWorkout,1000); }
function stopTicker(){ if(STATE.ticker){ clearInterval(STATE.ticker); STATE.ticker=null; } }
function tickWorkout(){ if(!STATE.workout) return; const w=STATE.workout; if(w.phase==='done'){ stopTicker(); return;} w.tLeft-=1; if(w.tLeft<=0){ advancePhase(); } updateWorkoutUI(); }
function advancePhase(){ const w=STATE.workout; if(!w) return; switch(w.phase){ case 'warmup': w.phase='work'; w.rep=1; w.tLeft=w.workSec; break; case 'work': if(w.rep<w.reps){ w.phase='rest'; w.tLeft=w.restSec; } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } break; case 'rest': w.rep+=1; w.phase='work'; w.tLeft=w.workSec; break; case 'cooldown': w.phase='done'; w.tLeft=0; w.endedAt=new Date().toISOString(); stopLogger(); finishSession(); break; }}
function skipWarmup(){ const w=STATE.workout; if(w && w.phase==='warmup'){ w.phase='work'; w.rep=1; w.tLeft=w.workSec; updateWorkoutUI(); }}
function skipCooldown(){ const w=STATE.workout; if(w && w.phase==='cooldown'){ w.phase='done'; w.tLeft=0; w.endedAt=new Date().toISOString(); stopLogger(); finishSession(); }}
function skipInterval(){ const w=STATE.workout; if(!w) return; if(w.phase==='warmup'){ skipWarmup(); return;} if(w.phase==='cooldown'){ skipCooldown(); return;} if(w.phase==='work'){ if(w.rep<w.reps){ w.phase='rest'; w.tLeft=w.restSec; } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } } else if(w.phase==='rest'){ if(w.rep<w.reps){ w.rep+=1; w.phase='work'; w.tLeft=w.workSec; } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } } updateWorkoutUI(); }

el('skip-warmup').addEventListener('click', skipWarmup);
el('skip-cooldown').addEventListener('click', skipCooldown);
el('skip-interval').addEventListener('click', skipInterval);

el('start-workout').addEventListener('click', ()=>{ if(!STATE.workout){ const lp=localStorage.getItem('lastPreset'); const k=(lp && PRESETS[lp])?lp:'6x5'; document.querySelector(`.preset[data-set="${k}"]`).click(); } startTicker(); });
el('pause-workout').addEventListener('click', ()=>{ if(STATE.ticker){ stopTicker(); } else { startTicker(); }});
el('reset-workout').addEventListener('click', ()=>{ stopTicker(); STATE.workout=null; updateWorkoutUI(); });

function fmtMMSS(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
function updateWorkoutUI(){ const ci=el('current-interval'), ph=el('phase'), tmr=el('timer'), bar=el('progress'); if(!STATE.workout){ ci.textContent='Ingen økt valgt'; ph.textContent='–'; tmr.textContent='00:00'; bar.style.width='0%'; return;} const w=STATE.workout; ci.textContent=`${w.name} (pause ${fmtMMSS(w.restSec)})`; let label='', total=0, repText=''; if(w.phase==='warmup'){ label='Oppvarming'; total=w.warmupSec; } else if(w.phase==='work'){ label='Drag'; total=w.workSec; repText=` – rep ${w.rep}/${w.reps}`; } else if(w.phase==='rest'){ label='Pause'; total=w.restSec; repText=` – rep ${w.rep}/${w.reps}`; } else if(w.phase==='cooldown'){ label='Nedkjøling'; total=w.cooldownSec; } else { label='Ferdig!'; total=1; } ph.textContent=`${label}${repText}`; tmr.textContent=fmtMMSS(w.tLeft); const pct=Math.min(100, Math.max(0, 100*(1 - (w.tLeft/Math.max(1,total))))); bar.style.width=`${pct}%`; }

// ---- Series + UI periodic updates ----
function tick(){ const t=Date.now(); if(STATE.hr!=null) STATE.series.hr.push({t,y:STATE.hr}); const dispSpeed=displaySpeedKmh(); STATE.series.speed.push({t,y:dispSpeed}); const w=estimateWatt(dispSpeed, STATE.gradePct, STATE.massKg); STATE.series.watt.push({t,y:w}); const cutoff=t-STATE.windowSec*1000; for(const k of ['hr','speed','watt']){ const arr=STATE.series[k]; while(arr.length && arr[0].t<cutoff) arr.shift(); } el('pulse').textContent=STATE.hr!=null?STATE.hr:'--'; el('watt').textContent=w||'--'; const s=calcSlope(); el('slope').textContent=(s!=null)?(s>0?`+${s}`:`${s}`):'--'; draw(); if(STATE.logger.active){ const prevTs=STATE.logger.points.length? STATE.logger.points[STATE.logger.points.length-1].ts : STATE.logger.startTs; const dt=(t-prevTs)/1000; const speed_ms=dispSpeed/3.6; STATE.logger.dist += speed_ms*dt; STATE.logger.points.push({ ts:t, iso:new Date(t).toISOString(), hr:STATE.hr||0, speed_ms, grade:STATE.gradePct||0, dist_m:STATE.logger.dist, rpe:STATE.rpe, phase:STATE.workout?STATE.workout.phase:'', rep:STATE.workout?STATE.workout.rep:0, watt:w }); } }
setInterval(tick,1000);

// ---- Canvas drawing with ghost avg overlay ----
const canvas=el('chart'); const ctx=canvas.getContext('2d'); const dpr=window.devicePixelRatio||1; function resizeCanvas(){ const rect=canvas.getBoundingClientRect(); canvas.width=Math.floor(rect.width*dpr); canvas.height=Math.floor(rect.height*dpr);} window.addEventListener('resize', resizeCanvas); setTimeout(resizeCanvas,0);

function draw(){ const W=canvas.width,H=canvas.height; ctx.clearRect(0,0,W,H); const padL=60*dpr,padR=20*dpr,padT=20*dpr,padB=30*dpr; const plotW=W-padL-padR, plotH=H-padT-padB; const now=Date.now(); const xmin=now-STATE.windowSec*1000, xmax=now; const showHR=el('show-hr').checked, showWatt=el('show-watt').checked, showSpeed=el('show-speed').checked; const hrMin=Number(el('hr-min').value)||80, hrMax=Number(el('hr-max').value)||200; const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin))*plotH; function band(y0,y1,color){ ctx.fillStyle=color; ctx.fillRect(padL,y1,plotW,y0-y1);} band(yHR(hrMin), yHR(STATE.LT1), '#edf7ed'); band(yHR(STATE.LT1), yHR(STATE.LT2), '#e9f0fb'); band(yHR(STATE.LT2), yHR(hrMax), '#fdeaea'); ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=STATE.windowSec; sec+=60){ const t=xmin+sec*1000; const x=padL+(t-xmin)/(xmax-xmin)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke(); ctx.strokeStyle='#e2e8f0'; ctx.beginPath(); for(let v=hrMin; v<=hrMax; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke(); function xTime(t){ return padL + (t-xmin)/(xmax-xmin)*plotW; }
  function drawLine(arr,color,ymap,alpha=1){ if(!arr || arr.length<2) return; ctx.strokeStyle=color; ctx.globalAlpha=alpha; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ if(p.t<xmin) continue; const x=xTime(p.t), y=ymap(p.y); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); ctx.globalAlpha=1; }
  // main series
  if(showHR) drawLine(STATE.series.hr, '#16a34a', yHR, 1);
  const sp=STATE.series.speed, wt=STATE.series.watt; const spVals=sp.map(p=>p.y), wtVals=wt.map(p=>p.y);
  let gWtVals=[]; if(STATE.ghost.enabled && STATE.ghost.avg && STATE.ghost.avg.watt){ for(const gp of STATE.ghost.avg.watt){ if(gp.t<xmin || gp.t>now) continue; gWtVals.push(gp.y); } }
  const wmin=Math.min(...(wtVals.length?wtVals:[0]), ...(gWtVals.length?gWtVals:[0]));
  const wmax=Math.max(...(wtVals.length?wtVals:[1]), ...(gWtVals.length?gWtVals:[1]));
  const smin=Math.min(...(spVals.length?spVals:[0]));
  const smax=Math.max(...(spVals.length?spVals:[1]));
  const mapSpeed=v=> yHR(hrMin + (hrMax-hrMin) * ((v - smin) / Math.max(1e-6,(smax-smin))));
  const mapWatt=v => yHR(hrMin + (hrMax-hrMin) * ((v - wmin) / Math.max(1e-6,(wmax-wmin))));
  if(showSpeed) drawLine(sp, '#2563eb', mapSpeed, 1);
  if(showWatt) drawLine(wt, '#d97706', mapWatt, 1);
  // ghost average overlay
  if(STATE.ghost.enabled && STATE.ghost.avg){ if(showHR) drawLine(STATE.ghost.avg.hr, '#22c55e', yHR, 0.55); if(showWatt) drawLine(STATE.ghost.avg.watt, '#f59e0b', mapWatt, 0.55); }
  // legend
  ctx.fillStyle='#64748b'; ctx.font=`${12*dpr}px system-ui`; ctx.fillText('bpm', 8*dpr, 14*dpr); for(let v=hrMin; v<=hrMax; v+=20){ ctx.fillText(String(v), 20*dpr, yHR(v)+4*dpr); }
}

// ---- Finish session: persist + redirect to results ----
function finishSession(){ try{ const w=STATE.workout; if(!w) return; const session={ id:'s'+Date.now(), name:w.name, reps:w.reps, startedAt:w.startedAt||new Date().toISOString(), endedAt:w.endedAt||new Date().toISOString(), lt1:STATE.LT1, lt2:STATE.LT2, massKg:STATE.massKg, rpeByRep:STATE.rpeByRep, points:STATE.logger.points }; const key='sessions'; const arr=JSON.parse(localStorage.getItem(key)||'[]'); arr.push(session); localStorage.setItem(key, JSON.stringify(arr)); location.href='results.html#'+session.id; }catch(e){ console.error('finishSession failed', e); } }

// init
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./service-worker.js').catch(console.error); }); }
