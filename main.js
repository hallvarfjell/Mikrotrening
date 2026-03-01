

function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){ try{ const v=localStorage.getItem(nsKey(k)); if(v!=null) return JSON.parse(v); const ov=localStorage.getItem(k); return ov!=null? JSON.parse(ov): d; }catch(e){ return d; } }
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }
function delNS(k){ localStorage.removeItem(nsKey(k)); }

(function(){
  // --- Error trap to show UI card ---
  const errCard=()=>document.getElementById('err-card');
  const errLog=()=>document.getElementById('err-log');
  function showErr(e){ try{ errCard()?.classList.remove('hidden'); (errLog()&&(errLog().textContent += (e&&e.stack)? e.stack+'\n' : (e?.message||String(e))+'\n')); }catch(_){} }
  window.addEventListener('error', e=> showErr(e.error||e.message));
  window.addEventListener('unhandledrejection', e=> showErr(e.reason||e));

  // --- State ---
  const STATE = {
    hr: null,
    speedKmh: 0,
    gradePct: 0,
    massKg: Number(getNS('massKg',75)),
    LT1: Number(getNS('LT1',135)),
    LT2: Number(getNS('LT2',160)),
    series:{hr:[], speed:[], watt:[], rpe:[]},
    windowSec: 900,
    workout:null,
    ticker:null,
    wakeLock:null,
    rpe: 0,
    rpeByRep: {},
    logger: { active:false, points:[], startTs:null, dist:0 },
    ghost: { enabled:false, ids:new Set(), avg:null },
    cal: { K: Number(getNS('calK',1.0)), Crun: Number(getNS('cRun',1.0)) }
  };
  const el=id=>document.getElementById(id);

  function isWorkoutRunning(){ return !!(STATE.workout && STATE.ticker && STATE.workout.phase!=='done'); }

  // --- Wake Lock ---
  async function requestWakeLock(){ try{ if('wakeLock' in navigator){ STATE.wakeLock = await navigator.wakeLock.request('screen'); STATE.wakeLock.addEventListener('release', ()=>{ STATE.wakeLock=null; }); } }catch(e){} }

  // --- BLE HR ---
  async function connectHR(){ try{ if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth'); const device=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]}); const server=await device.gatt.connect(); const service=await server.getPrimaryService('heart_rate'); const ch=await service.getCharacteristic('heart_rate_measurement'); await ch.startNotifications(); ch.addEventListener('characteristicvaluechanged', ev=>{ const dv=ev.target.value; const flags=dv.getUint8(0); const hr16=flags&1; let i=1; const bpm=hr16? dv.getUint16(i,true):dv.getUint8(i); STATE.hr=bpm; }); }catch(e){ console.error(e); alert('Kunne ikke koble til pulsbelte: '+e);} }

  // --- BLE FTMS ---
  async function connectTreadmill(){ try{ if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth'); const device=await navigator.bluetooth.requestDevice({filters:[{services:[0x1826]}]}); const server=await device.gatt.connect(); const ftms=await server.getPrimaryService(0x1826); const tdc=await ftms.getCharacteristic('00002ACD-0000-1000-8000-00805F9B34FB'); await tdc.startNotifications(); const status=el('ftms-status'); if(status){ status.textContent='FTMS: Tilkoblet'; status.classList.add('connected'); }
    tdc.addEventListener('characteristicvaluechanged', ev=>{ const dv=ev.target.value; let idx=0; const flags=dv.getUint16(idx,true); idx+=2; const INST=1<<0, INCL=1<<3; if(flags&INST){ const ms=dv.getUint16(idx,true)/100; idx+=2; const kmh=ms*3.6; setSpeed(kmh); } if(flags&INCL){ const rawIncl=dv.getInt16(idx,true); idx+=2; idx+=2; setGrade(rawIncl/10);} }); device.addEventListener('gattserverdisconnected', ()=>{ if(status){ status.textContent='FTMS: Frakoblet'; status.classList.remove('connected'); } }); }catch(e){ console.error(e); alert('Kunne ikke koble til tredemølle: '+e);} }

  // --- Manual controls ---
  function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
  function setSpeed(v){ STATE.speedKmh = Math.max(0, Number(v)||0); el('manual-speed') && (el('manual-speed').value = STATE.speedKmh.toFixed(1)); }
  function setGrade(v){ STATE.gradePct = Number(v)||0; el('manual-grade') && (el('manual-grade').value = STATE.gradePct.toFixed(1)); }

  function setRPE(v){ STATE.rpe = clamp(Number(v)||0,0,10); el('rpe-now') && (el('rpe-now').value = STATE.rpe.toFixed(1)); }
  function applyRPEChange(delta){ setRPE((Number(el('rpe-now')?.value)||0)+delta); }

  function estimateWattExternal(speedKmh, gradePct, massKg, Crun, K){ const g=9.81, v=(speedKmh||0)/3.6, grade=(gradePct||0)/100; const mech = massKg * (g * v * grade + Crun * v); return Math.max(0, Math.round(mech * (K||1))); }

  function startLogger(){ STATE.logger.active=true; STATE.logger.startTs=Date.now(); STATE.logger.points=[]; STATE.logger.dist=0; writeSample(STATE.logger.startTs); }
  function stopLogger(){ STATE.logger.active=false; }
  function writeSample(t){ const dispSpeed=displaySpeedKmh(); const speed_ms=dispSpeed/3.6; const w=estimateWattExternal(dispSpeed, STATE.gradePct, STATE.massKg, STATE.cal.Crun, STATE.cal.K); const wstate=STATE.workout; STATE.logger.dist += speed_ms * (STATE.logger.points.length? (t-STATE.logger.points[STATE.logger.points.length-1].ts)/1000 : 0); STATE.logger.points.push({ ts:t, iso:new Date(t).toISOString(), hr:STATE.hr||0, speed_ms, grade:STATE.gradePct||0, dist_m:STATE.logger.dist, rpe:STATE.rpe, phase:wstate?wstate.phase:'', rep:wstate&&wstate.phase==='work'?wstate.rep:0, watt:w }); }

  // --- Workouts ---
  const BUILDER_KEY='custom_workouts_v2';
  function loadCustomWorkouts(){ return getNS(BUILDER_KEY,[]); }
  function workoutFromCfg(cw){ return { name:cw.name||'Økt', phase:'warmup', startedAt:null, endedAt:null, warmupSec:Number(cw.warmupSec)||0, cooldownSec:Number(cw.cooldownSec)||0, series:(cw.series||[]).map(s=>({reps:s.reps,workSec:s.workSec,restSec:s.restSec,seriesRestSec:s.seriesRestSec,note:s.note||''})), sIdx:-1, rep:0, tLeft:Number(cw.warmupSec)||0 } }

  function populateWorkoutSelect(){ const sel=el('workout-select'); if(!sel) return; sel.innerHTML=''; const customs=loadCustomWorkouts(); customs.forEach((cw,idx)=>{ const opt=document.createElement('option'); opt.value='c:'+idx; opt.textContent=cw.name||('Mal '+(idx+1)); sel.appendChild(opt); }); sel.addEventListener('change', ()=>{ const v=sel.value; if(v && v.startsWith('c:')){ const idx=Number(v.split(':')[1]); const cw=customs[idx]; if(cw){ STATE.workout=workoutFromCfg(cw); updateWorkoutUI(); setNS('lastPreset','custom:'+idx); } } }); }

  // Preselect (no autorun)
  function preselectIfRequested(){ const ar=getNS('preselect',null); if(!ar) return; if(ar.type==='custom'){ const arr=loadCustomWorkouts(); const i=Number(ar.index||0); const cw=arr[i]; if(cw){ const sel=el('workout-select'); if(sel){ sel.value='c:'+i; } STATE.workout=workoutFromCfg(cw); updateWorkoutUI(); } }
  delNS('preselect'); }

  function startTicker(){ if(STATE.ticker) return; if(STATE.workout && !STATE.workout.startedAt){ STATE.workout.startedAt=new Date().toISOString(); if(!STATE.logger.active) startLogger(); } STATE.ticker=setInterval(tickWorkout,1000); toggleStartPauseUI(true); }
  function stopTicker(){ if(STATE.ticker){ clearInterval(STATE.ticker); STATE.ticker=null; } toggleStartPauseUI(false); }

  function toggleStartPauseUI(running){ const icon=el('sp-icon'), label=el('sp-label'); if(!icon||!label) return; if(running){ icon.className='ph-pause'; label.textContent='Pause'; } else { icon.className='ph-play'; label.textContent='Start'; } }

  function nextPhase(){ const w=STATE.workout; if(!w) return; if(w.phase==='warmup'){ if(w.series && w.series.length){ w.phase='work'; w.sIdx=0; w.rep=1; w.tLeft=w.series[0].workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[0].restSec||0; } } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; } return; }
   if(w.phase==='work'){ const s=w.series[w.sIdx]; if(w.rep < s.reps){ w.phase='rest'; w.tLeft=s.restSec||0; return; } if(w.sIdx < w.series.length-1){ const sr=s.seriesRestSec||0; if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; return; } w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[w.sIdx].restSec||0; } return; } w.phase='cooldown'; w.tLeft=w.cooldownSec; return; }
   if(w.phase==='rest'){ const s=w.series[w.sIdx]; if(w.rep < s.reps){ w.rep++; w.phase='work'; w.tLeft=s.workSec||0; if(w.tLeft===0){ if(w.rep<=s.reps){ w.phase='rest'; w.tLeft=s.restSec||0; } } return; } if(w.sIdx < w.series.length-1){ const sr=s.seriesRestSec||0; if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; return; } w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[w.sIdx].restSec||0; } return; } w.phase='cooldown'; w.tLeft=w.cooldownSec; return; }
   if(w.phase==='seriesrest'){ w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[w.sIdx].restSec||0; } return; }
   if(w.phase==='cooldown'){ w.phase='done'; w.tLeft=0; w.endedAt=new Date().toISOString(); writeSample(Date.now()); stopLogger(); finishSession(); return; }
  }
  function prevPhase(){ const w=STATE.workout; if(!w) return; if(w.phase==='work'){ const s=w.series[w.sIdx]; if(w.rep>1){ w.phase='rest'; w.rep--; w.tLeft=s.restSec||0; } else { if(w.sIdx>0){ w.sIdx--; const ps=w.series[w.sIdx]; w.phase='work'; w.rep=ps.reps; w.tLeft=ps.workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=ps.restSec||0; } } else { w.phase='warmup'; w.tLeft=w.warmupSec; } } }
   else if(w.phase==='rest'){ const s=w.series[w.sIdx]; w.phase='work'; w.tLeft=s.workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=s.restSec||0; } }
   else if(w.phase==='seriesrest'){ const prev=w.series[w.sIdx-1]; if(prev){ w.sIdx--; w.phase='work'; w.rep=prev.reps; w.tLeft=prev.workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=prev.restSec||0; } } else { w.phase='warmup'; w.tLeft=w.warmupSec; } }
   else if(w.phase==='cooldown'){ const last=w.series[w.series.length-1]; if(last){ w.phase='work'; w.sIdx=w.series.length-1; w.rep=last.reps; w.tLeft=last.workSec||0; if(w.tLeft===0){ w.phase='rest'; w.tLeft=last.restSec||0; } } else { w.phase='warmup'; w.tLeft=w.warmupSec; } }
   updateWorkoutUI(); }

  function tickWorkout(){ if(!STATE.workout) return; const w=STATE.workout; if(w.phase==='done'){ stopTicker(); return; } w.tLeft=Math.max(0,(w.tLeft||0)-1); if(w.tLeft<=0){ nextPhase(); } updateWorkoutUI(); }

  function fmtMMSS(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
  function displaySpeedKmh(){ if(STATE.workout && (STATE.workout.phase==='rest' || STATE.workout.phase==='seriesrest')) return 0; return STATE.speedKmh; }

  function stepDurationLabel(w){ if(!w) return ''; if(w.phase==='warmup') return fmtMMSS(w.warmupSec); if(w.phase==='cooldown') return fmtMMSS(w.cooldownSec); if(w.phase==='seriesrest') return fmtMMSS(w.series[w.sIdx].seriesRestSec||0); if(w.phase==='rest') return fmtMMSS(w.series[w.sIdx].restSec||0); if(w.phase==='work') return fmtMMSS(w.series[w.sIdx].workSec||0); return ''; }
  function currentNote(w){ if(!w) return ''; if(w.phase==='work'){ const s=w.series[w.sIdx]; return (s && s.note)? ` – ${s.note}` : ''; } return ''; }
  function stepName(){ const w=STATE.workout; if(!w) return 'Ingen økt valgt'; const dur=stepDurationLabel(w); const note=currentNote(w); if(w.phase==='warmup') return `Oppvarming – ${dur}`; if(w.phase==='cooldown') return `Nedjogg – ${dur}`; if(w.phase==='seriesrest') return `Serie‑pause – ${dur}`; if(w.phase==='rest') return `Pause – serie ${w.sIdx+1}/${w.series.length} – rep ${w.rep}/${w.series[w.sIdx].reps} – ${dur}`; if(w.phase==='work') return `Drag – serie ${w.sIdx+1}/${w.series.length} – rep ${w.rep}/${w.series[w.sIdx].reps} – ${dur}${note}`; return '–'; }

  function computeNextSteps(){ const w=STATE.workout; if(!w) return ['–','–']; function clone(x){ return JSON.parse(JSON.stringify(x)); } function advance(obj){ if(obj.phase==='warmup'){ if(obj.series && obj.series.length){ obj.phase='work'; obj.sIdx=0; obj.rep=1; obj.tLeft=obj.series[0].workSec||0; if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[0].restSec||0; } } else { obj.phase='cooldown'; obj.tLeft=obj.cooldownSec; } return;} if(obj.phase==='work'){ const s=obj.series[obj.sIdx]; if(obj.rep < s.reps){ obj.phase='rest'; obj.tLeft=s.restSec||0; return;} if(obj.sIdx < obj.series.length-1){ const sr=s.seriesRestSec||0; if(sr>0){ obj.phase='seriesrest'; obj.tLeft=sr; return;} obj.sIdx++; obj.phase='work'; obj.rep=1; obj.tLeft=obj.series[obj.sIdx].workSec||0; if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[obj.sIdx].restSec||0; } return;} obj.phase='cooldown'; obj.tLeft=obj.cooldownSec; return;} if(obj.phase==='rest'){ const s=obj.series[obj.sIdx]; if(obj.rep < s.reps){ obj.rep++; obj.phase='work'; obj.tLeft=s.workSec||0; if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=s.restSec||0; } return; } if(obj.sIdx < obj.series.length-1){ const sr=s.seriesRestSec||0; if(sr>0){ obj.phase='seriesrest'; obj.tLeft=sr; return;} obj.sIdx++; obj.phase='work'; obj.rep=1; obj.tLeft=obj.series[obj.sIdx].workSec||0; if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[obj.sIdx].restSec||0; } return;} obj.phase='cooldown'; obj.tLeft=obj.cooldownSec; return;} if(obj.phase==='seriesrest'){ obj.sIdx++; obj.phase='work'; obj.rep=1; obj.tLeft=obj.series[obj.sIdx].workSec||0; if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[obj.sIdx].restSec||0; } return;} if(obj.phase==='cooldown'){ obj.phase='done'; obj.tLeft=0; return; } }
    const n1=clone(w); advance(n1); const n2=clone(n1); advance(n2);
    function label(o){ if(!o||o.phase==='done') return '–'; const dur=stepDurationLabel(o); const note=(o.phase==='work' && o.series && o.series[o.sIdx] && o.series[o.sIdx].note)? ` – ${o.series[o.sIdx].note}`:''; if(o.phase==='warmup') return `Oppvarming – ${dur}`; if(o.phase==='cooldown') return `Nedjogg – ${dur}`; if(o.phase==='seriesrest') return `Serie‑pause – ${dur}`; if(o.phase==='rest') return `Pause – s${o.sIdx+1} rep ${o.rep} – ${dur}`; if(o.phase==='work') return `Drag – s${o.sIdx+1} rep ${o.rep} – ${dur}${note}`; return '–'; }
    return [label(n1), label(n2)];
  }

  // --- Graph ---
  let canvas, ctx, dpr;
  function resizeCanvas(){ if(!canvas) return; const rect=canvas.getBoundingClientRect(); canvas.width=Math.floor(rect.width*(dpr||1)); canvas.height=Math.floor(rect.height*(dpr||1)); }
  function draw(){ if(!ctx||!canvas) return; const W=canvas.width,H=canvas.height; const padL=60*dpr,padR=60*dpr,padT=30*dpr,padB=24*dpr; const plotW=W-padL-padR, plotH=H-padT-padB; ctx.clearRect(0,0,W,H); if(plotW<=0||plotH<=0) return; const now=Date.now(); const xmin=now-STATE.windowSec*1000, xmax=now; const showHR=el('show-hr')?.checked ?? getNS('defHR',true); const showWatt=el('show-watt')?.checked ?? getNS('defWatt',true); const showSpeed=el('show-speed')?.checked ?? getNS('defSpeed',false); const showRPE=el('show-rpe')?.checked ?? getNS('defRPE',true); const hrMin= getNS('hrMin',80), hrMax=getNS('hrMax',200); const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin||1))*plotH; const sp = STATE.series.speed.filter(p=>p.t>=xmin); const wt = STATE.series.watt.filter(p=>p.t>=xmin); const rp = STATE.series.rpe.filter(p=>p.t>=xmin); const spVals=sp.map(p=>p.y), wtVals=wt.map(p=>p.y); const smin=Math.min(...(spVals.length?spVals:[0])), smax=Math.max(...(spVals.length?spVals:[1])); const wmin=Math.min(...(wtVals.length?wtVals:[0])), wmax=Math.max(...(wtVals.length?wtVals:[1])); const yWatt=v=> padT + (1 - (v-wmin)/Math.max(1,(wmax-wmin))) * plotH; const yRPE=v => padT + (1 - v/10) * plotH; const xTime=t=> padL + (t-xmin)/(xmax-xmin||1)*plotW; ctx.fillStyle='rgba(239,68,68,0.06)'; ctx.fillRect(padL, yHR(STATE.LT2), plotW, yHR(hrMax)-yHR(STATE.LT2)); ctx.fillStyle='rgba(37,99,235,0.06)'; ctx.fillRect(padL, yHR(STATE.LT1), plotW, yHR(STATE.LT2)-yHR(STATE.LT1)); ctx.fillStyle='rgba(16,163,74,0.06)'; ctx.fillRect(padL, yHR(hrMin), plotW, yHR(STATE.LT1)-yHR(hrMin)); ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=STATE.windowSec; sec+=60){ const t=xmin+sec*1000; const x=padL+(t-xmin)/(xmax-xmin||1)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke(); ctx.strokeStyle='#e5e7eb'; ctx.beginPath(); for(let v=hrMin; v<=hrMax; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke(); ctx.fillStyle='#ef4444'; ctx.font=`${12*dpr}px system-ui`; for(let v=hrMin; v<=hrMax; v+=20){ ctx.fillText(String(v), 8*dpr, yHR(v)+4*dpr); } if(showWatt){ ctx.fillStyle='#16a34a'; ctx.textAlign='right'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=wmin + (wmax-wmin)*i/ticks; const y=yWatt(v); ctx.fillText(String(Math.round(v)), W-8*dpr, y+4*dpr); } ctx.textAlign='left'; } if(showSpeed){ ctx.fillStyle='#2563eb'; ctx.textAlign='center'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=smin + (smax-smin)*i/ticks; const x=padL + plotW*i/ticks; ctx.fillText(String(v.toFixed(1)), x, (padT-8*dpr)); } ctx.textAlign='left'; } if(showRPE){ ctx.fillStyle='#d97706'; ctx.textAlign='right'; for(let v=0; v<=10; v+=2){ const y=yRPE(v); ctx.fillText(String(v), W-40*dpr, y+4*dpr); } ctx.textAlign='left'; } function drawLine(arr,color,ymap,alpha=1){ if(!arr || arr.length<2) return; ctx.strokeStyle=color; ctx.globalAlpha=alpha; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ if(p.t<xmin) continue; const x=xTime(p.t), y=ymap(p.y); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); ctx.globalAlpha=1; } if(showHR) drawLine(STATE.series.hr, '#ef4444', yHR, 1); if(showWatt) drawLine(STATE.series.watt, '#16a34a', yWatt, 1); if(showSpeed){ const ySpeed=v=> padT + (1 - (v - smin)/Math.max(1,(smax-smin))) * plotH; drawLine(STATE.series.speed, '#2563eb', ySpeed, 1); } if(showRPE) drawLine(STATE.series.rpe, '#d97706', yRPE, 1); if(STATE.ghost.enabled && STATE.ghost.avg && STATE.workout && STATE.workout.startedAt){ const elapsedSec=Math.max(0, Math.floor((Date.now() - new Date(STATE.workout.startedAt).getTime())/1000)); const startOff=Math.max(0, elapsedSec - STATE.windowSec); ctx.lineWidth=2*dpr; if(showHR){ ctx.strokeStyle='rgba(239,68,68,0.6)'; ctx.setLineDash([6,4]); ctx.beginPath(); let moved=false; for(let s=startOff; s<=elapsedSec; s++){ const val=STATE.ghost.avg.hr[s]; if(val==null) continue; const tAbs = xmin + (s - startOff)/(STATE.windowSec||1) * (xmax-xmin); const x = padL + (tAbs - xmin)/(xmax-xmin||1)*plotW; const y=yHR(val); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]); } if(showWatt){ ctx.strokeStyle='rgba(22,163,74,0.6)'; ctx.setLineDash([6,4]); ctx.beginPath(); let moved=false; for(let s=startOff; s<=elapsedSec; s++){ const val=STATE.ghost.avg.w[s]; if(val==null) continue; const tAbs = xmin + (s - startOff)/(STATE.windowSec||1) * (xmax-xmin); const x = padL + (tAbs - xmin)/(xmax-xmin||1)*plotW; const y=yWatt(val); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]); } }
  }

  function avgWindow(series, spanMs){ const now=Date.now(); const lo=now-spanMs; let sum=0,cnt=0; for(let i=series.length-1;i>=0;i--){ const p=series[i]; if(p.t<lo) break; sum+=p.y; cnt++; } return cnt? sum/cnt : null; }
  function calcSlope(){ const s=STATE.series.hr; if(!s.length) return null; const a20=avgWindow(s,20000), a120=avgWindow(s,120000); if(a20==null||a120==null) return null; return Math.round(a20-a120); }

  function finishSession(){ try{ const w=STATE.workout; if(!w) return; const nowIso=new Date().toISOString(); if(!w.startedAt) w.startedAt = STATE.logger.startTs? new Date(STATE.logger.startTs).toISOString(): nowIso; if(!w.endedAt) w.endedAt=nowIso; if(STATE.logger.points.length<2){ const t0=STATE.logger.startTs || Date.now(); const t1=Date.now(); if(STATE.logger.points.length===0) writeSample(t0); writeSample(t1); } const session={ id:'s'+Date.now(), name:w.name||'Økt', reps: (w.series||[]).reduce((a,s)=>a+(Number(s.reps)||0),0), startedAt:w.startedAt, endedAt:w.endedAt, lt1:STATE.LT1, lt2:STATE.LT2, massKg:STATE.massKg, rpeByRep:STATE.rpeByRep, points:STATE.logger.points }; const arr=getNS('sessions',[]); arr.push(session); setNS('sessions', arr); window.location.assign('results.html#'+session.id); } catch(e){ console.error('finishSession failed', e); alert('Klarte ikke å lagre økt: '+e.message); } }

  function init(){ try{
    // guard nav while running
    for(const a of (document.getElementById('topbar')?.querySelectorAll('a')||[])) a.addEventListener('click', (e)=>{ if(isWorkoutRunning()){ e.preventDefault(); alert('Avslutt økta før du navigerer bort fra hovedsida.'); } });
    window.addEventListener('beforeunload', (e)=>{ if(isWorkoutRunning()){ e.preventDefault(); e.returnValue='Økta pågår. Avslutt før du lukker/navigerer bort.'; } });

    // hookups
    document.getElementById('connect-hr')?.addEventListener('click', connectHR);
    document.getElementById('connect-treadmill')?.addEventListener('click', connectTreadmill);
    document.getElementById('rpe-dec')?.addEventListener('click', ()=> applyRPEChange(-0.5));
    document.getElementById('rpe-inc')?.addEventListener('click', ()=> applyRPEChange(+0.5));
    document.getElementById('rpe-now')?.addEventListener('change', ()=> applyRPEChange(0));

    for(const btn of document.querySelectorAll('.speed-btn')) btn.addEventListener('click', (ev)=> setSpeed(Number(ev.currentTarget.dataset.speed)) );
    document.getElementById('manual-speed')?.addEventListener('change',()=> setSpeed(document.getElementById('manual-speed').value));
    document.getElementById('manual-grade')?.addEventListener('change',()=> setGrade(document.getElementById('manual-grade').value));
    document.getElementById('speed-dec')?.addEventListener('click', ()=> setSpeed(STATE.speedKmh-0.1));
    document.getElementById('speed-inc')?.addEventListener('click', ()=> setSpeed(STATE.speedKmh+0.1));
    document.getElementById('grade-dec')?.addEventListener('click', ()=> setGrade(STATE.gradePct-0.5));
    document.getElementById('grade-inc')?.addEventListener('click', ()=> setGrade(STATE.gradePct+0.5));

    document.getElementById('btn-start-pause')?.addEventListener('click', ()=>{
      if(!STATE.workout){ const sel=document.getElementById('workout-select'); const customs=loadCustomWorkouts(); if(sel && sel.value && sel.value.startsWith('c:')){ const idx=Number(sel.value.split(':')[1]); const cw=customs[idx]; if(cw){ STATE.workout=workoutFromCfg(cw); } else { return alert('Velg en økt.'); } } else { return alert('Velg en økt.'); } }
      if(!STATE.ticker){
        // Require HR before starting
        if(STATE.hr==null){ alert('Koble til pulsbelte før du starter.'); return; }
        startTicker();
      } else { stopTicker(); }
    });
    document.getElementById('btn-skip-fwd')?.addEventListener('click', ()=>{ const w=STATE.workout; if(!w) return; if(w.phase==='warmup'){ w.tLeft=0; nextPhase(); }
      else if(w.phase==='cooldown'){ w.phase='done'; w.endedAt=new Date().toISOString(); writeSample(Date.now()); stopLogger(); finishSession(); }
      else { nextPhase(); } updateWorkoutUI(); });
    document.getElementById('btn-skip-back')?.addEventListener('click', ()=> prevPhase());
    document.getElementById('btn-stop-save')?.addEventListener('click', ()=>{ if(!STATE.workout) return; if(confirm('Stopp og lagre økta?')){ STATE.workout.endedAt=new Date().toISOString(); writeSample(Date.now()); stopLogger(); finishSession(); }});
    document.getElementById('btn-discard')?.addEventListener('click', ()=>{ if(confirm('Forkast økta (ikke lagre)?')){ if(STATE.ticker) stopTicker(); STATE.workout=null; STATE.logger.active=false; STATE.logger.points=[]; updateWorkoutUI(); draw(); }});

    // graph
    canvas=document.getElementById('chart'); ctx=canvas?.getContext('2d'); dpr=window.devicePixelRatio||1; window.addEventListener('resize', resizeCanvas); resizeCanvas();

    // ghost menu
    document.getElementById('ghost-picker')?.addEventListener('click', (e)=>{ e.stopPropagation(); document.getElementById('ghost-menu')?.classList.remove('hidden'); buildGhostList(); });
    document.addEventListener('click', (e)=>{ const menu=document.getElementById('ghost-menu'); const picker=document.getElementById('ghost-picker'); if(menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target!==picker) menu.classList.add('hidden'); });
    document.getElementById('ghost-select-all')?.addEventListener('click', (e)=>{ e.preventDefault(); document.getElementById('ghost-list')?.querySelectorAll('input[type=checkbox]')?.forEach(c=>c.checked=true); });
    document.getElementById('ghost-clear-all')?.addEventListener('click', (e)=>{ e.preventDefault(); document.getElementById('ghost-list')?.querySelectorAll('input[type=checkbox]')?.forEach(c=>c.checked=false); });
    document.getElementById('ghost-apply')?.addEventListener('click', ()=>{ const checks=document.getElementById('ghost-list').querySelectorAll('input[type=checkbox]'); STATE.ghost.ids=new Set(Array.from(checks).filter(c=>c.checked).map(c=>c.value)); computeGhostAverage(); document.getElementById('ghost-menu').classList.add('hidden'); });
    document.getElementById('ghost-enable')?.addEventListener('change', e=>{ STATE.ghost.enabled=e.target.checked; });

    // populate workouts and preselect (no autorun)
    populateWorkoutSelect();
    preselectIfRequested();

    // start ticks
    setInterval(()=>{ try{ const t=Date.now(); if(STATE.hr!=null) STATE.series.hr.push({t,y:STATE.hr}); const dispSpeed=displaySpeedKmh(); STATE.series.speed.push({t,y:dispSpeed}); const w=estimateWattExternal(dispSpeed, STATE.gradePct, STATE.massKg, STATE.cal.Crun, STATE.cal.K); STATE.series.watt.push({t,y:w}); STATE.series.rpe.push({t,y:STATE.rpe}); const cutoff=t-STATE.windowSec*1000; for(const k of ['hr','speed','watt','rpe']){ const arr=STATE.series[k]; while(arr.length && arr[0].t<cutoff) arr.shift(); } if(STATE.logger.active){ writeSample(t); } if(el('pulse')) el('pulse').textContent = (STATE.hr!=null?STATE.hr:'--'); if(el('watt')) el('watt').textContent = w||'--'; const s=calcSlope(); if(el('slope')) el('slope').textContent=(s!=null)?(s>0?`+${s}`:`${s}`):'--'; draw(); } catch(e){ showErr(e); } },1000);

    requestWakeLock();
  }catch(e){ showErr(e); }
  }

  function buildGhostList(){ const list=document.getElementById('ghost-list'); if(!list) return; list.innerHTML=''; const sessions = getNS('sessions',[]); if(!sessions.length){ list.innerHTML='<div class="small" style="padding:6px 8px">Ingen lagrede økter</div>'; return; } sessions.slice().reverse().forEach(s=>{ const dt=new Date(s.startedAt||Date.now()).toLocaleString(); const id=s.id; const row=document.createElement('label'); row.className='menu-item'; const cb=document.createElement('input'); cb.type='checkbox'; cb.value=id; cb.checked=STATE.ghost.ids.has(id); const span=document.createElement('span'); span.textContent=`${s.name||'Økt'} – ${dt}`; row.appendChild(cb); row.appendChild(span); list.appendChild(row); }); }

  function computeGhostAverage(){ const ids=Array.from(STATE.ghost.ids||[]); const sessions=getNS('sessions',[]).filter(s=> ids.includes(s.id)); if(!sessions.length){ STATE.ghost.avg=null; return; } const perSess = sessions.map(s=>{ const pts=s.points||[]; if(!pts.length) return {dur:0, hr:[], w:[]}; const t0=pts[0].ts; const tN=pts[pts.length-1].ts; const dur=Math.max(0, Math.round((tN - t0)/1000)); const hr=new Array(dur+1).fill(null), w=new Array(dur+1).fill(null); let idx=0; for(let sec=0; sec<=dur; sec++){ const target=t0+sec*1000; while(idx+1<pts.length && pts[idx+1].ts<=target) idx++; const p=pts[idx]; hr[sec]=p.hr||0; w[sec]=Math.round(p.watt||0); } return {dur, hr, w}; }); const maxDur = Math.max(...perSess.map(x=>x.dur)); const avgHR=new Array(maxDur+1).fill(0); const avgW=new Array(maxDur+1).fill(0); const cnt=new Array(maxDur+1).fill(0); perSess.forEach(ss=>{ for(let i=0;i<=ss.dur;i++){ if(ss.hr[i]!=null){ avgHR[i]+=ss.hr[i]; avgW[i]+=ss.w[i]; cnt[i]++; } } }); for(let i=0;i<=maxDur;i++){ if(cnt[i]>0){ avgHR[i]=Math.round(avgHR[i]/cnt[i]); avgW[i]=Math.round(avgW[i]/cnt[i]); } else { avgHR[i]=null; avgW[i]=null; } } STATE.ghost.avg={dur:maxDur, hr:avgHR, w:avgW}; }

  document.addEventListener('DOMContentLoaded', init);
})();
