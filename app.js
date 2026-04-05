/******************************************************************************
 * SUPABASE CLIENT
 ******************************************************************************/

const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus"
);

/******************************************************************************
 * GLOBAL STATE
 ******************************************************************************/

const state = {
  race: null,
  participants: [],
  laps: [],
  logs: []
};

/******************************************************************************
 * UTILITIES
 ******************************************************************************/

const now = () => new Date();

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function sortRegistrationGrid(arr) {
  const order = p =>
    p.uiState === "green" ? 1 :
    p.uiState === "red"   ? 2 :
    p.uiState === "white" ? 3 :
    p.uiState === "gray"  ? 4 : 5;

  return arr.sort((a,b)=> order(a) - order(b));
}

/******************************************************************************
 * PAGE NAV
 ******************************************************************************/

function showPage(id){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/******************************************************************************
 * TIME CALCULATIONS
 ******************************************************************************/

function getInterval(round){
  const r = state.race;
  if (!r) return 3600;

  if (r.type === "frontyard") {
    return r.interval_seconds - (round - 1) * 60;
  }
  return r.interval_seconds;
}

function currentRound(){
  const r = state.race;
  if (!r?.start_time) return 1;

  const start = new Date(r.start_time);
  if (now() < start) return 1;

  let diff = (now() - start) / 1000;
  let acc = 0;
  let round = 1;

  while (true) {
    let dur = getInterval(round);
    if (diff < acc + dur) break;
    acc += dur;
    round++;
  }
  return round;
}

function timeToNext(){
  const r = state.race;
  if (!r?.start_time) return 0;

  const start = new Date(r.start_time);
  if (now() < start) return (start - now())/1000;

  let diff = (now() - start) / 1000;
  let acc = 0;
  let round = 1;

  while (true) {
    let dur = getInterval(round);
    if (diff < acc + dur) return acc + dur - diff;
    acc += dur;
    round++;
  }
}

/******************************************************************************
 * RENDER
 ******************************************************************************/

function draw(){
  drawRegister();
  drawLive();
  drawAdmin();
  drawLog();
}

/******************************************************************************
 * REGISTRATION PAGE
 ******************************************************************************/

function drawRegister(){
  const grid = document.getElementById("runnerGrid");
  if (!grid || !state.race) return;

  const r = currentRound();
  const beforeStart = now() < new Date(state.race.start_time);
  const remaining = timeToNext();
  const cutoff = remaining <= 0;

  // Build participant states
  const view = state.participants.map(p => {
    const lap = state.laps.find(
      l => l.participant_id == p.id && l.lap_number == r
    );

    let uiState = "white";

    if (beforeStart) uiState = "white";
    else if (p.status === "dnf") uiState = "gray";
    else if (lap) uiState = "green";
    else if (cutoff) uiState = "red";
    else uiState = "white";

    return { ...p, uiState };
  });

  const sorted = sortRegistrationGrid(view);
  grid.innerHTML = "";

  sorted.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "runner " + p.uiState;

    const rLap = state.laps.find(
      l => l.participant_id == p.id && l.lap_number == r
    );

    btn.textContent =
      p.bib + " " + p.name + (rLap ? " " + fmt(rLap.lap_seconds) : "");

    btn.onclick = () => press(p, p.uiState);
    grid.appendChild(btn);
  });

  document.getElementById("roundHeader").innerText =
    beforeStart ? "Start om" : "Runde " + r;

  document.getElementById("countdownHeader").innerText = fmt(remaining);
}

/******************************************************************************
 * PRESS HANDLING (Backyard‑korrekt)
 ******************************************************************************/

