/******************************************************************************
 * SUPABASE CLIENT
 ******************************************************************************/

const db = supabase.createClient(
  "https://wjmucbavcslivuzofayi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbXVjYmF2Y3NsaXZ1em9mYXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQxNDMsImV4cCI6MjA5MDc0MDE0M30.Tr6_K5_DIoW0wafZiOjKhPxjtmlw6k-mqVmSrSrKfus"
);


/******************************************************************************
 * GLOBAL STATE (NY STRUKTUR)
 ******************************************************************************/

const state = {
  race: null,
  participants: [],
  laps: [],
  logs: []
};


/******************************************************************************
 * UTILS
 ******************************************************************************/

const now = () => new Date();

/** Format seconds as mm:ss */
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}


/******************************************************************************
 * PAGE NAVIGATION
 ******************************************************************************/

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}


/******************************************************************************
 * CORE TIME LOGIC
 ******************************************************************************/

function getInterval(round) {
  const r = state.race;
  if (!r) return 60;

  if (r.type === "frontyard") {
    return r.interval_seconds - (round - 1) * 60;
  }
  return r.interval_seconds;
}

function currentRound() {
  const r = state.race;
  if (!r?.start_time) return 1;

  const start = new Date(r.start_time);
  if (now() < start) return 1;

  let diff = (now() - start) / 1000;
  let round = 1;
  let acc = 0;

  while (true) {
    const dur = getInterval(round);
    if (diff < acc + dur) break;
    acc += dur;
    round++;
  }
  return round;
}

function timeToNext() {
  const r = state.race;
  if (!r?.start_time) return 0;

  const start = new Date(r.start_time);

  if (now() < start) {
    return (start - now()) / 1000;
  }

  let diff = (now() - start) / 1000;
  let round = 1;
  let acc = 0;

  while (true) {
    let dur = getInterval(round);
    if (diff < acc + dur) return acc + dur - diff;
    acc += dur;
    round++;
  }
}


/******************************************************************************
 * RENDERING (OPTIMALISERT)
 ******************************************************************************/

function draw() {
  drawRegister();
  drawLive();
  drawAdmin();
  drawLog();
}

/* ------------------------ REGISTER PAGE ------------------------ */
function drawRegister() {
  const grid = document.getElementById("runnerGrid");
  if (!grid || !state.race) return;

  const start = new Date(state.race.start_time || now());
  const beforeStart = now() < start;
  const r = currentRound();
  const remaining = timeToNext();
  const closed = remaining <= 0;

  grid.innerHTML = "";

  state.participants.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "runner";

    const lap = state.laps.find(
      l => l.participant_id == p.id && l.lap_number == r
    );

    let stateColor = "white";
    if (!beforeStart) {
      if (p.status === "dnf") stateColor = "gray";
      else if (lap) stateColor = "green";
      else if (closed) stateColor = "red";
    }

    btn.classList.add(stateColor);
    btn.textContent = `${p.bib} ${p.name}${lap ? " " + fmt(lap.lap_seconds) : ""}`;

    if (!beforeStart) {
      btn.onclick = () => press(p);
    }

    grid.appendChild(btn);
  });

  document.getElementById("roundHeader").innerText =
    beforeStart ? "Start om" : "Runde " + r;

  document.getElementById("countdownHeader").innerText = fmt(remaining);
}

/* ------------------------ PRESS BUTTON ------------------------ */
async function press(p) {
  const r = currentRound();
  const existing = state.laps.find(
    l => l.participant_id === p.id && l.lap_number === r
  );

  if (existing) {
    if (confirm("Slette registrering?")) {
      await db.from("laps").delete().eq("id", existing.id);
    }
    return;
  }

  // LOCAL OPTIMISTIC UPDATE
  const start = new Date(state.race.start_time);
  const sec = Math.floor((now() - start) / 1000);

  const localLap = {
    id: "local-" + Math.random(),
    race_id: state.race.id,
    participant_id: p.id,
    lap_number: r,
    lap_seconds: sec
  };

  state.laps.push(localLap);
  draw();

  await db.from("laps").insert({
    race_id: state.race.id,
    participant_id: p.id,
    lap_number: r,
    lap_seconds: sec
  });
}


