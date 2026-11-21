# AMIGO Planner

Een Doodle/Cally-achtige webapp om met een groep een datum te prikken,
gebouwd met **React** en **Gun.js** (realtime, peer-to-peer sync, geen
eigen database nodig). Gestyled volgens de **AMIGO**-huisstijl
("Institutional Analog Modernism"): Inter + Space Grotesk, een strak
rood/blauw/ivoor-palet, rechte hoeken en technische lijnen i.p.v.
zachte kaartjes.

## Hoe het werkt

1. De **organisator** maakt een prikker aan: titel, omschrijving, een
   **wachtwoord** (voor zichzelf), en minstens 2 kandidaat-datums
   (aanklikken in de kalender). Na het aanmaken land je meteen op het
   stemscherm van je eigen prikker.
2. Er verschijnt een link (`...?poll=<id>`) — met de **"Link
   kopiëren"**-knop plak je die zelf waar je wil (groepsapp, mail, ...).
3. Elke deelnemer (organisator inbegrepen) vult enkel een **naam** in
   — geen e-mail nodig — en stemt meteen per kandidaat-datum in de
   kalender: **Ja / Misschien / Nee** (klik een dag aan om te cyclen).
   Er is geen apart "eerst registreren"-scherm: je kan de kalender
   altijd bekijken, en de naam wordt pas opgevraagd op het moment dat
   je effectief een eerste stem uitbrengt.
4. Alle stemmen zijn **live zichtbaar** voor iedereen, dankzij Gun.js.
5. Het **wachtwoordveld staat altijd zichtbaar** onderaan voor wie nog
   niet ontgrendeld is. Het invullen ervan schakelt meteen een
   duidelijk afgebakende **bewerkmodus** in: titel/omschrijving (met
   expliciete "Wijzigingen opslaan" / "Wijzigingen verwerpen"),
   datums toevoegen of verwijderen (meteen van toepassing, zoals
   stemmen), deelnemers verwijderen, en de uiteindelijke datum
   bevestigen. Die ontgrendeling blijft bewaard in de browser (geen
   wachtwoord opnieuw nodig bij een volgend bezoek op hetzelfde
   toestel).
6. De **"Update kopiëren"**-knop staat altijd klaar — ook tijdens het
   stemmen, niet pas na de keuze — met een kant-en-klare
   voortgangstekst (emoji-rooster per datum, wie al stemde, wie nog
   moet) om zelf te plakken waar je wil.

## Huisstijl (AMIGO)

Alle merktokens staan als CSS-variabelen bovenaan `src/styles.css`
(`--amigo-*`), met semantische aliassen eronder (`--accent`, `--ink`,
...) zodat de rest van het stijlblad leesbaar blijft. Toegepast:

- **Typografie**: Space Grotesk voor titels/sectiekoppen/kalendertitel
  (hoofdlettergebruik + letterspatiëring voor technische labels),
  Inter voor lopende tekst en formuliervelden. Geladen via Google
  Fonts in `index.html`.
- **Kleur**: Institutional Red voor de bevestigde einddatum, Deep Blue
  als interactie-accent (knoppen, geselecteerde kalenderdag), Warm
  Ivory/Paper White als achtergronden. De stemkleuren in de kalender
  gebruiken de merkkleuren i.p.v. generiek groen/geel/rood: Deep Forest
  (ja), Mustard (misschien), Institutional Red (nee) — de gekopieerde
  tekst (`buildShareText`) blijft wel de universele 🟩🟨🟥-emoji
  gebruiken, die zijn niet stijlbaar.
- **Geometrie**: rechte hoeken (2–4px radius, nooit bubbelig), 1.5px
  randen i.p.v. schaduwen, een vaste merkkop (`.brand-header`) met
  wordmark + scheidingslijn boven elk scherm.
- **Beweging**: de bestaande kalender-flip (al split-flap-achtig) kreeg
  een iets strakkere timing (0.35s, binnen de merkrichtlijn voor
  "window transitions") en respecteert nu `prefers-reduced-motion`.

De uitgebreidere merkelementen uit het volledige AMIGO-systeem (de
Rotary Index-interactie, iconenset, illustratiestijl, ...) zijn niet
toegepast — die gaan over het bredere platform, niet over deze ene
tool.

## Installatie

```bash
npm install
```

Maak een `.env` bestand (kopie van `.env.example`) met de URL van je
Gun-relay:

```
VITE_GUN_RELAY=http://localhost:8765/gun
```

### 1. Start de Gun-relay (de "server")

