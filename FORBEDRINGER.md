# ⏱️ Time App — Forbedringer & Opgaver

**Instrukser:**
- `☐` betyder "ikke startet" — du kan klikke for at godkende at jeg skal gå i gang
- `☑` betyder "godkendt" — jeg starter på opgaven
- `✓ ~~tekst~~` betyder "færdig" — opgaven er klar

Du kan tilføje nye ting når som helst. Gem filen, og fortæl mig når du har tilføjet noget nyt.

---

## 🏗️ ARKITEKTUR & KODEKVALITET

- ☐ **Opdel app.html** — 3460 linjer er meget for én fil. Kunne deles i moduler (PDF, UI, storage, utilities)
- ☐ **Refaktorer PDF-funktioner** — `doPDF`, `doPDF_dag`, `doPDF_mnd`, `doPDF_aar` har meget dupliceret kode. Kunne abstraheres
- ☐ **Centraliseret tilstandshåndtering** — Data ligger i localStorage/IndexedDB uden klart mønster. Kunne være mere struktureret
- ☐ **Ryd gamle filer** — `udskrifter/`-mappen har gamle HTML-skabeloner (ikke i brug) — slet eller dokumenter hvorfor de bliver holdt

---

## 🎨 UI/UX FORBEDRINGER

- ☐ **Mørkere tilstand** — Har du brug for light mode?
- ☐ **Tastaturnavigation** — Modal og knapper virker ikke helt med keyboard
- ☐ **Mobilrespons** — Appen er begrænsed til 430px max-width. Virker det som forventet på større skærme?
- ☐ **Lyd/vibrering** — Kunne give feedback ved tid-entries
- ☐ **Drag-and-drop** — For at ændre rækkefølge af produktioner?
- ☐ **Autofill** — Kan appen huske hyppige værdier (pause-længde, frokost-tid osv.)?

---

## 🚀 FEATURES & FUNKTIONALITET

- ☐ **Årsoversigt (doPDF_aar)** — Findes knappen, men hvad skal den vise?
- ☐ **Eksportformat** — CSV/Excel for brug i økonomi-systemer?
- ☐ **Deling/samarbejde** — Kan flere personer på samme produktion registrere timer?
- ☐ **Notater per dag** — Kolonne for kommentarer (vejr, kamera osv.)?
- ☐ **Skabeloner** — Gem hyppige tidsopdelinger som skabeloner for produktioner?
- ☐ **Synkronisering** — Hvis flere enheder bruges, hvordan synkroniserer data?

---

## 🐛 POTENTIELLE BUGFIX

- ☐ **Backup-navn** — Filnavn i backup er ikke unik. Kunne inkludere dato/tid
- ☐ **Conflictløsning** — Hvis appen forceres lukket under gemning, hvad sker der?
- ☐ **Undo/Redo** — Kan tider slettes? Kan man gendanne slettede produktioner?
- ☐ **Offline-støtte** — Service Worker for fuld offline-evne?
- ☐ **Logo i PDF** — Base64-embedded logo virker, men kunne valideres på mobile print

---

## 📦 VEDLIGEHOLD & DOKUMENTATION

- ☐ **CLAUDE.md** — Dokumentation af arkitektur, hvordan man bygger, deploy-proces
- ☐ **Commit-beskeder** — Git-historien burde være mere beskrivende
- ☐ **Versionering** — Versionstal et sted? (i HTML-titlen, metadata osv.)
- ☐ **Fejllogging** — Hvis noget går galt, hvordan debugger man?
- ☐ **Test** — Unit tests for beregninger (løn, timer osv.)?

---

## 🎯 DESIGN-REFRESH

- ☐ **Ældre font-setup** — Bruger Syne, DM Sans, DM Mono. Stadig relevant?
- ☐ **Farvepalette** — 3 gange orange-knapper, men variationen virker muligvis forvirrende
- ☐ **Konsistens** — Input-felter vs. display, border-radius variation (`--r` vs `--rs`)

---

## 🆕 NYE IDÉER (tilføj her)

*Tom — du kan tilføje ting her*

