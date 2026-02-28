
(function(){
  const KEY='custom_workouts_v2';
  const el=id=>document.getElementById(id);
  const stepsEl=el('steps'), listEl=el('b-list');
  let editingIndex=null;

  // Step model: {id,type:'warmup'|'cooldown'|'single'|'series'|'block', data:{...}, children:[steps]}
  let STEPS=[];

  // --- UI Helpers ---
  function uid(){ return 's'+Math.random().toString(36).slice(2,9); }
  function minutesToSec(m){ return Math.max(0, Math.round(Number(m||0)*60)); }

  function stepCard(step){ const card=document.createElement('div'); card.className='step'; card.draggable=true; card.dataset.id=step.id; card.innerHTML = renderStepInner(step); wireStepCard(card, step); return card; }

  function renderStepInner(step){ const t=step.type; const h=`<div class="step-header"><span class="handle"><i class="ph-dots-six"></i></span><span class="step-title">${labelFor(step)}</span></div>`;
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
    if(t==='block'){
      const children = `<div class="block-children">${(step.children||[]).map(c=> renderStepInnerChild(c)).join('')}</div>`;
      return h+`<div class="step-actions"><button class="ghost act-dup"><i class="ph-copy"></i> Dupliser</button><button class="ghost act-del"><i class="ph-trash"></i> Slett</button></div>`+children;
    }
    return h;
  }

  function renderStepInnerChild(child){ return `<div class="step" draggable="true" data-id="${child.id}">${renderStepInner(child)}</div>`; }

  function labelFor(step){ return ({warmup:'Oppvarming', cooldown:'Nedjogg', single:'Enkelt‑drag', series:'Serie', block:'Blokk'})[step.type]||step.type; }

  function wireStepCard(card, step){
    // Inputs
    card.querySelectorAll('input,textarea').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        if(step.type==='warmup'||step.type==='cooldown'){ step.data.sec = minutesToSec(card.querySelector('.f-min').value); }
        if(step.type==='single'){ step.data.workSec = Number(card.querySelector('.f-work').value||0); step.data.note = card.querySelector('.f-note').value||''; }
        if(step.type==='series'){ step.data.reps=Number(card.querySelector('.f-reps').value||0); step.data.workSec=Number(card.querySelector('.f-work').value||0); step.data.restSec=Number(card.querySelector('.f-rest').value||0); step.data.seriesRestSec=Number(card.querySelector('.f-srest').value||0); step.data.note = card.querySelector('.f-note').value||''; }
      });
    });
    // Actions
    const dup=card.querySelector('.act-dup'); if(dup) dup.onclick=()=>{ const clone=JSON.parse(JSON.stringify(step)); clone.id=uid(); insertAfterStep(step.id, clone); };
    const del=card.querySelector('.act-del'); if(del) del.onclick=()=>{ removeStep(step.id); };
    // Drag handlers
    card.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/plain', step.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
    card.addEventListener('dragover', ev=>{ ev.preventDefault(); showDropHint(card); });
    card.addEventListener('dragleave', ()=> hideDropHint(card));
    card.addEventListener('drop', ev=>{ ev.preventDefault(); const srcId=ev.dataTransfer.getData('text/plain'); if(!srcId||srcId===step.id) return; handleDrop(srcId, step.id); hideDropHint(card); });
  }

  function showDropHint(card){ if(!card.querySelector('.drop-hint')){ const dh=document.createElement('div'); dh.className='drop-hint'; card.appendChild(dh);} }
  function hideDropHint(card){ const dh=card.querySelector('.drop-hint'); if(dh) dh.remove(); }

  function insertAfterStep(targetId, newStep){ const idx=findIndexById(STEPS, targetId); if(idx>=0){ STEPS.splice(idx+1,0,newStep); render(); }}
  function removeStep(id){ function removeIn(arr){ const i=arr.findIndex(x=>x.id===id); if(i>=0){ arr.splice(i,1); return true; } for(const s of arr){ if(s.type==='block' && s.children){ if(removeIn(s.children)) return true; } } return false; } removeIn(STEPS); render(); }
  function findIndexById(arr, id){ return arr.findIndex(x=>x.id===id); }
  function findStepById(arr, id){ for(const s of arr){ if(s.id===id) return {parent:arr, step:s}; if(s.type==='block' && s.children){ const r=findStepById(s.children,id); if(r) return r; } } return null; }

  function handleDrop(srcId, dstId){ const src=findStepById(STEPS, srcId); const dst=findStepById(STEPS, dstId); if(!src||!dst) return;
    // Case 1: single on single -> make block
    if(src.step.type==='single' && dst.step.type==='single'){
      // remove src from original
      const srcIdx=src.parent.indexOf(src.step); src.parent.splice(srcIdx,1);
      // replace dst with new block containing [dst, src]
      const dstIdx=dst.parent.indexOf(dst.step);
      const block={ id:uid(), type:'block', data:{}, children:[ dst.step, src.step ] };
      dst.parent.splice(dstIdx,1, block);
      render(); return;
    }
    // Case 2: drop on block -> append as child
    if(dst.step.type==='block'){
      const srcIdx=src.parent.indexOf(src.step); src.parent.splice(srcIdx,1);
      dst.step.children = dst.step.children || [];
      dst.step.children.push(src.step);
      render(); return;
    }
    // Case 3: reorder at same level (insert before dst)
    const srcIdx=src.parent.indexOf(src.step); src.parent.splice(srcIdx,1);
    const dstIdx=dst.parent.indexOf(dst.step);
    dst.parent.splice(dstIdx,0,src.step);
    render();
  }

  function render(){ stepsEl.innerHTML=''; for(const st of STEPS){ const c=stepCard(st); stepsEl.appendChild(c); if(st.type==='block' && st.children){ // wire nested cards
        const container=c.querySelector('.block-children'); container.innerHTML=''; st.children.forEach(ch=>{ const chCard=stepCard(ch); container.appendChild(chCard); }); }
    }
    renderList();
  }

  // --- Toolbar actions ---
  function addWarm(){ STEPS.push({id:uid(), type:'warmup', data:{sec:600}}); render(); }
  function addSeries(){ STEPS.push({id:uid(), type:'series', data:{reps:4,workSec:180,restSec:60,seriesRestSec:0,note:''}}); render(); }
  function addSingle(){ STEPS.push({id:uid(), type:'single', data:{workSec:60,note:''}}); render(); }
  function addBlock(){ STEPS.push({id:uid(), type:'block', data:{}, children:[]}); render(); }
  function addCool(){ STEPS.push({id:uid(), type:'cooldown', data:{sec:600}}); render(); }
  el('add-warmup').onclick=addWarm; el('add-series').onclick=addSeries; el('add-single').onclick=addSingle; el('add-block').onclick=addBlock; el('add-cooldown').onclick=addCool;

  // --- Save & Update ---
  function compileToV2(){ let warm=0, cool=0; const series=[]; function walk(arr){ for(const s of arr){ if(s.type==='warmup') warm += Number(s.data.sec||0); else if(s.type==='cooldown') cool += Number(s.data.sec||0); else if(s.type==='single') series.push({reps:1,workSec:Number(s.data.workSec||0),restSec:0,seriesRestSec:0,note:s.data.note||''}); else if(s.type==='series') series.push({reps:Number(s.data.reps||0), workSec:Number(s.data.workSec||0), restSec:Number(s.data.restSec||0), seriesRestSec:Number(s.data.seriesRestSec||0), note:s.data.note||''}); else if(s.type==='block') walk(s.children||[]); } }
    walk(STEPS); return {warmupSec:warm, cooldownSec:cool, series}; }

  function loadFromV2(cfg){ STEPS=[]; if((cfg.warmupSec||0)>0) STEPS.push({id:uid(), type:'warmup', data:{sec:Number(cfg.warmupSec||0)}}); (cfg.series||[]).forEach(s=>{ if(Number(s.reps||0)===1 && Number(s.restSec||0)===0 && Number(s.seriesRestSec||0)===0){ STEPS.push({id:uid(), type:'single', data:{workSec:Number(s.workSec||0), note:s.note||''}}); } else { STEPS.push({id:uid(), type:'series', data:{reps:Number(s.reps||0), workSec:Number(s.workSec||0), restSec:Number(s.restSec||0), seriesRestSec:Number(s.seriesRestSec||0), note:s.note||''}}); } }); if((cfg.cooldownSec||0)>0) STEPS.push({id:uid(), type:'cooldown', data:{sec:Number(cfg.cooldownSec||0)}}); render(); }

  function getAll(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
  function setAll(arr){ localStorage.setItem(KEY, JSON.stringify(arr)); }

  el('b-save').onclick=()=>{ const arr=getAll(); const compiled=compileToV2(); const obj={ name: el('b-name').value||'Custom', desc: el('b-desc').value||'', warmupSec:compiled.warmupSec, cooldownSec:compiled.cooldownSec, series:compiled.series }; arr.push(obj); setAll(arr); alert('Lagret ny mal.'); renderList(); };
  el('b-update').onclick=()=>{ if(editingIndex==null){ alert('Ingen mal valgt for oppdatering.'); return; } const arr=getAll(); const compiled=compileToV2(); arr[editingIndex]={ ...arr[editingIndex], name:el('b-name').value||arr[editingIndex].name, desc: el('b-desc').value||arr[editingIndex].desc, warmupSec:compiled.warmupSec, cooldownSec:compiled.cooldownSec, series:compiled.series }; setAll(arr); alert('Oppdatert.'); renderList(); };
  el('b-clear').onclick=()=>{ editingIndex=null; el('b-update').classList.add('hidden'); el('b-save').classList.remove('hidden'); el('b-name').value=''; el('b-desc').value=''; STEPS=[]; render(); };

  function renderList(){ const arr=getAll(); if(!arr.length){ listEl.innerHTML='<p class="small">Ingen lagrede maler enda.</p>'; return;} listEl.innerHTML=''; const wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px'; arr.forEach((w,i)=>{ const row=document.createElement('div'); row.className='menu-item'; row.style.display='flex'; row.style.alignItems='center'; row.style.justifyContent='space-between'; const left=document.createElement('a'); left.href='javascript:void(0)'; left.textContent=`${w.name||'Uten navn'}`; left.onclick=()=>{ // load into editor (edit mode)
      editingIndex=i; el('b-name').value=w.name||''; el('b-desc').value=w.desc||''; loadFromV2(w); el('b-update').classList.remove('hidden'); el('b-save').classList.add('hidden'); window.scrollTo({top:0,behavior:'smooth'}); };
      const btns=document.createElement('div'); btns.style.display='flex'; btns.style.gap='6px';
      const use=document.createElement('a'); use.className='secondary'; use.href='index.html'; use.textContent='Bruk';
      const del=document.createElement('button'); del.className='ghost'; del.textContent='Slett'; del.onclick=()=>{ if(confirm('Slette denne malen?')){ const a=getAll(); a.splice(i,1); setAll(a); renderList(); } };
      btns.appendChild(use); btns.appendChild(del);
      row.appendChild(left); row.appendChild(btns); wrap.appendChild(row);
    }); listEl.appendChild(wrap); }

  // init
  render(); renderList();
})();
