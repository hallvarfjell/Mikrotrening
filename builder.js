
// ---- Namespaced storage helpers ----

function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){ try{ const v=localStorage.getItem(nsKey(k)); if(v!=null) return JSON.parse(v); const ov=localStorage.getItem(k); return ov!=null? JSON.parse(ov): d; }catch(e){ return d; } }
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }

(function(){
  const KEY='custom_workouts_v2';
  const el=id=>document.getElementById(id);
  const stepsEl=el('steps'), listEl=el('b-list');
  let editingIndex=null;

  // Step model types: warmup, cooldown, single, series, pause, seriespause
  let STEPS=[];
  const UNDO=[], REDO=[]; const UNDO_LIMIT=20;

  function pushState(){ UNDO.push(JSON.stringify({STEPS, editingIndex, name: el('b-name').value, desc: el('b-desc').value})); if(UNDO.length>UNDO_LIMIT) UNDO.shift(); REDO.length=0; }
  function restoreState(stateStr){ const s=JSON.parse(stateStr); STEPS=s.STEPS; editingIndex=s.editingIndex; el('b-name').value=s.name||''; el('b-desc').value=s.desc||''; render(); }
  function undo(){ if(!UNDO.length) return; const cur=JSON.stringify({STEPS, editingIndex, name:el('b-name').value, desc:el('b-desc').value}); REDO.push(cur); const prev=UNDO.pop(); restoreState(prev); }
  function redo(){ if(!REDO.length) return; const cur=JSON.stringify({STEPS, editingIndex, name:el('b-name').value, desc:el('b-desc').value}); UNDO.push(cur); const nxt=REDO.pop(); restoreState(nxt); }
  el('undo').onclick=undo; el('redo').onclick=redo;

  function uid(){ return 's'+Math.random().toString(36).slice(2,9); }
  function minutesToSec(m){ return Math.max(0, Math.round(Number(m||0)*60)); }

  function stepCard(step){ const card=document.createElement('div'); card.className='step'; card.draggable=true; card.dataset.id=step.id; card.innerHTML = renderStepInner(step); wireStepCard(card, step); return card; }

  function renderStepInner(step){ const t=step.type; const h=`<div class=\"step-header\"><span class=\"handle\"><i class=\"ph-dots-six\"></i></span><span class=\"step-title\">${labelFor(step)}</span></div>`;
    if(t==='warmup' || t==='cooldown'){
      return h+`<div class=\"step-fields\">`+
        `<label>Varighet (min)<input type=\"number\" class=\"f-min\" min=\"0\" step=\"1\" value=\"${(step.data.sec||0)/60}\"></label>`+
        `</div><div class=\"step-actions\"><button class=\"ghost act-dup\"><i class=\"ph-copy\"></i> Dupliser</button><button class=\"ghost act-del\"><i class=\"ph-trash\"></i> Slett</button></div>`;
    }
    if(t==='single'){
      return h+`<div class=\"step-fields enlarge-note\">`+
        `<label>Work (s)<input type=\"number\" class=\"f-work\" min=\"5\" step=\"5\" value=\"${step.data.workSec||60}\"></label>`+
        `<label style=\"grid-column: span 5\">Merknad<textarea class=\"f-note\" rows=\"2\" placeholder=\"f.eks. HM‑fart\">${step.data.note||''}</textarea></label>`+
        `</div><div class=\"step-actions\"><button class=\"ghost act-dup\"><i class=\"ph-copy\"></i> Dupliser</button><button class=\"ghost act-del\"><i class=\"ph-trash\"></i> Slett</button></div>`;
    }
    if(t==='series'){
      return h+`<div class=\"step-fields enlarge-note\">`+
        `<label>Reps<input type=\"number\" class=\"f-reps\" min=\"1\" step=\"1\" value=\"${step.data.reps||4}\"></label>`+
        `<label>Work (s)<input type=\"number\" class=\"f-work\" min=\"10\" step=\"5\" value=\"${step.data.workSec||180}\"></label>`+
        `<label>Rest (s)<input type=\"number\" class=\"f-rest\" min=\"0\" step=\"5\" value=\"${step.data.restSec||60}\"></label>`+
        `<label>Seriepause (s)<input type=\"number\" class=\"f-srest\" min=\"0\" step=\"10\" value=\"${step.data.seriesRestSec||0}\"></label>`+
        `<label style=\"grid-column: span 2\">Merknad<textarea class=\"f-note\" rows=\"2\" placeholder=\"f.eks. 90% HRmax\">${step.data.note||''}</textarea></label>`+
        `</div><div class=\"step-actions\"><button class=\"ghost act-dup\"><i class=\"ph-copy\"></i> Dupliser</button><button class=\"ghost act-del\"><i class=\"ph-trash\"></i> Slett</button></div>`;
    }
    if(t==='pause' || t==='seriespause'){
      return h+`<div class=\"step-fields\">`+
        `<label>Varighet (s)<input type=\"number\" class=\"f-sec\" min=\"5\" step=\"5\" value=\"${step.data.sec||60}\"></label>`+
        `</div><div class=\"step-actions\"><button class=\"ghost act-dup\"><i class=\"ph-copy\"></i> Dupliser</button><button class=\"ghost act-del\"><i class=\"ph-trash\"></i> Slett</button></div>`;
    }
    return h;
  }

  function labelFor(step){ return ({warmup:'Oppvarming', cooldown:'Nedjogg', single:'Enkelt‑drag', series:'Serie', pause:'Pause', seriespause:'Seriepause'})[step.type]||step.type; }

  function wireStepCard(card, step){
    card.querySelectorAll('input,textarea').forEach(inp=>{
      inp.addEventListener('input', ()=>{ pushState();
        if(step.type==='warmup'||step.type==='cooldown'){ step.data.sec = minutesToSec(card.querySelector('.f-min').value); }
        if(step.type==='single'){ step.data.workSec = Number(card.querySelector('.f-work').value||0); step.data.note = card.querySelector('.f-note').value||''; }
        if(step.type==='series'){ step.data.reps=Number(card.querySelector('.f-reps').value||0); step.data.workSec=Number(card.querySelector('.f-work').value||0); step.data.restSec=Number(card.querySelector('.f-rest').value||0); step.data.seriesRestSec=Number(card.querySelector('.f-srest').value||0); step.data.note = card.querySelector('.f-note').value||''; }
        if(step.type==='pause'||step.type==='seriespause'){ step.data.sec = Number(card.querySelector('.f-sec').value||0); }
      });
    });
    const dup=card.querySelector('.act-dup'); if(dup) dup.onclick=()=>{ pushState(); const clone=JSON.parse(JSON.stringify(step)); clone.id=uid(); insertAfterStep(step.id, clone); };
    const del=card.querySelector('.act-del'); if(del) del.onclick=()=>{ pushState(); removeStep(step.id); };
    card.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', step.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
    card.addEventListener('dragover', ev=>{ ev.preventDefault(); });
    card.addEventListener('drop', ev=>{ ev.preventDefault(); const srcId=ev.dataTransfer.getData('text/plain'); if(!srcId||srcId===step.id) return; pushState(); reorderBefore(srcId, step.id); });
  }

  function insertAfterStep(targetId, newStep){ const idx=STEPS.findIndex(x=>x.id===targetId); if(idx>=0){ STEPS.splice(idx+1,0,newStep); render(); }}
  function removeStep(id){ const i=STEPS.findIndex(x=>x.id===id); if(i>=0){ STEPS.splice(i,1); render(); }}
  function reorderBefore(srcId, dstId){ const si=STEPS.findIndex(x=>x.id===srcId); const di=STEPS.findIndex(x=>x.id===dstId); if(si<0||di<0) return; const [item]=STEPS.splice(si,1); const insert= si<di? di-1: di; STEPS.splice(insert,0,item); render(); }

  function render(){ stepsEl.innerHTML=''; for(const st of STEPS){ const c=stepCard(st); stepsEl.appendChild(c); } renderList(); }

  // Toolbar actions
  function addWarm(){ pushState(); STEPS.push({id:uid(), type:'warmup', data:{sec:600}}); render(); }
  function addSeries(){ pushState(); STEPS.push({id:uid(), type:'series', data:{reps:4,workSec:180,restSec:60,seriesRestSec:0,note:''}}); render(); }
  function addSingle(){ pushState(); STEPS.push({id:uid(), type:'single', data:{workSec:60,note:''}}); render(); }
  function addPause(){ pushState(); STEPS.push({id:uid(), type:'pause', data:{sec:60}}); render(); }
  function addSeriesPause(){ pushState(); STEPS.push({id:uid(), type:'seriespause', data:{sec:120}}); render(); }
  function addCool(){ pushState(); STEPS.push({id:uid(), type:'cooldown', data:{sec:600}}); render(); }
  el('add-warmup').onclick=addWarm; el('add-series').onclick=addSeries; el('add-single').onclick=addSingle; el('add-pause').onclick=addPause; el('add-seriepause').onclick=addSeriesPause; el('add-cooldown').onclick=addCool;

  // Generators
  el('gen-fartlek').onclick=()=>{ const s=prompt('Oppgi varigheter i sekunder (kommadelt), f.eks. 60,90,60,120'); if(!s) return; const arr=s.split(',').map(x=>Number(x.trim())).filter(x=>x>0); if(!arr.length) return; pushState(); arr.forEach(sec=> STEPS.push({id:uid(), type:'single', data:{workSec:sec, note:''}})); render(); };
  el('gen-pyramid').onclick=()=>{ const s=prompt('Oppgi varigheter i sekunder for pyramiden (kommadelt), f.eks. 60,120,180,120,60'); if(!s) return; const arr=s.split(',').map(x=>Number(x.trim())).filter(x=>x>0); if(!arr.length) return; pushState(); arr.forEach(sec=> STEPS.push({id:uid(), type:'single', data:{workSec:sec, note:''}})); render(); };

  // Save & Update
  function compileToV2(){ let warm=0, cool=0; const series=[]; for(const s of STEPS){ if(s.type==='warmup') warm += Number(s.data.sec||0); else if(s.type==='cooldown') cool += Number(s.data.sec||0); else if(s.type==='single'){ series.push({reps:1,workSec:Number(s.data.workSec||0),restSec:0,seriesRestSec:0,note:s.data.note||''}); } else if(s.type==='series'){ series.push({reps:Number(s.data.reps||0), workSec:Number(s.data.workSec||0), restSec:Number(s.data.rest||s.data.restSec||0), seriesRestSec:Number(s.data.seriesRestSec||0), note:s.data.note||''}); } else if(s.type==='pause' || s.type==='seriespause'){ // standalone pause → reps1 work0 rest=sec
      const sec=Number(s.data.sec||0); series.push({reps:1, workSec:0, restSec:sec, seriesRestSec:0, note:''}); }
    }
    return {warmupSec:warm, cooldownSec:cool, series}; }

  function loadFromV2(cfg){ STEPS=[]; if((cfg.warmupSec||0)>0) STEPS.push({id:uid(), type:'warmup', data:{sec:Number(cfg.warmupSec||0)}});
    (cfg.series||[]).forEach(s=>{ if(Number(s.reps||0)===1 && Number(s.workSec||0)>0 && Number(s.restSec||0)===0 && Number(s.seriesRestSec||0)===0){ STEPS.push({id:uid(), type:'single', data:{workSec:Number(s.workSec||0), note:s.note||''}}); }
      else if(Number(s.reps||0)===1 && Number(s.workSec||0)===0 && Number(s.restSec||0)>0){ STEPS.push({id:uid(), type:'pause', data:{sec:Number(s.restSec||0)}}); }
      else { STEPS.push({id:uid(), type:'series', data:{reps:Number(s.reps||0), workSec:Number(s.workSec||0), restSec:Number(s.restSec||0), seriesRestSec:Number(s.seriesRestSec||0), note:s.note||''}}); } });
    if((cfg.cooldownSec||0)>0) STEPS.push({id:uid(), type:'cooldown', data:{sec:Number(cfg.cooldownSec||0)}}); render(); }

  function getAll(){ return getNS(KEY,[]); }
  function setAll(arr){ setNS(KEY, arr); }

  el('b-save').onclick=()=>{ const arr=getAll(); const compiled=compileToV2(); const obj={ name: el('b-name').value||'Custom', desc: el('b-desc').value||'', warmupSec:compiled.warmupSec, cooldownSec:compiled.cooldownSec, series:compiled.series }; arr.push(obj); setAll(arr); alert('Lagret ny mal.'); renderList(); };
  el('b-update').onclick=()=>{ if(editingIndex==null){ alert('Ingen mal valgt for oppdatering.'); return; } const arr=getAll(); const compiled=compileToV2(); arr[editingIndex]={ ...arr[editingIndex], name:el('b-name').value||arr[editingIndex].name, desc: el('b-desc').value||arr[editingIndex].desc, warmupSec:compiled.warmupSec, cooldownSec:compiled.cooldownSec, series:compiled.series }; setAll(arr); alert('Oppdatert.'); renderList(); };
  el('b-clear').onclick=()=>{ pushState(); editingIndex=null; el('b-update').classList.add('hidden'); el('b-save').classList.remove('hidden'); el('b-name').value=''; el('b-desc').value=''; STEPS=[]; render(); };

  function renderList(){ const arr=getAll(); if(!arr.length){ listEl.innerHTML='<p class="small">Ingen lagrede maler enda.</p>'; return;} listEl.innerHTML=''; const wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px'; arr.forEach((w,i)=>{ const row=document.createElement('div'); row.className='menu-item'; row.style.display='flex'; row.style.alignItems='center'; row.style.justifyContent='space-between'; const left=document.createElement('a'); left.href='javascript:void(0)'; left.textContent=`${w.name||'Uten navn'}`; left.onclick=()=>{ editingIndex=i; el('b-name').value=w.name||''; el('b-desc').value=w.desc||''; loadFromV2(w); el('b-update').classList.remove('hidden'); el('b-save').classList.add('hidden'); window.scrollTo({top:0,behavior:'smooth'}); };
      const btns=document.createElement('div'); btns.style.display='flex'; btns.style.gap='6px';
      const use=document.createElement('a'); use.className='secondary'; use.href='index.html'; use.textContent='Bruk';
      const del=document.createElement('button'); del.className='ghost'; del.textContent='Slett'; del.onclick=()=>{ if(confirm('Slette denne malen?')){ const a=getAll(); a.splice(i,1); setAll(a); renderList(); } };
      btns.appendChild(use); btns.appendChild(del);
      row.appendChild(left); row.appendChild(btns); wrap.appendChild(row);
    }); listEl.appendChild(wrap); }

  // init
  render(); renderList();
})();