async function press(p, uiState){
  const r = currentRound();
  const cutoff = timeToNext() <= 0;

  const existing = state.laps.find(
    l => l.participant_id === p.id && l.lap_number === r
  );

  /************ CASE 1 — Remove existing lap (green → white) ************/
  if (existing) {
    if (confirm("Slette registrering?")) {
      await db.from("laps").delete().eq("id", existing.id);
    }
    return;
  }

  /************ CASE 2 — Timed‑out (red) → DNF ************/
  if (uiState === "red" && cutoff) {
    const lastRound = r - 1;

    await db.from("participants")
      .update({ status: "dnf" })
      .eq("id", p.id);

    return;
  }

  /************ CASE 3 — Normal registration ************/
  const start = new Date(state.race.start_time);
  const sec = Math.floor((now() - start)/1000);

  // Optimistic
  state.laps.push({
    id: "local-" + Math.random(),
    race_id: state.race.id,
    participant_id: p.id,
    lap_number: r,
    lap_seconds: sec
  });
  draw();

  // DB
  await db.from("laps").insert({
    race_id: state.race.id,
    participant_id: p.id,
    lap_number: r,
    lap_seconds: sec
  });
}

/******************************************************************************
 * LIVE PAGE
 ******************************************************************************/

function drawLive(){
  const box = document.getElementById("liveTable");
  if (!box || !state.race) return;

  const r = currentRound();
  const start = new Date(state.race.start_time || now());
  const elapsed = (now() - start) / 1000;

  document.getElementById("liveRound").innerText =
    `Klokke ${now().toLocaleTimeString()} — Runde ${r}`;

  document.getElementById("liveCountdown").innerText =
    `Påløpt ${fmt(elapsed)} — Neste start om ${fmt(timeToNext())}`;

  // Build standings
  const map = {};
  state.participants.forEach(
    p => (map[p.id] = { ...p, rounds: 0, total: 0, last: 0 })
  );

  state.laps.forEach(l => {
    const m = map[l.participant_id];
    if (!m) return;
    m.rounds++;
    m.total += l.lap_seconds;
    m.last = l.lap_seconds;
  });

  const arr = Object.values(map);
  arr.sort((a,b)=> b.rounds - a.rounds || a.total - b.total);

  let html =
    "<tr><th>#</th><th>Navn</th><th>Runder</th><th>Siste</th><th>Totaltid</th><th>Status</th></tr>";

  arr.forEach((r,i)=>{
    html += `
      <tr>
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.rounds}</td>
        <td>${fmt(r.last)}</td>
        <td>${fmt(r.total)}</td>
        <td>${r.status || "active"}</td>
      </tr>`;
  });

  box.innerHTML = html;
}

/******************************************************************************
 * ADMIN PAGE
 ******************************************************************************/

function drawAdmin(){
  const t = document.getElementById("adminTable");
  if (!t || !state.race) return;

  let rounds = Math.max(1,...state.laps.map(l=>l.lap_number||0));

  let html = "<tr><th>BIB</th><th>Navn</th>";
  for (let i=1;i<=rounds;i++) html += `<th>${i}</th>`;
  html += "</tr>";

  state.participants.forEach(p=>{
    html += `<tr><td>${p.bib}</td><td>${p.name}</td>`;
    for (let i=1;i<=rounds;i++){
      const lap = state.laps.find(
        l => l.participant_id==p.id && l.lap_number==i
      );
      html += `<td>${lap?fmt(lap.lap_seconds):""}</td>`;
    }
    html += "</tr>";
  });

  t.innerHTML = html;

  // COUNTDOWN
  const info = document.getElementById("adminCountdown");
  if (!info) return;

  const start = new Date(state.race.start_time);
  const diff = start - now();

  if (diff > 0) info.innerText = "Starter om: " + fmt(diff/1000);
  else info.innerText = "Løpet er i gang!";
}

/******************************************************************************
 * ADMIN ACTIONS
 ******************************************************************************/

function openAddModal(){
  document.getElementById("modalAdd").classList.add("active");
}
function closeAddModal(){
  document.getElementById("modalAdd").classList.remove("active");
}

async function confirmAddParticipant(){
  const bib = document.getElementById("modalBib").value.trim();
  const name = document.getElementById("modalName").value.trim();

  if (!bib || !name) {
    alert("BIB og navn må fylles ut.");
    return;
  }

  await db.from("participants").insert({
    bib,
    name,
    status:"active"
  });

  document.getElementById("modalBib").value="";
  document.getElementById("modalName").value="";
  closeAddModal();
}

