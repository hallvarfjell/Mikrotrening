import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';


export default defineConfig({
base: '/Mikrotrening/', // <-- endre hvis repo-navn er annerledes
plugins: [svelte()],
build: {
outDir: 'dist'
}
});
