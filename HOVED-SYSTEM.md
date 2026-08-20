# 🧠 Alt ud af hovedet — systemet

Ét sted at aflevere alle tanker (skrevet eller talt), som automatisk ender de rigtige steder — og et dashboard der linker til resultaterne.

## Delene

| Del | Hvor | Hvad |
|-----|------|------|
| **Indtastning** | `apps`-repo → `hoved.html` | Skriv/tal en tanke, grov-sortering via #tags, offline-kø |
| **Dashboard** | `apps`-repo → `hoved-dash.html` | Overblik, filtre, statistik, redigering, links til issues/resultater |
| **API** | Cloudflare worker `lightcrew-api.thomas-5c5.workers.dev` | `/api/hoved` (liste/opret/ret/slet), `/api/hoved/config`, `/api/hoved/sorter` |
| **Behandler** | Claude med `/hoved`-skillen (denne repo: `.claude/skills/hoved/`) | Finsorterer og UDFØRER: undersøger, opretter påmindelser, laver GitHub-issues, skriver resultater tilbage |

## Ruterne (kontrakten)

Når en tanke lander i systemet, afgør indholdet hvor den ender:

1. **"undersøg …" / #undersøg** → Claude undersøger det (websøgning, skills) og skriver
   svaret tilbage i feltet `resultat` → synligt på dashboardet med 🤖-badge.
2. **Nævner et projekt** (crew cast / lightcrew, fryser, time app, dmx …) → ruten er
   projektet: `projekt`-feltet sættes, og er det en kode-opgave (`kode:1`) oprettes et
   **GitHub-issue** i projektets repo (mapping i `/api/hoved/config` → `repos`), som en
   Claude-session i det projekt samler op. Issue-linket vises på dashboardet (🐙).
3. **"lav påmindelse" / "husk mig på" / har deadline** → oprettes i **Apple Påmindelser**
   (kræver Mac-Claude med `pamindelser`-skillen), og noten markeres `behandlet`.
4. **#idé, #køb, #bog …** (braindump-tags) → gemmes i **Apple Notes** via braindump-systemet.
5. **Alt andet** → finsorteres (titel, kategori, prioritet, deadline) og bliver liggende
   åbent på dashboardet til manuel stillingtagen.

Statusflow: `aaben` → (finsorteret: `sorteret_af: claude`) → (`behandlet: 1` + `resultat`) → `udfoert`.

## Sådan køres behandleren

- **På Mac'en** (fuld funktion, inkl. Apple Påmindelser/Notes): sig **"kør hoved"** eller
  `/hoved` i Claude Code — skillen ligger i `.claude/skills/hoved/` her i repoet.
  Kopiér den evt. til `~/.claude/skills/hoved/` så den virker i alle mapper.
- **I skyen** (claude.ai/code): kræver at `lightcrew-api.thomas-5c5.workers.dev` er
  tilladt i miljøets netværkspolitik (Environment → Network policy). Uden det kan
  cloud-sessioner ikke nå API'et — Apple-ruterne (påmindelser/noter) kræver under alle
  omstændigheder Mac'en.
- **Automatisk**: dashboardets "🤖 Sortér usorterede"-knap kalder `/api/hoved/sorter`
  (regel/AI-sortering på serveren) — behandleren tager sig af selve udførelsen.

## API-felter (til reference)

`id, tekst, titel, kategori, handling, projekt, prioritet (1=nu/2/3), deadline,
tags, kilde (iphone/ipad/mac), status (aaben/udfoert), sorteret_af (regel/ai/claude/manuel),
begrundelse, resultat, behandlet (0/1), kode (0/1), github_issue, oprettet, udfoert_dato`

Ret en note: `POST /api/hoved/{id}` med JSON-body af de felter der skal ændres.
Slet: `DELETE /api/hoved/{id}`.
