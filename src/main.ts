import App from './App.svelte';
import './global.css';


const app = new App({
target: document.getElementById('app') as HTMLElement,
props: {}
});


// enkel debug for å sikre at bundlen kjører
console.log('Mikrotrening app loaded');


export default app;