Gun.js heeft geen traditionele backend nodig, maar wel een lichte relay
die berichten tussen browsers doorstuurt en data persistent bewaart:

```bash
npm run relay
```

Dit start een server op `http://localhost:8765/gun` en slaat data op in
de map `data/`.

### 2. Start de React-app

```bash
npm run dev
```

Open de getoonde localhost-URL. Maak een prikker aan, open de
gegenereerde link in een ander tabblad (of stuur hem naar iemand
anders) en zie de stemmen live binnenkomen.

### 3. Productie

```bash
npm run build
```

Dit levert een statische `dist/`-map op die je overal kan hosten
(Netlify, Vercel, een eigen server, ...). Zorg dat `VITE_GUN_RELAY`
wijst naar een relay die publiek bereikbaar is (bv. gedeployed op
Fly.io of Render — zie `server/relay.js`).

## Deployen op Render

De relay (`server/relay.js`) werkt op Render zonder verdere aanpassingen
aan je kant — Render zet zelf een `PORT` env var, en die wordt al
gebruikt. Twee dingen om wel te weten:

- **CORS** staat al aan in de code (via het `cors`-package), nodig
  omdat je frontend (bv. Netlify) en relay (Render) op verschillende
  domeinen draaien.
- **Opslag**: Render's gratis "Web Service"-tier heeft een *ephemeral*
  bestandssysteem — de map `data/` (waar de stemmen in staan) wordt
  gewist bij elke herdeploy en kan ook verloren gaan als de gratis
  service na inactiviteit terug opstart. Voor een prikker die je
  binnen een dag of wat gebruikt is dat zelden een probleem, maar voor
  iets dat weken moet blijven staan wil je een **persistent disk**:
  1. Upgrade naar een betaald Render-plan (Starter volstaat).
  2. Voeg in de service-instellingen een "Disk" toe, bv. met mount path
     `/var/data`.
  3. Zet de environment variable `DATA_DIR=/var/data` op die service.

  Zonder dat alles laat je `DATA_DIR` gewoon weg — dan gebruikt de app
  de lokale (ephemere) map, prima voor testen of kortlopende prikkers.

## Datamodel in Gun

```
polls
  └── <pollId>
        ├── title, description
        ├── passwordHash  (SHA-256 van "<pollId>:<wachtwoord>", nooit het wachtwoord zelf)
        ├── status: 'open' | 'closed'
        ├── finalDateId: null | <dateId>
        ├── dates
        │     └── <dateId> → { date: '2026-12-05', time: '19:00' }   (dateId = de datum zelf)
        └── votes
              └── <voterId> → { name, votesJson: '{"<dateId>":"yes", ...}' }
```

Een datum of deelnemer *verwijderen* gebeurt met `.put(null)` op die
node — Gun markeert hem dan als "tombstoned" en elke client die
luistert (via `useGunList`) ziet hem meteen verdwijnen.

De stemmen van één deelnemer worden als één JSON-string weggeschreven
(`votesJson`) in plaats van als losse geneste velden per datum. Dat
houdt elke stem-update een enkele, atomaire `.put()`-call — belangrijk
bij Gun, waar losse geneste writes anders apart zouden synchroniseren
en tijdelijk inconsistent kunnen lijken.

## Beperkingen / dingen om zelf uit te breiden

- **Wachtwoordbeveiliging is lichtgewicht.** We hashen (SHA-256,
  gezouten met de pollId) zodat het wachtwoord zelf niet in leesbare
  vorm in Gun staat, maar er zit geen rate-limiting op het aantal
  pogingen, en wie de hash kent zou in theorie offline kunnen proberen
  te kraken. Voor een groep vrienden/collega's is dit ruim voldoende;
  voor iets gevoeligers zou je [Gun SEA](https://gun.eco/docs/SEA)
  (ingebouwde crypto-auth) kunnen overwegen.
- De app verstuurt zelf **geen e-mails of notificaties** — delen
  gebeurt bewust manueel via de "Link kopiëren" en "Update
  kopiëren"-knoppen, die je zelf plakt waar je wil (groepsapp, mail,
  ...). Er wordt ook geen e-mailadres gevraagd of opgeslagen, enkel
  een naam.
- De ontgrendeling als organisator wordt onthouden via
  `localStorage`, dus **per browser/toestel** — op een ander toestel
  moet je het wachtwoord opnieuw intypen.
- Als een `?poll=`-link ongeldig is, blijft de pagina op "laden" staan
  in plaats van een duidelijke foutmelding te tonen — prima voor een
  MVP, maar iets om later te verbeteren.
