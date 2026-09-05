# 🧠 Alt ud af hovedet — systemet

Ét kort input (skrevet eller talt) → Claude gør resten selv: udfører, fordeler
og logger, så dashboardet altid viser det fulde billede.

## Modellen: Claude er hjernen, app'en er postkassen

**To døre ind, én hjerne, ét overblik:**

```
  Dør 1: Claude direkte (Mac)     Dør 2: hoved.html (iPhone, offline-kø)
        │  udføres STRAKS                │  venter i API'et
        └────────────┬───────────────────┘
                     ▼
          /hoved-skillen (hjernen)
   udfører + finsorterer + skriver facit til API'et
                     ▼
        hoved-dash.html (overblikket)
   resultater, issue-links, deadlines, statistik
```

- **På Mac'en**: skriv bare til Claude ("undersøg …", "lav påmindelse …",
  "fryser appen skal …", en løs tanke). Claude udfører med det samme OG logger
  noten i API'et (MODE A i skillen).
- **På telefonen / på farten**: hoved.html — tanken er fanget på 5 sekunder,
  også offline. Behandles automatisk (se Automatik).

## Delene

| Del | Hvor | Hvad |
|-----|------|------|
| **Indgang 1: Claude** | `/hoved`-skillen, MODE A | Udfør straks + log til API |
| **Indgang 2: app** | `apps`-repo → `hoved.html` | Lynindbakke: skriv/tal, #tags, offline-kø |
| **Dashboard** | `apps`-repo → `hoved-dash.html` | Overblik, filtre, redigering, links til issues/resultater |
| **API** | Cloudflare worker `lightcrew-api.thomas-5c5.workers.dev` | `/api/hoved` (liste/opret/ret/slet), `/api/hoved/config`, `/api/hoved/sorter` |
| **Hjernen** | denne repo → `.claude/skills/hoved/` | Ruterne + udførelsen (MODE A og B) |
| **Automatik** | denne repo → `hoved-auto/` | launchd kører "kør hoved" hver 2. time på Mac'en |

## Ruterne (kontrakten)

1. **"undersøg …"** → Claude undersøger straks (websøgning, skills) og skriver
   svaret i notens `resultat` → 🤖-badge på dashboardet.
2. **Projekt-input** (crew cast/lightcrew, fryser, time app, dmx …) →
   `projekt` sættes; kode-opgaver bliver **GitHub-issues** i projektets repo
   (mapping: `/api/hoved/config` → `repos`), issue-link på dashboardet (🐙).
   En Claude-session i projektet samler issuet op.
3. **"lav påmindelse" / "husk …" / deadline-to-do** → **Apple Påmindelser**
   (kræver Mac) → `behandlet` + kvittering i `resultat`.
4. **#idé, #bog, #lær …** (tanker uden handling) → **Apple Notes** via braindump.
5. **Alt andet** → finsorteres (titel, kategori, prioritet, deadline) og står
   åbent på dashboardet til manuel stillingtagen.

Statusflow: `aaben` → finsorteret (`sorteret_af: claude`) → `behandlet: 1` +
`resultat` → `udfoert` (lukkes af Thomas — eller af Claude når opgaven
beviseligt er helt færdig).

## Automatik — selvkørende drift

**Mac (anbefalet, fuld funktion):** kør én gang i repo-mappen:

```bash
bash hoved-auto/install.sh
```

Så kører "kør hoved" automatisk hver 2. time via launchd (også lige efter
login). Log: `~/Library/Logs/hoved-auto.log`. Stop/kør nu-kommandoer printes
af installeren.

**Cloud (claude.ai/code):** kræver at `lightcrew-api.thomas-5c5.workers.dev`
tilføjes under miljøets **Network policy**. Indtil da kan cloud-sessioner
hverken læse eller skrive API'et — og Apple-ruterne (Påmindelser/Notes) kræver
under alle omstændigheder Mac'en.

## API-felter (reference)

`id, tekst, titel, kategori, handling, projekt, prioritet (1=nu/2/3), deadline,
tags, kilde (iphone/ipad/mac/claude), status (aaben/udfoert), sorteret_af
(regel/ai/claude/manuel), begrundelse, resultat, behandlet (0/1), kode (0/1),
github_issue, oprettet, udfoert_dato`

Opret: `POST /api/hoved` `{tekst, kilde}` · Ret: `POST /api/hoved/{id}` med de
felter der ændres · Slet: `DELETE /api/hoved/{id}` (kun Thomas, via dashboard).
