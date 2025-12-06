
# Desk Microflows (PWA)

Mikroøkter ved pulten – installasjonsfri web‑app (PWA) som kjører på alle enheter.  
Logger økter lokalt og eksporterer daglig TCX (Sport="Other") med én lap per økt og trackpoints per sekund.

## Funksjoner
- Start-skjerm: velg økt, Start, vis dagens logg, Eksporter TCX (dag)
- Økt-skjerm: liste over øvelser, nedtelling per øvelse, automatisk 10s hvile, Pause/Resumé (Space), Stopp (S)
- Dagens logg lagres lokalt (IndexedDB eller fallback til localStorage)
- Eksporter TCX: `microdesk_YYYY-MM-DD.tcx` med UTC-tider, Sport="Other", én lap per økt
- PWA: offline-støtte (service worker), kan "installeres" som app-ikon (valgfritt)

## Bruk (uten installasjon)
1. Opprett repo på GitHub (f.eks. `desk-microflows`) → **Add a README**.
2. Last opp alle filene/mappene i dette prosjektet:
   - Klikk **Add file → Upload files** og slipp inn mappene, eller
   - **Add file → Create new file**, og lim inn innholdet fra hver fil ovenfor.
3. Aktiver **GitHub Pages**:
   - Repo **Settings → Pages**
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`, **Folder**: `/ (root)`
   - **Save**
4. Vent et minutt, åpne URL:
   - `https://<brukernavn>.github.io/<REPO_NAVN>/`
5. Bruk appen:
   - Velg økt → **Start**
   - **Space** = Pause/Resumé, **S** = Stopp, **Enter** = Start, **N** = Neste
   - **Eksporter TCX (dag)** for opplasting til Garmin Connect

## Tips
- Ikoner i `assets/` er placeholder — bytt gjerne med egne PNG 192×192 og 512×512.
- Filer lagres lokalt i nettleseren. Du kan eksportere TCX og legge den i OneDrive eller direkte i Garmin Connect.
- Ved senere oppdatering: **Add file → Upload files** igjen; Pages oppdateres automatisk.

## Personvern
- Ingen innlogging. Ingen data sendes til server. Alt lagres lokalt i nettleseren.

## Videre
