function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){
  try{
    const v = localStorage.getItem(nsKey(k));
    if (v != null) return JSON.parse(v);
    const ov = localStorage.getItem(k);
    return ov != null ? JSON.parse(ov) : d;
  }catch(e){ return d; }
}
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }
function delNS(k){ localStorage.removeItem(nsKey(k)); }

(function(){
  const el = id => document.getElementById(id);
  const errCard = () => el('err-card');
  const errLog  = () => el('err-log');

  function showErr(e){
    try{
      errCard()?.classList.remove('hidden');
      const msg = (e && e.stack) ? e.stack : (e?.message || String(e));
      errLog() && (errLog().textContent += msg + '\n');
    }catch(_){}
  }
  window.addEventListener('error', e => showErr(e.error || e.message));
  window.addEventListener('unhandledrejection', e => showErr(e.reason || e));

  const RPE_TXT = {
    1:"Ingen anstrengelse",2:"Svært lett",3:"Lett",4:"Moderat",5:"Middels / kontrollert hard",
    6:"Moderat hard",7:"Hard",8:"Svært hard",9:"Nesten maksimal",10:"Maksimal innsats"
  };

  const STATE = {
    hr: null, speedKmh: 0, gradePct: 0,
    massKg: Number(getNS('massKg',75)),
    LT1: Number(getNS('LT1',135)), LT2: Number(getNS('LT2',160)),
    series:{hr:[], speed:[], watt:[], rpe:[]}, windowSec:900,
    workout:null, ticker:null, wakeLock:null,
    rpe:0, rpeByRep:{},
    logger:{active:false, points:[], startTs:null, dist:0},
    ghost:{enabled:false, ids:new Set(), avg:null},
    cal:{K:Number(getNS('calK',1.0)), Crun:Number(getNS('cRun',1.0))}
  };

  function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
  function fmtMMSS(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
  function displaySpeedKmh(){ if(STATE.workout && (STATE.workout.phase==='rest' || STATE.workout.phase==='seriesrest')) return 0; return STATE.speedKmh; }

  async function requestWakeLock(){
    try{
      if('wakeLock' in navigator){
        STATE.wakeLock = await navigator.wakeLock.request('screen');
        STATE.wakeLock.addEventListener('release', ()=>{ STATE.wakeLock=null; });
      }
    }catch(e){}
  }

  async function connectHR(){
    try{
      if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth');
      const device = await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]});
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const ch = await service.getCharacteristic('heart_rate_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', ev=>{
        const dv = ev.target.value;
        const flags = dv.getUint8(0);
        const hr16 = flags & 1;
        let i = 1;
        const bpm = hr16? dv.getUint16(i,true) : dv.getUint8(i);
        STATE.hr = bpm;
      });
    }catch(e){ console.error(e); alert('Kunne ikke koble til pulsbelte: '+e); }
  }

  // ---- V9.15 PATCH: FTMS tredemølle – alias 0x2ACD + korrekt parsing iht. Flags ----
  async function connectTreadmill(){
    try{
      if(!('bluetooth' in navigator)) return alert('Nettleseren støtter ikke Web Bluetooth');

      // FTMS-tjeneste (0x1826)
      const device = await navigator.bluetooth.requestDevice({ filters:[{ services:[0x1826] }] });
      const server = await device.gatt.connect();
      const ftms  = await server.getPrimaryService(0x1826);

      // Treadmill Data (0x2ACD): bruk alias (robust), alternativ er kanonisk lowercase streng
      const tdc   = await ftms.getCharacteristic(0x2ACD);
      await tdc.startNotifications();

      const status = el('ftms-status');
      if(status){
        status.textContent = 'FTMS: Tilkoblet';
        status.classList.add('connected');
      }

      // Parsing iht. FTMS Treadmill Data:
      //  - Flags (2 byte)
      //  - Instantaneous Speed (ALLTID): uint16, 0.01 km/t
      //  - (bit1) Average Speed: uint16, 0.01 km/t
      //  - (bit2) Total Distance: uint24, meter
      //  - (bit3) Inclination: sint16, 0.1 %  + Ramp Angle: sint16, 0.1°
      tdc.addEventListener('characteristicvaluechanged', ev=>{
        const dv = ev.target.value;
        let i = 0;

        const flags = dv.getUint16(i, true); i += 2;

        // Instantaneous Speed (obligatorisk)
        const instSpeedKmh = dv.getUint16(i, true) / 100; i += 2;
        setSpeed(instSpeedKmh);

        // Hopp over (bit1) Average Speed dersom til stede
        if (flags & (1 << 1)) i += 2;

        // Hopp over (bit2) Total Distance (uint24)
        if (flags & (1 << 2)) i += 3;

        // Les (bit3) Inclination + Ramp Angle dersom til stede
        if (flags & (1 << 3)) {
          const incline01pct = dv.getInt16(i, true); i += 2; // 0.1 %
          const rampAngle01d = dv.getInt16(i, true); i += 2; // 0.1 °
          setGrade(incline01pct / 10); // konverter til prosent
          // rampAngle01d kan brukes ved behov
        }
      });

      device.addEventListener('gattserverdisconnected', ()=>{
        if(status){
          status.textContent='FTMS: Frakoblet';
          status.classList.remove('connected');
        }
      });
    }catch(e){
      console.error(e);
      alert('Kunne ikke koble til tredemølle: '+e);
    }
  }
  // ---- Slutt på patch ----

  function setSpeed(v){
    STATE.speedKmh = Math.max(0, Number(v)||0);
    el('manual-speed') && (el('manual-speed').value = STATE.speedKmh.toFixed(1));
  }
  function setGrade(v){
    STATE.gradePct = Number(v)||0;
    el('manual-grade') && (el('manual-grade').value = STATE.gradePct.toFixed(1));
  }

  function rpeDescription(v){
    const n = Math.round(clamp(Number(v)||0,0,10));
    return (n in RPE_TXT)? `RPE ${n} – ${RPE_TXT[n]}` : 'RPE 0–10 – velg et nivå';
  }
  function setRPE(v){
    STATE.rpe = clamp(Number(v)||0,0,10);
    if(el('rpe-now')) el('rpe-now').value = STATE.rpe.toFixed(1);
    const lab = el('rpe-desc');
    if(lab) lab.textContent = rpeDescription(STATE.rpe);
  }
  function applyRPEChange(delta){ setRPE((Number(el('rpe-now')?.value)||0)+delta); }

  const BUILDER_KEY='custom_workouts_v2';
  function loadCustomWorkouts(){ return getNS(BUILDER_KEY,[]); }
  function workoutFromCfg(cw){
    return {
      name:cw.name||'Økt', phase:'warmup', startedAt:null, endedAt:null,
      warmupSec:Number(cw.warmupSec)||0, cooldownSec:Number(cw.cooldownSec)||0,
      series:(cw.series||[]).map(s=>({reps:s.reps,workSec:s.workSec,restSec:s.restSec,seriesRestSec:s.seriesRestSec,note:s.note||''})),
      sIdx:-1, rep:0, tLeft:Number(cw.warmupSec)||0
    }
  }
  function computeTotalDur(cfg){
    const s=cfg.series||[]; let total=Number(cfg.warmupSec||0)+Number(cfg.cooldownSec||0);
    for(const x of s){ total += Number(x.reps||0) * (Number(x.workSec||0) + Number(x.restSec||0)); total += Number(x.seriesRestSec||0); }
    return total;
  }
  function populateWorkoutSelect(){
    const sel=el('workout-select'); if(!sel) return; sel.innerHTML='';
    const customs=loadCustomWorkouts();
    customs.forEach((cw,idx)=>{
      const opt=document.createElement('option');
      opt.value='c:'+idx; opt.textContent=cw.name||('Mal '+(idx+1)); sel.appendChild(opt);
    });
    sel.addEventListener('change', ()=>{
      const v=sel.value;
      if(v && v.startsWith('c:')){
        const idx=Number(v.split(':')[1]);
        const cw=loadCustomWorkouts()[idx];
        if(cw){
          STATE.workout=workoutFromCfg(cw);
          updateWorkoutUI();
          setNS('lastPreset','custom:'+idx);
          const sd=el('sel-dur'); if(sd) sd.textContent = fmtMMSS(computeTotalDur(cw));
        }
      }
    });
  }
  function preselectIfRequested(){
    const ar=getNS('preselect',null); if(!ar) return;
    if(ar.type==='custom'){
      const arr=loadCustomWorkouts(); const i=Number(ar.index||0); const cw=arr[i];
      if(cw){
        const sel=el('workout-select'); if(sel){ sel.value='c:'+i; }
        STATE.workout=workoutFromCfg(cw); updateWorkoutUI();
        const sd=el('sel-dur'); if(sd) sd.textContent = fmtMMSS(computeTotalDur(cw));
      }
    }
    delNS('preselect');
  }

  function startTicker(){
    if(STATE.ticker) return;
    if(STATE.workout && !STATE.workout.startedAt){
      STATE.workout.startedAt=new Date().toISOString();
      if(!STATE.logger.active) startLogger();
    }
    STATE.ticker=setInterval(tickWorkout,1000);
    toggleStartPauseUI(true);
  }
  function stopTicker(){ if(STATE.ticker){ clearInterval(STATE.ticker); STATE.ticker=null; } toggleStartPauseUI(false); }
  function toggleStartPauseUI(running){
    const icon=el('sp-icon'), label=el('sp-label'); if(!icon||!label) return;
    if(running){ icon.className='ph-pause'; label.textContent='Pause'; }
    else{ icon.className='ph-play'; label.textContent='Start'; }
  }

  function nextPhase(){
    const w=STATE.workout; if(!w) return;
    if(w.phase==='warmup'){
      if(w.series && w.series.length){
        w.phase='work'; w.sIdx=0; w.rep=1; w.tLeft=w.series[0].workSec||0;
        if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[0].restSec||0; }
      } else { w.phase='cooldown'; w.tLeft=w.cooldownSec; }
      return;
    }
    if(w.phase==='work'){
      const s=w.series[w.sIdx];
      if(w.rep < s.reps){ w.phase='rest'; w.tLeft=s.restSec||0; return; }
      if(w.sIdx < w.series.length-1){
        const sr=s.seriesRestSec||0;
        if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; return; }
        w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec||0;
        if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[w.sIdx].restSec||0; }
        return;
      }
      w.phase='cooldown'; w.tLeft=w.cooldownSec; return;
    }
    if(w.phase==='rest'){
      const s=w.series[w.sIdx];
      if(w.rep < s.reps){
        w.rep++; w.phase='work'; w.tLeft=s.workSec||0;
        if(w.tLeft===0){ if(w.rep<=s.reps){ w.phase='rest'; w.tLeft=s.restSec||0; } }
        return;
      }
      if(w.sIdx < w.series.length-1){
        const sr=s.seriesRestSec||0;
        if(sr>0){ w.phase='seriesrest'; w.tLeft=sr; return; }
        w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec||0;
        if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[w.sIdx].restSec||0; }
        return;
      }
      w.phase='cooldown'; w.tLeft=w.cooldownSec; return;
    }
    if(w.phase==='seriesrest'){
      w.sIdx++; w.phase='work'; w.rep=1; w.tLeft=w.series[w.sIdx].workSec||0;
      if(w.tLeft===0){ w.phase='rest'; w.tLeft=w.series[w.sIdx].restSec||0; }
      return;
    }
    if(w.phase==='cooldown'){
      w.phase='done'; w.tLeft=0; w.endedAt=new Date().toISOString();
      writeSample(Date.now()); stopLogger(); finishSession(); return;
    }
  }
  function prevPhase(){
    const w=STATE.workout; if(!w) return;
    if(w.phase==='work'){
      const s=w.series[w.sIdx];
      if(w.rep>1){ w.phase='rest'; w.rep--; w.tLeft=s.restSec||0; }
      else{
        if(w.sIdx>0){
          w.sIdx--; const ps=w.series[w.sIdx];
          w.phase='work'; w.rep=ps.reps; w.tLeft=ps.workSec||0;
          if(w.tLeft===0){ w.phase='rest'; w.tLeft=ps.restSec||0; }
        }else{ w.phase='warmup'; w.tLeft=w.warmupSec; }
      }
    }
    else if(w.phase==='rest'){
      const s=w.series[w.sIdx]; w.phase='work'; w.tLeft=s.workSec||0;
      if(w.tLeft===0){ w.phase='rest'; w.tLeft=s.restSec||0; }
    }
    else if(w.phase==='seriesrest'){
      const prev=w.series[w.sIdx-1];
      if(prev){
        w.sIdx--; w.phase='work'; w.rep=prev.reps; w.tLeft=prev.workSec||0;
        if(w.tLeft===0){ w.phase='rest'; w.tLeft=prev.restSec||0; }
      }else{ w.phase='warmup'; w.tLeft=w.warmupSec; }
    }
    else if(w.phase==='cooldown'){
      const last=w.series[w.series.length-1];
      if(last){
        w.phase='work'; w.sIdx=w.series.length-1; w.rep=last.reps; w.tLeft=last.workSec||0;
        if(w.tLeft===0){ w.phase='rest'; w.tLeft=last.restSec||0; }
      }else{ w.phase='warmup'; w.tLeft=w.warmupSec; }
    }
    updateWorkoutUI();
  }

  function tickWorkout(){
    if(!STATE.workout) return;
    const w=STATE.workout; if(w.phase==='done'){ stopTicker(); return; }
    w.tLeft = Math.max(0,(w.tLeft||0)-1);
    if(w.tLeft<=0){ nextPhase(); }
    updateWorkoutUI();
  }

  function estimateWattExternal(speedKmh, gradePct, massKg, Crun, K){
    const g=9.81, v=(speedKmh||0)/3.6, grade=(gradePct||0)/100;
    const mech = massKg * (g * v * grade + Crun * v);
    return Math.max(0, Math.round(mech * (K||1)));
  }

  function startLogger(){ STATE.logger.active=true; STATE.logger.startTs=Date.now(); STATE.logger.points=[]; STATE.logger.dist=0; writeSample(STATE.logger.startTs); }
  function stopLogger(){ STATE.logger.active=false; }
  function writeSample(t){
    const dispSpeed=displaySpeedKmh();
    const speed_ms=dispSpeed/3.6;
    const w=estimateWattExternal(dispSpeed, STATE.gradePct, STATE.massKg, STATE.cal.Crun, STATE.cal.K);
    const wstate=STATE.workout;
    STATE.logger.dist += speed_ms * (STATE.logger.points.length? (t-STATE.logger.points[STATE.logger.points.length-1].ts)/1000 : 0);
    STATE.logger.points.push({
      ts:t, iso:new Date(t).toISOString(), hr:STATE.hr||0, speed_ms,
      grade:STATE.gradePct||0, dist_m:STATE.logger.dist, rpe:STATE.rpe,
      phase:wstate?wstate.phase:'', rep:wstate&&wstate.phase==='work'?wstate.rep:0, watt:w
    });
  }
  function finishSession(){
    try{
      const w=STATE.workout; if(!w) return;
      const nowIso=new Date().toISOString();
      if(!w.startedAt) w.startedAt = STATE.logger.startTs? new Date(STATE.logger.startTs).toISOString(): nowIso;
      if(!w.endedAt)   w.endedAt   = nowIso;
      if(STATE.logger.points.length<2){
        const t0=STATE.logger.startTs || Date.now();
        const t1=Date.now();
        if(STATE.logger.points.length===0) writeSample(t0);
        writeSample(t1);
      }
      const session={
        id:'s'+Date.now(), name:w.name||'Økt',
        reps:(w.series||[]).reduce((a,s)=>a+(Number(s.reps)||0),0),
        startedAt:w.startedAt, endedAt:w.endedAt,
        lt1:STATE.LT1, lt2:STATE.LT2, massKg:STATE.massKg, rpeByRep:STATE.rpeByRep,
        points:STATE.logger.points
      };
      const arr=getNS('sessions',[]); arr.push(session); setNS('sessions', arr);
      window.location.assign('results.html#'+session.id);
    }catch(e){ console.error('finishSession failed', e); alert('Klarte ikke å lagre økt: '+e.message); }
  }

  function stepDurationLabel(w){
    if(!w) return '';
    if(w.phase==='warmup')     return fmtMMSS(w.warmupSec);
    if(w.phase==='cooldown')   return fmtMMSS(w.cooldownSec);
    if(w.phase==='seriesrest') return fmtMMSS(w.series[w.sIdx].seriesRestSec||0);
    if(w.phase==='rest')       return fmtMMSS(w.series[w.sIdx].restSec||0);
    if(w.phase==='work')       return fmtMMSS(w.series[w.sIdx].workSec||0);
    return '';
  }
  function currentNote(w){
    if(!w) return '';
    if(w.phase==='work'){ const s=w.series[w.sIdx]; return (s && s.note)? ` – ${s.note}` : ''; }
    return '';
  }
  function stepName(){
    const w=STATE.workout; if(!w) return 'Ingen økt valgt';
    const dur=stepDurationLabel(w); const note=currentNote(w);
    if(w.phase==='warmup')     return `Oppvarming – ${dur}`;
    if(w.phase==='cooldown')   return `Nedjogg – ${dur}`;
    if(w.phase==='seriesrest') return `Serie‑pause – ${dur}`;
    if(w.phase==='rest')       return `Pause – serie ${w.sIdx+1}/${w.series.length} – rep ${w.rep}/${w.series[w.sIdx].reps} – ${dur}`;
    if(w.phase==='work')       return `Drag – serie ${w.sIdx+1}/${w.series.length} – rep ${w.rep}/${w.series[w.sIdx].reps} – ${dur}${note}`;
    return '–';
  }
  function computeNextSteps(){
    const w=STATE.workout; if(!w) return ['–','–'];
    function clone(x){ return JSON.parse(JSON.stringify(x)); }
    function advance(obj){
      if(obj.phase==='warmup'){
        if(obj.series && obj.series.length){
          obj.phase='work'; obj.sIdx=0; obj.rep=1; obj.tLeft=obj.series[0].workSec||0;
          if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[0].restSec||0; }
        } else { obj.phase='cooldown'; obj.tLeft=obj.cooldownSec; }
        return;
      }
      if(obj.phase==='work'){
        const s=obj.series[obj.sIdx];
        if(obj.rep < s.reps){ obj.phase='rest'; obj.tLeft=s.restSec||0; return; }
        if(obj.sIdx < obj.series.length-1){
          const sr=s.seriesRestSec||0; if(sr>0){ obj.phase='seriesrest'; obj.tLeft=sr; return; }
          obj.sIdx++; obj.phase='work'; obj.rep=1; obj.tLeft=obj.series[obj.sIdx].workSec||0;
          if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[obj.sIdx].restSec||0; }
          return;
        }
        obj.phase='cooldown'; obj.tLeft=obj.cooldownSec; return;
      }
      if(obj.phase==='rest'){
        const s=obj.series[obj.sIdx];
        if(obj.rep < s.reps){
          obj.rep++; obj.phase='work'; obj.tLeft=s.workSec||0;
          if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=s.restSec||0; }
          return;
        }
        if(obj.sIdx < obj.series.length-1){
          const sr=s.seriesRestSec||0; if(sr>0){ obj.phase='seriesrest'; obj.tLeft=sr; return; }
          obj.sIdx++; obj.phase='work'; obj.rep=1; obj.tLeft=obj.series[obj.sIdx].workSec||0;
          if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[obj.sIdx].restSec||0; }
          return;
        }
        obj.phase='cooldown'; obj.tLeft=obj.cooldownSec; return;
      }
      if(obj.phase==='seriesrest'){
        obj.sIdx++; obj.phase='work'; obj.rep=1; obj.tLeft=obj.series[obj.sIdx].workSec||0;
        if(obj.tLeft===0){ obj.phase='rest'; obj.tLeft=obj.series[obj.sIdx].restSec||0; }
        return;
      }
      if(obj.phase==='cooldown'){ obj.phase='done'; obj.tLeft=0; return; }
    }
    const n1=clone(w); advance(n1); const n2=clone(n1); advance(n2);
    function label(o){
      if(!o||o.phase==='done') return '–';
      const dur=stepDurationLabel(o);
      const note=(o.phase==='work' && o.series && o.series[o.sIdx] && o.series[o.sIdx].note)? ` – ${o.series[o.sIdx].note}`:'';
      if(o.phase==='warmup')     return `Oppvarming – ${dur}`;
      if(o.phase==='cooldown')   return `Nedjogg – ${dur}`;
      if(o.phase==='seriesrest') return `Serie‑pause – ${dur}`;
      if(o.phase==='rest')       return `Pause – s${o.sIdx+1} rep ${o.rep} – ${dur}`;
      if(o.phase==='work')       return `Drag – s${o.sIdx+1} rep ${o.rep} – ${dur}${note}`;
      return '–';
    }
    return [label(n1), label(n2)];
  }
  function updateWorkoutUI(){
    const tmr=el('timer'), bar=el('progress'), cs=el('current-step-name');
    if(!tmr||!bar||!cs){ return; }
    if(!STATE.workout){
      cs.textContent='Ingen økt valgt'; tmr.textContent='00:00'; bar.style.width='0%';
      el('next1').textContent='Neste: –'; el('next2').textContent='Deretter: –';
      return;
    }
    const w=STATE.workout; cs.textContent=stepName();
    const total = (w.phase==='warmup')?w.warmupSec
                : (w.phase==='cooldown')?w.cooldownSec
                : (w.phase==='seriesrest')? (w.series[w.sIdx].seriesRestSec||0)
                : (w.phase==='rest')? (w.series[w.sIdx].restSec||0)
                : (w.phase==='work')? (w.series[w.sIdx].workSec||0)
                : 1;
    tmr.textContent=fmtMMSS(w.tLeft);
    const pct=Math.min(100, Math.max(0, 100*(1 - (w.tLeft/Math.max(1,total)))));
    bar.style.width=`${pct}%`;
    const [n1,n2]=computeNextSteps();
    el('next1').textContent='Neste: '+n1;
    el('next2').textContent='Deretter: '+n2;
  }

  let canvas, ctx, dpr;
  function resizeCanvas(){
    if(!canvas) return;
    const rect=canvas.getBoundingClientRect();
    canvas.width=Math.floor(rect.width*(dpr||1));
    canvas.height=Math.floor(rect.height*(dpr||1));
  }
  function draw(){
    try{
      if(!ctx||!canvas) return;
      const W=canvas.width, H=canvas.height;
      const dpr = window.devicePixelRatio||1;
      const padL=60*dpr, padR=60*dpr, padT=30*dpr, padB=24*dpr;
      const plotW=W-padL-padR, plotH=H-padT-padB;
      ctx.clearRect(0,0,W,H);
      if(plotW<=0||plotH<=0) return;

      const now=Date.now();
      const xmin=now-STATE.windowSec*1000, xmax=now;
      const showHR = document.getElementById('show-hr')?.checked ?? getNS('defHR',true);
      const showWatt = document.getElementById('show-watt')?.checked ?? getNS('defWatt',true);
      const showSpeed= document.getElementById('show-speed')?.checked ?? getNS('defSpeed',false);
      const showRPE = document.getElementById('show-rpe')?.checked ?? getNS('defRPE',true);

      const HR = (STATE.series.hr||[]).filter(p=>p.t>=xmin);
      const WT = (STATE.series.watt||[]).filter(p=>p.t>=xmin);
      const SP = (STATE.series.speed||[]).filter(p=>p.t>=xmin);
      const RP = (STATE.series.rpe||[]).filter(p=>p.t>=xmin);

      const hrVals = HR.map(p=>p.y).filter(v=>v!=null);
      const wVals = WT.map(p=>p.y).filter(v=>v!=null);
      const sVals = SP.map(p=>p.y).filter(v=>v!=null);
      const rVals = RP.map(p=>p.y).filter(v=>v!=null);

      // Axis locks
      const lockHR = getNS('hrLock', false);
      let hrMin = lockHR? Number(getNS('hrMin',80)) : (hrVals.length? Math.min(...hrVals):80);
      let hrMax = lockHR? Number(getNS('hrMax',200)) : (hrVals.length? Math.max(...hrVals):200);
      if(!lockHR){ hrMin=Math.floor(hrMin-2); hrMax=Math.ceil(hrMax+2); if(hrMax<=hrMin) hrMax=hrMin+1; }

      const lockW = getNS('wLock', false);
      let wMin = lockW? Number(getNS('wMin',0)) : (wVals.length? Math.min(...wVals):0);
      let wMax = lockW? Number(getNS('wMax',400)) : (wVals.length? Math.max(...wVals):400);
      if(!lockW){ const pad=Math.max(10, Math.round((wMax-wMin)*0.05)); wMin-=pad; wMax+=pad; if(wMax<=wMin) wMax=wMin+1; }

      const lockS = getNS('sLock', false);
      let sMin = lockS? Number(getNS('sMin',0)) : (sVals.length? Math.min(...sVals):0);
      let sMax = lockS? Number(getNS('sMax',20)) : (sVals.length? Math.max(...sVals):20);
      if(!lockS){ const pad=(sMax-sMin)*0.05||0.5; sMin-=pad; sMax+=pad; if(sMax<=sMin) sMax=sMin+0.5; }

      const lockR = getNS('rpeLock', false);
      let rMin = lockR? Number(getNS('rpeMin',0)) : 0;
      let rMax = lockR? Number(getNS('rpeMax',10)) : 10;

      const xTime = t => padL + (t-xmin)/Math.max(1,(xmax-xmin))*plotW;
      const yHR   = v => padT + (1 - (v-hrMin)/Math.max(1,(hrMax-hrMin)))*plotH;
      const yWatt = v => padT + (1 - (v-wMin)/Math.max(1,(wMax-wMin)))*plotH;
      const ySpeed= v => padT + (1 - (v-sMin)/Math.max(1,(sMax-sMin)))*plotH;
      const yRPE  = v => padT + (1 - (v-rMin)/Math.max(1,(rMax-rMin)))*plotH;

      // LT background bands (based on HR scale)
      const LT1 = STATE.LT1, LT2 = STATE.LT2;
      const yLT1 = yHR(LT1), yLT2 = yHR(LT2);
      ctx.save();
      ctx.fillStyle = 'rgba(220,38,38,0.10)'; // over LT2
      ctx.fillRect(padL, padT, plotW, Math.max(0, yLT2-padT));
      ctx.fillStyle = 'rgba(217,119,6,0.08)'; // LT1-LT2
      ctx.fillRect(padL, Math.max(padT,yLT2), plotW, Math.max(0, Math.min(H-padB, yLT1) - Math.max(padT, yLT2)));
      ctx.fillStyle = 'rgba(22,163,74,0.08)'; // under LT1
      ctx.fillRect(padL, Math.max(padT,yLT1), plotW, Math.max(0, (H-padB) - Math.max(padT, yLT1)));
      ctx.restore();

      // Minute grid
      ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1*dpr; ctx.beginPath();
      const windowSec = STATE.windowSec;
      for(let sec=0; sec<=windowSec; sec+=60){ const t=xmin+sec*1000; const x=padL+(t-xmin)/Math.max(1,(xmax-xmin))*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke();

      // Y labels: HR left
      ctx.fillStyle='#ef4444'; ctx.font=`${12*dpr}px system-ui`; ctx.textAlign='left';
      const hrTick = Math.max(10, Math.round((hrMax-hrMin)/6/10)*10);
      for(let v=Math.ceil(hrMin/hrTick)*hrTick; v<=hrMax; v+=hrTick){ ctx.fillText(String(v), 8*dpr, yHR(v)+4*dpr); }
      // Watt right (outer)
      if(showWatt){ ctx.fillStyle='#16a34a'; ctx.textAlign='right'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=wMin+(wMax-wMin)*i/ticks; ctx.fillText(String(Math.round(v)), W-8*dpr, yWatt(v)+4*dpr);} }
      // RPE right inner
      if(showRPE){ ctx.fillStyle='#d97706'; ctx.textAlign='right'; for(let v=rMin; v<=rMax; v+=2){ ctx.fillText(String(v), W-40*dpr, yRPE(v)+4*dpr); } }

      function drawLine(arr, color, ymap, alpha=1){ if(!arr||arr.length<2) return; ctx.strokeStyle=color; ctx.globalAlpha=alpha; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ if(p.t<xmin) continue; const x=xTime(p.t), y=ymap(p.y); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); ctx.globalAlpha=1; }

      if(showHR)   drawLine(HR, '#ef4444', yHR, 1);
      if(showWatt) drawLine(WT, '#16a34a', yWatt, 1);
      if(showSpeed)drawLine(SP, '#2563eb', ySpeed, 1);
      if(showRPE)  drawLine(RP, '#d97706', yRPE, 1);

      // Ghost overlay
      const ghostEnabled = document.getElementById('ghost-enable')?.checked || false;
      if(ghostEnabled && STATE.ghost && STATE.ghost.avg && STATE.workout && STATE.workout.startedAt){
        const g=STATE.ghost.avg; const startTs=new Date(STATE.workout.startedAt).getTime();
        const gHR=[], gW=[]; for(let t=xmin; t<=xmax; t+=1000){ const sec=Math.floor((t-startTs)/1000); if(sec>=0 && sec<=g.dur){ if(g.hr[sec]!=null) gHR.push({t,y:g.hr[sec]}); if(g.w[sec]!=null) gW.push({t,y:g.w[sec]}); }}
        if(showHR && gHR.length>1) drawLine(gHR, '#ef4444', yHR, 0.35);
        if(showWatt && gW.length>1) drawLine(gW, '#16a34a', yWatt, 0.35);
      }

      // Slope (20s - 120s)
      function avgSince(arr, tmin){ const xs=arr.filter(p=>p.t>=tmin).map(p=>p.y).filter(v=>v!=null); if(!xs.length) return null; return xs.reduce((a,b)=>a+b,0)/xs.length; }
      const a20=avgSince(STATE.series.hr||[], now-20000), a120=avgSince(STATE.series.hr||[], now-120000);
      const slopeVal=(a20!=null && a120!=null)? Math.round(a20-a120) : null;
      const slopeEl=document.getElementById('slope'); if(slopeEl) slopeEl.textContent = (slopeVal==null? '--': String(slopeVal));

    }catch(e){
      try{ document.getElementById('err-card')?.classList.remove('hidden'); const L=document.getElementById('err-log'); if(L) L.textContent += (e?.stack||e?.message||String(e))+"\n"; }catch(_){}
    }
}

  function buildGhostList(){
    const list=el('ghost-list'); if(!list) return; list.innerHTML='';
    const sessions = getNS('sessions',[]);
    if(!sessions.length){
      list.innerHTML='<div class="small" style="padding:6px 8px">Ingen lagrede økter</div>';
      return;
    }
    sessions.slice().reverse().forEach(s=>{
      const dt=new Date(s.startedAt||Date.now()).toLocaleString();
      const id=s.id;
      const row=document.createElement('label'); row.className='menu-item';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.value=id; cb.checked=STATE.ghost.ids.has(id);
      const span=document.createElement('span'); span.textContent=`${s.name||'Økt'} – ${dt}`;
      row.appendChild(cb); row.appendChild(span); list.appendChild(row);
    });
  }
  function computeGhostAverage(){
    const ids=Array.from(STATE.ghost.ids||[]);
    const sessions=getNS('sessions',[]).filter(s=> ids.includes(s.id));
    if(!sessions.length){ STATE.ghost.avg=null; return; }
    const perSess = sessions.map(s=>{
      const pts=s.points||[]; if(!pts.length) return {dur:0, hr:[], w:[]};
      const t0=pts[0].ts; const tN=pts[pts.length-1].ts;
      const dur=Math.max(0, Math.round((tN - t0)/1000));
      const hr=new Array(dur+1).fill(null), w=new Array(dur+1).fill(null);
      let idx=0;
      for(let sec=0; sec<=dur; sec++){
        const target=t0+sec*1000;
        while(idx+1<pts.length && pts[idx+1].ts<=target) idx++;
        const p=pts[idx]; hr[sec]=p.hr||0; w[sec]=Math.round(p.watt||0);
      }
      return {dur, hr, w};
    });
    const maxDur = Math.max(...perSess.map(x=>x.dur));
    const avgHR=new Array(maxDur+1).fill(0); const avgW=new Array(maxDur+1).fill(0); const cnt=new Array(maxDur+1).fill(0);
    perSess.forEach(ss=>{ for(let i=0;i<=ss.dur;i++){ if(ss.hr[i]!=null){ avgHR[i]+=ss.hr[i]; avgW[i]+=ss.w[i]; cnt[i]++; } } });
    for(let i=0;i<=maxDur;i++){
      if(cnt[i]>0){ avgHR[i]=Math.round(avgHR[i]/cnt[i]); avgW[i]=Math.round(avgW[i]/cnt[i]); }
      else { avgHR[i]=null; avgW[i]=null; }
    }
    STATE.ghost.avg={dur:maxDur, hr:avgHR, w:avgW};
  }

  function ensureModalCompatOrStart(){
    const m=el('nohr-modal');
    if(!m){
      const want=confirm('Pulsbelte ikke tilkoblet. Koble til nå?');
      if(want) return connectHR(); else return startTicker();
    }
    m.classList.add('open');
  }

  function init(){
    try{
      for(const a of (document.getElementById('topbar')?.querySelectorAll('a')||[]))
        a.addEventListener('click', (e)=>{
          if(STATE.workout && STATE.ticker && STATE.workout.phase!=='done'){
            e.preventDefault(); alert('Avslutt økta før du navigerer bort fra hovedsida.');
          }
        });
      window.addEventListener('beforeunload', (e)=>{
        if(STATE.workout && STATE.ticker && STATE.workout.phase!=='done'){
          e.preventDefault(); e.returnValue='Økta pågår. Avslutt før du lukker/navigerer bort.';
        }
      });

      el('connect-hr')?.addEventListener('click', connectHR);
      el('connect-treadmill')?.addEventListener('click', connectTreadmill);

      el('rpe-dec')?.addEventListener('click', ()=> applyRPEChange(-0.5));
      el('rpe-inc')?.addEventListener('click', ()=> applyRPEChange(+0.5));
      el('rpe-now')?.addEventListener('change', ()=> applyRPEChange(0));
      setRPE(getNS('lastRPE', 0));

      for(const btn of document.querySelectorAll('.speed-btn'))
        btn.addEventListener('click', (ev)=> setSpeed(Number(ev.currentTarget.dataset.speed)) );
      el('manual-speed')?.addEventListener('change',()=> setSpeed(el('manual-speed').value));
      el('manual-grade')?.addEventListener('change',()=> setGrade(el('manual-grade').value));
      el('speed-dec')?.addEventListener('click', ()=> setSpeed(STATE.speedKmh-0.1));
      el('speed-inc')?.addEventListener('click', ()=> setSpeed(STATE.speedKmh+0.1));
      el('grade-dec')?.addEventListener('click', ()=> setGrade(STATE.gradePct-0.5));
      el('grade-inc')?.addEventListener('click', ()=> setGrade(STATE.gradePct+0.5));
      for(const btn of document.querySelectorAll('.grade-btn'))
        btn.addEventListener('click', (ev)=> setGrade(Number(ev.currentTarget.dataset.grade||0)) );

      // no-HR modal
      el('nohr-cancel')?.addEventListener('click', ()=> el('nohr-modal')?.classList.remove('open'));
      el('nohr-start') ?.addEventListener('click', ()=>{ el('nohr-modal')?.classList.remove('open'); startTicker(); });
      el('nohr-connect')?.addEventListener('click', async ()=>{ el('nohr-modal')?.classList.remove('open'); await connectHR(); });

      el('btn-start-pause')?.addEventListener('click', async ()=>{
        if(!STATE.workout){
          const sel=el('workout-select'); const customs=loadCustomWorkouts();
          if(sel && sel.value && sel.value.startsWith('c:')){
            const idx=Number(sel.value.split(':')[1]); const cw=customs[idx];
            if(cw){ STATE.workout=workoutFromCfg(cw); } else { return alert('Velg en økt.'); }
          } else { return alert('Velg en økt.'); }
        }
        if(!STATE.ticker){ if(STATE.hr==null) return ensureModalCompatOrStart(); startTicker(); }
        else { stopTicker(); }
      });

      el('btn-skip-fwd')?.addEventListener('click', ()=>{
        const w=STATE.workout; if(!w) return;
        if(w.phase==='warmup'){ w.tLeft=0; nextPhase(); }
        else if(w.phase==='cooldown'){
          w.phase='done'; w.endedAt=new Date().toISOString();
          writeSample(Date.now()); stopLogger(); finishSession();
        } else { nextPhase(); }
        updateWorkoutUI();
      });
      el('btn-skip-back')?.addEventListener('click', ()=> prevPhase());
      el('btn-stop-save')?.addEventListener('click', ()=>{
        if(!STATE.workout) return;
        if(confirm('Stopp og lagre økta?')){
          STATE.workout.endedAt=new Date().toISOString();
          writeSample(Date.now()); stopLogger(); finishSession();
        }
      });
      el('btn-discard')?.addEventListener('click', ()=>{
        if(confirm('Forkast økta (ikke lagre)?')){
          if(STATE.ticker) { clearInterval(STATE.ticker); STATE.ticker=null; }
          STATE.workout=null; STATE.logger.active=false; STATE.logger.points=[];
          updateWorkoutUI(); draw();
        }
      });

      canvas=el('chart'); ctx=canvas?.getContext('2d'); dpr=window.devicePixelRatio||1;
      window.addEventListener('resize', resizeCanvas); resizeCanvas();

      el('ghost-picker')?.addEventListener('click', (e)=>{
        e.stopPropagation(); el('ghost-menu')?.classList.remove('hidden'); buildGhostList();
      });
      document.addEventListener('click', (e)=>{
        const menu=el('ghost-menu'); const picker=el('ghost-picker');
        if(menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target!==picker)
          menu.classList.add('hidden');
      });
      el('ghost-select-all')?.addEventListener('click', (e)=>{
        e.preventDefault(); el('ghost-list')?.querySelectorAll('input[type=checkbox]')?.forEach(c=>c.checked=true);
      });
      el('ghost-clear-all')?.addEventListener('click', (e)=>{
        e.preventDefault(); el('ghost-list')?.querySelectorAll('input[type=checkbox]')?.forEach(c=>c.checked=false);
      });
      el('ghost-apply')?.addEventListener('click', ()=>{
        const checks=el('ghost-list')?.querySelectorAll('input[type=checkbox]');
        STATE.ghost.ids=new Set(Array.from(checks||[]).filter(c=>c.checked).map(c=>c.value));
        computeGhostAverage(); el('ghost-menu')?.classList.add('hidden');
      });

      populateWorkoutSelect();
      preselectIfRequested();

      setInterval(()=>{
        try{
          const t=Date.now();
          if(STATE.hr!=null) STATE.series.hr.push({t,y:STATE.hr});
          const dispSpeed=displaySpeedKmh();
          STATE.series.speed.push({t,y:dispSpeed});
          const w=estimateWattExternal(dispSpeed, STATE.gradePct, STATE.massKg, STATE.cal.Crun, STATE.cal.K);
          STATE.series.watt.push({t,y:w});
          STATE.series.rpe.push({t,y:STATE.rpe});
          const cutoff=t-STATE.windowSec*1000;
          for(const k of ['hr','speed','watt','rpe']){
            const arr=STATE.series[k]; while(arr.length && arr[0].t<cutoff) arr.shift();
          }
          if(el('pulse')) el('pulse').textContent = (STATE.hr!=null?STATE.hr:'--');
          if(el('watt'))  el('watt').textContent  = w||'--';
          draw();
          if(STATE.logger.active){ writeSample(t); }
        }catch(e){ showErr(e); }
      },1000);

      requestWakeLock();
    }catch(e){ showErr(e); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
