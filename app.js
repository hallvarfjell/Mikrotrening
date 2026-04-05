// ✅ Supabase Client
const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // din anon key
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
