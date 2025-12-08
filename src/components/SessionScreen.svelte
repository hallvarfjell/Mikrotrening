<script lang="ts">
import { onMount, createEventDispatcher } from 'svelte';
import type { Writable } from 'svelte/store';
import { Timer } from '../core/timer';
import { StateMachine } from '../core/state';


export let currentSession: Writable<any>;
const dispatch = createEventDispatcher();


let session: any;
let timer: Timer;
let state: StateMachine;
let timeDisplay = '00:00';


$: if (currentSession) {
currentSession.subscribe((v) => session = v);
}


function updateDisplay(ms: number) {
const s = Math.max(0, Math.ceil(ms/1000));
const mm = Math.floor(s/60).toString().padStart(2,'0');
const ss = (s%60).toString().padStart(2,'0');
timeDisplay = `${mm}:${ss}`;
}


function start() {
if (!timer) {
timer = new Timer(60000, (remaining) => updateDisplay(remaining));
timer.start();
} else {
timer.resume();
}
}


function pause() { timer?.pause(); }
function stop() { timer?.stop(); dispatch('done'); }


onMount(() => {
const onKey = (e: KeyboardEvent) => {
if (e.code === 'Space') { e.preventDefault(); timer?.toggle(); }
if (e.key.toLowerCase() === 's') stop();
if (e.key === 'Enter') start();
};
window.addEventListener('keydown', onKey);
return () => window.removeEventListener('keydown', onKey);
});
</script>


<h2>Økt: {session?.workout?.name}</h2>
<div style="font-size:3rem;margin:16px 0">{timeDisplay}</div>
<div>
<button on:click={start}>Start</button>
<button on:click={pause}>Pause</button>
<button on:click={stop}>Stop (S)</button>
</div>
