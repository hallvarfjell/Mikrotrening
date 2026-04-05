/* -----------------------------------------------------------
   ✅ SUPABASE CLIENT
----------------------------------------------------------- */
const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus"
);

/* -----------------------------------------------------------
   ✅ GLOBAL STATE
----------------------------------------------------------- */
let state = {
  race: null,
  participants: [],
  laps: []
};

/* -----------------------------------------------------------
   ✅ PAGE SWITCH
----------------------------------------------------------- */
function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* -----------------------------------------------------------
   ✅ INITIAL LOAD
----------------------------------------------------------- */
async function loadAll() {

  const r = await db.from("race").select("*").limit(1);
  state.race = r.data?.[0] || null;

  const p = await db.from("participants").select("*").order("bib");
  state.participants = p.data || [];

  const l = await db.from("laps").select("*");
  state.laps = l.data || [];

  drawRegister();
  drawAdmin();
}
loadAll();

/* -----------------------------------------------------------
   ✅ ADMIN RENDERING
----------------------------------------------------------- */
function drawAdmin() {
  // countdown
  const cd = document.getElementById("adminCountdown");
  if (!state.race?.start_time) {
    cd.innerText = "";
  } else {
    const diff = (new Date(state.race.start_time) - new Date())/1000;
    cd.innerText = diff > 0 ? "Starter om " + fmt(diff) : "Løpet er i gang";
  }

  // table
  const t = document.getElementById("adminTable");
  let html = "<tr><th>BIB</th><th>Navn</th></tr>";
  state.participants.forEach(p=>{
    html += `<tr><td>${p.bib}</td><td>${p.name}</td></tr>`;
  });
  t.innerHTML = html;
}

/* -----------------------------------------------------------
   ✅ ADMIN ACTIONS
----------------------------------------------------------- */
async function startRace() {
  const type = document.getElementById("raceType").value;
  const start = new Date(document.getElementById("startTime").value).toISOString();
  const interval = parseInt(document.getElementById("interval").value)*60;
  const dist = parseFloat(document.getElementById("distance").value);

  await db.from("race").upsert({
    id:1, type,
    start_time:start,
    interval_seconds:interval,
    lap_distance_km:dist,
    running:true
  });

  loadAll();
}

async function stopRace() {
  await db.from("race").update({running:false}).eq("id",1);
  loadAll();
}

async function resetRace() {
  if (!confirm("Slette alt?")) return;

  await db.from("laps").delete().neq("id",0);
  await db.from("participants").delete().neq("id",0);
  await db.from("race").delete().neq("id",0);

  await db.from("race").insert({
    id:1,
    type:"backyard",
    start_time:new Date().toISOString(),
    interval_seconds:3600,
    lap_distance_km:6.7,
    running:false
  });

  loadAll();
}

/* -----------------------------------------------------------
   ✅ REGISTRERINGSSIDE
----------------------------------------------------------- */
function drawRegister() {
  if (!state.race) return;

  const r = currentRound();
  const remain = timeToNext();
  const cutoff = remain <= 0;
  const beforeStart = new Date() < new Date(state.race.start_time);

  document.getElementById("regRoundHeader").innerText =
    beforeStart ? "Start om" : "Runde " + r;

  document.getElementById("regCountdown").innerText = fmt(remain);

  let list = state.participants.map(p=>{
    const lap = state.laps.find(l=>l.participant_id===p.id && l.lap_number===r);

    let ui = "white";
    if (beforeStart) ui = "white";
    else if (p.status==="dnf") ui="gray";
    else if (lap) ui="green";
    else if (cutoff) ui="red";

    return {...p, uiState:ui};
  });

  // sort
  const order = {green:1, red:2, white:3, gray:4};
  list.sort((a,b)=> order[a.uiState] - order[b.uiState]);

  const grid = document.getElementById("runnerGrid");
  grid.innerHTML = "";

  list.forEach(p=>{
    const btn = document.createElement("button");
    btn.className="runner "+p.uiState;

    const lap = state.laps.find(l=>l.participant_id===p.id && l.lap_number===r);
    btn.textContent = p.bib+" "+p.name+(lap?" "+fmt(lap.lap_seconds):"");

    btn.onclick = ()=> pressRunner(p, p.uiState);

    grid.appendChild(btn);
  });
}

/* -----------------------------------------------------------
   ✅ TRYKK PÅ LØPER-KNAPP
----------------------------------------------------------- */
async function pressRunner(p, ui) {
  const r = currentRound();
  const cutoff = timeToNext() <= 0;

  const lap = state.laps.find(
    l=>l.participant_id===p.id && l.lap_number===r
  );

  // remove green
  if (lap) {
    if (!confirm("Slette registrering?")) return;
    await db.from("laps").delete().eq("id",lap.id);
    return;
  }

  // red → DNF
  if (ui==="red" && cutoff) {
    await db.from("participants").update({status:"dnf"}).eq("id",p.id);
    return;
  }

  // register
  const sec = Math.floor((new Date() - new Date(state.race.start_time))/1000);

  // optimistic
  state.laps.push({
    id:"local-"+Math.random(),
    race_id:state.race.id,
    participant_id:p.id,
    lap_number:r,
    lap_seconds:sec
  });
  drawRegister();

  await db.from("laps").insert({
    race_id:state.race.id,
    participant_id:p.id,
    lap_number:r,
    lap_seconds:sec
  });
}

/* -----------------------------------------------------------
   ✅ IMPORT / LEGGE TIL DELTAKER
----------------------------------------------------------- */
function openAddModal(){
  document.getElementById("modalAdd").classList.add("active");
}
function closeAddModal(){
  document.getElementById("modalAdd").classList.remove("active");
}

async function confirmAddParticipant(){
  const bib = document.getElementById("modalBib").value.trim();
  const name = document.getElementById("modalName").value.trim();
  await db.from("participants").insert({bib,name,status:"active"});
  closeAddModal();
  loadAll();
}

function importParticipants(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();

  reader.onload = ev => {
    const wb = XLSX.read(new Uint8Array(ev.target.result), {type:"array"});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    rows.forEach(async r=>{
      const bib  = r.BIB  || r.bib;
      const name = r.Navn || r.name;
      if (bib && name)
        await db.from("participants").insert({bib,name,status:"active"});
    });
    loadAll();
  };

  reader.readAsArrayBuffer(file);
}

/* -----------------------------------------------------------
   ✅ RUNDELOGIKK
----------------------------------------------------------- */
function currentRound(){
  if (!state.race?.start_time) return 1;
  const start = new Date(state.race.start_time);
  if (new Date() < start) return 1;
  const sec = (new Date() - start) / 1000;
  return Math.floor(sec / state.race.interval_seconds) + 1;
}

function timeToNext(){
  if (!state.race?.start_time) return 0;
  const start = new Date(state.race.start_time);
  if (new Date() < start) return (start-new Date())/1000;
  const sec = (new Date() - start) / 1000;
  return state.race.interval_seconds - (sec % state.race.interval_seconds);
}

function fmt(sec){
  sec = Math.max(0,Math.floor(sec));
  return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");
}

/* -----------------------------------------------------------
   ✅ REALTIME
----------------------------------------------------------- */
db.channel("participants_changes")
  .on("postgres_changes",{schema:"public",table:"participants"},payload=>{
    loadAll();
  }).subscribe();

db.channel("laps_changes")
  .on("postgres_changes",{schema:"public",table:"laps"},payload=>{
    loadAll();
  }).subscribe();

/* -----------------------------------------------------------
   ✅ AUTO UPDATE
----------------------------------------------------------- */
setInterval(drawRegister, 1000);
