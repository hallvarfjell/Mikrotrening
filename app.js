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

function sortRegistrationGrid(items) {
  const rank = p => {
    if (p.uiState === "green") return 1;
    if (p.uiState === "red")   return 2;
    if (p.uiState === "white") return 3;
    if (p.uiState === "gray")  return 4;
    return 5;
  };
  return items.sort((a, b) => rank(a) - rank(b));
}


/******************************************************************************
 * PAGE NAVIGATION
 ******************************************************************************/

function showPage(id) {
  document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}


/******************************************************************************
 * CORE TIME LOGIC
 ******************************************************************************/

function getInterval(round) {
  const r = state.race;
  if (!r) return 3600;
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
  if (now() < start) return (start - now()) / 1000;

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
 * RENDERING
 ******************************************************************************/

function draw() {
  drawRegister();
  drawLive();
  drawAdmin();
  drawLog();
}


/******************************************************************************
 * REGISTER PAGE
 ******************************************************************************/

function drawRegister() {
  const grid = document.getElementById("runnerGrid");
  if (!grid || !state.race) return;

  const r = currentRound();
  const start = new Date(state.race.start_time || now());
  const beforeStart = now() < start;
  const remaining = timeToNext();
  const cutoff = remaining <= 0;

  const participantsView = state.participants.map(p => {
    const lap = state.laps.find(
      l => l.participant_id === p.id && l.lap_number === r
    );

    let uiState = "white";

    if (beforeStart) {
      uiState = "white";
    } else if (p.status === "dnf") {
      uiState = "gray";
    } else if (lap) {
      uiState = "green";
    } else if (cutoff) {
      uiState = "red";
    } else {
      uiState = "white";
    }

    return { ...p, uiState };
  });

  const sorted = sortRegistrationGrid(participantsView);
  grid.innerHTML = "";

  sorted.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "runner " + p.uiState;

    const rLap = state.laps.find(
      l => l.participant_id === p.id && l.lap_number === r
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
 * PRESS HANDLING
 ******************************************************************************/

async function press(p, uiState) {
  const r = currentRound();
  const start = new Date(state.race.start_time);
  const existing = state.laps.find(
    l => l.participant_id === p.id && l.lap_number === r
  );

  const cutoff = timeToNext() <= 0;

  // -----------------------------
  // CASE 1 — GREEN → click again → remove
  // -----------------------------
  if (existing) {
    if (confirm("Slette registrering?")) {
      await db.from("laps").delete().eq("id", existing.id);
    }
    return;
  }

  // -----------------------------
  // CASE 2 — RED (timed out) → mark DNF
  // -----------------------------
  if (uiState === "red" && cutoff) {
    const lastRound = r - 1;
    const lastLap = state.laps.find(
      l => l.participant_id === p.id && l.lap_number === lastRound
    );

    const sec = lastLap ? lastLap.lap_seconds : null;

    // Set DNF
    await db.from("participants").update({ status: "dnf" }).eq("id", p.id);
    return;
  }

  // -----------------------------
  // CASE 3 — NORMAL registration
  // -----------------------------
  const sec = Math.floor((now() - start) / 1000);

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

function drawLive() {
  const box = document.getElementById("liveTable");
  if (!box || !state.race) return;

  const r = currentRound();
  const start = new Date(state.race.start_time);
  const elapsed = (now() - start) / 1000;

  // HEADER PANEL
  document.getElementById("liveRound").innerHTML =
    `Klokke ${now().toLocaleTimeString()} — Runde ${r}`;
  document.getElementById("liveCountdown").innerHTML =
    `Påløpt ${fmt(elapsed)} — Neste start om ${fmt(timeToNext())}`;

  // BUILD RESULT TABLE
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
  arr.sort((a, b) => b.rounds - a.rounds || a.total - b.total);

  let html =
    "<tr><th>#</th><th>Navn</th><th>Runder</th><th>Siste</th><th>Totaltid</th><th>Status</th></tr>";

  arr.forEach((r, i) => {
    html += `
      <tr>
        <td>${i + 1}</td>
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

function drawAdmin() {
  const t = document.getElementById("adminTable");
  if (!t || !state.race) return;

  const rounds = Math.max(
    1,
    ...state.laps.map(l => l.lap_number || 0)
  );

  let html = "<tr><th>BIB</th><th>Navn</th>";
  for (let i = 1; i <= rounds; i++) html += `<th>${i}</th>`;
  html += "</tr>";

  state.participants.forEach(p => {
    html += `<tr><td>${p.bib}</td><td>${p.name}</td>`;
    for (let i = 1; i <= rounds; i++) {
      const lap = state.laps.find(
        l => l.participant_id == p.id && l.lap_number == i
      );
      html += `<td>${lap ? fmt(lap.lap_seconds) : ""}</td>`;
    }
    html += "</tr>";
  });

  t.innerHTML = html;

  // COUNTDOWN
  const info = document.getElementById("adminCountdown");
  if (!info) return;

  const start = new Date(state.race.start_time);
  const diff = start - now();

  if (diff > 0) {
    info.innerText = "Starter om: " + fmt(diff / 1000);
  } else {
    info.innerText = "Løpet er i gang!";
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
  await db.from("race").update({ running: false }).eq("id", state.race.id);
}

async function resetRace() {
  if (!confirm("Slette alt?")) return;

  await db.from("laps").delete().neq("id", 0);
  await db.from("participants").delete().neq("id", 0);
  await db.from("race").delete().neq("id", 0);
}


/******************************************************************************
 * LOG PAGE
 ******************************************************************************/

function drawLog() {
  const t = document.getElementById("logTable");
  if (!t) return;

  let html = "<tr><th>Start</th><th>Slutt</th></tr>";

  state.logs.forEach(l => {
    html += `
      <tr>
        <td>${new Date(l.start_time).toLocaleString()}</td>
        <td>${new Date(l.end_time).toLocaleString()}</td>
      </tr>`;
  });

  t.innerHTML = html;
}


/******************************************************************************
 * REALTIME LISTENERS (PATCH‑BASED)
 ******************************************************************************/

db.channel("race_changes")
  .on("postgres_changes", { schema: "public", table: "race" }, payload => {
    state.race = payload.new || null;
    draw();
  })
  .subscribe();

db.channel("participants_changes")
  .on("postgres_changes", { schema: "public", table: "participants" }, payload => {
    if (payload.eventType === "INSERT") {
      state.participants.push(payload.new);
    }
    if (payload.eventType === "UPDATE") {
      const i = state.participants.findIndex(p => p.id === payload.new.id);
      if (i >= 0) state.participants[i] = payload.new;
    }
    if (payload.eventType === "DELETE") {
      state.participants = state.participants.filter(p => p.id !== payload.old.id);
    }
    draw();
  })
  .subscribe();

db.channel("laps_changes")
  .on("postgres_changes", { schema: "public", table: "laps" }, payload => {
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


/******************************************************************************
 * INITIAL LOAD + CLOCK TICK
 ******************************************************************************/

async function initialLoad() {
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

setInterval(() => {
  if (state.race) drawRegister();
}, 1000);


/******************************************************************************
 * WAKELOCK
 ******************************************************************************/

async function keepAwake() {
  try {
    await navigator.wakeLock.request("screen");
  } catch {}
}
keepAwake();
