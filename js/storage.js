
// Enkel IndexedDB-wrapper for sessions.
// Faller tilbake til localStorage hvis IndexedDB ikke er tilgjengelig.
const DB_NAME = 'desk_microflows';
const DB_VERSION = 1;
const STORE = 'sessions';

export async function openDb() {
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

export async function addSession(db, session) {
  // session: {session_id, date, started_at, ended_at, status, workout_id, workout_name, exercises: [...]}
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

export async function getSessionsByDate(db, dateStr) {
  if (!db) {
    // Hent alle localStorage sessions, filtrer på date
    const sessions = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('session:')) {
        const v = localStorage.getItem(k);
        if (!v) continue;
        try {
          const obj = JSON.parse(v);
          if (obj.date === dateStr) sessions.push(obj);
        } catch { /* ignore */ }
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
