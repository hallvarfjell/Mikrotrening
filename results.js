
function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){ try{ const v=localStorage.getItem(nsKey(k)); if(v!=null) return JSON.parse(v); const ov=localStorage.getItem(k); return ov!=null? JSON.parse(ov): d; }catch(e){ return d; } }
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }
(function(){
  const $=id=>document.getElementById(id);
  function showErr(e){ try{ $('err-card')?.classList.remove('hidden'); const s=(e&&e.stack)? e.stack: (e?.message||String(e)); $('err-log').textContent += s+'\n'; }catch(_){} }
  window.addEventListener('error', e=> showErr(e.error||e.message));
  window.addEventListener('unhandledrejection', e=> showErr(e.reason||e));

  let SESSION=null; let CAN,CTX,DPR;
  function pickSession(){ const id=location.hash? location.hash.substring(1):''; const arr=getNS('sessions',[]); if(!arr||!arr.length) return null; if(id){ return arr.find(s=> s.id===id) || null; } return arr[arr.length-1]; }
  function formatMMSS(sec){ sec=Math.max(0, Math.round(sec)); const m=Math.floor(sec/60), s=String(sec%60).padStart(2,'0'); return `${m}:${s}`; }
  function avg(arr){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length:0; }

  function computeSummary(s){ const pts=s.points||[]; if(!pts.length) return {dur:0,dist:0,avgHR:0,avgW:0}; const dur = Math.max(0, (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime())/1000);
    const dist = (pts[pts.length-1].dist_m||0)/1000; let sumHR=0,cntHR=0,sumW=0,cntW=0; pts.forEach(p=>{ if(p.hr){ sumHR+=p.hr; cntHR++; } if(p.watt!=null){ sumW += p.watt; cntW++; } }); const avgHR= cntHR? Math.round(sumHR/cntHR):0; const avgW= cntW? Math.round(sumW/cntW):0; return {dur,dist,avgHR,avgW}; }

  function renderSummary(){ const s=SESSION; const sum=computeSummary(s); const when=new Date(s.startedAt||Date.now()); const name=s.name||'Økt'; const reps=s.reps||0; $('summary').innerHTML = `
    <div><strong>${name}</strong></div>
    <div class="small">${when.toLocaleString()}</div>
    <ul style="list-style:none;padding-left:0;display:grid;gap:4px;margin:8px 0 0 0">
      <li><strong>Varighet:</strong> ${formatMMSS(sum.dur)}</li>
      <li><strong>Distanse:</strong> ${ (isFinite(sum.dist)? sum.dist.toFixed(2):'0.00') } km</li>
      <li><strong>Snitt HR:</strong> ${sum.avgHR||'–'} bpm</li>
      <li><strong>Snitt Watt:</strong> ${sum.avgW||'–'} W</li>
      <li><strong>Antall drag:</strong> ${reps}</li>
    </ul>`; $('notes').value = s.notes||''; }

  function splitLaps(s){ const pts=s.points||[]; if(!pts.length) return []; const laps=[]; let cur={startTs:pts[0].ts, distStart:pts[0].dist_m||0, pts:[], hrSum:0, hrCnt:0, hrMax:0}; let lastPhase=pts[0].phase||'', lastRep=pts[0].rep||0; for(const p of pts){ const phase=p.phase||''; const rep=p.rep||0; const boundary = (phase==='work' && rep!==lastRep) || (phase!=='work' && lastPhase==='work');
      if(boundary && cur.pts.length){ const last=cur.pts[cur.pts.length-1]; cur.endTs=last.ts; cur.distEnd=last.dist_m||0; laps.push(cur); cur={startTs:p.ts, distStart:p.dist_m||0, pts:[], hrSum:0, hrCnt:0, hrMax:0}; }
      cur.pts.push(p); if(p.hr){ cur.hrSum+=p.hr; cur.hrCnt++; if(p.hr>cur.hrMax) cur.hrMax=p.hr; } lastPhase=phase; lastRep=rep; }
    if(cur.pts.length){ const last=cur.pts[cur.pts.length-1]; cur.endTs=last.ts; cur.distEnd=last.dist_m||0; laps.push(cur); }
    const workLaps = laps.filter(l=> l.pts.some(p=> (p.phase||'')==='work'));
    if(workLaps.length) return workLaps;
    // Fallback: no phase info -> single lap for whole session
    return laps.length? [ { ...laps[0] } ] : [];
  }

  function renderLaps(){ const table=$('laps'); const laps=splitLaps(SESSION); if(!table) return; const headers=['#','Varighet','Distanse (km)','Snitt HR','Snitt W','Snitt fart (km/t)']; table.innerHTML='<thead><tr>'+headers.map(h=>`<th style="text-align:left;padding:4px 6px">${h}</th>`).join('')+'</tr></thead><tbody></tbody>'; const tb=table.querySelector('tbody');
    laps.forEach((l,i)=>{ const dur=(l.endTs-l.startTs)/1000; const dist=Math.max(0,(l.distEnd-l.distStart)/1000); const HR= l.hrCnt? Math.round(l.hrSum/l.hrCnt):0; const wAvg=Math.round(avg(l.pts.map(p=> p.watt||0))); const spAvg=avg(l.pts.map(p=> (p.speed_ms||0)*3.6)); const tr=document.createElement('tr'); const cells=[String(i+1), formatMMSS(dur), dist.toFixed(2), HR? String(HR):'–', wAvg? String(wAvg):'–', isFinite(spAvg)? spAvg.toFixed(1):'–']; cells.forEach(c=>{ const td=document.createElement('td'); td.style.padding='4px 6px'; td.textContent=c; tr.appendChild(td); }); tb.appendChild(tr); }); }

  function toTCX(s){ const pts=s.points||[]; if(!pts.length) return ''; function esc(x){ return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
    const t0=new Date(pts[0].ts).toISOString(); const laps=splitLaps(s);
    function lapXml(l){ const startIso=new Date(l.startTs).toISOString(); const durSec=Math.max(1, Math.round((l.endTs - l.startTs)/1000)); const distM = Math.max(0, Math.round((l.distEnd - l.distStart)||0)); const avgHR = l.hrCnt? Math.round(l.hrSum/l.hrCnt):0; const maxHR = l.hrMax||0; const trackpoints=l.pts.map(p=> `
        <Trackpoint>
          <Time>${new Date(p.ts).toISOString()}</Time>
          <DistanceMeters>${((p.dist_m||0)).toFixed(2)}</DistanceMeters>
          <HeartRateBpm><Value>${p.hr||0}</Value></HeartRateBpm>
          <Extensions>
            <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Speed>${(p.speed_ms||0).toFixed(3)}</Speed><Watts>${Math.round(p.watt||0)}</Watts></TPX>
          </Extensions>
        </Trackpoint>`).join('');
      return `
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${durSec}</TotalTimeSeconds>
        <DistanceMeters>${distM}</DistanceMeters>
        <MaximumHeartRateBpm><Value>${maxHR}</Value></MaximumHeartRateBpm>
        <AverageHeartRateBpm><Value>${avgHR}</Value></AverageHeartRateBpm>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>${trackpoints}\n        </Track>
      </Lap>`; }
    const lapsXml = laps.map(lapXml).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="Running">
      <Id>${t0}</Id>
${lapsXml}
      <Notes>${esc(s.notes||'')}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`; }

  function download(name, content, mime){ const blob=new Blob([content],{type:mime}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  function setupButtons(){ $('btn-download-tcx')?.addEventListener('click', ()=>{ try{ const xml=toTCX(SESSION); if(!xml){ alert('Ingen data i økta.'); return; } const name=(SESSION.name||'okt')+'.tcx'; download(name, xml, 'application/vnd.garmin.tcx+xml'); }catch(e){ showErr(e); alert('TCX-eksport feilet. Se feilpanel.'); } }); $('btn-dump-json')?.addEventListener('click', ()=>{ try{ download((SESSION.name||'okt')+'.json', JSON.stringify(SESSION,null,2),'application/json'); }catch(e){ showErr(e); } }); $('save-notes')?.addEventListener('click', ()=>{ try{ const arr=getNS('sessions',[]); const idx=arr.findIndex(x=>x.id===SESSION.id); if(idx>=0){ arr[idx]={...arr[idx], notes:$('notes').value||''}; setNS('sessions',arr); alert('Lagret merknader.'); } }catch(e){ showErr(e); } }); }

  function resizeCanvas(){ if(!CAN) return; const rect=CAN.getBoundingClientRect(); CAN.width=Math.floor(rect.width*(DPR||1)); CAN.height=Math.floor(rect.height*(DPR||1)); }

  function draw(){ if(!CTX||!CAN||!SESSION) return; const pts=SESSION.points||[]; const showHR=$('r-show-hr')?.checked; const showWatt=$('r-show-watt')?.checked; const showSpeed=$('r-show-speed')?.checked; const showRPE=$('r-show-rpe')?.checked; const W=CAN.width,H=CAN.height; const padL=60*DPR,padR=60*DPR,padT=30*DPR,padB=24*DPR; const plotW=W-padL-padR, plotH=H-padT-padB; CTX.clearRect(0,0,W,H); if(!pts.length||plotW<=0||plotH<=0){ return; }
    const t0=pts[0].ts, tN=pts[pts.length-1].ts; const xmin=t0, xmax=tN; const hrMin=80, hrMax=200; const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin||1))*plotH; const wVals=pts.map(p=> p.watt||0), wmin=Math.min(...wVals), wmax=Math.max(...wVals); const yW=v=> padT + (1 - (v-wmin)/Math.max(1,(wmax-wmin))) * plotH; const spVals=pts.map(p=> (p.speed_ms||0)*3.6), smin=Math.min(...spVals), smax=Math.max(...spVals); const yS=v=> padT + (1 - (v - smin)/Math.max(1,(smax-smin))) * plotH; const yR=v=> padT + (1 - (v/10)) * plotH; const xT=t=> padL + (t-xmin)/(xmax-xmin||1)*plotW;
    // grid & axes
    CTX.strokeStyle='#e2e8f0'; CTX.lineWidth=1; CTX.beginPath(); const totSec=Math.max(1, Math.round((xmax-xmin)/1000)); for(let sec=0; sec<=totSec; sec+=60){ const t=xmin+sec*1000; const x=xT(t); CTX.moveTo(x,padT); CTX.lineTo(x,padT+plotH);} CTX.stroke();
    CTX.fillStyle='#ef4444'; CTX.font=`${12*DPR}px system-ui`; for(let v=hrMin; v<=hrMax; v+=20){ CTX.fillText(String(v), 8*DPR, yHR(v)+4*DPR); }
    if(showWatt){ CTX.fillStyle='#16a34a'; CTX.textAlign='right'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=wmin + (wmax-wmin)*i/ticks; CTX.fillText(String(Math.round(v)), W-8*DPR, yW(v)+4*DPR); } CTX.textAlign='left'; }
    if(showSpeed){ CTX.fillStyle='#2563eb'; CTX.textAlign='center'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=smin + (smax-smin)*i/ticks; const x=padL + plotW*i/ticks; CTX.fillText(String(isFinite(v)? v.toFixed(1):'0.0'), x, (padT-8*DPR)); } CTX.textAlign='left'; }
    if(showRPE){ CTX.fillStyle='#d97706'; CTX.textAlign='right'; for(let v=0; v<=10; v+=2){ CTX.fillText(String(v), W-40*DPR, yR(v)+4*DPR); } CTX.textAlign='left'; }

    function drawLine(extract,color,ymap){ const vals=pts.map(extract); const any = vals.some(v=> v!=null); if(!any) return; CTX.strokeStyle=color; CTX.lineWidth=2*DPR; CTX.beginPath(); let moved=false; for(let i=0;i<pts.length;i++){ const p=pts[i]; const val=vals[i]; if(val==null) continue; const x=xT(p.ts), y=ymap(val); if(!moved){ CTX.moveTo(x,y); moved=true; } else CTX.lineTo(x,y); } CTX.stroke(); }
    if(showHR) drawLine(p=>p.hr, '#ef4444', yHR); if(showWatt) drawLine(p=>p.watt, '#16a34a', yW); if(showSpeed) drawLine(p=> (p.speed_ms||0)*3.6, '#2563eb', yS); if(showRPE) drawLine(p=>p.rpe, '#d97706', yR);
  }

  function renderZones(){ const c=$('zones'); if(!c||!SESSION) return; const ctx=c.getContext('2d'); const w=c.width, h=c.height; ctx.clearRect(0,0,w,h); const pts=SESSION.points||[]; const LT1=SESSION.lt1||135, LT2=SESSION.lt2||160; let t1=0,t2=0,t3=0; for(let i=1;i<pts.length;i++){ const dt=(pts[i].ts-pts[i-1].ts)/1000; const hr=pts[i].hr||0; if(hr<LT1) t1+=dt; else if(hr<LT2) t2+=dt; else t3+=dt; } const total=Math.max(1, t1+t2+t3); const bars=[{v:t1,c:'#86efac',label:'<LT1'},{v:t2,c:'#fde68a',label:'LT1–LT2'},{v:t3,c:'#fca5a5',label:'>LT2'}]; const pad=20; const bw=(w-4*pad)/3; ctx.font='12px system-ui'; bars.forEach((b,i)=>{ const x=pad + i*(bw+pad); const ratio=b.v/total; const bh=Math.round((h-2*pad)*ratio); const y=h-pad-bh; ctx.fillStyle=b.c; ctx.fillRect(x,y,bw,bh); ctx.fillStyle='#111827'; ctx.fillText(`${Math.round(b.v/60)} min`, x+4, y-6); ctx.fillText(b.label, x+4, h-6); }); }

  function init(){ try{
    SESSION = pickSession(); if(!SESSION){ $('no-session').classList.remove('hidden'); return; }
    $('result-summary-card').classList.remove('hidden');
    CAN=$('r-chart'); CTX=CAN.getContext('2d'); DPR=window.devicePixelRatio||1; window.addEventListener('resize', ()=>{ resizeCanvas(); draw(); }); resizeCanvas();
    renderSummary(); renderLaps(); renderZones(); setupButtons();
    ['r-show-hr','r-show-watt','r-show-speed','r-show-rpe'].forEach(id=> $(id)?.addEventListener('change', draw));
    draw();
  }catch(e){ showErr(e); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
