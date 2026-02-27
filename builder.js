
(function(){
  const key='custom_workouts';
  const el=id=>document.getElementById(id);
  const nameEl=el('w-name'), warmEl=el('w-warm'), coolEl=el('w-cool'), repsEl=el('w-reps'), workEl=el('w-work'), restEl=el('w-rest'), tSpd=el('w-target-speed'), tGrd=el('w-target-grade');
  function load(){ try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){ return []; } }
  function saveAll(arr){ localStorage.setItem(key, JSON.stringify(arr)); renderList(); }
  function renderList(){ const list=el('w-list'); const arr=load(); if(!arr.length){ list.innerHTML='<p class="muted">Ingen lagrede maler enda.</p>'; return;} list.innerHTML=''; arr.forEach((w,i)=>{ const div=document.createElement('div'); div.className='menu-item'; div.innerHTML=`<strong>${w.name||'Uten navn'}</strong> — ${w.reps}×${w.workSec}s / ${w.restSec}s (oppv ${w.warmupSec}m, nedkj ${w.cooldownSec}m)`; const btns=document.createElement('div'); btns.style.marginLeft='auto'; const del=document.createElement('button'); del.className='ghost'; del.textContent='Slett'; del.onclick=()=>{ const a=load(); a.splice(i,1); saveAll(a); };
    const use=document.createElement('a'); use.className='secondary'; use.href='index.html'; use.textContent='Bruk';
    btns.appendChild(use); btns.appendChild(del); div.appendChild(btns); list.appendChild(div); }); }
  function preview(){ const reps=Number(repsEl.value||0), work=Number(workEl.value||0), rest=Number(restEl.value||0), warm=Number(warmEl.value||0), cool=Number(coolEl.value||0); const total = warm*60 + reps*(work+rest) + cool*60; el('w-preview').textContent = `Varighet: ${Math.floor(total/60)}:${String(total%60).padStart(2,'0')} — Drag: ${reps} × ${work}s / ${rest}s` + (tSpd.value? ` — mål ${tSpd.value} km/t`:'') + (tGrd.value? ` @ ${tGrd.value}%`:''); }
  ['w-reps','w-work','w-rest','w-warm','w-cool','w-target-speed','w-target-grade'].forEach(id=> el(id).addEventListener('input', preview));
  preview(); renderList();
  el('w-save').onclick=()=>{ const w={ name:nameEl.value||'Custom', warmupSec:Number(warmEl.value||0)*60/60, cooldownSec:Number(coolEl.value||0)*60/60, reps:Number(repsEl.value||1), workSec:Number(workEl.value||60), restSec:Number(restEl.value||0), targetSpeed: tSpd.value?Number(tSpd.value):null, targetGrade: tGrd.value?Number(tGrd.value):null}; const arr=load(); arr.push(w); saveAll(arr); alert('Lagret. Gå til hovedskjerm – knappen dukker opp.'); };
  el('w-clear').onclick=()=>{ nameEl.value=''; warmEl.value=10; coolEl.value=10; repsEl.value=5; workEl.value=300; restEl.value=60; tSpd.value=''; tGrd.value=''; preview(); };
})();
