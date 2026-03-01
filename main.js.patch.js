
(function(){
  function el(id){return document.getElementById(id)}
  function on(sel,ev,fn){ document.querySelectorAll(sel).forEach(x=> x.addEventListener(ev,fn)); }
  document.addEventListener('DOMContentLoaded', ()=>{
    // quick grade buttons
    on('.grade-btn','click', (e)=>{ const v=Number(e.currentTarget.dataset.grade||0); const inp=el('manual-grade'); if(inp){ inp.value=String(v.toFixed(1)); const evt=new Event('change'); inp.dispatchEvent(evt); } });
  });
})();
