/******************************************************************************
 * DEBUG HELPERS
 ******************************************************************************/

function log(...args)   { console.log("[APP]", ...args); }
function dbg(...args)   { console.debug("[DBG]", ...args); }
function warn(...args)  { console.warn("[WARN]", ...args); }
function err(...args)   { console.error("[ERROR]", ...args); }

/******************************************************************************
 * SUPABASE CLIENT (DEBUG)
 ******************************************************************************/

dbg("Initializing Supabase client...");
const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus"
);
dbg("Supabase client initialized.");

/******************************************************************************
 * GLOBAL STATE (DEBUG)
 ******************************************************************************/

const state = {
  race: null,
  participants: [],
  laps: [],
  logs: []
};

dbg("Initial EMPTY STATE:", state);

/******************************************************************************
 * UTILS
 ******************************************************************************/

const now = () => new Date();

function fmt(sec){
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2,"0");
}

function sortRegistrationGrid(arr){
  const rank = ui =>
    ui === "green" ? 1 :
    ui === "red"   ? 2 :
    ui === "white" ? 3 :
    ui === "gray"  ? 4 : 5;

  return arr.sort((a,b)=>rank(a.uiState)-rank(b.uiState));
}

/******************************************************************************
 * TIME LOGIC
 ******************************************************************************/

function getInterval(round){
  if (!state.race) return 3600;
  return state.race.type === "frontyard"
    ? state.race.interval_seconds - (round-1)*60
    : state.race.interval_seconds;
}

function currentRound(){
  if (!state.race?.start_time) return 1;
  const start = new Date(state.race.start_time);
  if (now() < start) return 1;

  let diff = (now()-start)/1000;
  let acc = 0;
  let round = 1;

  while(true){
    const dur = getInterval(round);
    if (diff < acc + dur) break;
    acc += dur;
    round++;
  }
  return round;
}

function timeToNext(){
  if (!state.race?.start_time) return 0;
  const start = new Date(state.race.start_time);

  if (now() < start) return (start-now())/1000;

  let diff = (now()-start)/1000;
  let acc = 0;
  let round = 1;

  while(true){
    let dur = getInterval(round);
    if (diff < acc + dur) return acc + dur - diff;
    acc += dur;
    round++;
  }
}

/******************************************************************************
 * PAGE NAV
 ******************************************************************************/

