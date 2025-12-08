<script lang="ts">
import StartScreen from './components/StartScreen.svelte';
import SessionScreen from './components/SessionScreen.svelte';
import { writable } from 'svelte/store';


// very small router-ish state
const page = writable<'start'|'session'>('start');
const currentSession = writable(null as any);


const goToSession = (session: any) => {
currentSession.set(session);
page.set('session');
};


const goHome = () => page.set('start');
</script>


<main class="container">
{#if $page === 'start'}
<StartScreen on:startSession={(e) => goToSession(e.detail)} />
{:else}
<SessionScreen {currentSession} on:done={goHome} />
{/if}
</main>
