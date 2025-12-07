
/* ===== timer ===== */
class CountdownTimer {
  constructor(onTick, onFinished) {
    this.onTick = onTick;
    this.onFinished = onFinished;
    this.target = null;
    this._raf = null;
    this.remainingMs = 0;
    this.paused = false;
  }
  start(seconds) {
    const now = Date.now();
    this.target = now + seconds * 1000;
    this.paused = false;
    this._loop();
  }
  _loop = () => {
    if (this.paused || !this.target) return;
    const now = Date.now();
    this.remainingMs = Math.max(0, this.target - now);
    if (this.onTick) this.onTick(this.remainingMs);
    if (this.remainingMs <= 0) {
      this.stop();
      if (this.onFinished) this.onFinished();
      return;
    }
    this._raf = setTimeout(this._loop, 250);
  }
  pause() {
    if (this.paused || !this.target) return;
    this.paused = true;
    if (this._raf) clearTimeout(this._raf);
    this._raf = null;
  }
  resume() {
    if (!this.paused || !this.target) return;
    this.paused = false;
    this.target = Date.now() + this.remainingMs;
    this._loop();
  }
  stop() {
    if (this._raf) clearTimeout(this._raf);
    this._raf = null;
    this.target = null;
    this.paused = false;
    this.remainingMs = 0;
  }
}
function formatMMSS(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ===== state ===== */
const SessionPhase = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE_EXERCISE',
  REST: 'REST',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  STOPPED: 'STOPPED',
};
class SessionState {
  constructor(workout) {
    this.workout = workout;
    this.exerciseIndex = 0;
    this.phase = SessionPhase.IDLE;
    this.startedAt = null; // ISO (UTC via Date.toISOString())
    this.endedAt = null;
    this.exercisesLog = []; // {name, planned_seconds, actual_seconds, started_at, ended_at}
    this.currentPhaseStartedAt = null;
    this.currentPhaseEndedAt = null;
  }
  _nowISO() { return new Date().toISOString(); }
  start() {
    this.startedAt = this._nowISO();
    this.exerciseIndex = 0;
    this.phase = SessionPhase.ACTIVE;
    this.currentPhaseStartedAt = this._nowISO();
  }
  pause() {
    if (this.phase === SessionPhase.ACTIVE || this.phase === SessionPhase.REST) {
      this.phase = SessionPhase.PAUSED;
    }
  }
  resume(prevPhase) {
    if (this.phase === SessionPhase.PAUSED) {
      this.phase = prevPhase;
    }
  }
  nextPhase() {
    if (this.phase === SessionPhase.ACTIVE) {
      const ex = this.workout.exercises[this.exerciseIndex];
      this.currentPhaseEndedAt = this._nowISO();
      this.exercisesLog.push({
        name: ex.name,
        planned_seconds: ex.duration_seconds,
        started_at: this.currentPhaseStartedAt,
        ended_at: this.currentPhaseEndedAt,
      });
      if (this.exerciseIndex < this.workout.exercises.length - 1) {
        this.phase = SessionPhase.REST;
        this.currentPhaseStartedAt = this._nowISO();
      } else {
        this.phase = SessionPhase.COMPLETED;
        this.endedAt = this._nowISO();
      }
    } else if (this.phase === SessionPhase.REST) {
      this.currentPhaseEndedAt = this._nowISO();
      this.exerciseIndex += 1;
      this.phase = SessionPhase.ACTIVE;
      this.currentPhaseStartedAt = this._nowISO();
    }
  }
  stop() {
    if (this.phase === SessionPhase.ACTIVE) {
      const ex = this.workout.exercises[this.exerciseIndex];
      this.exercisesLog.push({
        name: ex.name,
        planned_seconds: ex.duration_seconds,
        started_at: this.currentPhaseStartedAt,
        ended_at: new Date().toISOString(),
      });
    }
    this.phase = SessionPhase.STOPPED;
    this.endedAt = this._nowISO();
  }
}

