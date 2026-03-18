import { supabase } from './supabase-init.js';
const KEY = 'custom_workouts_v2';
const statusEl = document.getElementById('cloud-status');
const syncBtn  = document.getElementById('cloud-sync');
const authBtn  = document.getElementById('cloud-auth');
function setStatus(text, ok=false){ if(!statusEl) return; statusEl.textContent = `Sky: ${text}`; statusEl.style.border = ok? '1px solid #16a34a':'1px solid #dc2626'; }
async function getSession(){ const { data:{ session } } = await supabase.auth.getSession(); return session; }
async function signIn(){ const email = prompt('E-post (magic link):'); if(!email) return; const { error } = await supabase.auth.signInWithOtp({ email }); if(error) alert(error.message); else alert('Sjekk e-posten og følg lenken.'); }
async function pullTemplates(){ const sess = await getSession(); if(!sess){ setStatus('offline'); return; } setStatus('henter…'); const { data, error } = await supabase.from('workout_templates').select('*').order('sort_index',{ascending:true}).order('created_at',{ascending:true}); if(error){ console.warn(error); setStatus('feil'); return; } const arr = (data??[]).map(row=>({ name: row.name??'Økt', desc: row.desc??'', warmupSec: row.warmup_sec??0, cooldownSec: row.cooldown_sec??0, series: row.series??[] })); localStorage.setItem(KEY, JSON.stringify(arr)); setStatus('online', true); window.dispatchEvent(new CustomEvent('cloud-synced')); }
async function pushTemplates(){ const sess = await getSession(); if(!sess){ setStatus('offline'); return; } const user_id = sess.user.id; const arr = JSON.parse(localStorage.getItem(KEY) || '[]'); await supabase.from('workout_templates').delete().neq('id','00000000-0000-0000-000000000000'); const payload = arr.map((w,i)=>({ user_id, name:w.name??'Økt', desc:w.desc??'', warmup_sec:w.warmupSec??0, cooldown_sec:w.cooldownSec??0, series:w.series??[], sort_index:i })); const { error } = await supabase.from('workout_templates').insert(payload); if(error){ console.warn(error); setStatus('feil'); return; } setStatus('online', true); }
async function bootstrap(){ const sess = await getSession(); setStatus(sess? 'online':'offline', !!sess); supabase.auth.onAuthStateChange((_e,s)=> setStatus(s? 'online':'offline', !!s)); }
if (authBtn) authBtn.onclick = signIn;
if (syncBtn)  syncBtn.onclick  = async () => { await pushTemplates().catch(console.warn); await pullTemplates().catch(console.warn); };
window.cloudSync = { bootstrap, pullTemplates, pushTemplates };
