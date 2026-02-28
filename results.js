
// ---- Namespaced storage helpers ----

function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){ try{ const v=localStorage.getItem(nsKey(k)); if(v!=null) return JSON.parse(v); const ov=localStorage.getItem(k); return ov!=null? JSON.parse(ov): d; }catch(e){ return d; } }
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }


document.addEventListener('DOMContentLoaded', function(){
  try{
    const noSess=document.getElementById('no-session'); if(noSess) noSess.classList.add('hidden');
    const errCard=document.getElementById('err-card'); if(errCard) errCard.classList.add('hidden');
    const dpr=window.devicePixelRatio||1;
    const id=location.hash?location.hash.slice(1):null;
    const sessions=getNS('sessions',[]);
    let s=id? sessions.find(x=>x.id===id) : sessions[sessions.length-1];
    if(!s){ if(noSess) noSess.classList.remove('hidden'); document.getElementById('result-summary-card').classList.add('hidden'); return; }

    const pts=s.points||[];
    const durSec=pts.length>1? Math.round((pts[pts.length-1].ts-pts[0].ts)/1000):0;
    const distM=pts.length? Math.round(pts[pts.length-1].dist_m):0;
    const hrVals=pts.map(p=>p.hr).filter(Boolean);
    const hrMax=hrVals.length? Math.max(...hrVals):0;
    const workPts=pts.filter(p=>p.phase==='work');
    const avg=(a)=> a.length? a.reduce((x,y)=>x+y,0)/a.length : 0;
    const avgHrWork=Math.round(avg(workPts.map(p=>p.hr))||0);
    const avgSpdWork=avg(workPts.map(p=>p.speed_ms))*3.6;
    const avgWattWork=Math.round(avg(workPts.map(p=>p.watt))||0);

    const summary=document.getElementById('summary'); summary.innerHTML=`
      <div class="metric"><label>Økt</label><span>${s.name}</span></div>
      <div class="metric"><label>Varighet</label><span>${Math.floor(durSec/60)}:${String(durSec%60).padStart(2,'0')}</span></div>
      <div class="metric"><label>Distanse</label><span>${(distM/1000).toFixed(2)} km</span></div>
      <div class="metric"><label>Snittpuls (drag)</label><span>${avgHrWork||'--'} bpm</span></div>
      <div class="metric"><label>Snittfart (drag)</label><span>${avgSpdWork?avgSpdWork.toFixed(1):'--'} km/t</span></div>
      <div class="metric"><label>Snittwatt (drag)</label><span>${avgWattWork||'--'} W</span></div>
      <div class="metric"><label>Maks puls</label><span>${hrMax||'--'} bpm</span></div>`;

    const notesEl=document.getElementById('notes'); notesEl.value=s.notes||''; document.getElementById('save-notes').addEventListener('click', ()=>{ s.notes=notesEl.value; persistSession(s); alert('Lagret.'); });

    const z={under:0, between:0, over:0}; for(const p of pts){ if(!p.hr) continue; if(p.hr < s.lt1) z.under++; else if(p.hr < s.lt2) z.between++; else z.over++; } drawZones(document.getElementById('zones'), z);

    const chart=document.getElementById('r-chart'); resizeCanvas(chart);
    const toggles={ hr:true, watt:true, speed:false, rpe:true };
    document.getElementById('r-show-hr').addEventListener('change', e=>{ toggles.hr=e.target.checked; drawGraph(); });
    document.getElementById('r-show-watt').addEventListener('change', e=>{ toggles.watt=e.target.checked; drawGraph(); });
    document.getElementById('r-show-speed').addEventListener('change', e=>{ toggles.speed=e.target.checked; drawGraph(); });
    document.getElementById('r-show-rpe').addEventListener('change', e=>{ toggles.rpe=e.target.checked; drawGraph(); });

    function drawGraph(){
      const ctx=chart.getContext('2d'); const W=chart.width,H=chart.height; ctx.clearRect(0,0,W,H);
      const padL=60*dpr,padR=60*dpr,padT=30*dpr,padB=24*dpr; const plotW=W-padL-padR, plotH=H-padT-padB;
      if(!pts.length) return;
      const tmin=pts[0].ts, tmax=pts[pts.length-1].ts;
      const hrVals=pts.map(p=>p.hr).filter(Boolean); const hrMin=hrVals.length?Math.min(...hrVals):80; const hrMaxAxis=hrVals.length?Math.max(...hrVals):200;
      const yHR=v=> padT + (1 - (v-hrMin)/(hrMaxAxis-hrMin||1))*plotH;
      const sp=pts.map(p=>({t:p.ts,y:p.speed_ms*3.6}));
      const wt=pts.map(p=>({t:p.ts,y:p.watt}));
      const rp=pts.map(p=>({t:p.ts,y:p.rpe||0}));
      const spVals=sp.map(p=>p.y).filter(v=>!isNaN(v));
      const wtVals=wt.map(p=>p.y).filter(v=>!isNaN(v));
      const smin=Math.min(...(spVals.length?spVals:[0])), smax=Math.max(...(spVals.length?spVals:[1]));
      const wmin=Math.min(...(wtVals.length?wtVals:[0])), wmax=Math.max(...(wtVals.length?wtVals:[1]));
      const yWatt=v=> padT + (1 - (v-wmin)/Math.max(1,(wmax-wmin))) * plotH;
      const yRPE=v => padT + (1 - v/10) * plotH;
      const xTime=t=> padL + (t-tmin)/(tmax-tmin||1)*plotW;

      // HR zone bands
      ctx.fillStyle='rgba(239,68,68,0.06)'; ctx.fillRect(padL, yHR(s.lt2), plotW, yHR(hrMaxAxis)-yHR(s.lt2));
      ctx.fillStyle='rgba(37,99,235,0.06)'; ctx.fillRect(padL, yHR(s.lt1), plotW, yHR(s.lt2)-yHR(s.lt1));
      ctx.fillStyle='rgba(16,163,74,0.06)'; ctx.fillRect(padL, yHR(hrMin), plotW, yHR(s.lt1)-yHR(hrMin));

      // time grid
      ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=Math.max(60,(tmax-tmin)/1000); sec+=60){ const tt=tmin+sec*1000; const x=padL+(tt-tmin)/(tmax-tmin||1)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke();
      // HR ticks
      ctx.strokeStyle='#e5e7eb'; ctx.beginPath(); for(let v=hrMin; v<=hrMaxAxis; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke();
      ctx.fillStyle='#ef4444'; ctx.font=`${12*dpr}px system-ui`; for(let v=hrMin; v<=hrMaxAxis; v+=20){ ctx.fillText(String(v), 8*dpr, yHR(v)+4*dpr); }
      if(toggles.watt){ ctx.fillStyle='#16a34a'; ctx.textAlign='right'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=wmin + (wmax-wmin)*i/ticks; const y=yWatt(v); ctx.fillText(String(Math.round(v)), W-8*dpr, y+4*dpr); } ctx.textAlign='left'; }
      if(toggles.speed){ ctx.fillStyle='#2563eb'; ctx.textAlign='center'; const ticks=5; for(let i=0;i<=ticks;i++){ const v=smin + (smax-smin)*i/ticks; const x=padL + plotW*i/ticks; ctx.fillText(String(v.toFixed(1)), x, (padT-8*dpr)); } ctx.textAlign='left'; }
      if(toggles.rpe){ ctx.fillStyle='#d97706'; ctx.textAlign='right'; for(let v=0; v<=10; v+=2){ const y=yRPE(v); ctx.fillText(String(v), W-40*dpr, y+4*dpr); } ctx.textAlign='left'; }

      function drawLine(arr,color,ymap){ if(arr.length<2) return; ctx.strokeStyle=color; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ const x=xTime(p.t), y=ymap(p.y); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); }
      if(toggles.hr) drawLine(pts.map(p=>({t:p.ts,y:p.hr})), '#ef4444', yHR);
      if(toggles.watt) drawLine(wt, '#16a34a', yWatt);
      if(toggles.speed){ const ySpeed=v=> padT + (1 - (v - smin)/Math.max(1,(smax-smin))) * plotH; drawLine(sp, '#2563eb', ySpeed); }
      if(toggles.rpe) drawLine(rp, '#d97706', yRPE);
    }
    drawGraph();

    const table=document.getElementById('laps'); const rows=[];
    for(let r=1; r<= (s.reps||0); r++){
      const arr=pts.filter(p=>p.phase==='work' && p.rep===r);
      if(!arr.length) continue;
      const repRPE = (s.rpeByRep && s.rpeByRep[r]!=null)? s.rpeByRep[r] : ( ()=>{ const last=arr.map(p=>p.rpe).filter(v=>v!=null); return last.length? last[last.length-1] : ''; })();
      const avg=(a)=> a.length? a.reduce((x,y)=>x+y,0)/a.length : 0;
      const m={ rep:r, hr: Math.round(avg(arr.map(p=>p.hr))||0), spd: avg(arr.map(p=>p.speed_ms))*3.6, grd: avg(arr.map(p=>p.grade)), wat: Math.round(avg(arr.map(p=>p.watt))||0), rpe: (repRPE!==''? Number(repRPE).toFixed(1) : '') };
      rows.push(m);
    }
    table.innerHTML = `<thead><tr><th>Rep</th><th>Snittpuls</th><th>Snittfart</th><th>Snittwatt</th><th>Stigning</th><th>RPE</th></tr></thead>` +
      `<tbody>`+ rows.map(r=>`<tr><td>${r.rep}</td><td>${r.hr} bpm</td><td>${r.spd?r.spd.toFixed(1):'--'} km/t</td><td>${r.wat} W</td><td>${r.grd?r.grd.toFixed(1):'--'} %</td><td>${r.rpe}</td></tr>`).join('') +`</tbody>`;

    function tsString(iso){ const d=new Date(iso); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
    const baseName = `${(s.name||'workout').replace(/\s+/g,'_')}_${tsString(s.startedAt||new Date())}`;

    document.getElementById('btn-download-tcx').addEventListener('click', ()=>{ const tcx=buildTCX(s); const blob=new Blob([tcx],{type:'application/vnd.garmin.tcx+xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download= baseName + '.tcx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); });
    document.getElementById('btn-dump-json').addEventListener('click', ()=>{ const blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download= baseName + '.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); });

    function persistSession(sess){ const arr=getNS('sessions',[]); const i=arr.findIndex(x=>x.id===sess.id); if(i>=0) arr[i]=sess; else arr.push(sess); setNS('sessions', arr); }
    function resizeCanvas(c){ const rect=c.getBoundingClientRect(); c.width=Math.floor(rect.width*dpr); c.height=Math.floor(rect.height*dpr); }
    function drawZones(canvas,z){ const ctx=canvas.getContext('2d'); const W=canvas.width, H=canvas.height; ctx.clearRect(0,0,W,H); const labels=[['Under LT1',z.under,'#ccebd0'],['LT1–LT2',z.between,'#cfe1fb'],['Over LT2',z.over,'#f7cfcf']]; const total=(z.under+z.between+z.over)||1; const barH=36; const gap=12; const pad=16; ctx.font=`${14*dpr}px system-ui`; ctx.fillStyle='#334155'; labels.forEach((row,i)=>{ const y = pad + i*(barH+gap); const frac = row[1]/total; const w = Math.max(1, Math.round((W-160*dpr)*frac)); ctx.fillStyle=row[2]; ctx.fillRect(140*dpr, y, w, barH); ctx.fillStyle='#334155'; ctx.fillText(`${row[0]}`, 8*dpr, y+barH*0.7); ctx.fillText(`${Math.round(row[1])} s`, (140*dpr)+w+8*dpr, y+barH*0.7); }); }

    function buildTCX(sess){ const nsTCX='http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2'; const nsAE='http://www.garmin.com/xmlschemas/ActivityExtension/v2'; const nsXsi='http://www.w3.org/2001/XMLSchema-instance'; const nsINTZ='https://intz.app/xmlschemas/Extensions/v1'; const startISO=sess.startedAt; const endISO=sess.endedAt || (sess.points.length? sess.points[sess.points.length-1].iso : startISO); function esc(s){ return String(s).replace(/[<&>]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); } let xml=''; xml+=`<?xml version="1.0" encoding="UTF-8"?>\n`; xml+=`<TrainingCenterDatabase xmlns="${nsTCX}" xmlns:xsi="${nsXsi}" xmlns:ns3="${nsAE}" xmlns:intz="${nsINTZ}">\n`; xml+=`  <Activities>\n`; xml+=`    <Activity Sport="Running">\n`; xml+=`      <Id>${esc(startISO)}</Id>\n`; xml+=`      <Lap StartTime="${esc(startISO)}">\n`; xml+=`        <TotalTimeSeconds>${Math.max(1, Math.round((new Date(endISO)-new Date(startISO))/1000))}</TotalTimeSeconds>\n`; const distLast=sess.points.length? sess.points[sess.points.length-1].dist_m : 0; xml+=`        <DistanceMeters>${Math.round(distLast)}</DistanceMeters>\n`; xml+=`        <Intensity>Active</Intensity>\n`; xml+=`        <Track>\n`; for(const p of sess.points){ xml+=`          <Trackpoint>\n`; xml+=`            <Time>${esc(p.iso)}</Time>\n`; if(p.hr){ xml+=`            <HeartRateBpm><Value>${Math.round(p.hr)}</Value></HeartRateBpm>\n`; } xml+=`            <DistanceMeters>${Math.round(p.dist_m||0)}</DistanceMeters>\n`; xml+=`            <Extensions>\n`; xml+=`              <ns3:TPX><ns3:Speed>${(p.speed_ms||0).toFixed(3)}</ns3:Speed></ns3:TPX>\n`; xml+=`              <intz:INTZ><intz:Grade>${(p.grade||0).toFixed(1)}</intz:Grade><intz:RPE>${p.rpe!=null?Number(p.rpe).toFixed(1):''}</intz:RPE></intz:INTZ>\n`; xml+=`            </Extensions>\n`; xml+=`          </Trackpoint>\n`; } xml+=`        </Track>\n`; xml+=`      </Lap>\n`; xml+=`    </Activity>\n`; xml+=`  </Activities>\n`; xml+=`</TrainingCenterDatabase>`; return xml; }
  }catch(e){ const card=document.getElementById('err-card'); const pre=document.getElementById('err-log'); if(card&&pre){ card.classList.remove('hidden'); pre.textContent += (e&&e.stack)? e.stack : (e.message||String(e)); } }
});
