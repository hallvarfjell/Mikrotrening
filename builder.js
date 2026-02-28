
(function(){
  const key='custom_workouts_v2';
  const el=id=>document.getElementById(id);
  const nameEl=el('w-name'), warmEl=el('w-warm'), coolEl=el('w-cool'), tSpd=el('w-target-speed'), tGrd=el('w-target-grade');
  const listEl=el('series-list'), previewEl=el('w-preview'), savedEl=el('w-list');

  function newSeriesRow(data){
    const wrap=document.createElement('div'); wrap.className='menu-item';
    wrap.innerHTML=`
      <label>Reps <input type="number" class="sr-reps" min="1" step="1" value="${data?.reps??4}"></label>
      <label>Work (s) <input type="number" class="sr-work" min="10" step="10" value="${data?.workSec??180}"></label>
      <label>Rest (s) <input type="number" class="sr-rest" min="0" step="5" value="${data?.restSec??60}"></label>
      <label>Seriepause (s) <input type="number" class="sr-srest" min="0" step="10" value="${data?.seriesRestSec??120}"></label>
      <button class="ghost sr-del">Slett</button>`;
    wrap.querySelector('.sr-del').onclick=()=>{ wrap.remove(); preview(); };
    ['sr-reps','sr-work','sr-rest','sr-srest'].forEach(cls=> wrap.querySelector('.'+cls).addEventListener('input', preview));
    return wrap;
  }
  function addSeriesRow(data){ listEl.appendChild(newSeriesRow(data)); preview(); }
  el('add-series').onclick=()=> addSeriesRow();
  el('clear-series').onclick=()=>{ listEl.innerHTML=''; preview(); };

  function collect(){ const series=[]; listEl.querySelectorAll('.menu-item').forEach(row=>{ series.push({ reps:Number(row.querySelector('.sr-reps').value||0), workSec:Number(row.querySelector('.sr-work').value||0), restSec:Number(row.querySelector('.sr-rest').value||0), seriesRestSec:Number(row.querySelector('.sr-srest').value||0) }); }); return { name:nameEl.value||'Custom', warmupSec:Number(warmEl.value||0)*60/60, cooldownSec:Number(coolEl.value||0)*60/60, targetSpeed:tSpd.value?Number(tSpd.value):null, targetGrade:tGrd.value?Number(tGrd.value):null, series }; }
  function totalSeconds(cfg){ const warm=Number(cfg.warmupSec||0); const cool=Number(cfg.cooldownSec||0); const series=cfg.series||[]; const sum=series.reduce((a,s)=> a + (Number(s.reps||0)*(Number(s.workSec||0)+Number(s.restSec||0))) + Number(s.seriesRestSec||0), 0); return warm + sum + cool; }
  function preview(){ const cfg=collect(); const tot=totalSeconds(cfg); previewEl.textContent=`Varighet: ${Math.floor(tot/60)}:${String(tot%60).padStart(2,'0')} — ${cfg.series.length} serier`; }

  function load(){ try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){ return []; } }
  function saveAll(arr){ localStorage.setItem(key, JSON.stringify(arr)); renderList(); }
  function renderList(){ const arr=load(); if(!arr.length){ savedEl.innerHTML='<p class="muted">Ingen lagrede maler enda.</p>'; return;} savedEl.innerHTML=''; arr.forEach((w,i)=>{ const div=document.createElement('div'); div.className='menu-item'; div.innerHTML=`<strong>${w.name||'Uten navn'}</strong> — ${w.series.length} serier (oppv ${w.warmupSec}m, nedj ${w.cooldownSec}m)`; const btns=document.createElement('div'); btns.style.marginLeft='auto'; const del=document.createElement('button'); del.className='ghost'; del.textContent='Slett'; del.onclick=()=>{ const a=load(); a.splice(i,1); saveAll(a); };
    const use=document.createElement('a'); use.className='secondary'; use.href='index.html'; use.textContent='Bruk';
    btns.appendChild(use); btns.appendChild(del); div.appendChild(btns); savedEl.appendChild(div); }); }

  el('w-save').onclick=()=>{ const cfg=collect(); if(!cfg.series.length){ alert('Legg til minst én serie.'); return; } const arr=load(); arr.push(cfg); saveAll(arr); alert('Lagret. Gå til hovedskjerm – knappen dukker opp.'); };
  el('w-clear').onclick=()=>{ nameEl.value=''; warmEl.value=10; coolEl.value=10; listEl.innerHTML=''; tSpd.value=''; tGrd.value=''; preview(); };

  // init
  addSeriesRow({reps:4,workSec:180,restSec:60,seriesRestSec:120});
  renderList(); preview();
})();
