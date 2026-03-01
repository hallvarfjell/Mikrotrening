
(function(){
  const el=id=>document.getElementById(id);
  const KEY='custom_workouts_v2';
  function getNS(k,d){ try{ return JSON.parse(localStorage.getItem('u:'+(localStorage.getItem('active_user')||'default')+':'+k))||d; }catch(e){ return d; } }
  function setNS(k,v){ localStorage.setItem('u:'+(localStorage.getItem('active_user')||'default')+':'+k, JSON.stringify(v)); }
  function uid(){ return 's'+Math.random().toString(36).slice(2,9); }
  function fmt(s){ s=Math.max(0,Math.round(s)); const m=Math.floor(s/60), ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
  let STEPS=[]; const stepsEl=el('steps');
  function render(){ stepsEl.innerHTML=''; STEPS.forEach(st=>{ const d=document.createElement('div'); d.className='menu-item'; d.textContent=JSON.stringify(st.data); stepsEl.appendChild(d); }); el('b-total').textContent=fmt(total()); }
  function total(){ const cfg=compile(); const s=cfg.series||[]; let t=(cfg.warmupSec||0)+(cfg.cooldownSec||0); for(const x of s){ t+= (x.reps||0)*((x.workSec||0)+(x.restSec||0)); t+= (x.seriesRestSec||0);} return t; }
  function compile(){ let warm=0,cool=0; const series=[]; for(const s of STEPS){ if(s.type==='warmup') warm+=s.data.sec||0; else if(s.type==='cooldown') cool+=s.data.sec||0; else if(s.type==='single') series.push({reps:1,workSec:s.data.workSec||0,restSec:0,seriesRestSec:0,note:s.data.note||''}); else if(s.type==='series') series.push({reps:s.data.reps||0,workSec:s.data.workSec||0,restSec:s.data.restSec||0,seriesRestSec:s.data.seriesRestSec||0,note:s.data.note||''}); else if(s.type==='pause'||s.type==='seriespause') series.push({reps:1,workSec:0,restSec:s.data.sec||0,seriesRestSec:0,note:''}); }
    return {warmupSec:warm,cooldownSec:cool,series}; }
  function add(t,data){ STEPS.push({id:uid(),type:t,data}); render(); }
  el('add-warmup').onclick=()=>add('warmup',{sec:600});
  el('add-series').onclick=()=>add('series',{reps:4,workSec:180,restSec:60,seriesRestSec:0,note:''});
  el('add-single').onclick=()=>add('single',{workSec:60,note:''});
  el('add-pause').onclick=()=>add('pause',{sec:60});
  el('add-seriepause').onclick=()=>add('seriespause',{sec:120});
  el('add-cooldown').onclick=()=>add('cooldown',{sec:600});
  document.getElementById('gen-fartlek').onclick=()=>document.getElementById('gen-modal').classList.add('open');
  document.getElementById('gen-pyramid').onclick=()=>document.getElementById('gen-modal').classList.add('open');
  document.getElementById('gen-cancel').onclick=()=>document.getElementById('gen-modal').classList.remove('open');
  document.getElementById('gen-apply').onclick=()=>{ const txt=document.getElementById('gen-segments').value||''; const segs=txt.split(',').map(x=>Number(x.trim())).filter(x=>x>0); if(!segs.length){ alert('Ingen segmenter.'); return; } const gid=uid(); STEPS.push({id:gid,type:'group',data:{title:'Fartlek/Pyramide',secs:segs,collapsed:true}}); segs.forEach((s,i)=>{ STEPS.push({id:uid(),type:'single',data:{workSec:s,note:'',_groupId:gid}}); if(i<segs.length-1){ STEPS.push({id:uid(),type:'pause',data:{sec:0,_groupId:gid}}); }}); document.getElementById('gen-modal').classList.remove('open'); render(); };
  function saveNew(){ const arr=getNS(KEY,[]); const c=compile(); arr.push({name:el('b-name').value||'Økt',desc:el('b-desc').value||'',warmupSec:c.warmupSec,cooldownSec:c.cooldownSec,series:c.series}); setNS(KEY,arr); alert('Lagret ny mal.'); list(); }
  function list(){ const wrap=document.getElementById('b-list'); wrap.innerHTML=''; const arr=getNS(KEY,[]); if(!arr.length){ wrap.innerHTML='<p class="small">Ingen lagrede maler enda.</p>'; return;} arr.forEach((w,i)=>{ const row=document.createElement('div'); row.className='rowline'; const btn=document.createElement('button'); btn.className='row-name'; btn.textContent=w.name||'Uten navn'; const play=document.createElement('button'); play.className='secondary'; play.innerHTML='<i class="ph-play"></i>'; play.onclick=()=>{ localStorage.setItem('u:'+(localStorage.getItem('active_user')||'default')+':preselect', JSON.stringify({type:'custom',index:i})); location.href='index.html'; }; row.appendChild(btn); const dur=document.createElement('span'); dur.className='row-dur'; let t=(w.warmupSec||0)+(w.cooldownSec||0); (w.series||[]).forEach(x=>{ t+= (x.reps||0)*((x.workSec||0)+(x.restSec||0)); t+= (x.seriesRestSec||0); }); dur.textContent=fmt(t); row.appendChild(dur); row.appendChild(play); wrap.appendChild(row); }); }
  document.getElementById('b-save').onclick=saveNew; document.getElementById('b-clear').onclick=()=>{ STEPS=[]; render(); };
  render(); list();
})();
