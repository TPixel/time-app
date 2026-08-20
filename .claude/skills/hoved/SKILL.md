---
name: hoved
description: >
  Behandl Thomas's "Alt ud af hovedet"-indbakke. Henter åbne noter fra
  lightcrew-api'ets /api/hoved, finsorterer dem og UDFØRER dem: "undersøg …"
  → lav undersøgelsen og skriv resultatet tilbage; projekt-opgaver (crew cast,
  fryser, time app, dmx …) → opret GitHub-issue i projektets repo; "lav
  påmindelse"/"husk …"/deadlines → opret i Apple Påmindelser; braindump-tags
  → Apple Notes. Trigger ALTID på: "kør hoved", "/hoved", "tøm hovedet",
  "behandl indbakken", "finsortér", "hvad ligger der i hovedet", "kør
  indbakken", "behandl mine tanker".
---

# 🧠 /hoved — behandleren

Du er behandleren i Thomas's "Alt ud af hovedet"-system. Din opgave: tøm indbakken
ved at få hver note derhen hvor den hører til — og skriv altid tilbage til API'et,
så dashboardet (hoved-dash.html) viser hvad der skete.

`API = https://lightcrew-api.thomas-5c5.workers.dev`

## 1. Hent

```bash
curl -s "$API/api/hoved?status=aaben&limit=200"
curl -s "$API/api/hoved/config"   # kategorier, handlinger, projekter, repos-mapping
```

Behandl kun noter med `status: "aaben"` og `behandlet != 1`.

## 2. Finsortér (dem hvor `sorteret_af` er tom eller "regel")

Sæt pr. note: `titel` (kort, handlingsorienteret), `kategori`, `handling`,
`projekt`, `prioritet` (1 = #nu/haster, 2 = normal, 3 = #engang), `deadline`
(YYYY-MM-DD hvis teksten nævner en frist — "inden fredag", "d. 3." osv.),
og en kort `begrundelse`. Gem med:

```bash
curl -s -X POST "$API/api/hoved/{id}" -H 'content-type: application/json' \
  -d '{"titel":"…","kategori":"…","handling":"…","projekt":"…","prioritet":2,"deadline":"…","begrundelse":"…","sorteret_af":"claude"}'
```

## 3. Udfør — rute pr. note

Vurdér i denne rækkefølge; én note kan ramme flere ruter (fx undersøg + påmindelse).

### 🔎 Undersøg (`#undersøg` eller teksten starter med/beder om "undersøg", "find ud af", "tjek om", "research")
Lav undersøgelsen NU — websøgning og relevante skills (live-musik, events, pladejagt …).
Skriv et kort, konkret svar (≤ ~600 tegn, gerne med links) tilbage:

```bash
curl -s -X POST "$API/api/hoved/{id}" -H 'content-type: application/json' \
  -d '{"resultat":"🔎 <svaret>","behandlet":1}'
```

Vis også det fulde svar til Thomas i samtalen.

### 🐙 Projekt/kode-opgave (nævner crew cast, lightcrew, fryser, time app, dmx, butik … eller `kode:1`)
1. Slå projektets repo op i `config.repos` (fx lightcrew → TPixel/light-crew,
   fryser → TPixel/apps, timeapp → TPixel/time-app). Mangler mappingen: spørg Thomas én gang.
2. Er det en kode-/app-opgave: opret et GitHub-issue i repoet (`gh issue create` eller
   GitHub-MCP) med noteteksten som brødtekst og titlen fra finsorteringen.
3. Skriv tilbage: `{"github_issue":"<issue-url>","kode":1,"behandlet":1,"resultat":"🐙 Issue oprettet"}`.
   Dashboardet viser issue-linket. En Claude-session i det projekt samler issuet op.

### ⏰ Påmindelse ("lav påmindelse", "husk mig på", "påmind mig", eller noten har en deadline og er en konkret to-do: #betal #ring #hent #bestil …)
KUN på Mac'en: brug `pamindelser`-skillen (Apple Påmindelser) med titel + dato/tid.
Skriv tilbage: `{"resultat":"⏰ Oprettet i Påmindelser: <titel> — <dato>","behandlet":1}`.
Kører du i skyen uden Apple-adgang: lad noten stå ubehandlet og sig det til Thomas.

### 📝 Braindump (#idé #bog #lær #mål #vane #koncept — tanker uden handling)
KUN på Mac'en: gem via braindump-systemet (Apple Notes, rigtig kategori).
Skriv tilbage: `{"resultat":"📝 Gemt i Noter → <kategori>","behandlet":1}`.

### 🤷 Resten
Finsortér dem (trin 2) og lad dem stå åbne — nævn dem i opsummeringen så Thomas
kan tage stilling på dashboardet.

## 4. Opsummér til Thomas

Kort tabel: hvad kom ind → hvor endte det (med links til issues/resultater).
Nævn eksplicit hvad der IKKE kunne behandles og hvorfor (fx Apple-ruter i skyen).

## Regler

- Slet ALDRIG noter — kun Thomas sletter (dashboard).
- Markér aldrig `udfoert` medmindre opgaven beviseligt ER udført; `behandlet:1`
  betyder blot "rutet/udført af Claude", noten lukkes af Thomas.
- Hold `resultat` kort og konkret — detaljer hører til i samtalen eller issuet.
- Fejler API-kald: prøv igen ×2, og rapportér ærligt hvad der ikke blev gemt.
