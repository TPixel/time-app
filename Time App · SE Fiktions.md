# Time App · SE Fiktions — Projektkontekst

**Overenskomst:** Scen & Film · Film·TV·Video 2023–2025 (Sverige)
**Fil:** `se-ftv-test.html` (ligger i time-app-mappen)
**Senest opdateret:** marts 2026

---

## Hvad er det

PWA til timeregistrering for svenske filmteknikere under Scen & Films Film·TV·Video-overenskomst 2023–2025. Bygget i samme stil som de danske Time Apps (mørkt tema, Syne/DM Mono/DM Sans fonte), men med **blå** accent (`#60A5FA`) og svenske regler i SEK.

---

## Teknisk stack

- Ét enkelt HTML-fil, alt inline
- Samme design-system som fiktions/reklame-apps (`--bg:#0C0C12`, `--surf:#14141E` osv.)
- Svensk sprog (lang="sv")
- Deploy: samme repo som de andre (`/tmp/time-app-deploy/`)

---

## Farver & design

```css
--bg:#0C0C12; --surf:#14141E; --card:#1C1C2A; --card2:#222232;
--brd:#2E2E42; --txt:#EEEEF5; --mut:#666680;
--acc:#60A5FA;  /* blå — SE Fiktions */
--pur:#A78BFA; --grn:#34D399; --red:#F87171; --yel:#FBBF24;
```

---

## Overenskomstregler (Scen & Film Film·TV·Video 2023–2025)

### Ansættelsesformer
- **Dagsansat:** dagløn per dag (Dag 1/2/3+ minimumsatser)
- **Månadsansat:** OT beregnes som brøkdel af månedsløn

### Minimumsatser (dagsansat)
| Dag i produktion | Min. dagslön (SEK) |
|-----------------|-------------------|
| Dag 1           | 5 984             |
| Dag 2           | 5 502             |
| Dag 3+          | 3 645             |
| Fri sats        | —                 |

### Månadsansat minimum
- Min. 35 191 SEK/måned (2025, +3,4%)

### OT (månadsansat)
- Hverdage 07–21: månedsløn ÷ **94** pr. time
- Øvrige tider: månedsløn ÷ **82** pr. time

### OB-tillæg (obekvämlighetstillägg)
| Tidspunkt | Sats |
|-----------|------|
| Lördag 07–21 | +44 SEK/t |
| Mån–lör 21–24 | +71 SEK/t |
| Mån–lör 00–07 | +148 SEK/t |
| Söndag + helgdag (hele døgnet) | +148 SEK/t |

### Pause
- Under 6t: ingen pause
- 6–9t: 30 min pause (trækkes fra arbejdstid)
- Over 9t: 45 min pause

### Dagtype
- Vardag (mån–fre), Lördag, Söndag

---

## Hvad der er bygget (status marts 2026)

### ✅ Færdigt
- Dag-kalkulator med start/slut-tid (tidvælger-modal med kvarter)
- Dagsansat-model med alle tre dagssatser + fri sats
- Månadsansat-model med OT ÷94/÷82
- Dagtype-toggle (Vardag / Lördag / Söndag)
- OB-tillæg (alle fire satser, inkl. midnatsgrænse)
- Pauselogik (0 / 30 / 45 min)
- OT-breakdown fold ud/ind på resultatboks
- Avtalsregler-info fold ud/ind
- **35+ automatiske tests** der kører ved load og viser grønt/rødt banner

### ❌ Mangler (næste skridt)
- Uge/Måned/År-views med historik
- localStorage (gemmer ikke dage på tværs af sessions)
- PDF + mail-eksport
- Indstillinger-view
- Fil er stadig `se-ftv-test.html` — skal omdøbes og deployes

---

## Næste skridt (aftalt)

1. Udvid til fuld app med Dag/Uge/Måned/År-views
2. Tilføj localStorage: nøgle `se-ftv-dage-v1`
3. PDF + mail-eksport fra uge/måned-view
4. Deploy som `se-ftv.html` på time-app.dk
5. Opdater landing page (index.html) med svensk app

---

## Deploy-kommando

```bash
cd /tmp/time-app-deploy
git pull
# kopier ny se-ftv.html hertil
git add se-ftv.html
git commit -m "Time App SE Fiktions vX — beskrivelse"
git push
```

---

## Reference

- Overenskomst: Scen & Film / Teaterförbundet Sverige — Film·TV·Video 2023–2025
- Beregning testet med 35+ automatiske scenarier (alle bestået i test-fil)
