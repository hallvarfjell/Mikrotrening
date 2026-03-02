
function activeUser(){ return localStorage.getItem('active_user') || 'default'; }
function nsKey(k){ return 'u:'+activeUser()+':'+k; }
function getNS(k, d){ try{ const v=localStorage.getItem(nsKey(k)); if(v!=null) return JSON.parse(v); const ov=localStorage.getItem(k); return ov!=null? JSON.parse(ov): d; }catch(e){ return d; } }
function setNS(k, v){ localStorage.setItem(nsKey(k), JSON.stringify(v)); }
(function(){
  const KEY='custom_workouts_v2';
  const el=id=>document.getElementById(id);
  const stepsEl=el('steps'), listEl=el('b-list');
  let editingIndex=null;

  let STEPS=[]; const UNDO=[], REDO=[]; const UNDO_LIMIT=20;
  function pushState(){ UNDO.push(JSON.stringify({STEPS, editingIndex, name: el('b-name').value, desc: el('b-desc').value})); if(UNDO.length>UNDO_LIMIT) UNDO.shift(); REDO.length=0; }
  function restoreState(stateStr){ const s=JSON.parse(stateStr); STEPS=s.STEPS; editingIndex=s.editingIndex; el('b-name').value=s.name||''; el('b-desc').value=s.desc||''; render(); }
  function undo(){ if(!UNDO.length) return; const cur=JSON.stringify({STEPS, editingIndex, name:el('b-name').value, desc:el('b-desc').value}); REDO.push(cur); const prev=UNDO.pop(); restoreState(prev); }
  function redo(){ if(!REDO.length) return; const cur=JSON.stringify({STEPS, editingIndex, name:el('b-name').value, desc:el('b-desc').value}); UNDO.push(cur); const nxt=REDO.pop(); restoreState(nxt); }
  el('undo').onclick=undo; el('redo').onclick=redo;

  function uid(){ return 's'+Math.random().toString(36).slice(2,9); }
  function fmt(s){ s=Math.max(0,Math.round(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }

  function stepCard(step){ const card=document.createElement('div'); card.className='step'; card.draggable = step.type!=='group'; card.dataset.id=step.id; card.innerHTML = renderStepInner(step); wireStepCard(card, step); return card; }
  function labelFor(step){ return ({warmup:'Oppvarming', cooldown:'Nedjogg', single:'Enkelt‑drag', series:'Serie', pause:'Pause', seriespause:'Seriepause', group:'Sammendrag'})[step.type]||step.type; }

  function renderStepInner(step){ const t=step.type; const h=`<div class="step-header"><span class="handle"><i class="ph-dots-six"></i></span><span class="step-title">${labelFor(step)}</span></div>`;
    if(t==='group'){
      const arr=step.data.secs||[]; const collapsed = !!step.data.collapsed; const label = step.data.title || 'Gruppe';
      return `<div class="step-header"><span class="handle"><i class="ph-dots-six"></i></span><span class="step-title">${label} – ${arr.length} segmenter</span><div class="step-actions"><button class="ghost act-dupgrp"><i class="ph-copy"></i> Dupliser</button><button class="ghost act-tgl">${collapsed?'Vis':'Skjul'}</button><button class="ghost act-del"><i class="ph-trash"></i> Slett</button></div>`;
    }
    if(t==='warmup' || t==='cooldown'){
      return h+`<div class="step-fields">`+
        `<label>Varighet (min)<input type="number" class="f-min" min="0" step="1" value="${(step.data.sec||0)/60}"></label>`+
        `</div><div class="step-actions"><button class="ghost act-dup"><i class="ph-copy"></i> Dupliser</button><button class="ghost act-del"><i class="ph-trash"></i> Slett</button></div>`;
    }
    if(t==='single'){
      return h+`<div class="step-fields enlarge-note">`+
        `<label>Work (s)<input type="number" class="f-work" min="5" step="5" value="${step.data.workSec||60}"></label>`+
        `<label style="grid-column: span 5">Merknad<textarea class="f-note" rows="2" placeholder="f.eks. HM‑fart">${step.data.note||''}</textarea></label>`+
        `</div><div class="step-actions"><button class="ghost act-dup"><i class="ph-copy"></i> Dupliser</button><button class="ghost act-del"><i class="ph-trash"></i> Slett</button></div>`;
    }
    if(t==='series'){
      return h+`<div class="step-fields enlarge-note">`+
        `<label>Reps<input type="number" class="f-reps" min="1" step="1" value="${step.data.reps||4}"></label>`+
        `<label>Work (s)<input type="number" class="f-work" min="10" step="5" value="${step.data.workSec||180}"></label>`+
        `<label>Rest (s)<input type="number" class="f-rest" min="0" step="5" value="${step.data.restSec||60}"></label>`+
        `<label>Seriepause (s)<input type="number" class="f-srest" min="0" step="10" value="${step.data.seriesRestSec||0}"></label>`+
        `<label style="grid-column: span 2">Merknad<textarea class="f-note" rows="2" placeholder="f.eks. 90% HRmax">${step.data.note||''}</textarea></label>`+
        `</div><div class="step-actions"><button class="ghost act-dup"><i class="ph-copy"></i> Dupliser</button><button class="ghost act-del"><i class="ph-trash"></i> Slett</button></div>`;
    }
    if(t==='pause' || t==='seriespause'){
      return h+`<div class="step-fields">`+
        `<label>Varighet (s)<input type="number" class="f-sec" min="5" step="5" value="${step.data.sec||60}"></label>`+
        `</div><div class="step-actions"><button class="ghost act-dup"><i class="ph-copy"></i> Dupliser</button><button class="ghost act-del"><i class="ph-trash"></i> Slett</button></div>`;
    }
    return h;
  }

  function wireStepCard(card, step){
    if(step.type==='group'){
      const tgl=card.querySelector('.act-tgl'); if(tgl) tgl.onclick=()=>{ pushState(); step.data.collapsed=!step.data.collapsed; render(); };
      const dupg=card.querySelector('.act-dupgrp'); if(dupg) dupg.onclick=()=>{ pushState(); duplicateGroup(step.id); };
      const del=card.querySelector('.act-del'); if(del) del.onclick=()=>{ pushState(); deleteGroup(step.id); };
    }
    card.querySelectorAll('input,textarea').forEach(inp=>{ inp.addEventListener('input', ()=>{ pushState();
      if(step.type==='warmup'||step.type==='cooldown'){ step.data.sec = Number(card.querySelector('.f-min').value||0)*60; }
      if(step.type==='single'){ step.data.workSec = Number(card.querySelector('.f-work').value||0); step.data.note = card.querySelector('.f-note').value||''; }
      if(step.type==='series'){ step.data.reps=Number(card.querySelector('.f-reps').value||0); step.data.workSec=Number(card.querySelector('.f-work').value||0); step.data.restSec=Number(card.querySelector('.f-rest').value||0); step.data.seriesRestSec=Number(card.querySelector('.f-srest').value||0); step.data.note = card.querySelector('.f-note').value||''; }
      if(step.type==='pause'||step.type==='seriespause'){ step.data.sec = Number(card.querySelector('.f-sec').value||0); }
      refreshTotal();
    }); });

    const dup=card.querySelector('.act-dup'); if(dup) dup.onclick=()=>{ pushState(); const clone=JSON.parse(JSON.stringify(step)); clone.id=uid(); insertAfterStep(step.id, clone); refreshTotal(); };
    const del=card.querySelector('.act-del'); if(del && step.type!=='group') del.onclick=()=>{ pushState(); removeStep(step.id); refreshTotal(); };

    card.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', step.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
    card.addEventListener('dragover', ev=>{ ev.preventDefault(); });
    card.addEventListener('drop', ev=>{ ev.preventDefault(); const srcId=ev.dataTransfer.getData('text/plain'); if(!srcId||srcId===step.id) return; pushState(); reorderBefore(srcId, step.id); refreshTotal(); });
  }

  function indexOfId(id){ return STEPS.findIndex(x=>x.id===id); }
  function insertAfterStep(targetId, newStep){ const idx=indexOfId(targetId); if(idx>=0){ STEPS.splice(idx+1,0,newStep); render(); }}
  function removeStep(id){ const i=indexOfId(id); if(i>=0){ const st=STEPS[i]; if(st.type==='group'){ deleteGroup(st.id); return; } STEPS.splice(i,1); render(); }}

  function deleteGroup(groupId){ const i=indexOfId(groupId); if(i<0) return; STEPS.splice(i,1); while(i<STEPS.length && STEPS[i].data && STEPS[i].data._groupId===groupId){ STEPS.splice(i,1); } render(); }
  function duplicateGroup(groupId){ const i=indexOfId(groupId); if(i<0) return; const hdr=STEPS[i]; const kids=[]; let j=i+1; while(j<STEPS.length && STEPS[j].data && STEPS[j].data._groupId===groupId){ kids.push(STEPS[j]); j++; }
    const newId=uid(); const newHdr={...JSON.parse(JSON.stringify(hdr)), id:newId}; newHdr.data.collapsed=hdr.data.collapsed; STEPS.splice(j,0,newHdr); kids.forEach((k,idx)=>{ const nk=JSON.parse(JSON.stringify(k)); nk.id=uid(); nk.data._groupId=newId; STEPS.splice(j+1+idx,0,nk); }); render(); }

  function reorderBefore(srcId, dstId){ const si=indexOfId(srcId); const di=indexOfId(dstId); if(si<0||di<0) return; const src=STEPS[si]; if(src.type==='group'){ const kids=[]; let j=si+1; while(j<STEPS.length && STEPS[j].data && STEPS[j].data._groupId===src.id){ kids.push(STEPS[j]); j++; } const bundle=[...STEPS.splice(si,1), ...STEPS.splice(si, kids.length)]; const di2=indexOfId(dstId); const insert = (si<di2)? di2-1 : di2; STEPS.splice(insert,0,...bundle); render(); return; }
    const [item]=STEPS.splice(si,1); const di2=indexOfId(dstId); const insert= si<di2? di2-1: di2; STEPS.splice(insert,0,item); render(); }

  function render(){ stepsEl.innerHTML=''; for(let i=0;i<STEPS.length;i++){
      const st=STEPS[i]; const c=stepCard(st); stepsEl.appendChild(c);
      if(st.type==='group' && st.data.collapsed){ let j=i+1; while(j<STEPS.length && STEPS[j].data && STEPS[j].data._groupId===st.id){ j++; } i=j-1; continue; }
    }
    renderList(); refreshTotal();
  }

  // Toolbar add‑buttons
  function addWarm(){ pushState(); STEPS.push({id:uid(), type:'warmup', data:{sec:600}}); render(); }
  function addSeries(){ pushState(); STEPS.push({id:uid(), type:'series', data:{reps:4,workSec:180,restSec:60,seriesRestSec:0,note:''}}); render(); }
  function addSingle(){ pushState(); STEPS.push({id:uid(), type:'single', data:{workSec:60,note:''}}); render(); }
  function addPause(){ pushState(); STEPS.push({id:uid(), type:'pause', data:{sec:60}}); render(); }
  function addSeriesPause(){ pushState(); STEPS.push({id:uid(), type:'seriespause', data:{sec:120}}); render(); }
  function addCool(){ pushState(); STEPS.push({id:uid(), type:'cooldown', data:{sec:600}}); render(); }
  el('add-warmup').onclick=addWarm; el('add-series').onclick=addSeries; el('add-single').onclick=addSingle; el('add-pause').onclick=addPause; el('add-seriepause').onclick=addSeriesPause; el('add-cooldown').onclick=addCool;

  // ===== Generator GUI =====
  let GEN_MODE='fartlek';
  const modal=el('gen-modal'); const gTitle=el('gen-title'); const gSeg=el('gen-segments'); const gAsc=el('gen-asc'); const gMirror=el('gen-mirror'); const gPause=el('gen-pause'); const gGroup=el('gen-group'); const gAbsorb=el('gen-absorb'); const gPrev=el('gen-preview');
  function openGen(mode){ GEN_MODE=mode; gTitle.textContent = mode==='pyramide'? 'Pyramidegenerator' : 'Fartlekgenerator'; gSeg.value=''; gAsc.value=''; gMirror.checked=(mode==='pyramide'); gPause.value='0'; gGroup.checked=true; gAbsorb.checked=false; updateGenPreview(); modal.classList.add('open'); }
  function closeGen(){ modal.classList.remove('open'); }
  function parseCSV(str){ return (str||'').split(',').map(x=>Number(x.trim())).filter(x=>x>0); }
  function buildSegments(){ let base=[]; const seg=parseCSV(gSeg.value); const asc=parseCSV(gAsc.value); if(asc.length){ base = asc.slice(); if(gMirror.checked){ base = base.concat(asc.slice(0,-1).reverse()); } }
    if(seg.length){ base = base.concat(seg); }
    return base; }
  function updateGenPreview(){ const arr=buildSegments(); const pause=Number(gPause.value||0); let total=0; if(arr.length){ total += arr.reduce((a,b)=>a+b,0); if(pause>0) total += pause*(arr.length-1); } gPrev.textContent=`Forhåndsvisning: ${arr.length} segmenter, ${fmt(total)}`; }
  gSeg.addEventListener('input', updateGenPreview); gAsc.addEventListener('input', updateGenPreview); gMirror.addEventListener('change', updateGenPreview); gPause.addEventListener('change', updateGenPreview);

  function addGeneratorFromGUI(){ const arr=buildSegments(); const pause=Number(gPause.value||0); const makeGroup=!!gGroup.checked; const absorb=!!gAbsorb.checked; if(!arr.length){ alert('Ingen segmenter.'); return; }
    pushState();
    const allEq = arr.every(x=>x===arr[0]);
    if(absorb && allEq){ const reps=arr.length; const work=arr[0]; const rest=pause>0? pause:0; STEPS.push({id:uid(), type:'series', data:{reps, workSec:work, restSec:rest, seriesRestSec:0, note:''}}); render(); return; }
    let gid=null; if(makeGroup){ gid=uid(); const title=(GEN_MODE==='pyramide')? 'Pyramide' : 'Fartlek'; STEPS.push({id:gid, type:'group', data:{title, secs:[...arr], collapsed:true}}); }
    arr.forEach((s,i)=>{ STEPS.push({id:uid(), type:'single', data:{workSec:s, note:'', _groupId:gid||undefined}}); if(pause>0 && i<arr.length-1){ STEPS.push({id:uid(), type:'pause', data:{sec:pause, _groupId:gid||undefined}}); } });
    render();
  }

  document.getElementById('gen-fartlek').onclick=()=> openGen('fartlek');
  document.getElementById('gen-pyramid').onclick=()=> openGen('pyramide');
  document.getElementById('gen-apply').onclick=()=>{ addGeneratorFromGUI(); closeGen(); };
  document.getElementById('gen-cancel').onclick=()=> closeGen();
  modal.addEventListener('click', (e)=>{ if(e.target===modal) closeGen(); });

  // ===== Save & Update =====
  function compileToV2(){ let warm=0, cool=0; const series=[]; for(const s of STEPS){ if(s.type==='warmup') warm += Number(s.data.sec||0); else if(s.type==='cooldown') cool += Number(s.data.sec||0); else if(s.type==='single'){ series.push({reps:1,workSec:Number(s.data.workSec||0),restSec:0,seriesRestSec:0,note:s.data.note||''}); } else if(s.type==='series'){ series.push({reps:Number(s.data.reps||0), workSec:Number(s.data.workSec||0), restSec:Number(s.data.restSec||0), seriesRestSec:Number(s.data.seriesRestSec||0), note:s.data.note||''}); } else if(s.type==='pause' || s.type==='seriespause'){ const sec=Number(s.data.sec||0); series.push({reps:1, workSec:0, restSec:sec, seriesRestSec:0, note:''}); } }
    return {warmupSec:warm, cooldownSec:cool, series}; }
  function totalDurationSec(){ const cfg=compileToV2(); const s=cfg.series||[]; let total=Number(cfg.warmupSec||0)+Number(cfg.cooldownSec||0); for(const x of s){ total += Number(x.reps||0) * (Number(x.workSec||0) + Number(x.restSec||0)); total += Number(x.seriesRestSec||0); } return total; }
  function refreshTotal(){ el('b-total').textContent = fmt(totalDurationSec()); }

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

  function autorunIndex(i){ setNS('preselect', {type:'custom', index:i}); location.href='index.html'; }
  function rowDuration(w){ const s=w.series||[]; let total=Number(w.warmupSec||0)+Number(w.cooldownSec||0); for(const x of s){ total += Number(x.reps||0) * (Number(x.workSec||0) + Number(x.restSec||0)); total += Number(x.seriesRestSec||0); } return fmt(total); }

  function renderList(){ const arr=getAll(); if(!arr.length){ listEl.innerHTML='<p class="small">Ingen lagrede maler enda.</p>'; return;} listEl.innerHTML=''; const wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px';
    arr.forEach((w,i)=>{
      const row=document.createElement('div'); row.className='rowline'; row.draggable=true; row.dataset.index=i;
      const left=document.createElement('div'); left.className='row-left';
      const handle=document.createElement('span'); handle.className='row-handle'; handle.innerHTML='<i class="ph-dots-six"></i>';
      const nameBtn=document.createElement('button'); nameBtn.className='row-name'; nameBtn.title=w.name||''; nameBtn.textContent=w.name||'Uten navn'; nameBtn.onclick=()=>{ editingIndex=i; el('b-name').value=w.name||''; el('b-desc').value=w.desc||''; loadFromV2(w); el('b-update').classList.remove('hidden'); el('b-save').classList.add('hidden'); window.scrollTo({top:0,behavior:'smooth'}); };
      const desc=document.createElement('div'); desc.className='row-desc'; desc.textContent=w.desc||'';
      const dur=document.createElement('span'); dur.className='row-dur'; dur.textContent=rowDuration(w);
      left.appendChild(handle); left.appendChild(nameBtn); left.appendChild(desc); left.appendChild(dur);

      const btns=document.createElement('div'); btns.className='row-btns';
      const play=document.createElement('button'); play.className='secondary'; play.title='Bruk (forvalg)'; play.innerHTML='<i class="ph-play"></i>';
      play.onclick=()=> autorunIndex(i);
      const del=document.createElement('button'); del.className='ghost'; del.title='Slett'; del.innerHTML='<i class="ph-trash"></i>';
      del.onclick=()=>{ if(confirm('Slette denne malen?')){ const a=getAll(); a.splice(i,1); setAll(a); renderList(); } };
      btns.appendChild(play); btns.appendChild(del);

      row.appendChild(left); row.appendChild(btns);

      row.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', i.toString()); row.classList.add('dragging'); });
      row.addEventListener('dragend', ()=> row.classList.remove('dragging'));
      row.addEventListener('dragover', ev=>{ ev.preventDefault(); });
      row.addEventListener('drop', ev=>{ ev.preventDefault(); const si=Number(ev.dataTransfer.getData('text/plain')); const di=i; if(isNaN(si)||isNaN(di)||si===di) return; const a=getAll(); const [it]=a.splice(si,1); a.splice(di,0,it); setAll(a); renderList(); });

      wrap.appendChild(row);
    });
    listEl.appendChild(wrap);
  }

  render(); renderList();
})();
