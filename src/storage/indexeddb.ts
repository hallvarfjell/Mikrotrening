// Minimal IndexedDB wrapper for sessions per day
export async function openDb(): Promise<IDBDatabase> {
return new Promise((resolve, reject) => {
const req = indexedDB.open('mikrotrening-db', 1);
req.onupgradeneeded = () => {
const db = req.result;
if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
};
req.onsuccess = () => resolve(req.result);
req.onerror = () => reject(req.error);
});
}


export async function saveSession(session: any) {
const db = await openDb();
return new Promise((res, rej) => {
const tx = db.transaction('sessions', 'readwrite');
const store = tx.objectStore('sessions');
store.put(session);
tx.oncomplete = () => res(true);
tx.onerror = () => rej(tx.error);
});
}


export async function listSessions() {
const db = await openDb();
return new Promise<any[]>((res, rej) => {
const tx = db.transaction('sessions', 'readonly');
const store = tx.objectStore('sessions');
const req = store.getAll();
req.onsuccess = () => res(req.result || []);
req.onerror = () => rej(req.error);
});
}
