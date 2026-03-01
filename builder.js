

function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){ try{ const v=localStorage.getItem(nsKey(k)); if(v!=null) return JSON.parse(v); const ov=localStorage.getItem(k); return ov!=null? JSON.parse(ov): d; }catch(e){ return d; } }
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }
function delNS(k){ localStorage.removeItem(nsKey(k)); }

(function(){
  const KEY='custom_workouts_v2';
  const el=id=>document.getElementById(id);
  const stepsEl=el('steps'), listEl=el('b-list');
  let editingIndex=null;

  // Step model types: warmup, cooldown, single, series, pause, seriespause, group (ui-only summary)
  let STEPS=[];
  const UNDO=[], REDO=[]; const UNDO_LIMIT=20;

  function pushState(){ UNDO.push(JSON.stringify({STEPS, editingIndex, name: el('b-name').value, desc: el('b-desc').value})); if(UNDO.length>UNDO_LIMIT) UNDO.shift(); REDO.length=0; }
  function restoreState(stateStr){ const s=JSON.parse(stateStr); STEPS=s.STEPS; editingIndex=s.editingIndex; el('b-name').value=s.name||''; el('b-desc').value=s.desc||''; render(); }
  function undo(){ if(!UNDO.length) return; const cur=JSON.stringify({STEPS, editingIndex, name:el('b-name').value, desc:el('b-desc').value}); REDO.push(cur); const prev=UNDO.pop(); restoreState(prev); }
  function redo(){ if(!REDO.length) return; const cur=JSON.stringify({STEPS, editingIndex, name:el('b-name').value, desc:el('b-desc').value}); UNDO.push(cur); const nxt=REDO.pop(); restoreState(nxt); }
  el('undo').onclick=undo; el('redo').onclick=redo;

  function uid(){ return 's'+Math.random().toString(36).slice(2,9); }
  function minutesToSec(m){ return Math.max(0, Math.round(Number(m||0)*60)); }

  function stepCard(step){ const card=document.createElement('div'); card.className='step'; card.draggable = step.type!=='group'; card.dataset.id=step.id; card.innerHTML = renderStepInner(step); wireStepCard(card, step); return card; }

  function renderStepInner(step){ const t=step.type; const h=`<div class=\"step-header\"><span class=\"handle\"><i class=\"ph-dots-six\"></i></span><span class=\"step-title\">${labelFor(step)}</span></div>`;
    if(t==='group'){
      const arr=step.data.secs||[]; const collapsed = !!step.data.collapsed; const label = step.data.title || 'Gruppe';
      return `<div class=\"step-header\"><span class=\"handle\"><i class=\"ph-dots-six\"></i></span><span class=\"step-title\">${label} – ${arr.length} segmenter</span><button class=\"ghost act-toggle\">${collapsed?'Vis segmenter':'Skjul segmenter'}</button></div>`;
    }
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

  function labelFor(step){ return ({warmup:'Oppvarming', cooldown:'Nedjogg', single:'Enkelt‑drag', series:'Serie', pause:'Pause', seriespause:'Seriepause', group:'Sammendrag'})[step.type]||step.type; }

  function wireStepCard(card, step){
    // group header special actions
    if(step.type==='group'){
      const tgl = card.querySelector('.act-toggle'); if(tgl){ tgl.onclick=()=>{ pushState(); step.data.collapsed = !step.data.collapsed; render(); } }
    }

    // inputs
    card.querySelectorAll('input,textarea').forEach(inp=>{ inp.addEventListener('input', ()=>{ pushState();
      if(step.type==='warmup'||step.type==='cooldown'){ step.data.sec = minutesToSec(card.querySelector('.f-min').value); }
      if(step.type==='single'){ step.data.workSec = Number(card.querySelector('.f-work').value||0); step.data.note = card.querySelector('.f-note').value||''; }
      if(step.type==='series'){ step.data.reps=Number(card.querySelector('.f-reps').value||0); step.data.workSec=Number(card.querySelector('.f-work').value||0); step.data.restSec=Number(card.querySelector('.f-rest').value||0); step.data.seriesRestSec=Number(card.querySelector('.f-srest').value||0); step.data.note = card.querySelector('.f-note').value||''; }
      if(step.type==='pause'||step.type==='seriespause'){ step.data.sec = Number(card.querySelector('.f-sec').value||0); }
    }); });

    // actions
    const dup=card.querySelector('.act-dup'); if(dup) dup.onclick=()=>{ pushState(); const clone=JSON.parse(JSON.stringify(step)); clone.id=uid(); insertAfterStep(step.id, clone); };
    const del=card.querySelector('.act-del'); if(del) del.onclick=()=>{ pushState(); removeStep(step.id); };

    // DnD
    card.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', step.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
    card.addEventListener('dragover', ev=>{ ev.preventDefault(); });
    card.addEventListener('drop', ev=>{ ev.preventDefault(); const srcId=ev.dataTransfer.getData('text/plain'); if(!srcId||srcId===step.id) return; pushState(); reorderBefore(srcId, step.id); });
  }

  function indexOfId(id){ return STEPS.findIndex(x=>x.id===id); }
  function insertAfterStep(targetId, newStep){ const idx=indexOfId(targetId); if(idx>=0){ STEPS.splice(idx+1,0,newStep); render(); }}
  function removeStep(id){ const i=indexOfId(id); if(i>=0){ const st=STEPS[i]; if(st.type==='group'){ // remove children following this group that belong to it
        const count=(st.data.secs||[]).length; let removed=0; for(let k=0; k<count && i+1<STEPS.length; k++){ if(STEPS[i+1] && (STEPS[i+1].data && STEPS[i+1].data._groupId===st.id)){ STEPS.splice(i+1,1); removed++; } }
      }
      STEPS.splice(i,1); render(); }
  }

  function reorderBefore(srcId, dstId){ const si=indexOfId(srcId); const di=indexOfId(dstId); if(si<0||di<0) return; const src=STEPS[si];
    // If src is group header: move header + its children together
    if(src.type==='group'){
      const count=(src.data.secs||[]).length; const bundle=STEPS.splice(si, 1 + countFilterFollowing(si, src.id));
      const di2 = indexOfId(dstId); const insert = si<di2? di2 - 1 : di2; STEPS.splice(insert,0,...bundle);
      render(); return;
    }
    // Prevent dropping a child of group outside its group if group collapsed
    if(src.data && src.data._groupId){ const hdrIndex=findGroupHeaderIndex(src.data._groupId); if(hdrIndex>=0){ const collapsed = !!STEPS[hdrIndex].data.collapsed; if(collapsed){ render(); return; } } }
    const [item]=STEPS.splice(si,1); const di2=indexOfId(dstId); const insert= si<di2? di2-1: di2; STEPS.splice(insert,0,item); render();
  }
  function countFilterFollowing(startIndex, groupId){ let count=0; for(let k=startIndex; k<STEPS.length; k++){ const s=STEPS[k]; if(k===startIndex) continue; if(s.data && s.data._groupId===groupId) count++; else break; } return count; }
  function findGroupHeaderIndex(groupId){ return STEPS.findIndex((s)=> s.type==='group' && s.id===groupId); }

  function render(){ stepsEl.innerHTML=''; for(let i=0;i<STEPS.length;i++){ const st=STEPS[i]; if(st.type==='group' && st.data.collapsed){ // render header only, skip children in collapsed view
        const c=stepCard(st); stepsEl.appendChild(c); // skip following children
        const count=(st.data.secs||[]).length; // ensure children exist right after header
        // children are still there; we just don't render them when collapsed
        i += 0; // loop will still visit them; we need to append but skip
        // We will handle skip in the loop by not appending children if collapsed; just continue and let them render? No, we must skip rendering of children rows here
      } }
    // second pass render to actually implement collapse/expand
    stepsEl.innerHTML='';
    for(let i=0;i<STEPS.length;i++){
      const st=STEPS[i];
      if(st.type==='group'){
        const c=stepCard(st); stepsEl.appendChild(c);
        if(st.data.collapsed){ // skip rendering children
          // advance i to after its children
          const cnt=(st.data.secs||[]).length; let skipped=0; let j=i+1; while(skipped<cnt && j<STEPS.length && STEPS[j].data && STEPS[j].data._groupId===st.id){ j++; skipped++; }
          i = j-1; continue;
        }
        continue;
      }
      const c=stepCard(st); stepsEl.appendChild(c);
    }
    renderList();
  }

  // Toolbar actions
  function addWarm(){ pushState(); STEPS.push({id:uid(), type:'warmup', data:{sec:600}}); render(); }
  function addSeries(){ pushState(); STEPS.push({id:uid(), type:'series', data:{reps:4,workSec:180,restSec:60,seriesRestSec:0,note:''}}); render(); }
  function addSingle(){ pushState(); STEPS.push({id:uid(), type:'single', data:{workSec:60,note:''}}); render(); }
  function addPause(){ pushState(); STEPS.push({id:uid(), type:'pause', data:{sec:60}}); render(); }
  function addSeriesPause(){ pushState(); STEPS.push({id:uid(), type:'seriespause', data:{sec:120}}); render(); }
  function addCool(){ pushState(); STEPS.push({id:uid(), type:'cooldown', data:{sec:600}}); render(); }
  el('add-warmup').onclick=addWarm; el('add-series').onclick=addSeries; el('add-single').onclick=addSingle; el('add-pause').onclick=addPause; el('add-seriepause').onclick=addSeriesPause; el('add-cooldown').onclick=addCool;

  // Generators -> group header + contiguous singles tagged with _groupId
  function addGenerator(title, secs){ if(!secs.length) return; pushState(); const gid=uid(); STEPS.push({id:gid, type:'group', data:{title, secs:[...secs], collapsed:true}}); secs.forEach(s=>{ STEPS.push({id:uid(), type:'single', data:{workSec:s, note:'', _groupId:gid}}); }); render(); }
  el('gen-fartlek').onclick=()=>{ const s=prompt('Varigheter i sek (kommadelt), f.eks. 60,90,60,120'); if(!s) return; const arr=s.split(',').map(x=>Number(x.trim())).filter(x=>x>0); addGenerator('Fartlek', arr); };
  el('gen-pyramid').onclick=()=>{ const s=prompt('Varigheter i sek for pyramide (kommadelt), f.eks. 60,120,180,120,60'); if(!s) return; const arr=s.split(',').map(x=>Number(x.trim())).filter(x=>x>0); addGenerator('Pyramide', arr); };

  // Save & Update
  function compileToV2(){ let warm=0, cool=0; const series=[]; for(const s of STEPS){ if(s.type==='warmup') warm += Number(s.data.sec||0); else if(s.type==='cooldown') cool += Number(s.data.sec||0); else if(s.type==='single'){ series.push({reps:1,workSec:Number(s.data.workSec||0),restSec:0,seriesRestSec:0,note:s.data.note||''}); } else if(s.type==='series'){ series.push({reps:Number(s.data.reps||0), workSec:Number(s.data.workSec||0), restSec:Number(s.data.rest||s.data.restSec||0), seriesRestSec:Number(s.data.seriesRestSec||0), note:s.data.note||''}); } else if(s.type==='pause' || s.type==='seriespause'){ const sec=Number(s.data.sec||0); series.push({reps:1, workSec:0, restSec:sec, seriesRestSec:0, note:''}); } else if(s.type==='group'){ /* ui only */ } }
    return {warmupSec:warm, cooldownSec:cool, series}; }

  function loadFromV2(cfg){ STEPS=[]; if((cfg.warmupSec||0)>0) STEPS.push({id:uid(), type:'warmup', data:{sec:Number(cfg.warmupSec||0)}});
    (cfg.series||[]).forEach(s=>{ if(Number(s.reps||0)===1 && Number(s.workSec||0)>0 && Number(s.restSec||0)===0 && Number(s.seriesRestSec||0)===0){ STEPS.push({id:uid(), type:'single', data:{workSec:Number(s.workSec||0), note:s.note||''}}); }
      else if(Number(s.reps||0)===1 && Number(s.workSec||0)===0 && Number(s.restSec||0)>0){ STEPS.push({id:uid(), type:'pause', data:{sec:Number(s.restSec||0)}}); }
      else { STEPS.push({id:uid(), type:'series', data:{reps:Number(s.reps||0), workSec:Number(s.workSec||0), restSec:Number(s.restSec||0), seriesRestSec:Number(s.seriesRestSec||0), note:s.note||''}}); } });
    if((cfg.cooldownSec||0)>0) STEPS.push({id:uid(), type:'cooldown', data:{sec:Number(cfg.cooldownSec||0)}}); render(); }

  function getAll(){ return getNS(KEY,[]); }
  function setAll(arr){ setNS(KEY, arr); }

  el('b-save').onclick=()=>{ const arr=getAll(); const compiled=compileToV2(); const obj={ name: el('b-name').value||'Økt', desc: el('b-desc').value||'', warmupSec:compiled.warmupSec, cooldownSec:compiled.cooldownSec, series:compiled.series }; arr.push(obj); setAll(arr); alert('Lagret ny mal.'); renderList(); };
  el('b-update').onclick=()=>{ if(editingIndex==null){ alert('Ingen mal valgt for oppdatering.'); return; } const arr=getAll(); const compiled=compileToV2(); arr[editingIndex]={ ...arr[editingIndex], name:el('b-name').value||arr[editingIndex].name, desc: el('b-desc').value||arr[editingIndex].desc, warmupSec:compiled.warmupSec, cooldownSec:compiled.cooldownSec, series:compiled.series }; setAll(arr); alert('Oppdatert.'); renderList(); };
  el('b-clear').onclick=()=>{ pushState(); editingIndex=null; el('b-update').classList.add('hidden'); el('b-save').classList.remove('hidden'); el('b-name').value=''; el('b-desc').value=''; STEPS=[]; render(); };

  // Saved templates UI: name button, play, trash, desc; DnD reorder
  function autorunIndex(i){ setNS('autorun', {type:'custom', index:i}); location.href='index.html'; }

  function renderList(){ const arr=getAll(); if(!arr.length){ listEl.innerHTML='<p class="small">Ingen lagrede maler enda.</p>'; return;} listEl.innerHTML=''; const wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px';
    arr.forEach((w,i)=>{
      const row=document.createElement('div'); row.className='rowline'; row.draggable=true; row.dataset.index=i;
      const left=document.createElement('div'); left.className='row-left';
      const handle=document.createElement('span'); handle.className='row-handle'; handle.innerHTML='<i class="ph-dots-six"></i>';
      const nameBtn=document.createElement('button'); nameBtn.className='row-name'; nameBtn.title=w.name||''; nameBtn.textContent=w.name||'Uten navn'; nameBtn.onclick=()=>{ editingIndex=i; el('b-name').value=w.name||''; el('b-desc').value=w.desc||''; loadFromV2(w); el('b-update').classList.remove('hidden'); el('b-save').classList.add('hidden'); window.scrollTo({top:0,behavior:'smooth'}); };
      const desc=document.createElement('div'); desc.className='row-desc'; desc.textContent=w.desc||'';
      left.appendChild(handle); left.appendChild(nameBtn); left.appendChild(desc);

      const btns=document.createElement('div'); btns.className='row-btns';
      const play=document.createElement('button'); play.className='secondary'; play.title='Bruk denne økta'; play.innerHTML='<i class="ph-play"></i>';
      play.onclick=()=> autorunIndex(i);
      const del=document.createElement('button'); del.className='ghost'; del.title='Slett'; del.innerHTML='<i class="ph-trash"></i>';
      del.onclick=()=>{ if(confirm('Slette denne malen?')){ const a=getAll(); a.splice(i,1); setAll(a); renderList(); } };
      btns.appendChild(play); btns.appendChild(del);

      row.appendChild(left); row.appendChild(btns);

      // DnD order
      row.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', i.toString()); row.classList.add('dragging'); });
      row.addEventListener('dragend', ()=> row.classList.remove('dragging'));
      row.addEventListener('dragover', ev=>{ ev.preventDefault(); });
      row.addEventListener('drop', ev=>{ ev.preventDefault(); const si=Number(ev.dataTransfer.getData('text/plain')); const di=i; if(isNaN(si)||isNaN(di)||si===di) return; const a=getAll(); const [it]=a.splice(si,1); a.splice(di,0,it); setAll(a); renderList(); });

      wrap.appendChild(row);
    });
    listEl.appendChild(wrap);
  }

  // init
  render(); renderList();
})();
