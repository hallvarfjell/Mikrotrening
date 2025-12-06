
import { CountdownTimer, formatMMSS } from './timer.js';
import { SessionState, SessionPhase } from './state.js';
import { openDb, addSession, getSessionsByDate } from './storage.js';
import { generateTCXForDay, downloadTCX } from './tcx.js';

let DB = null;
let WORKOUTS = [];
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

async function init() {
  // PWA service worker
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js'); } catch {}
  }

  DB = await openDb();
  await loadWorkouts();
  populateWorkoutSelect();
  await refreshTodayLog();

  // Nav
  els.navHome.addEventListener('click', () => showView('start'));
  els.navLog.addEventListener('click', () => { showView('start'); scrollToLog(); });
  els.navExport.addEventListener('click', onExportDay);

  // Start session
  els.btnStart.addEventListener('click', startSession);
  els.btnPause.addEventListener('click', togglePause);
  els.btnStop.addEventListener('click', stopSession);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key.toLowerCase() === 's') { e.preventDefault(); stopSession(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (isShowing('start')) startSession(); }
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); if (CURRENT_SESSION) skipToNext(); }
  });
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

function scrollToLog() {
  els.todayLogList.scrollIntoView({behavior: 'smooth'});
}

async function loadWorkouts() {
  const names = ['nakke_5min','skuldre_4min','handledd_3min','core_4min'];
  WORKOUTS = [];
  for (const n of names) {
    const res = await fetch(`./data/workouts/${n}.json`);
    const j = await res.json();
    WORKOUTS.push(j);
  }
}

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

function findWorkoutById(id) {
  return WORKOUTS.find(w => w.id === id);
}

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
  els.sessionProgress.textContent = `${session.exerciseIndex+1}/${workout.exercises.length}`;
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
  if (!workout) return;

  CURRENT_SESSION = new SessionState(workout);
  CURRENT_SESSION.start();

  showView('session');
  renderExercisesList(workout, CURRENT_SESSION.exerciseIndex);
  updateSessionHeader(workout, CURRENT_SESSION);

  // Start timer for første øvelse
  TIMER?.stop();
  TIMER = new CountdownTimer(onTick, onFinished);
  TIMER.start(workout.exercises[CURRENT_SESSION.exerciseIndex].duration_seconds);
}

function onTick(ms) {
  els.timerValue.textContent = formatMMSS(ms);
}

function onFinished() {
  // Avslutt gjeldende fase og gå videre
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
  // Valgfritt: hopp til neste fase
  TIMER?.stop();
  onFinished();
}

async function finalizeAndSaveSession(status) {
  // Kalkuler actual_seconds for hver øvelse basert på tidsstempler
  for (const item of CURRENT_SESSION.exercisesLog) {
    const secs = Math.max(1, Math.round((new Date(item.ended_at) - new Date(item.started_at)) / 1000));
    item.actual_seconds = secs;
  }

  const sessionObj = {
    session_id: crypto.randomUUID(),
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
  if (!sessions.length) {
    alert('Ingen økter i dag.');
    return;
  }
  const xml = generateTCXForDay(dateStr, sessions);
  downloadTCX(dateStr, xml);
}

init();
