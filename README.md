# INTZ (v10.1.1 + Cloud Sync)

Dette repoet inneholder PWA-en "INTZ" med Supabase-basert skylagring for:

- **Maler** (workout_templates)
- **Økter** (workouts) + **TCX** i Supabase **Storage** (bucket `sessions`)

## Hurtigstart

1. Opprett et Supabase-prosjekt.
2. Åpne **SQL** → kjør `migrations/0001_intz_cloud.sql`.
3. Kopiér `config.sample.js` til `config.js` og fyll inn `SUPABASE_URL` og `SUPABASE_ANON_KEY` (allerede inkludert her for demo).
4. Server mappen statisk (f.eks. `npx serve .`) og åpne `index.html`.
5. Trykk **Logg inn** (magic link). Statusfeltet skal vise **Sky: online**.
6. Lag en mal i **Øktbygger**, trykk **Synk**.
7. Kjør en kort økt og **Stopp og lagre**. Sjekk i Supabase: rad i `workouts`, fil i `sessions/<user>/<client_id>.tcx`.

## Filer
- `supabase-init.js` – oppretter `window.supabase`
- `cloud-sync.js` – synk av **maler** (localStorage ⇄ Supabase)
- `cloud-sessions.js` – synk av **økter** + **TCX-opplasting**
- `tcx.js` – genererer TCX fra `session.points`
- `service-worker.js` – cache av PWA-ressurser (ikke `config.js`)

## Sikkerhet
- Klientnøkkelen (`anon`) er offentlig. Tilgangen sikres av **Row Level Security**-polisiene i migrasjonen.

## Offline
- Appen fungerer offline med localStorage som cache. Når du er innlogget og online, kan du trykke **Synk**.
