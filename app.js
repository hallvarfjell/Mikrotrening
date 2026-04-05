// ✅ Supabase Client
const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus" // din anon key
);

// ✅ STATE
let state = {
  race: null,
  participants: []
};

// ✅ PAGE SWITCH
function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ✅ INITIAL LOAD
async function loadAdmin(){
  const r = await db.from("race").select("*").limit(1);
  state.race = r.data?.[0] || null;

  const p = await db.from("participants").select("*").order("bib");
  state.participants = p.data || [];

  drawAdmin();
}
loadAdmin();

// ✅ ADMIN DRAW
function drawAdmin(){
  drawCountdown();
  drawAdminTable();
}

function drawCountdown(){
  if (!state.race?.start_time) {
    document.getElementById("adminCountdown").innerText = "";
    return;
  }

  const start = new Date(state.race.start_time);
  const diff = (start - new Date())/1000;

  document.getElementById("adminCountdown").innerText =
    diff > 0 ? "Starter om: " + fmt(diff) : "Løpet er i gang!";
}

function drawAdminTable(){
  const t = document.getElementById("adminTable");

  let html = "<tr><th>BIB</th><th>Navn</th></tr>";
  state.participants.forEach(p=>{
    html += `<tr><td>${p.bib}</td><td>${p.name}</td></tr>`;
  });

  t.innerHTML = html;
}

// ✅ START RACE
async function startRace(){
  const type = document.getElementById("raceType").value;
  const startLocal = document.getElementById("startTime").value;
  const interval = parseInt(document.getElementById("interval").value)*60;
  const dist = parseFloat(document.getElementById("distance").value);

  const startISO = new Date(startLocal).toISOString();

  await db.from("race").upsert({
    id:1,
    type,
    start_time:startISO,
    interval_seconds:interval,
    lap_distance_km:dist,
    running:true
  });

  loadAdmin();
}

// ✅ STOP RACE
async function stopRace(){
  if (!confirm("Stoppe løpet?")) return;

  await db.from("race").update({ running:false }).eq("id",1);
  loadAdmin();
}

// ✅ RESET
async function resetRace(){
  if (!confirm("Slette ALT?")) return;

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

  loadAdmin();
}

// ✅ MODAL
function openAddModal(){
  document.getElementById("modalAdd").classList.add("active");
}
function closeAddModal(){
  document.getElementById("modalAdd").classList.remove("active");
}

// ✅ ADD PARTICIPANT
async function confirmAddParticipant(){
  const bib = document.getElementById("modalBib").value.trim();
  const name = document.getElementById("modalName").value.trim();

  if (!bib || !name){
    alert("BIB og navn må fylles ut");
    return;
  }

  await db.from("participants").insert({
    bib,
    name,
    status:"active"
  });

  closeAddModal();
  loadAdmin();
}

// ✅ IMPORT
function importParticipants(event){
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type:"array" });

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    rows.forEach(async r=>{
      const bib  = r.BIB  || r.bib;
      const name = r.Navn || r.NAVN || r.navn || r.name;

      if (bib && name){
        await db.from("participants").insert({
          bib,name,status:"active"
        });
      }
    });

    loadAdmin();
  };

  reader.readAsArrayBuffer(file);
}

// ✅ Formatter
function fmt(sec){
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");
}

// ✅ Auto update countdown
setInterval(()=>drawCountdown(),1000);

/* -----------------------------------------------------------
   ✅ REGISTRERING – HOVEDMODUL
----------------------------------------------------------- */

function drawRegister() {
  if (!state.participants.length || !state.race) return;

  const grid = document.getElementById("runnerGrid");
  const r = currentRound();
  const remaining = timeToNext();
  const cutoff = remaining <= 0;
  const beforeStart = now() < new Date(state.race.start_time);

  // Oppdater header
  document.getElementById("regRoundHeader").innerText =
    beforeStart ? "Start om" : "Runde " + r;

  document.getElementById("regCountdown").innerText = fmt(remaining);

  // BESTEM FARGER FOR HVERT KNAPP
  let list = state.participants.map(p => {
    const lap = state.laps.find(
      l => l.participant_id === p.id && l.lap_number === r
    );

    let ui = "white";

    if (beforeStart) ui = "white";
    else if (p.status === "dnf") ui = "gray";
    else if (lap) ui = "green";
    else if (cutoff) ui = "red";
    else ui = "white";

    return { ...p, uiState: ui };
  });

  // SORTER (grønn > rød > hvit > grå)
  const sortOrder = { green:1, red:2, white:3, gray:4 };
  list.sort((a,b)=>sortOrder[a.uiState] - sortOrder[b.uiState]);

  // RENDER
  grid.innerHTML = "";
  list.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "runner " + p.uiState;

    const lap = state.laps.find(
      l => l.participant_id === p.id && l.lap_number === r
    );

    btn.textContent =
      p.bib + " " + p.name + (lap ? " " + fmt(lap.lap_seconds) : "");

    // TRYKKHÅNDTERING
    btn.onclick = () => pressRunner(p, p.uiState);

    grid.appendChild(btn);
  });
}

/* -----------------------------------------------------------
   ✅ TRYKK PÅ EN DELTAKER-KNAPP
----------------------------------------------------------- */
async function pressRunner(p, uiState) {
  const r = currentRound();
  const cutoff = timeToNext() <= 0;

  const existing = state.laps.find(
    l => l.participant_id === p.id && l.lap_number === r
  );

  // ✅ CASE 1: FJERNE REGISTRERING (GREEN → WHITE)
  if (existing) {
    if (!confirm("Slette registrering?")) return;
    await db.from("laps").delete().eq("id", existing.id);
    return;
  }

  // ✅ CASE 2: TIDSAVBRUDD (RED) → DNF
  if (uiState === "red" && cutoff) {
    await db.from("participants").update({ status:"dnf" }).eq("id", p.id);
    return;
  }

  // ✅ CASE 3: NORMAL REGISTRERING
  const start = new Date(state.race.start_time);
  const sec = Math.floor((now() - start) / 1000);

  // Optimistic update
  state.laps.push({
    id: "local-" + Math.random(),
    race_id: state.race.id,
    participant_id: p.id,
    lap_number: r,
    lap_seconds: sec
  });
  drawRegister();

  // Write to DB
  await db.from("laps").insert({
    race_id: state.race.id,
    participant_id: p.id,
    lap_number: r,
    lap_seconds: sec
  });
}

/* -----------------------------------------------------------
   ✅ HJELPEFUNKSJONER (SAME AS ADMIN USES)
----------------------------------------------------------- */

function now() { return new Date(); }

function currentRound() {
  if (!state.race?.start_time) return 1;

  const start = new Date(state.race.start_time);
  if (now() < start) return 1;

  let diff = (now() - start) / 1000;
  let acc = 0;
  let r = 1;

  while (true) {
    const dur = state.race.interval_seconds;
    if (diff < acc + dur) break;
    acc += dur;
    r++;
  }
  return r;
}

function timeToNext() {
  if (!state.race?.start_time) return 0;

  const start = new Date(state.race.start_time);
  if (now() < start) return (start - now()) / 1000;

  let diff = (now() - start) / 1000;
  let acc = 0;
  let r = 1;

  while (true) {
    const dur = state.race.interval_seconds;
    if (diff < acc + dur) return acc + dur - diff;
    acc += dur;
    r++;
  }
}

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec/60) + ":" + String(sec%60).padStart(2,"0");
}

/* -----------------------------------------------------------
   ✅ AUTOOPPDATERING (1s)
----------------------------------------------------------- */
setInterval(drawRegister, 1000);