async function importParticipants(event){
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type:"array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    rows.forEach(r => {
      const bib  = r.BIB  || r.bib;
      const name = r.Navn || r.NAVN || r.navn || r.name;
      if (bib && name) {
        db.from("participants").insert({
          bib,
          name,
          status:"active"
        });
      }
    });
  };
  reader.readAsArrayBuffer(file);
}

async function startRace(){
  const type = document.getElementById("raceType").value;
  const startLocal = document.getElementById("startTime").value;
  const startISO = new Date(startLocal).toISOString();
  const interval = parseInt(document.getElementById("interval").value)*60;
  const dist = parseFloat(document.getElementById("distance").value);

  await db.from("race").upsert({
    id:1,
    type,
    start_time:startISO,
    interval_seconds:interval,
    lap_distance_km:dist,
    running:true
  });
}

async function stopRace(){
  if (!confirm("Stoppe løpet?")) return;
  await db.from("race")
    .update({ running:false })
    .eq("id", state.race.id);
}

async function resetRace(){
  if (!confirm("Slette alt?")) return;

  await db.from("laps").delete().neq("id",0);
  await db.from("participants").delete().neq("id",0);
  await db.from("race").delete().neq("id",0);
}

/******************************************************************************
 * LOG
 ******************************************************************************/

function drawLog(){
  const t=document.getElementById("logTable");
  if(!t) return;

  let html="<tr><th>Start</th><th>Slutt</th></tr>";

  state.logs.forEach(l=>{
    html += `
      <tr>
        <td>${new Date(l.start_time).toLocaleString()}</td>
        <td>${new Date(l.end_time).toLocaleString()}</td>
      </tr>`;
  });

  t.innerHTML=html;
}

/******************************************************************************
 * REALTIME SUBSCRIPTIONS
 ******************************************************************************/

db.channel("race_changes")
  .on("postgres_changes", {schema:"public", table:"race"}, payload=>{
    state.race = payload.new || null;
    draw();
  })
  .subscribe();

db.channel("participants_changes")
  .on("postgres_changes", {schema:"public", table:"participants"}, payload=>{
    if (payload.eventType==="INSERT") state.participants.push(payload.new);
    if (payload.eventType==="UPDATE"){
      const i=state.participants.findIndex(p=>p.id===payload.new.id);
      if(i>=0) state.participants[i]=payload.new;
    }
    if (payload.eventType==="DELETE"){
      state.participants =
        state.participants.filter(p=>p.id!==payload.old.id);
    }
    draw();
  })
  .subscribe();

db.channel("laps_changes")
  .on("postgres_changes", {schema:"public", table:"laps"}, payload=>{
    if (payload.eventType==="INSERT") state.laps.push(payload.new);
    if (payload.eventType==="UPDATE"){
      const i=state.laps.findIndex(p=>p.id===payload.new.id);
      if(i>=0) state.laps[i]=payload.new;
    }
    if (payload.eventType==="DELETE"){
      state.laps = state.laps.filter(l=>l.id!==payload.old.id);
    }
    draw();
  })
  .subscribe();

/******************************************************************************
 * INITIAL LOAD
 ******************************************************************************/

async function initialLoad(){
  const r = await db.from("race").select("*").limit(1);
  state.race = r.data?.[0] || null;

  const p = await db.from("participants").select("*");
  state.participants = p.data || [];

  const l = await db.from("laps").select("*");
  state.laps = l.data || [];

  const lg = await db.from("race_log").select("*");
  state.logs = lg.data || [];

  draw();
}
initialLoad();

// Keep countdown ticking
setInterval(()=> drawRegister(), 1000);

/******************************************************************************
 * WAKELOCK
 ******************************************************************************/

async function keepAwake(){
  try { await navigator.wakeLock.request("screen"); }
  catch {}
}
keepAwake();
