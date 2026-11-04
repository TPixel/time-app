# 🧠 Hoved — Thomas' oplæg til funktioner (2026-10-28)

> Thomas' egne ord, gemt ordret. Dette er retningen for næste version —
> det tekniske virker, men oplevelsen skal ramme dette.

---

Ud af Hoved system App mm.

Grund ideen er at ting, ideer, tanker kommer ud af mit hoved, og bliver sorteret og behandlet korrekt bagefter.

Det centrale er det lander de rigtige steder, jeg vil ikke skulle gennemgå lange udskrifter.
De vigtig informationer skal automatisk dukke op fx i min morgen brief eller kalender eller noget helt 3.

Hvordan vi ender med at lave outputet må vi arbejde med. Måske en lille app formet som en lille notes bog med små inden markeringer i siden.

Det er faktisk en god ide

Her er et par funktion

**SENDE INPUT VIDERE:**

sende input til morgen liste, eller andre lister både MAC ( delte ) og andre steder hen.
Informationer til mine egne apps.

Disse bliver sorteret med det samme via # ( #morgen, #Indkøb, mm )

**SLÅ OP:**

Slå op er "simpel" søgning

**KØB:** enkelt find produkt, forhandler, indmeldelse

**UNDERSØG:**

Grundig undersøgelse, med flere kilder og vinkler alternativer evt steder at køb, bestille eller andet.

Output en lille rapport, med billeder, informationer, links til relevante sider mm.

**CLAUDE PROJEKTER:**

Opgaver eller Ændringer til projekter i Claude.
Kører sin egen gang i Claude.

---

## Kernen (læsning af oplægget)

1. **Ingen lange udskrifter.** Svar og resultater skal ikke læses i en log —
   de skal *dukke op* de rigtige steder (morgenbrief, kalender, lister, apps).
2. **Fem funktioner/kommandoer**, ikke kategorier:
   - **SEND VIDERE** — input ryger direkte i en liste/app via #tag (#morgen,
     #indkøb, …): Apple Påmindelser-lister (delte!), morgenlisten, egne apps
     (fryser, time app …). Ingen AI-behandling nødvendig — bare levering.
   - **SLÅ OP** — hurtig, simpel søgning, kort svar.
   - **KØB** — find produkt + forhandler + pris, klar til bestilling.
   - **UNDERSØG** — grundig research, flere kilder/vinkler/alternativer +
     købs-/bestillingsmuligheder. Output: **en lille rapport med billeder,
     info og links** (ikke en tekstklump i et resultat-felt).
   - **CLAUDE PROJEKTER** — opgaver/ændringer til kode-projekterne; kører
     deres egen gang i Claude (issues → sessioner).
3. **Output-idé til app'en:** en lille notesbog med faneblads-markeringer i
   siden (indeks-markeringer) — én "side" pr. liste/funktion.

## Gap ift. det byggede (til arbejdslisten)

| Oplæg | Status i dag | Mangler |
|---|---|---|
| Send videre til delte lister (#morgen, #indkøb) | Påmindelser oprettes kun i standardliste | Ruter #tag → navngiven (delt) Påmindelses-liste; morgenliste |
| Dukker op i morgenbrief/kalender | Morgenbrief henter Hoved | Kalender-leveringen; "noget helt 3." |
| SLÅ OP som hurtig kommando | Alt behandles ens | Let vej: kort svar, ingen rapport |
| KØB som egen funktion | Ligger under Indkøb/research | Produkt+forhandler+pris-format |
| UNDERSØG → lille rapport m. billeder/links | Tekst i `resultat`-feltet | Rapport-side (HTML pr. note, linket fra dashboard/brief) |
| Notesbog-UI med indeksmarkeringer | Standard dashboard | Nyt UI-koncept til app/dashboard |
