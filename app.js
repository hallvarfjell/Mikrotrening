/******************************************************************************
 * SUPABASE CLIENT
 ******************************************************************************/

const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
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

function fmt(sec){
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");
}

function sortGrid(arr){
  const rank = ui =>
    ui==="green" ? 1 :
    ui==="red"   ? 2 :
    ui==="white" ? 3 :
    ui==="gray"  ? 4 : 5;

  return arr.sort((a,b)=>rank(a.uiState)-rank(b.uiState));
}

/******************************************************************************
 * TIME CALCULATION
 ******************************************************************************/

function getInterval(round){
  if (!state.race) return 3600;
  return state.race.type==="frontyard"
    ? state.race.interval_seconds - (round-1)*60
    : state.race.interval_seconds;
}

function currentRound(){
  if (!state.race?.start_time) return 1;
  const start = new Date(state.race.start_time);
  if (now() < start) return 1;

  let diff = (now()-start)/1000;
  let r = 1, acc = 0;

  while(true){
    const dur = getInterval(r);
    if (diff < acc + dur) break;
    acc += dur;
    r++;
  }
  return r;
}

function timeToNext(){
  if (!state.race?.start_time) return 0;

  const start = new Date(state.race.start_time);
  if (now() < start) return (start-now())/1000;

  let diff = (now()-start)/1000;
  let r=1, acc=0;

  while(true){
    const dur = getInterval(r);
    if (diff < acc+dur) return acc+dur-diff;
    acc += dur;
    r++;
  }
}

/******************************************************************************
 * PAGE NAVIGATION
 ******************************************************************************/

function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/******************************************************************************
 * RENDER MASTER
 ******************************************************************************/

function draw(){
  drawRegister();
  drawLive();
  drawAdmin();
  drawLog();
}

/******************************************************************************
 * REGISTER PAGE
 ******************************************************************************/

function drawRegister(){
  const grid = document.getElementById("runnerGrid");
  if (!grid || !state.race) return;

  const r = currentRound();
  const remaining = timeToNext();
  const beforeStart = now() < new Date(state.race.start_time);
  const cutoff = remaining <= 0;

  const view = state.participants.map(p=>{
    const lap = state.laps.find(
      l => l.participant_id==p.id && l.lap_number==r
    );

    let uiState="white";
    if (beforeStart) uiState="white";
    else if (p.status==="dnf") uiState="gray";
    else if (lap) uiState="green";
    else if (cutoff) uiState="red";
    else uiState="white";

    return { ...p, uiState };
  });

  const sorted = sortGrid(view);
  grid.innerHTML = "";

  sorted.forEach(p=>{
    const btn = document.createElement("button");
    btn.className = "runner "+p.uiState;

    const lap = state.laps.find(
      l => l.participant_id==p.id && l.lap_number==r
    );

    btn.textContent =
      p.bib+" "+p.name + (lap ? " "+fmt(lap.lap_seconds) : "");

    btn.onclick = ()=> press(p, p.uiState);

    grid.appendChild(btn);
  });

  document.getElementById("roundHeader").innerText =
    beforeStart ? "Start om" : "Runde "+r;

  document.getElementById("countdownHeader").innerText = fmt(remaining);
}

/******************************************************************************
 * PRESS — registration, timeout, DNF
 ******************************************************************************/

async function press(p, uiState){
  const r = currentRound();
  const cutoff = timeToNext() <= 0;

  const existing = state.laps.find(
    l => l.participant_id===p.id && l.lap_number===r
  );

  // Remove existing green lap
  if (existing){
    if (confirm("Slette registrering?")){
      await db.from("laps").delete().eq("id", existing.id);
    }
    return;
  }

  // Timed out → DNF
  if (uiState==="red" && cutoff){
    await db.from("participants")
      .update({ status:"dnf" })
      .eq("id", p.id);
    return;
  }

  // Normal registration
  const start = new Date(state.race.start_time);
  const sec = Math.floor((now()-start)/1000);

  state.laps.push({
    id:"local-"+Math.random(),
    race_id:state.race.id,
    participant_id:p.id,
    lap_number:r,
    lap_seconds:sec
  });
  draw();

  await db.from("laps").insert({
    race_id:state.race.id,
    participant_id:p.id,
    lap_number:r,
    lap_seconds:sec
  });
}

