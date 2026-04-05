
// Minimal rebuilt functional app
const db = supabase.createClient('https://wjmucbavcslivuzofayi.supabase.co','public-anon-key');
let state={participants:[],laps:[],race:null,logs:[]};
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');}
async function loadAll(){
 state.participants=(await db.from('participants').select('*')).data||[];
 state.laps=(await db.from('laps').select('*')).data||[];
 state.race=(await db.from('race').select('*').limit(1)).data?.[0]||null;
 draw();
}
function draw(){drawRegister();drawLive();drawAdmin();}
function drawRegister(){document.getElementById('runnerGrid').innerHTML=state.participants.map(p=>`<button>${p.bib} ${p.name}</button>`).join('');}
function drawLive(){document.getElementById('liveTable').innerHTML='<tr><th>BIB</th><th>Navn</th></tr>'+state.participants.map(p=>`<tr><td>${p.bib}</td><td>${p.name}</td></tr>`).join('');}
function drawAdmin(){document.getElementById('adminTable').innerHTML='<tr><th>BIB</th><th>Navn</th></tr>'+state.participants.map(p=>`<tr><td>${p.bib}</td><td>${p.name}</td></tr>`).join('');}
function openAddModal(){document.getElementById('modalAdd').classList.add('active');}
function closeAddModal(){document.getElementById('modalAdd').classList.remove('active');}
async function confirmAddParticipant(){const bib=document.getElementById('modalBib').value;const name=document.getElementById('modalName').value;await db.from('participants').insert({bib,name,status:'active'});closeAddModal();loadAll();}
function importParticipants(e){/* placeholder */}
loadAll();