function showPage(id){
  dbg("showPage:", id);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/******************************************************************************
 * DRAW MASTER
 ******************************************************************************/

function draw(){
  dbg("DRAW ALL");
  drawRegister();
  drawLive();
  drawAdmin();
  drawLog();
}

/******************************************************************************
 * REGISTER PAGE
 ******************************************************************************/

function drawRegister(){
  dbg("DRAW REGISTER");

  const grid = document.getElementById("runnerGrid");
  if (!grid || !state.race) return;

  const r = currentRound();
  const beforeStart = now() < new Date(state.race.start_time);
  const remaining = timeToNext();
  const cutoff = remaining <= 0;

  dbg("currentRound:", r, "remaining:", remaining, "cutoff:", cutoff);

  const view = state.participants.map(p=>{
    const lap = state.laps.find(
      l => l.participant_id == p.id && l.lap_number == r
    );

    let uiState="white";
    if (beforeStart) uiState="white";
    else if (p.status==="dnf") uiState="gray";
    else if (lap) uiState="green";
    else if (cutoff) uiState="red";
    else uiState="white";

    return {...p, uiState};
  });

  const sorted = sortRegistrationGrid(view);
  dbg("Sorted participants:", sorted);

  grid.innerHTML = "";

  sorted.forEach(p=>{
    const btn = document.createElement("button");
    btn.className = "runner "+p.uiState;

    const lap = state.laps.find(
      l => l.participant_id==p.id && l.lap_number==r
    );

    btn.textContent = p.bib + " " + p.name + (lap ? " "+fmt(lap.lap_seconds) : "");

    btn.onclick = () => {
      dbg("PRESS btn:", p);
      press(p, p.uiState);
    };

    grid.appendChild(btn);
  });

  document.getElementById("roundHeader").innerText =
    beforeStart ? "Start om" : "Runde "+r;

  document.getElementById("countdownHeader").innerText = fmt(remaining);
}

/******************************************************************************
 * PRESS
 ******************************************************************************/

async function press(p, uiState){
  dbg("PRESS handler:", p, "UI state:", uiState);

  const r = currentRound();
  const cutoff = timeToNext() <= 0;

  const existing = state.laps.find(
    l => l.participant_id===p.id && l.lap_number===r
  );

  // CASE 1 — Slette grønn
  if (existing){
    dbg("Existing lap found -> remove lap", existing);

    if (confirm("Slette registrering?")){
      const { error } = await db.from("laps")
        .delete()
        .eq("id", existing.id);

      if (error) err("ERROR deleting lap", error);
    }
    return;
  }

  // CASE 2 – Timed out → DNF
  if (uiState==="red" && cutoff){
    dbg("RED TIMEOUT → SET DNF for", p);

    const lastRound = r-1;

    const { error } = await db.from("participants")
      .update({ status:"dnf" })
      .eq("id", p.id);

    if (error) err("DNF update error:", error);
    return;
  }

  // CASE 3 — Normal registrering
  dbg("Normal registration for", p);
  const start = new Date(state.race.start_time);
  const sec = Math.floor((now()-start)/1000);

  // optimistic push
  state.laps.push({
    id:"local-"+Math.random(),
    race_id: state.race.id,
    participant_id: p.id,
    lap_number:r,
    lap_seconds:sec
  });
  draw();

  const { error } = await db.from("laps").insert({
    race_id: state.race.id,
    participant_id: p.id,
    lap_number:r,
    lap_seconds:sec
  });

  if (error) err("Error inserting lap:", error);
}

/******************************************************************************
 * LIVE PAGE
 ******************************************************************************/

function drawLive(){
  const box = document.getElementById("liveTable");
  if (!box || !state.race) return;
  dbg("DRAW LIVE");

  const r = currentRound();
  const start = new Date(state.race.start_time);
  const elapsed = (now()-start)/1000;

  document.getElementById("liveRound").innerText =
    `Klokke ${now().toLocaleTimeString()} — Runde ${r}`;
  document.getElementById("liveCountdown").innerText =
    `Påløpt ${fmt(elapsed)} — Neste start om ${fmt(timeToNext())}`;

  const map = {};
  state.participants.forEach(
    p => map[p.id] = { ...p, rounds:0, total:0, last:0 }
  );

  state.laps.forEach(l=>{
    const m = map[l.participant_id];
    if (!m) return;
    m.rounds++;
    m.total += l.lap_seconds;
    m.last = l.lap_seconds;
  });

  const arr = Object.values(map);
  arr.sort((a,b)=> b.rounds - a.rounds || a.total - b.total);

  dbg("LIVE standings:", arr);

  let html = `
    <tr>
      <th>#</th><th>Navn</th><th>Runder</th>
      <th>Siste</th><th>Tid</th><th>Status</th>
    </tr>
  `;

  arr.forEach((r,i)=>{
    html+=`
      <tr>
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.rounds}</td>
        <td>${fmt(r.last)}</td>
        <td>${fmt(r.total)}</td>
        <td>${r.status||"active"}</td>
      </tr>
    `;
  });

  box.innerHTML = html;
}

/******************************************************************************
 * ADMIN PAGE
 ******************************************************************************/

function drawAdmin(){
  const t = document.getElementById("adminTable");
  if (!t || !state.race) return;

  dbg("DRAW ADMIN");

  const rounds = Math.max(1, ...state.laps.map(l=>l.lap_number||0));

  let html = "<tr><th>BIB</th><th>Navn</th>";
  for (let i=1;i<=rounds;i++) html+=`<th>${i}</th>`;
  html+="</tr>";

  state.participants.forEach(p=>{
    html+=`<tr><td>${p.bib}</td><td>${p.name}</td>`;
    for (let i=1;i<=rounds;i++){
      const lap = state.laps.find(
        l => l.participant_id==p.id && l.lap_number==i
      );
      html+=`<td>${lap?fmt(lap.lap_seconds):""}</td>`;
    }
    html+="</tr>";
  });

  t.innerHTML = html;

  // countdown
  const info = document.getElementById("adminCountdown");
  if (!info) return;

  const start = new Date(state.race.start_time);
  const diff = start - now();
  info.innerText = diff > 0 ? "Starter om: "+fmt(diff/1000) : "Løpet er i gang!";
}

/******************************************************************************
 * ADD PARTICIPANT MODAL
 ******************************************************************************/

function openAddModal(){
  dbg("OPEN ADD MODAL");
  document.getElementById("modalAdd").classList.add("active");
}

function closeAddModal(){
  dbg("CLOSE ADD MODAL");
  document.getElementById("modalAdd").classList.remove("active");
}

async function confirmAddParticipant(){
  dbg("CONFIRM ADD PARTICIPANT");

  const bib = document.getElementById("modalBib").value.trim();
  const name = document.getElementById("modalName").value.trim();

  dbg("VALUES:", { bib, name });

  const { error } = await db.from("participants").insert({
    bib,
    name,
    status:"active"
  });

  if (error){
    err("INSERT ERROR:", error);
    alert("Feil ved lagring: "+error.message);
  } else dbg("Insert OK");

  document.getElementById("modalBib").value="";
  document.getElementById("modalName").value="";
  closeAddModal();
}

/******************************************************************************
 * IMPORT CSV/XLS/XLSX
 ******************************************************************************/

async function importParticipants(event){
  dbg("IMPORT PARTICIPANTS — start");

  const file = event.target.files[0];
  if (!file){
    warn("No file chosen.");
    return;
  }
  dbg("File chosen:", file.name);

  const reader = new FileReader();
  reader.onload = e => {
    dbg("File loaded via FileReader");

    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type:"array" });

    dbg("Sheets:", wb.SheetNames);

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    dbg("Parsed rows:", rows);

    rows.forEach(async row=>{
      const bib  = row.BIB  || row.bib;
      const name = row.Navn || row.NAVN || row.navn || row.name;

      dbg("Row extracted:", { bib, name });

      if (!bib || !name){
        warn("Skipping row due to missing data:", row);
        return;
      }

      const { error } = await db.from("participants")
        .insert({ bib, name, status:"active" });

      if (error){
        err("Insert error:", error);
      } else dbg("Imported participant:", bib, name);
    });
  };

  reader.readAsArrayBuffer(file);
}