/******************************************************************************
 * LIVE PAGE
 ******************************************************************************/

function drawLive(){
  const box = document.getElementById("liveTable");
  if (!box || !state.race) return;

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

  let html = `
    <tr>
      <th>#</th><th>Navn</th>
      <th>Runder</th><th>Siste</th>
      <th>Totaltid</th><th>Status</th>
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
  if(!t || !state.race) return;

  const rounds = Math.max(
    1, ...state.laps.map(l=>l.lap_number||0)
  );

  let html = "<tr><th>BIB</th><th>Navn</th>";
  for (let i=1;i<=rounds;i++) html+=`<th>${i}</th>`;
  html+="</tr>";

  state.participants.forEach(p=>{
    html += `<tr><td>${p.bib}</td><td>${p.name}</td>`;
    for(let i=1;i<=rounds;i++){
      const lap = state.laps.find(
        l => l.participant_id==p.id && l.lap_number==i
      );
      html+=`<td>${lap?fmt(lap.lap_seconds):""}</td>`;
    }
    html+="</tr>";
  });

  t.innerHTML = html;

  const info = document.getElementById("adminCountdown");
  const start = new Date(state.race.start_time);
  const diff = start-now();

  info.innerText =
    diff>0 ? "Starter om: "+fmt(diff/1000) : "Løpet er i gang!";
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

  await db.from("participants").insert({
    bib, name, status:"active"
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
    const wb = XLSX.read(data, {type:"array"});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    rows.forEach(async row=>{
      const bib  = row.BIB  || row.bib;
      const name = row.Navn || row.NAVN || row.navn || row.name;

      if (bib && name){
        await db.from("participants").insert({
          bib, name, status:"active"
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
    .update({running:false})
    .eq("id", state.race.id);
}

async function resetRace(){
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
}

/******************************************************************************
 * LOG PAGE
 ******************************************************************************/

function drawLog(){
  const t = document.getElementById("logTable");
  if (!t) return;

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

db.channel("race_changes")
  .on("postgres_changes",
    {schema:"public", table:"race"},
    payload=>{
      if (payload.eventType==="DELETE") return;
      state.race = payload.new;
      draw();
    }
  ).subscribe();

db.channel("participants_changes")
  .on("postgres_changes",
    {schema:"public", table:"participants"},
    payload=>{
      if (payload.eventType==="INSERT")
        state.participants.push(payload.new);

      if (payload.eventType==="UPDATE"){
        const i=state.participants.findIndex(p=>p.id===payload.new.id);
        if(i>=0) state.participants[i]=payload.new;
      }

      if (payload.eventType==="DELETE"){
        state.participants =
          state.participants.filter(p=>p.id!==payload.old.id);
      }

      draw();
    }
  ).subscribe();

db.channel("laps_changes")
  .on("postgres_changes",
    {schema:"public", table:"laps"},
    payload=>{
      if (payload.eventType==="INSERT")
        state.laps.push(payload.new);

      if (payload.eventType==="UPDATE"){
        const i=state.laps.findIndex(l=>l.id===payload.new.id);
        if(i>=0) state.laps[i]=payload.new;
      }

      if (payload.eventType==="DELETE"){
        state.laps = state.laps.filter(l=>l.id!==payload.old.id);
      }

      draw();
    }
  ).subscribe();

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

setInterval(()=> drawRegister(), 1000);

/******************************************************************************
 * WAKELOCK
 ******************************************************************************/

async function keepAwake(){
  try{ await navigator.wakeLock.request("screen"); }
  catch{}
}
keepAwake();
