
(function(){
  const key='custom_workouts_v2';
  const el=id=>document.getElementById(id);
  const nameEl=el('w-name'), warmEl=el('w-warm'), coolEl=el('w-cool'), tSpd=el('w-target-speed'), tGrd=el('w-target-grade');
  const listEl=el('series-list'), previewEl=el('w-preview'), savedEl=el('w-list');

  function seriesRow(data){
    const wrap=document.createElement('div'); wrap.className='series-grid';
    wrap.innerHTML=`
      <label>Reps<input type=\"number\" class=\"sr-reps\" min=\"1\" step=\"1\" value=\"${data?.reps??4}\"></label>
      <label>Work (s)<input type=\"number\" class=\"sr-work\" min=\"10\" step=\"5\" value=\"${data?.workSec??180}\"></label>
      <label>Rest (s)<input type=\"number\" class=\"sr-rest\" min=\"0\" step=\"5\" value=\"${data?.restSec??60}\"></label>
      <label>Seriepause (s)<input type=\"number\" class=\"sr-srest\" min=\"0\" step=\"10\" value=\"${data?.seriesRestSec??120}\"></label>
      <label>Merknad<input type=\"text\" class=\"sr-note\" placeholder=\"f.eks. HM-fart\" value=\"${data?.note??''}\"></label>
      <div class=\"series-actions\">
        <button class=\"secondary sr-dup\" title=\"Dupliser\"><i class=\"ph-copy\"></i></button>
        <button class=\"ghost sr-del\" title=\"Slett\"><i class=\"ph-trash\"></i></button>
        <span class=\"small sr-sum\"></span>
      </div>`;
    wrap.querySelector('.sr-del').onclick=()=>{ wrap.remove(); preview(); };
    wrap.querySelector('.sr-dup').onclick=()=>{ listEl.insertBefore(seriesRow(collectRow(wrap)), wrap.nextSibling); preview(); };
    ['sr-reps','sr-work','sr-rest','sr-srest','sr-note'].forEach(cls=> wrap.querySelector('.'+cls).addEventListener('input', ()=>{ updateRowSummary(wrap); preview(); }));
    updateRowSummary(wrap);
    return wrap;
  }
  function collectRow(wrap){ return { reps:val('.sr-reps'), workSec:val('.sr-work'), restSec:val('.sr-rest'), seriesRestSec:val('.sr-srest'), note:wrap.querySelector('.sr-note').value||'' }; function val(sel){ return Number(wrap.querySelector(sel).value||0); } }
  function updateRowSummary(wrap){ const s=collectRow(wrap); const sec=s.reps*(s.workSec+s.restSec)+s.seriesRestSec; wrap.querySelector('.sr-sum').textContent = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`; }
  function addSeriesRow(data){ listEl.appendChild(seriesRow(data)); preview(); }
  el('add-series').onclick=()=> addSeriesRow();
  el('clear-series').onclick=()=>{ listEl.innerHTML=''; preview(); };

  function collect(){ const series=[]; listEl.querySelectorAll('.series-grid').forEach(row=>{ series.push(collectRow(row)); }); return { name:nameEl.value||'Custom', warmupSec:Number(warmEl.value||0)*60, cooldownSec:Number(coolEl.value||0)*60, targetSpeed: tSpd.value?Number(tSpd.value):null, targetGrade: tGrd.value?Number(tGrd.value):null, series }; }
  function totalSeconds(cfg){ const warm=Number(cfg.warmupSec||0); const cool=Number(cfg.cooldownSec||0); const series=cfg.series||[]; const sum=series.reduce((a,s)=> a + (Number(s.reps||0)*(Number(s.workSec||0)+Number(s.restSec||0))) + Number(s.seriesRestSec||0), 0); return warm + sum + cool; }
  function fmtMMSS(sec){ sec=Math.max(0,Math.floor(sec)); const m=Math.floor(sec/60), s=String(sec%60).padStart(2,'0'); return `${m}:${s}`; }
  function preview(){ const cfg=collect(); const tot=totalSeconds(cfg); let perSeries = cfg.series.map((s,i)=>{ const sec=s.reps*(s.workSec+s.restSec)+s.seriesRestSec; const note = s.note? ` – ${s.note}`:''; return `S${i+1}: ${fmtMMSS(sec)} (${s.reps}×${s.workSec}/${s.restSec}${s.seriesRestSec? "+"+s.seriesRestSec: ''})${note}`; }).join(' · '); if(!perSeries) perSeries='Ingen serier'; previewEl.textContent=`Total: ${fmtMMSS(tot)} — Oppv ${fmtMMSS(cfg.warmupSec)} — ${perSeries} — Nedjogg ${fmtMMSS(cfg.cooldownSec)}`; }

  function load(){ try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){ return []; } }
  function saveAll(arr){ localStorage.setItem(key, JSON.stringify(arr)); renderList(); }
  function renderList(){ const arr=load(); if(!arr.length){ savedEl.innerHTML='<p class="muted">Ingen lagrede maler enda.</p>'; return;} savedEl.innerHTML=''; arr.forEach((w,i)=>{ const div=document.createElement('div'); div.className='menu-item'; const mmWarm=Math.round((w.warmupSec||0)/60); const mmCool=Math.round((w.cooldownSec||0)/60); div.innerHTML=`<strong>${w.name||'Uten navn'}</strong> — ${w.series.length} serier (oppv ${mmWarm} min, nedj ${mmCool} min)`; const btns=document.createElement('div'); btns.style.marginLeft='auto'; btns.style.display='flex'; btns.style.gap='8px';
    const use=document.createElement('a'); use.className='secondary'; use.href='index.html'; use.textContent='Bruk';
    const del=document.createElement('button'); del.className='ghost'; del.textContent='Slett'; del.onclick=()=>{ const a=load(); a.splice(i,1); saveAll(a); };
    btns.appendChild(use); btns.appendChild(del); div.appendChild(btns); savedEl.appendChild(div); }); }

  el('w-save').onclick=()=>{ const cfg=collect(); if(!cfg.series.length){ alert('Legg til minst én serie.'); return; } const arr=load(); arr.push(cfg); saveAll(arr); alert('Lagret. Gå til hovedskjerm – dukker opp i dropdown.'); };
  el('w-clear').onclick=()=>{ nameEl.value=''; warmEl.value=10; coolEl.value=10; listEl.innerHTML=''; tSpd.value=''; tGrd.value=''; preview(); };

  // Export / Import maler
  el('w-export').onclick=()=>{ const blob=new Blob([JSON.stringify(load(),null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='intz_workouts.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); };
  el('w-import').addEventListener('change', (ev)=>{ const f=ev.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ try{ const data=JSON.parse(rd.result); if(!Array.isArray(data)) throw new Error('Ugyldig format: forventet array'); const arr=load().concat(data); saveAll(arr); alert('Importert.'); }catch(e){ alert('Import feilet: '+e.message); } }; rd.readAsText(f); });

  // init
  addSeriesRow({reps:4,workSec:180,restSec:60,seriesRestSec:120,note:''});
  renderList(); preview();
})();
