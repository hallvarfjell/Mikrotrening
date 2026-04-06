# Backyard / Frontyard Ultra – enkel én-fil-app

Denne ZIP-en inneholder en komplett webapp med **så få filer som praktisk mulig**:

- `index.html` → hele appen (HTML + CSS + JavaScript i én fil)
- `supabase_schema.sql` → SQL som må kjøres i Supabase før appen brukes
- `README.md` → denne filen

## Funksjoner som er inkludert

- **4 hovedskjermer**
  1. Registrering
  2. Live-resultater
  3. Admin
  4. Logg
- **Backyard**, **Frontyard** og **Egendefinert** løpsoppsett
- Redigerbar rundelengde, tilgjengelig rundetid og reduksjon per runde
- Starttid som følger **lokal tid**
- Store, responsive deltakerknapper med umiddelbar visuell respons
- Dobbelt-trykkflyt for sletting av feilregistrert runde
- Automatisk DNF når tidsfristen passeres
- Live resultatliste egnet for storskjerm
- Import av deltakere fra **CSV / XLS / XLSX**
- Lagring i **Supabase**
- Logg over tidligere løp med mulighet for innlasting
- Klar for publisering på **GitHub Pages**

---

## Oppsett

### 1) Kjør SQL-schema i Supabase

Åpne **SQL Editor** i Supabase og kjør hele innholdet i `supabase_schema.sql`.

### 2) Last opp til GitHub

Legg filene i et GitHub-repo, for eksempel:

```text
/backyard-frontyard-ultra/
  index.html
  supabase_schema.sql
  README.md
```

### 3) Aktiver GitHub Pages

- Gå til repo → **Settings** → **Pages**
- Source: **Deploy from a branch**
- Branch: `main` (eller ønsket branch)
- Mappe: `/root`

Da vil `index.html` åpnes som app.

---

## Viktige merknader

- Appen bruker den oppgitte **Supabase URL + anon key** direkte i `index.html`.
- SQL-filen oppretter åpne **anon-policies** for enkel MVP-bruk uten innlogging.
- Hvis appen senere skal brukes offentlig, bør policyene strammes inn.

---

## Bruk

### Admin
1. Velg løpsmal (Backyard / Frontyard / Egendefinert)
2. Sett rundelengde, rundetid og eventuell reduksjon per runde
3. Velg starttid eller la feltet stå tomt for start **nå**
4. Legg inn deltakere manuelt eller importer fil
5. Trykk **Start løp**

### Registrering
- Trykk på deltakerknappen når runden er fullført
- Knappen blir grønn og viser rundetid
- Trykk på samme knapp igjen for å få spørsmålet **"Slette oppføring?"**

### Live
- Viser fortløpende plassering, runder, distanse, tider og status
- Viser også stor klokke og nedtelling til neste start

### Logg
- Når løpet stoppes på Adminsiden lagres det i loggen
- Du kan laste inn tidligere løp igjen fra Logg-skjermen

---

## Tips

Hvis noe ikke vises riktig ved første oppstart:
- kontroller at SQL-schemaet er kjørt
- oppdater siden
- sjekk at nettleseren har internettilgang (appen bruker CDN for Supabase-klient og XLSX-parser)
