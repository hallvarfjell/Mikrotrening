# INTZ – Komplett skyversjon (patchet)

**Dato:** 2026-03-18

Denne pakken inneholder alle sider + nye skyfiler + oppdatert service worker.

## Viktig
- Bytt ut `main.js` og `results.js` med dine originale filer.
- Bytt ut `builder.js` med din fungerende original (stub er lagt inn for å unngå krasj).

## Endringer som er gjort
- Toppbar: lagt til Sky‑status + Synk + Logg inn (alle sider).
- Lagt inn ESM‑moduler: `supabase-init.js`, `cloud-sync.js`, `cloud-sessions.js`.
- Service worker: versjonsbump + korrekt ASSETS.
- Lagt til `config.js` med Supabase‑detaljer, `tcx.js` og `migrations/0001_intz_cloud.sql`.

## Etter opplasting
1) Hard‑refresh (Ctrl+F5) / unregister service worker i DevTools.
2) Trykk **Logg inn** (magic link).
3) I **Øktbygger** → **Synk**.
4) Kjør en kort økt → **Stopp og lagre** → verifisér i Supabase.

