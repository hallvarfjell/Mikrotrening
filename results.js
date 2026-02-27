
document.addEventListener('DOMContentLoaded', function(){
  try{
    const dpr = window.devicePixelRatio || 1;
    const id = location.hash ? location.hash.slice(1) : null;
    const sessions = JSON.parse(localStorage.getItem('sessions')||'[]');
    let s = id ? sessions.find(x=>x.id===id) : sessions[sessions.length-1];
    if(!s){
      document.getElementById('no-session').classList.remove('hidden');
      document.getElementById('result-summary-card').classList.add('hidden');
      return;
    }

    const pts = s.points || [];
    const durSec = pts.length>1 ? Math.round((pts[pts.length-1].ts - pts[0].ts)/1000) : 0;
    const distM = pts.length? Math.round(pts[pts.length-1].dist_m) : 0;
    const hrVals = pts.map(p=>p.hr).filter(Boolean);
    const hrMax = hrVals.length? Math.max(...hrVals) : 0;
    const workPts = pts.filter(p=>p.phase==='work');
    const avg = a=> a.length? (a.reduce((x,y)=>x+y,0)/a.length) : 0;
    const avgHrWork = Math.round(avg(workPts.map(p=>p.hr))||0);
    const avgSpdWork = avg(workPts.map(p=>p.speed_ms))*3.6;
    const avgWattWork = Math.round(avg(workPts.map(p=>p.watt))||0);

    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <div class="metric"><label>Økt</label><span>${s.name}</span></div>
      <div class="metric"><label>Varighet</label><span>${Math.floor(durSec/60)}:${String(durSec%60).padStart(2,'0')}</span></div>
      <div class="metric"><label>Distanse</label><span>${(distM/1000).toFixed(2)} km</span></div>
      <div class="metric"><label>Snittpuls (drag)</label><span>${avgHrWork||'--'} bpm</span></div>
      <div class="metric"><label>Snittfart (drag)</label><span>${avgSpdWork?avgSpdWork.toFixed(1):'--'} km/t</span></div>
      <div class="metric"><label>Snittwatt (drag)</label><span>${avgWattWork||'--'} W</span></div>
      <div class="metric"><label>Maks puls</label><span>${hrMax||'--'} bpm</span></div>
    `;

    const notesEl = document.getElementById('notes');
    notesEl.value = s.notes||'';
    document.getElementById('save-notes').addEventListener('click', ()=>{
      s.notes = notesEl.value; persistSession(s); alert('Lagret.');
    });

    const z = {under:0, between:0, over:0};
    for(const p of pts){ if(!p.hr) continue; if(p.hr < s.lt1) z.under++; else if(p.hr < s.lt2) z.between++; else z.over++; }
    drawZones(document.getElementById('zones'), z);

    const chart = document.getElementById('r-chart');
    resizeCanvas(chart);
    const toggles = { hr: true, watt: true, speed: true };
    document.getElementById('r-show-hr').addEventListener('change', e=>{ toggles.hr=e.target.checked; drawGraph(); });
    document.getElementById('r-show-watt').addEventListener('change', e=>{ toggles.watt=e.target.checked; drawGraph(); });
    document.getElementById('r-show-speed').addEventListener('change', e=>{ toggles.speed=e.target.checked; drawGraph(); });

    function drawGraph(){
      const ctx = chart.getContext('2d'); const W=chart.width, H=chart.height; ctx.clearRect(0,0,W,H);
      const padL=60*dpr,padR=20*dpr,padT=20*dpr,padB=30*dpr; const plotW=W-padL-padR, plotH=H-padT-padB;
      if(!pts.length) return;
      const tmin=pts[0].ts, tmax=pts[pts.length-1].ts;
      const hrVals=pts.map(p=>p.hr).filter(Boolean); const hrMin=hrVals.length?Math.min(...hrVals):80; const hrMax=hrVals.length?Math.max(...hrVals):200;
      const yHR=v=> padT + (1 - (v-hrMin)/(hrMax-hrMin||1))*plotH;
      function band(y0,y1,color){ ctx.fillStyle=color; ctx.fillRect(padL,y1,plotW,y0-y1); }
      band(yHR(hrMin), yHR(s.lt1), '#edf7ed'); band(yHR(s.lt1), yHR(s.lt2), '#e9f0fb'); band(yHR(s.lt2), yHR(hrMax), '#fdeaea');
      ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1; ctx.beginPath(); for(let sec=0; sec<=Math.max(60, (tmax-tmin)/1000); sec+=60){ const tt=tmin+sec*1000; const x=padL+(tt-tmin)/(tmax-tmin||1)*plotW; ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH);} ctx.stroke();
      ctx.strokeStyle='#e2e8f0'; ctx.beginPath(); for(let v=hrMin; v<=hrMax; v+=10){ const y=yHR(v); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y);} ctx.stroke();
      const xTime=t=> padL+(t-tmin)/(tmax-tmin||1)*plotW;
      function drawLine(arr, get, color, ymap){ if(arr.length<2) return; ctx.strokeStyle=color; ctx.lineWidth=2*dpr; ctx.beginPath(); let moved=false; for(const p of arr){ const val=get(p); if(val==null) continue; const x=xTime(p.ts), y=ymap(val); if(!moved){ ctx.moveTo(x,y); moved=true;} else ctx.lineTo(x,y);} ctx.stroke(); }
      if(toggles.hr) drawLine(pts, p=>p.hr, '#16a34a', yHR);
      const spVals = pts.map(p=>p.speed_ms*3.6);
      const wtVals = pts.map(p=>p.watt);
      const smin=Math.min(...(spVals.length?spVals:[0])), smax=Math.max(...(spVals.length?spVals:[1]));
      const wmin=Math.min(...(wtVals.length?wtVals:[0])), wmax=Math.max(...(wtVals.length?wtVals:[1]));
      const mapSpeed=v=> yHR(hrMin + (hrMax-hrMin) * ((v - smin) / Math.max(1e-6,(smax-smin))));
      const mapWatt=v => yHR(hrMin + (hrMax-hrMin) * ((v - wmin) / Math.max(1e-6,(wmax-wmin))));
      if(toggles.speed) drawLine(pts, p=>p.speed_ms*3.6, '#2563eb', mapSpeed);
      if(toggles.watt) drawLine(pts, p=>p.watt, '#d97706', mapWatt);
    }
    drawGraph();

    const table = document.getElementById('laps');
    const rows = [];
    for(let r=1; r<= (s.reps||0); r++){
      const arr = pts.filter(p=>p.phase==='work' && p.rep===r);
      if(!arr.length) continue;
      const m = {
        rep:r,
        hr: Math.round(avg(arr.map(p=>p.hr))||0),
        spd: avg(arr.map(p=>p.speed_ms))*3.6,
        grd: avg(arr.map(p=>p.grade)),
        wat: Math.round(avg(arr.map(p=>p.watt))||0),
        rpe: (s.rpeByRep && s.rpeByRep[r]!=null)? s.rpeByRep[r] : ''
      };
      rows.push(m);
    }
    table.innerHTML = `<thead><tr><th>Rep</th><th>Snittpuls</th><th>Snittfart</th><th>Snittwatt</th><th>Stigning</th><th>RPE</th></tr></thead>` +
      `<tbody>`+ rows.map(r=>`<tr><td>${r.rep}</td><td>${r.hr} bpm</td><td>${r.spd?r.spd.toFixed(1):'--'} km/t</td><td>${r.wat} W</td><td>${r.grd?r.grd.toFixed(1):'--'} %</td><td>${r.rpe}</td></tr>`).join('') +`</tbody>`;

    document.getElementById('btn-download-tcx').addEventListener('click', ()=>{
      const tcx = buildTCX(s);
      const blob = new Blob([tcx], {type:'application/vnd.garmin.tcx+xml'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (s.name||'workout')+'.tcx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    });
    document.getElementById('btn-dump-json').addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(s,null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (s.name||'workout')+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    });

    function persistSession(sess){ const arr = JSON.parse(localStorage.getItem('sessions')||'[]'); const i = arr.findIndex(x=>x.id===sess.id); if(i>=0) arr[i]=sess; else arr.push(sess); localStorage.setItem('sessions', JSON.stringify(arr)); }
    function resizeCanvas(c){ const rect=c.getBoundingClientRect(); c.width=Math.floor(rect.width*dpr); c.height=Math.floor(rect.height*dpr); }
    function drawZones(canvas, z){ const ctx=canvas.getContext('2d'); const W=canvas.width, H=canvas.height; ctx.clearRect(0,0,W,H); const labels=[['Under LT1', z.under, '#ccebd0'], ['LT1–LT2', z.between, '#cfe1fb'], ['Over LT2', z.over, '#f7cfcf']]; const total=(z.under+z.between+z.over)||1; const barH=36; const gap=12; const pad=16; ctx.font=`${14* (window.devicePixelRatio||1)}px system-ui`; ctx.fillStyle='#334155'; labels.forEach((row,i)=>{ const y = pad + i*(barH+gap); const frac = row[1]/total; const w = Math.max(1, Math.round((W-160*(window.devicePixelRatio||1))*frac)); ctx.fillStyle=row[2]; ctx.fillRect(140*(window.devicePixelRatio||1), y, w, barH); ctx.fillStyle='#334155'; ctx.fillText(`${row[0]}`, 8*(window.devicePixelRatio||1), y+barH*0.7); ctx.fillText(`${Math.round(row[1])} s`, (140*(window.devicePixelRatio||1))+w+8*(window.devicePixelRatio||1), y+barH*0.7); }); }

    function buildTCX(sess){
      const nsTCX = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
      const nsAE  = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2';
      const nsXsi = 'http://www.w3.org/2001/XMLSchema-instance';
      const nsINTZ= 'https://intz.app/xmlschemas/Extensions/v1';
      const startISO = sess.startedAt; const endISO = sess.endedAt || (sess.points.length? sess.points[sess.points.length-1].iso : startISO);
      function esc(s){ return String(s).replace(/[<&>]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
      let xml='';
      xml += `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<TrainingCenterDatabase xmlns="${nsTCX}" xmlns:xsi="${nsXsi}" xmlns:ns3="${nsAE}" xmlns:intz="${nsINTZ}">\n`;
      xml += `  <Activities>\n`;
      xml += `    <Activity Sport="Running">\n`;
      xml += `      <Id>${esc(startISO)}</Id>\n`;
      xml += `      <Lap StartTime="${esc(startISO)}">\n`;
      xml += `        <TotalTimeSeconds>${Math.max(1, Math.round((new Date(endISO)-new Date(startISO))/1000))}</TotalTimeSeconds>\n`;
      const distLast = sess.points.length? sess.points[sess.points.length-1].dist_m : 0;
      xml += `        <DistanceMeters>${Math.round(distLast)}</DistanceMeters>\n`;
      xml += `        <Intensity>Active</Intensity>\n`;
      xml += `        <Track>\n`;
      for(const p of sess.points){
        xml += `          <Trackpoint>\n`;
        xml += `            <Time>${esc(p.iso)}</Time>\n`;
        if(p.hr){ xml += `            <HeartRateBpm><Value>${Math.round(p.hr)}</Value></HeartRateBpm>\n`; }
        xml += `            <DistanceMeters>${Math.round(p.dist_m||0)}</DistanceMeters>\n`;
        xml += `            <Extensions>\n`;
        xml += `              <ns3:TPX><ns3:Speed>${(p.speed_ms||0).toFixed(3)}</ns3:Speed></ns3:TPX>\n`;
        xml += `              <intz:INTZ><intz:Grade>${(p.grade||0).toFixed(1)}</intz:Grade><intz:RPE>${p.rpe!=null?Number(p.rpe).toFixed(1):''}</intz:RPE></intz:INTZ>\n`;
        xml += `            </Extensions>\n`;
        xml += `          </Trackpoint>\n`;
      }
      xml += `        </Track>\n`;
      xml += `      </Lap>\n`;
      xml += `    </Activity>\n`;
      xml += `  </Activities>\n`;
      xml += `</TrainingCenterDatabase>`;
      return xml;
    }
  }catch(e){
    const card = document.getElementById('err-card');
    const pre = document.getElementById('err-log');
    card.classList.remove('hidden');
    pre.textContent += (e && e.stack)? e.stack : (e.message||String(e));
  }
});
