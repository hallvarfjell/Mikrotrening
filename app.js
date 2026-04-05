// SUPABASE ---------------------------------------------------
const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus"
);

let race = {};
let participants = [];
let laps = [];
let logs = [];

// PAGE NAV ----------------------------------------------------
function showPage(id){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// LOAD --------------------------------------------------------
async function load(){
  const r = await db.from("race").select("*").limit(1);
  if (r.data?.[0]) race = r.data[0];

  const p = await db.from("participants").select("*");
  if (p.data) participants = p.data;

  const l = await db.from("laps").select("*");
  if (l.data) laps = l.data;

  const lg = await db.from("race_log").select("*");
  if (lg.data) logs = lg.data;

  draw();
}

// TIME --------------------------------------------------------
function now(){ return new Date(); }

function getInterval(round){
  if(race.type==="frontyard"){
    return (race.interval_seconds - (round-1)*60);
  }
  return race.interval_seconds;
}

function currentRound(){
  if(!race.start_time) return 1;
  let start=new Date(race.start_time);
  if(now()<start) return 1;

  let diff=(now()-start)/1000;
  let r=1, acc=0;

  while(true){
    let i=getInterval(r);
    if(diff < acc+i) break;
    acc+=i;
    r++;
  }
  return r;
}

function timeToNext(){
  if(!race.start_time) return 0;
  let start=new Date(race.start_time);

  if(now()<start){
    return (start-now())/1000;
  }
  let diff=(now()-start)/1000;
  let r=1, acc=0;

  while(true){
    let i=getInterval(r);
    if(diff < acc+i) return acc+i-diff;
    acc+=i;
    r++;
  }
}

// DRAW MASTER -------------------------------------------------
function draw(){
  drawRegister();
  drawLive();
  drawAdmin();
  drawLog();
}

// REGISTER ----------------------------------------------------
function drawRegister(){
  let grid=document.getElementById("runnerGrid");
  if(!grid) return;

  grid.innerHTML="";

  let start=new Date(race.start_time ?? now());
  let beforeStart=now()<start;
  let r=currentRound();
  let remaining=timeToNext();
  let closed=remaining<=0;

  participants.forEach(p=>{
    let btn=document.createElement("button");
    btn.className="runner";

    let lap=laps.find(l=>l.participant_id==p.id && l.lap_number==r);
    let state="white";

    if(beforeStart) state="white";
    else if(p.status==="dnf") state="gray";
    else if(lap) state="green";
    else if(closed) state="red";

    btn.classList.add(state);
    btn.innerText=p.bib+" "+p.name+(lap?" "+fmt(lap.lap_seconds):"");

    if(!beforeStart){
      btn.onclick=()=>press(p);
    }
    grid.appendChild(btn);
  });

  document.getElementById("roundHeader").innerText =
    beforeStart ? "Start om" : "Runde "+r;
  document.getElementById("countdownHeader").innerText = fmt(remaining);
}

async function press(p){
  let r=currentRound();
  let existing=laps.find(l=>l.participant_id==p.id && l.lap_number==r);

  if(existing){
    if(confirm("Slette registrering?")){
      await db.from("laps").delete().eq("id",existing.id);
    }
    return;
  }

  let start=new Date(race.start_time);
  let sec=Math.floor((now()-start)/1000);

  await db.from("laps").insert({
    race_id:race.id,
    participant_id:p.id,
    lap_number:r,
    lap_seconds:sec
  });
}

// LIVE -------------------------------------------------------
function drawLive(){
  let t=document.getElementById("liveTable");
  if(!t) return;

  let map={};
  participants.forEach(p=>map[p.id]={...p,laps:0,time:0,last:0});
  laps.forEach(l=>{
    let m=map[l.participant_id];
    if(!m) return;
    m.laps++;
    m.time+=l.lap_seconds;
    m.last=l.lap_seconds;
  });

  let arr=Object.values(map);
  arr.sort((a,b)=>b.laps-a.laps || a.time-b.time);

  let html="<tr><th>#</th><th>Navn</th><th>Runder</th><th>Siste</th><th>Snitt</th><th>Total</th><th>Status</th></tr>";
  arr.forEach((r,i)=>{
    html+=`
      <tr>
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.laps}</td>
        <td>${fmt(r.last)}</td>
        <td>${fmt(r.laps? r.time/r.laps:0)}</td>
        <td>${fmt(r.time)}</td>
        <td>${r.status ?? "active"}</td>
      </tr>`;
  });
  t.innerHTML=html;

  let start=new Date(race.start_time ?? now());
  let elapsed=(now()-start)/1000;

  document.getElementById("liveRound").innerText=
    "Klokke "+now().toLocaleTimeString()+
    "   Start "+start.toLocaleTimeString();

  document.getElementById("liveCountdown").innerText=
    "Påløpt "+fmt(elapsed)+
    "   Neste "+fmt(timeToNext());
}

// ADMIN -------------------------------------------------------
function drawAdmin(){
  let t=document.getElementById("adminTable");
  if(!t) return;

  let rounds=Math.max(10,...laps.map(l=>l.lap_number ?? 0));
  let html="<tr><th>BIB</th><th>Navn</th>";

  for(let i=1;i<=rounds;i++) html+=`<th>${i}</th>`;
  html+="</tr>";

  participants.forEach(p=>{
    html+=`<tr>
      <td>${p.bib}</td>
      <td>${p.name}</td>`;
    for(let i=1;i<=rounds;i++){
      let lap=laps.find(l=>l.participant_id==p.id && l.lap_number==i);
      html+=`<td onclick="editLap(${p.id},${i})">${lap?fmt(lap.lap_seconds):""}</td>`;
    }
    html+="</tr>";
  });

  t.innerHTML=html;
}

async function editLap(pid,round){
  let v=prompt("mm:ss");
  if(!v) return;
  let [m,s]=v.split(":");
  let sec=parseInt(m)*60+parseInt(s);

  let existing=laps.find(l=>l.participant_id==pid && l.lap_number==round);
  if(existing){
    await db.from("laps").update({lap_seconds:sec}).eq("id",existing.id);
  } else {
    await db.from("laps").insert({
      race_id:race.id,
      participant_id:pid,
      lap_number:round,
      lap_seconds:sec,
      manual:true
    });
  }
}

async function addParticipant(){
  let bib=prompt("BIB");
  let name=prompt("Navn");
  await db.from("participants").insert({bib,name,status:"active"});
}

async function startRace(){
  let type=document.getElementById("raceType").value;
  let startLocal=document.getElementById("startTime").value;
  let startISO=new Date(startLocal).toISOString();
  let interval=parseInt(document.getElementById("interval").value)*60;
  let dist=parseFloat(document.getElementById("distance").value);

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
  if(!confirm("Stoppe løpet?")) return;
  if(!confirm("Er du sikker?")) return;

  await db.from("race").update({running:false,finished:true}).eq("id",race.id);

  await db.from("race_log").insert({
    name:"Løp",
    start_time:race.start_time,
    end_time:new Date(),
    data:{participants,laps}
  });
}

async function resetRace(){
  if(!confirm("Reset?")) return;
  await db.from("laps").delete().neq("id",0);
  await db.from("participants").delete().neq("id",0);
  await db.from("race").delete().neq("id",0);
}

// LOG --------------------------------------------------------
function drawLog(){
  let t=document.getElementById("logTable");
  if(!t) return;

  let html="<tr><th>Start</th><th>Slutt</th><th></th></tr>";
  logs.forEach(l=>{
    html+=`
      <tr>
        <td>${new Date(l.start_time).toLocaleString()}</td>
        <td>${new Date(l.end_time).toLocaleString()}</td>
        <td><button onclick="loadLog(${l.id})">Last inn</button></td>
      </tr>`;
  });
  t.innerHTML=html;
}

function loadLog(id){
  let l=logs.find(x=>x.id==id);
  participants=l.data.participants;
  laps=l.data.laps;
  race.start_time=l.start_time;
  draw();
}

// FORMATTER ---------------------------------------------------
function fmt(sec){
  sec=Math.max(0,Math.floor(sec ?? 0));
  return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");
}

// REALTIME 2.0 -----------------------------------------------
db.channel("race_changes")
  .on("postgres_changes",{event:"*",schema:"public",table:"race"},payload=>{
      applyRaceChange(payload);
      draw();
  })
  .subscribe();

db.channel("participants_changes")
  .on("postgres_changes",{event:"*",schema:"public",table:"participants"},payload=>{
      applyParticipantChange(payload);
      draw();
  })
  .subscribe();

db.channel("laps_changes")
  .on("postgres_changes",{event:"*",schema:"public",table:"laps"},payload=>{
      applyLapChange(payload);
      draw();
  })
  .subscribe();

function applyRaceChange(payload){
  if(payload.eventType==="INSERT" || payload.eventType==="UPDATE"){
    race = payload.new;
  }
  if(payload.eventType==="DELETE"){
    race = {};
  }
}

function applyParticipantChange(payload){
  if(payload.eventType==="INSERT"){
    participants.push(payload.new);
  }
  if(payload.eventType==="UPDATE"){
    let i=participants.findIndex(p=>p.id===payload.new.id);
    if(i>=0) participants[i]=payload.new;
  }
  if(payload.eventType==="DELETE"){
    participants = participants.filter(p=>p.id !== payload.old.id);
  }
}

function applyLapChange(payload){
  if(payload.eventType==="INSERT"){
    laps.push(payload.new);
  }
  if(payload.eventType==="UPDATE"){
    let i=laps.findIndex(l=>l.id===payload.new.id);
    if(i>=0) laps[i]=payload.new;
  }
  if(payload.eventType==="DELETE"){
    laps = laps.filter(l=>l.id !== payload.old.id);
  }
}

// TICK --------------------------------------------------------
setInterval(draw,1000);

// INITIAL LOAD -----------------------------------------------
load();

// WAKELOCK ----------------------------------------------------
async function keepAwake(){
  try{ await navigator.wakeLock.request("screen"); }
  catch(e){}
}
keepAwake();