/* ===== storage (IndexedDB + fallback localStorage) ===== */
const DB_NAME = 'desk_microflows';
const DB_VERSION = 1;
const STORE = 'sessions';
async function openDb() {
  if (!('indexedDB' in window)) {
    console.warn('IndexedDB ikke tilgjengelig – bruker localStorage.');
    return null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'session_id' });
        store.createIndex('by_date', 'date', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function addSession(db, session) {
  if (!db) {
    const key = `session:${session.session_id}`;
    localStorage.setItem(key, JSON.stringify(session));
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getSessionsByDate(db, dateStr) {
  if (!db) {
    const sessions = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('session:')) {
        const v = localStorage.getItem(k);
        if (!v) continue;
        try {
          const obj = JSON.parse(v);
          if (obj.date === dateStr) sessions.push(obj);
        } catch {}
      }
    }
    return sessions;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const idx = store.index('by_date');
    const req = idx.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ===== TCX generator ===== */
function dayStartUtcId(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const localMidnight = new Date(y, m-1, d, 0, 0, 0);
  const utcIso = new Date(localMidnight.getTime() - localMidnight.getTimezoneOffset()*60000)
                    .toISOString().replace('.000','');
  return utcIso;
}
function escapeXml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}
function generateTCXForDay(dateStr, sessions) {
  const sorted = [...sessions].sort((a,b) => new Date(a.started_at) - new Date(b.started_at));
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n`;
  xml += `  <Activities>\n`;
  xml += `    <Activity Sport="Other">\n`;
  xml += `      <Id>${dayStartUtcId(dateStr)}</Id>\n`;
  for (const s of sorted) {
    const startIso = s.started_at.replace('.000','');
    const endIso = s.ended_at.replace('.000','');
    const totalSec = Math.max(1, Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 1000));
    xml += `      <Lap StartTime="${startIso}">\n`;
    xml += `        <TotalTimeSeconds>${totalSec}</TotalTimeSeconds>\n`;
    xml += `        <Intensity>Active</Intensity>\n`;
    xml += `        <TriggerMethod>Manual</TriggerMethod>\n`;
    xml += `        <Track>\n`;
    const startMs = new Date(s.started_at).getTime();
    const endMs = new Date(s.ended_at).getTime();
    for (let t = startMs; t <= endMs; t += 1000) {
      const isoUtc = new Date(t).toISOString().replace('.000','');
      xml += `          <Trackpoint><Time>${isoUtc}</Time></Trackpoint>\n`;
    }
    const notes = `${s.workout_name} (${s.exercises?.length ?? 0} øvelser)`;
    xml += `        </Track>\n`;
    xml += `        <Notes>${escapeXml(notes)}</Notes>\n`;
    xml += `      </Lap>\n`;
  }
  xml += `    </Activity>\n`;
  xml += `  </Activities>\n`;
  xml += `</TrainingCenterDatabase>\n`;
  return xml;
}
function downloadTCX(dateStr, xml) {
  const blob = new Blob([xml], {type: 'application/vnd.garmin.tcx+xml'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `microdesk_${dateStr}.tcx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ===== Innebygde workouts (failsafe) ===== */
const BUILTIN_WORKOUTS = [
  {
    id: "nakke_5min_v1",
    name: "Nakke og skuldre (5 min)",
    default_rest_seconds: 10,
    exercises: [
      { name: "Nakkestrekk frem/tilbake", duration_seconds: 45 },
      { name: "Skulderrulling", duration_seconds: 45 },
      { name: "Nakkeside til side", duration_seconds: 45 },
      { name: "Håndleddssirkler", duration_seconds: 45 },
      { name: "Sitt-til-stå", duration_seconds: 30 }
    ]
  },
  {
    id: "skuldre_4min_v1",
    name: "Skuldre mobilitet (4 min)",
    default_rest_seconds: 10,
    exercises: [
      { name: "Skuldertrekk", duration_seconds: 40 },
      { name: "Armsirkler", duration_seconds: 40 },
      { name: "Scapula retraksjon", duration_seconds: 40 },
      { name: "Nakkerulling", duration_seconds: 40 }
    ]
  },
  {
    id: "handledd_3min_v1",
    name: "Håndledd (3 min)",
    default_rest_seconds: 10,
    exercises: [
      { name: "Fleksjon/ekstensjon", duration_seconds: 30 },
      { name: "Pronasjons-/supinasjon", duration_seconds: 30 },
      { name: "Fingerstrekk", duration_seconds: 30 }
    ]
  },
  {
    id: "core_4min_v1",
    name: "Core ved pult (4 min)",
    default_rest_seconds: 10,
    exercises: [
      { name: "Sittende kneløft", duration_seconds: 40 },
      { name: "Isometrisk magepress", duration_seconds: 40 },
      { name: "Sittende rotasjoner", duration_seconds: 40 },
      { name: "Sittende tåhev", duration_seconds: 40 }
    ]
  }
];

/* ===== App (main) ===== */
let DB = null;
let WORKOUTS = BUILTIN_WORKOUTS.slice(); // kun innebygd, ingen fetch
let CURRENT_SESSION = null;
let TIMER = null;
let PREV_PHASE_BEFORE_PAUSE = null;

const els = {
  viewStart: document.getElementById('view-start'),
  viewSession: document.getElementById('view-session'),
  workoutSelect: document.getElementById('workout-select'),
  btnStart: document.getElementById('btn-start'),
  todayLogList: document.getElementById('today-log-list'),
  navHome: document.getElementById('nav-home'),
  navLog: document.getElementById('nav-log'),
  navExport: document.getElementById('nav-export'),
  sessionWorkoutName: document.getElementById('session-workout-name'),
  sessionPhase: document.getElementById('session-phase'),
  sessionProgress: document.getElementById('session-progress'),
  timerLabel: document.getElementById('timer-label'),
  timerValue: document.getElementById('timer-value'),
  exerciseList: document.getElementById('exercise-list'),
  btnPause: document.getElementById('btn-pause'),
  btnStop: document.getElementById('btn-stop'),
};

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function isShowing(view) {
  return view === 'start' ? !els.viewStart.classList.contains('hidden')
                          : !els.viewSession.classList.contains('hidden');
}
function showView(view) {
  if (view === 'start') {
    els.viewStart.classList.remove('hidden');
    els.viewSession.classList.add('hidden');
  } else {
    els.viewStart.classList.add('hidden');
    els.viewSession.classList.remove('hidden');
  }
}
function scrollToLog() { els.todayLogList.scrollIntoView({behavior: 'smooth'}); }

function populateWorkoutSelect() {
  els.workoutSelect.innerHTML = '';
  for (const w of WORKOUTS) {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name;
    els.workoutSelect.appendChild(opt);
  }
}

async function refreshTodayLog() {
  const today = getTodayStr();
  const sessions = await getSessionsByDate(DB, today);
  els.todayLogList.innerHTML = '';
  if (!sessions.length) {
    const li = document.createElement('li');
    li.textContent = 'Ingen økter registrert i dag.';
    els.todayLogList.appendChild(li);
    return;
  }
  for (const s of sessions.sort((a,b) => new Date(a.started_at)-new Date(b.started_at))) {
    const li = document.createElement('li');
    const status = s.status === 'completed' ? 'fullført' : 'stoppet';
    li.textContent = `[${new Date(s.started_at).toLocaleTimeString()}] ${s.workout_name} – ${status}, ${s.exercises.length} øvelser`;
    els.todayLogList.appendChild(li);
  }
}

function findWorkoutById(id) { return WORKOUTS.find(w => w.id === id); }

function renderExercisesList(workout, activeIndex) {
  els.exerciseList.innerHTML = '';
  workout.exercises.forEach((ex, i) => {
    const li = document.createElement('li');
    li.textContent = `${ex.name} — ${ex.duration_seconds}s`;
    if (i < activeIndex) li.classList.add('done');
    else if (i === activeIndex) li.classList.add('active');
    els.exerciseList.appendChild(li);
    if (i < workout.exercises.length-1) {
      const restLi = document.createElement('li');
      restLi.textContent = `Hvile — ${workout.default_rest_seconds ?? 10}s`;
      restLi.classList.add('rest');
      els.exerciseList.appendChild(restLi);
    }
  });
}

function updateSessionHeader(workout, session) {
  els.sessionWorkoutName.textContent = workout.name;
  els.sessionProgress.textContent = `${Math.min(session.exerciseIndex+1, workout.exercises.length)}/${workout.exercises.length}`;
  const phaseLabel = session.phase === SessionPhase.ACTIVE ? 'Øvelse'
                     : session.phase === SessionPhase.REST ? 'Hvile (10s)'
                     : session.phase === SessionPhase.PAUSED ? 'Pause'
                     : session.phase === SessionPhase.COMPLETED ? 'Fullført'
                     : session.phase === SessionPhase.STOPPED ? 'Stoppet'
                     : 'Klar';
  els.sessionPhase.textContent = phaseLabel;
  els.timerLabel.textContent = phaseLabel === 'Hvile (10s)' ? 'Hvile igjen' : 'Tid igjen';
}

function startSession() {
  const workoutId = els.workoutSelect.value;
  const workout = findWorkoutById(workoutId);
  if (!workout) { alert('Velg en treningsøkt først.'); return; }
  CURRENT_SESSION = new SessionState(workout);
  CURRENT_SESSION.start();
  showView('session');
  renderExercisesList(workout, CURRENT_SESSION.exerciseIndex);
  updateSessionHeader(workout, CURRENT_SESSION);
  TIMER?.stop();
  TIMER = new CountdownTimer(onTick, onFinished);
  TIMER.start(workout.exercises[CURRENT_SESSION.exerciseIndex].duration_seconds);
}

function onTick(ms) { els.timerValue.textContent = formatMMSS(ms); }

function onFinished() {
  const w = CURRENT_SESSION.workout;
  CURRENT_SESSION.nextPhase();
  updateSessionHeader(w, CURRENT_SESSION);
  renderExercisesList(w, CURRENT_SESSION.exerciseIndex);
  if (CURRENT_SESSION.phase === SessionPhase.REST) {
    TIMER.start(w.default_rest_seconds ?? 10);
  } else if (CURRENT_SESSION.phase === SessionPhase.ACTIVE) {
    TIMER.start(w.exercises[CURRENT_SESSION.exerciseIndex].duration_seconds);
  } else if (CURRENT_SESSION.phase === SessionPhase.COMPLETED) {
    finalizeAndSaveSession('completed');
  }
}

function togglePause() {
  if (!CURRENT_SESSION) return;
  if (CURRENT_SESSION.phase === SessionPhase.PAUSED) {
    CURRENT_SESSION.resume(PREV_PHASE_BEFORE_PAUSE);
    TIMER.resume();
  } else if (CURRENT_SESSION.phase === SessionPhase.ACTIVE || CURRENT_SESSION.phase === SessionPhase.REST) {
    PREV_PHASE_BEFORE_PAUSE = CURRENT_SESSION.phase;
    CURRENT_SESSION.pause();
    TIMER.pause();
  }
  updateSessionHeader(CURRENT_SESSION.workout, CURRENT_SESSION);
}

function stopSession() {
  if (!CURRENT_SESSION) return;
  CURRENT_SESSION.stop();
  TIMER?.stop();
  finalizeAndSaveSession('stopped');
}

function skipToNext() {
  if (!CURRENT_SESSION) return;
  TIMER?.stop();
  onFinished();
}

async function finalizeAndSaveSession(status) {
  for (const item of CURRENT_SESSION.exercisesLog) {
    const secs = Math.max(1, Math.round((new Date(item.ended_at) - new Date(item.started_at)) / 1000));
    item.actual_seconds = secs;
  }
  const sessionObj = {
    session_id: (crypto?.randomUUID && crypto.randomUUID()) || String(Date.now()),
    date: getTodayStr(),
    started_at: CURRENT_SESSION.startedAt,
    ended_at: CURRENT_SESSION.endedAt || new Date().toISOString(),
    status,
    workout_id: CURRENT_SESSION.workout.id,
    workout_name: CURRENT_SESSION.workout.name,
    exercises: CURRENT_SESSION.exercisesLog,
  };
  await addSession(DB, sessionObj);
  CURRENT_SESSION = null;
  await refreshTodayLog();
  showView('start');
}

async function onExportDay() {
  const dateStr = getTodayStr();
  const sessions = await getSessionsByDate(DB, dateStr);
  if (!sessions.length) { alert('Ingen økter i dag.'); return; }
  const xml = generateTCXForDay(dateStr, sessions);
  downloadTCX(dateStr, xml);
}

async function init() {
  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }
  DB = await openDb();
  populateWorkoutSelect();
  await refreshTodayLog();

  els.navHome.addEventListener('click', () => showView('start'));
  els.navLog.addEventListener('click', () => { showView('start'); scrollToLog(); });
  els.navExport.addEventListener('click', onExportDay);

  els.btnStart.addEventListener('click', startSession);
  els.btnPause.addEventListener('click', togglePause);
  els.btnStop.addEventListener('click', stopSession);

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key?.toLowerCase() === 's') { e.preventDefault(); stopSession(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (isShowing('start')) startSession(); }
    else if (e.key?.toLowerCase() === 'n') { e.preventDefault(); if (CURRENT_SESSION) skipToNext(); }
  });
}

document.addEventListener('DOMContentLoaded', init);
