
const SUPABASE_URL = "https://wjmucbavcslivuzofayi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let state = {
  runners: [],
  startTime: null,
  lapDistance: 6.7,
  lapTime: 3600,
  reduction: 0
};

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function renderRegister(){
  const el = document.getElementById("register");
  el.innerHTML = "";
  state.runners.forEach(r => {
    const div = document.createElement("div");
    div.className = "runner " + (r.status||"");
    div.innerText = r.bib + " " + r.name + (r.lastTime ? " - " + r.lastTime : "");
    div.onclick = () => toggleRunner(r);
    el.appendChild(div);
  });
}

function toggleRunner(r){
  if(r.status === "green"){
    if(confirm("Slette oppføring?")){
      r.status="";
      r.lastTime=null;
    }
  } else {
    r.status="green";
    r.lastTime = new Date().toLocaleTimeString();
  }
  renderRegister();
}

function initAdmin(){
  const el = document.getElementById("admin");
  el.innerHTML = `
    <h3>Oppsett</h3>
    Rundelengde <input id="dist" type="number" value="6.7"><br>
    Rundetid (sek) <input id="time" type="number" value="3600"><br>
    Reduksjon per runde (sek) <input id="red" type="number" value="0"><br>
    <button onclick="startRace()">Start</button>
    <h3>Deltakere</h3>
    <textarea id="runners" placeholder="1;Ola\n2;Kari"></textarea>
    <button onclick="loadRunners()">Last inn</button>
  `;
}

function loadRunners(){
  const txt = document.getElementById("runners").value;
  state.runners = txt.split("\n").map(l=>{
    const [bib,name] = l.split(";");
    return {bib,name,status:""};
  });
  renderRegister();
}

function startRace(){
  state.startTime = Date.now();
  alert("Startet");
}

function init(){
  showScreen('admin');
  initAdmin();
}
init();
