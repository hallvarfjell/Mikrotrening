<script lang="ts">
import { createEventDispatcher, onMount } from 'svelte';
import workouts from '../../data/workouts/example1.json';
const dispatch = createEventDispatcher();


let selected = workouts[0];


function start() {
// create a session object with exercises (simplified)
const session = { id: Date.now(), workout: selected, startedAt: new Date().toISOString() };
dispatch('startSession', session);
}


onMount(() => {
// keyboard shortcuts
const onKey = (e: KeyboardEvent) => {
if (e.key === 'Enter') start();
if (e.key === ' ') { e.preventDefault(); /* handled in session */ }
};
window.addEventListener('keydown', onKey);
return () => window.removeEventListener('keydown', onKey);
});
</script>


<h1>Mikrotrening</h1>
<p>Velg økt:</p>
<select bind:value={selected}>
{#each workouts as w}
<option value={w}>{w.name}</option>
{/each}
</select>


<div style="margin-top:12px">
<button on:click={start}>Start (Enter)</button>
<button on:click={() => { window.location.href = '/Mikrotrening/export.html' }}>Eksporter (dag)</button>
</div>
