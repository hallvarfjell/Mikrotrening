import { supabase } from './supabase-init.js';
import { sessionToTCX } from './tcx.js';
const KEY = 'custom_workouts_v2';
const SESS = 'sessions';
const statusEl = document.getElementById('cloud-status');
const syncBtn  = document.getElementById('cloud-sync');
const authBtn  = document.getElementById('cloud-auth');
function setStatus(text, ok=false){ if(!statusEl) return; statusEl.textContent = `Sky: ${text}`; statusEl.style.border = ok? '1px solid #29a329':'1px solid #c33'; }
async function getSession(){ const { data:{ session } } = await supabase.auth.getSession(); return session; }
async function bootstrap(){ const sess = await getSession(); setStatus(sess? 'online':'offline', !!sess); supabase.auth.onAuthStateChange((_e,s)=> setStatus(s? 'online':'offline', !!s)); }
async function pullSessions(){ const sess = await getSession(); if(!sess){ setStatus('offline'); return; } setStatus('henter…'); const { data, error } = await supabase.from('workouts').select('client_id, name, started_at, reps, lt1, lt2, mass_kg').order('started_at',{ascending:false}); if(error){ console.warn(error); setStatus('feil'); return; } const local = JSON.parse(localStorage.getItem(SESS) || '[]'); const byId = new Map(local.map(x=>[x.id, x])); (data||[]).forEach(row=>{ if(!byId.has(row.client_id)){ byId.set(row.client_id, { id: row.client_id, name: row.name || 'Økt', startedAt: row.started_at, endedAt: row.started_at, reps: row.reps || 0, lt1: row.lt1 ?? null, lt2: row.lt2 ?? null, massKg: row.mass_kg ?? null, points: [] }); }}); const merged = Array.from(byId.values()); localStorage.setItem(SESS, JSON.stringify(merged)); setStatus('online', true); window.dispatchEvent(new CustomEvent('cloud-synced')); }
async function pushNewSession(session){ const sess = await getSession(); if(!sess) return; const user_id = sess.user.id; setStatus('laster opp…'); const tcx = sessionToTCX(session); const tcxBlob = new Blob([tcx], { type: 'application/vnd.garmin.tcx+xml' }); const tcxPath = `${user_id}/${session.id}.tcx`; const { error: upErr } = await supabase.storage.from('sessions').upload(tcxPath, tcxBlob, { upsert:true }); if(upErr){ console.warn(upErr); setStatus('feil'); return; } const pts = Array.isArray(session.points)? session.points: []; let ghost=null; if(pts.length){ const t0=pts[0].ts, tN=pts[pts.length-1].ts; const dur = Math.max(0, Math.round((tN - t0)/1000)); const hr = new Array(dur+1).fill(null); const w  = new Array(dur+1).fill(null); let idx=0; for(let sec=0; sec<=dur; sec++){ const target=t0+sec*1000; while(idx+1<pts.length && pts[idx+1].ts<=target) idx++; const p=pts[idx]; hr[sec]=Math.max(0, Math.round(p.hr ?? 0)); w[sec]=Math.max(0, Math.round(p.watt ?? 0)); } ghost = { dur, hr, w };
 }
 const duration_sec = Math.max(1, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())/1000));
 const distance_m   = Number(session.points?.at(-1)?.dist_m ?? 0);
 const elev_gain_m  = Number(session.metrics?.elevGainM ?? 0);
 const tss          = Number(session.metrics?.tss ?? 0);
 const payload = {
   user_id,
   client_id: session.id,
   name: session.name || 'Økt',
   started_at: session.startedAt,
   ended_at: session.endedAt,
   duration_sec,
   reps: Number(session.reps || 0),
   lt1: Number(session.lt1 || null),
   lt2: Number(session.lt2 || null),
   mass_kg: Number(session.massKg || null),
   distance_m, elev_gain_m, tss,
   ghost_summary: ghost,
   tcx_path: `sessions/${tcxPath}`
 };
 const { error: upsertErr } = await supabase.from('workouts').upsert(payload, { onConflict: 'user_id,client_id' });
 if(upsertErr){ console.warn(upsertErr); setStatus('feil'); return; }
 setStatus('online', true);
}
async function deleteSession(client_id){ const sess = await getSession(); if(!sess) return; const user_id = sess.user.id; const { data, error: selErr } = await supabase.from('workouts').select('tcx_path').eq('user_id', user_id).eq('client_id', client_id).maybeSingle(); if(selErr){ console.warn(selErr); } await supabase.from('workouts').delete().match({ user_id, client_id }); const path = data?.tcx_path?.replace('sessions/', '') || `${user_id}/${client_id}.tcx`; await supabase.storage.from('sessions').remove([path]).catch(()=>{}); }
if (authBtn) authBtn.onclick = async ()=>{ const email=prompt('E-post for innlogging (magic link):'); if(!email) return; const { error } = await supabase.auth.signInWithOtp({ email }); if(error) alert(error.message); else alert('Sjekk e-posten din for innloggingslenke.'); };
if (syncBtn) syncBtn.onclick = async ()=>{ await pullSessions().catch(console.warn); window.dispatchEvent(new CustomEvent('cloud-synced')); };
window.cloudSessions = { bootstrap, pullSessions, pushNewSession, deleteSession };
