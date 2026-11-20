# Datumprikker

Een Doodle/Cally-achtige webapp om met een groep een datum te prikken,
gebouwd met **React** en **Gun.js** (realtime, peer-to-peer sync, geen
eigen database nodig).

## Hoe het werkt

1. De **organisator** maakt een prikker aan: titel, omschrijving, een
   **wachtwoord** (voor zichzelf), en minstens 2 kandidaat-datums
   (aanklikken in de kalender).
2. Er verschijnt een link (`...?poll=<id>`) — met de **"Link
   kopiëren"**-knop plak je die zelf waar je wil (groepsapp, mail, ...).
3. Elke deelnemer (organisator inbegrepen) vult bij het eerste bezoek
   naam + e-mail in, en stemt per kandidaat-datum in de kalender: **Ja
   / Misschien / Nee** (klik een dag aan om te cyclen).
4. Alle stemmen zijn **live zichtbaar** voor iedereen, dankzij Gun.js.
5. Door op **"Ben je de organisator?"** te klikken en het wachtwoord in
   te vullen, ontgrendel je op dat toestel extra beheer: de prikker
   bewerken (titel/omschrijving/datums), deelnemers verwijderen, en de
   uiteindelijke datum bevestigen. Die ontgrendeling blijft bewaard in
   de browser (geen wachtwoord opnieuw nodig bij een volgend bezoek op
   hetzelfde toestel).
6. Zodra de datum bevestigd is, verschijnt een **"Resultaat
   kopiëren"**-knop met een kant-en-klare samenvatting (titel, datum,
   wie "Ja" stemde) om zelf te plakken waar je wil.

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
              └── <voterId> → { name, email, votesJson: '{"<dateId>":"yes", ...}' }
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
  gebeurt bewust manueel via de "Link kopiëren" en "Resultaat
  kopiëren"-knoppen, die je zelf plakt waar je wil (groepsapp, mail,
  ...).
- De ontgrendeling als organisator wordt onthouden via
  `localStorage`, dus **per browser/toestel** — op een ander toestel
  moet je het wachtwoord opnieuw intypen.
- Als een `?poll=`-link ongeldig is, blijft de pagina op "laden" staan
  in plaats van een duidelijke foutmelding te tonen — prima voor een
  MVP, maar iets om later te verbeteren.