/******************************************************************************
 * ADMIN ACTIONS
 ******************************************************************************/

async function startRace(){
  dbg("START RACE");

  const type = document.getElementById("raceType").value;
  const startLocal = document.getElementById("startTime").value;
  const startISO = new Date(startLocal).toISOString();
  const interval = parseInt(document.getElementById("interval").value)*60;
  const dist = parseFloat(document.getElementById("distance").value);

  dbg("VALUES:", { type, startISO, interval, dist });

  const { error } = await db.from("race").upsert({
    id:1, type, start_time:startISO,
    interval_seconds:interval,
    lap_distance_km:dist,
    running:true
  });

  if (error) err("startRace error:", error);
}

async function stopRace(){
  dbg("STOP RACE");

  if (!confirm("Stoppe løpet?")) return;

  const { error } = await db.from("race")
    .update({ running:false })
    .eq("id", state.race.id);

  if (error) err("stopRace error:", error);
}

async function resetRace(){
  dbg("RESET RACE");

  if (!confirm("Slette alt?")) return;

  await db.from("laps").delete().neq("id",0);
  await db.from("participants").delete().neq("id",0);
  await db.from("race").delete().neq("id",0);

  // recreate baseline race row
  await db.from("race").insert({
    id:1,
    type:"backyard",
    start_time:new Date().toISOString(),
    interval_seconds:3600,
    lap_distance_km:6.7,
    running:false
  });

  dbg("RESET complete");
}

/******************************************************************************
 * LOG PAGE
 ******************************************************************************/

function drawLog(){
  const t=document.getElementById("logTable");
  if(!t) return;

  dbg("DRAW LOG");

  let html="<tr><th>Start</th><th>Slutt</th></tr>";

  state.logs.forEach(l=>{
    html+=`
      <tr>
        <td>${new Date(l.start_time).toLocaleString()}</td>
        <td>${new Date(l.end_time).toLocaleString()}</td>
      </tr>`;
  });

  t.innerHTML = html;
}

/******************************************************************************
 * REALTIME SUBSCRIPTIONS
 ******************************************************************************/

dbg("Setting up realtime subscriptions...");

db.channel("race_changes")
  .on("postgres_changes",
    {schema:"public", table:"race"},
    payload=>{
      dbg("RT race event:", payload);
      if (payload.eventType==="DELETE") return;
      state.race = payload.new;
      draw();
    }
  )
  .subscribe();

db.channel("participants_changes")
  .on("postgres_changes",
    {schema:"public", table:"participants"},
    payload=>{
      dbg("RT participants event:", payload);

      if (payload.eventType === "INSERT"){
        state.participants.push(payload.new);
      }
      if (payload.eventType === "UPDATE"){
        const i = state.participants.findIndex(p=>p.id===payload.new.id);
        if (i>=0) state.participants[i]=payload.new;
      }
      if (payload.eventType === "DELETE"){
        state.participants =
          state.participants.filter(p=>p.id!==payload.old.id);
      }

      draw();
    }
  )
  .subscribe();

db.channel("laps_changes")
  .on("postgres_changes",
    {schema:"public", table:"laps"},
    payload=>{
      dbg("RT laps event:", payload);

      if (payload.eventType === "INSERT"){
        state.laps.push(payload.new);
      }
      if (payload.eventType === "UPDATE"){
        const i=state.laps.findIndex(l=>l.id===payload.new.id);
        if(i>=0) state.laps[i]=payload.new;
      }
      if (payload.eventType === "DELETE"){
        state.laps = state.laps.filter(l=>l.id!==payload.old.id);
      }

      draw();
    }
  )
  .subscribe();

/******************************************************************************
 * INITIAL LOAD
 ******************************************************************************/

async function initialLoad(){
  dbg("INITIAL LOAD START");

  let r = await db.from("race").select("*").limit(1);
  dbg("race load result:", r);
  state.race = r.data?.[0] || null;

  let p = await db.from("participants").select("*");
  dbg("participants load:", p);
  state.participants = p.data || [];

  let l = await db.from("laps").select("*");
  dbg("laps load:", l);
  state.laps = l.data || [];

  let logRes = await db.from("race_log").select("*");
  dbg("race_log load:", logRes);
  state.logs = logRes.data || [];

  dbg("INITIAL STATE AFTER LOAD:", state);

  draw();
}

initialLoad();

// countdown tick
setInterval(()=> {
  dbg("countdown tick");
  drawRegister();
}, 1000);

/******************************************************************************
 * WAKELOCK
 ******************************************************************************/

async function keepAwake(){
  try{
    await navigator.wakeLock.request("screen");
    dbg("WAKELOCK granted");
  } catch(e){
    warn("WAKELOCK denied or not supported");
  }
}
keepAwake();