/* ------------------------ LIVE PAGE ------------------------ */

function drawLive() {
  const t = document.getElementById("liveTable");
  if (!t || !state.race) return;

  const map = {};
  state.participants.forEach(
    p => (map[p.id] = { ...p, laps: 0, time: 0, last: 0 })
  );

  state.laps.forEach(l => {
    const m = map[l.participant_id];
    if (!m) return;
    m.laps++;
    m.time += l.lap_seconds;
    m.last = l.lap_seconds;
  });

  const arr = Object.values(map);
  arr.sort((a, b) => b.laps - a.laps || a.time - b.time);

  let html =
    "<tr><th>#</th><th>Navn</th><th>Runder</th><th>Siste</th><th>Snitt</th><th>Total</th><th>Status</th></tr>";

  arr.forEach((r, i) => {
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${r.name}</td>
        <td>${r.laps}</td>
        <td>${fmt(r.last)}</td>
        <td>${fmt(r.laps ? r.time / r.laps : 0)}</td>
        <td>${fmt(r.time)}</td>
        <td>${r.status ?? "active"}</td>
      </tr>`;
  });

  t.innerHTML = html;

  const start = new Date(state.race.start_time || now());
  const elapsed = (now() - start) / 1000;

  document.getElementById("liveRound").innerText =
    "Klokke " +
    now().toLocaleTimeString() +
    "   Start " +
    start.toLocaleTimeString();

  document.getElementById("liveCountdown").innerText =
    "Påløpt " + fmt(elapsed) + "   Neste " + fmt(timeToNext());
}


/* ------------------------ ADMIN PAGE ------------------------ */

function drawAdmin() {
  const t = document.getElementById("adminTable");
  if (!t) return;
  if (!state.race) return;

  let rounds = Math.max(
    10,
    ...state.laps.map(l => l.lap_number || 0)
  );

  let html = "<tr><th>BIB</th><th>Navn</th>";

  for (let i = 1; i <= rounds; i++) html += `<th>${i}</th>`;

  html += "</tr>";

  state.participants.forEach(p => {
    html += `<tr>
      <td>${p.bib}</td>
      <td>${p.name}</td>`;

    for (let i = 1; i <= rounds; i++) {
      const lap = state.laps.find(
        l => l.participant_id == p.id && l.lap_number == i
      );
      html += `<td onclick="editLap(${p.id}, ${i})">${lap ? fmt(lap.lap_seconds) : ""}</td>`;
    }
    html += "</tr>";
  });

  t.innerHTML = html;
}

async function editLap(pid, round) {
  const v = prompt("mm:ss");
  if (!v) return;

  const [m, s] = v.split(":");
  const sec = parseInt(m) * 60 + parseInt(s);

  const existing = state.laps.find(
    l => l.participant_id === pid && l.lap_number === round
  );

  if (existing) {
    await db.from("laps").update({ lap_seconds: sec }).eq("id", existing.id);
  } else {
    await db.from("laps").insert({
      race_id: state.race.id,
      participant_id: pid,
      lap_number: round,
      lap_seconds: sec,
      manual: true
    });
  }
}

async function addParticipant() {
  const bib = prompt("BIB");
  const name = prompt("Navn");
  await db.from("participants").insert({ bib, name, status: "active" });
}

async function startRace() {
  const type = document.getElementById("raceType").value;
  const startLocal = document.getElementById("startTime").value;
  const startISO = new Date(startLocal).toISOString();
  const interval = parseInt(document.getElementById("interval").value) * 60;
  const dist = parseFloat(document.getElementById("distance").value);

  await db.from("race").upsert({
    id: 1,
    type,
    start_time: startISO,
    interval_seconds: interval,
    lap_distance_km: dist,
    running: true
  });
}

async function stopRace() {
  if (!confirm("Stoppe løpet?")) return;
  if (!confirm("Er du sikker?")) return;

  await db
    .from("race")
    .update({ running: false, finished: true })
    .eq("id", state.race.id);

  await db.from("race_log").insert({
    name: "Løp",
    start_time: state.race.start_time,
    end_time: new Date(),
    data: {
      participants: state.participants,
      laps: state.laps
    }
  });
}

async function resetRace() {
  if (!confirm("Reset?")) return;

  await db.from("laps").delete().neq("id", 0);
  await db.from("participants").delete().neq("id", 0);
  await db.from("race").delete().neq("id", 0);
}


/* ------------------------ LOG PAGE ------------------------ */

function drawLog() {
  const t = document.getElementById("logTable");
  if (!t) return;

  let html = "<tr><th>Start</th><th>Slutt</th><th></th></tr>";

  state.logs.forEach(l => {
    html += `
      <tr>
        <td>${new Date(l.start_time).toLocaleString()}</td>
        <td>${new Date(l.end_time).toLocaleString()}</td>
        <td><button onclick="loadLog(${l.id})">Last inn</button></td>
      </tr>`;
  });

  t.innerHTML = html;
}

function loadLog(id) {
  const l = state.logs.find(x => x.id == id);
  state.participants = l.data.participants;
  state.laps = l.data.laps;
  state.race.start_time = l.start_time;
  draw();
}


/******************************************************************************
 * REALTIME SUBSCRIPTIONS — MODERN (PATCH‑BASERT)
 ******************************************************************************/

// ---- RACE ----
db.channel("race_changes")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "race"
  }, payload => {
    if (payload.eventType === "DELETE") {
      state.race = null;
    } else {
      state.race = payload.new;
    }
    draw();
  })
  .subscribe();

// ---- PARTICIPANTS ----
db.channel("participants_changes")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "participants"
  }, payload => {
    if (payload.eventType === "INSERT") {
      state.participants.push(payload.new);
    }
    if (payload.eventType === "UPDATE") {
      const i = state.participants.findIndex(p => p.id === payload.new.id);
      if (i >= 0) state.participants[i] = payload.new;
    }
    if (payload.eventType === "DELETE") {
      state.participants = state.participants.filter(
        p => p.id !== payload.old.id
      );
    }
    draw();
  })
  .subscribe();

// ---- LAPS ----
db.channel("laps_changes")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "laps"
  }, payload => {
    if (payload.eventType === "INSERT") {
      state.laps.push(payload.new);
    }
    if (payload.eventType === "UPDATE") {
      const i = state.laps.findIndex(l => l.id === payload.new.id);
      if (i >= 0) state.laps[i] = payload.new;
    }
    if (payload.eventType === "DELETE") {
      state.laps = state.laps.filter(l => l.id !== payload.old.id);
    }
    draw();
  })
  .subscribe();

// ---- LOGS ----
db.channel("logs_changes")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "race_log"
  }, payload => {
    if (payload.eventType === "INSERT") state.logs.push(payload.new);
    if (payload.eventType === "UPDATE") {
      const i = state.logs.findIndex(l => l.id === payload.new.id);
      if (i >= 0) state.logs[i] = payload.new;
    }
    if (payload.eventType === "DELETE") {
      state.logs = state.logs.filter(l => l.id !== payload.old.id);
    }
    draw();
  })
  .subscribe();


/******************************************************************************
 * INITIAL LOAD + CLOCK TICK
 ******************************************************************************/

async function initialLoad() {
  const race = await db.from("race").select("*").limit(1);
  state.race = race.data?.[0] || null;

  const p = await db.from("participants").select("*");
  state.participants = p.data || [];

  const l = await db.from("laps").select("*");
  state.laps = l.data || [];

  const lg = await db.from("race_log").select("*");
  state.logs = lg.data || [];

  draw();
}

initialLoad();

// CLOCK ONLY — not full redraw
setInterval(() => {
  if (state.race) {
    document.getElementById("countdownHeader") &&
      (document.getElementById("countdownHeader").innerText = fmt(timeToNext()));
  }
}, 1000);


/******************************************************************************
 * WAKELOCK
 ******************************************************************************/

async function keepAwake() {
  try {
    await navigator.wakeLock.request("screen");
  } catch (e) {}
}
keepAwake();
