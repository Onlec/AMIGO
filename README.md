# Datumprikker

Een Doodle/Cally-achtige webapp om met een groep een datum te prikken,
gebouwd met **React** en **Gun.js** (realtime, peer-to-peer sync, geen
eigen database nodig).

## Hoe het werkt

1. De **organisator** maakt een prikker aan: titel, omschrijving, zijn
   eigen naam + e-mail, en minstens 2 kandidaat-datums.
2. Er verschijnt een link (`...?poll=<id>`) die je deelt met de groep.
3. Elke deelnemer (organisator inbegrepen) vult bij het eerste bezoek
   naam + e-mail in en stemt per datum: **Ja / Misschien / Nee**
   (klik op een cel om door de opties te cyclen).
4. Alle stemmen zijn **live zichtbaar** voor iedereen, dankzij Gun.js.
5. De organisator (herkend via zijn e-mailadres) ziet een extra paneel
   om de uiteindelijke datum te bevestigen. Daarna toont de pagina voor
   iedereen de gekozen datum.

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

## Datamodel in Gun

```
polls
  └── <pollId>
        ├── title, description, organizerEmail, organizerName
        ├── status: 'open' | 'closed'
        ├── finalDateId: null | <dateId>
        ├── dates
        │     └── <dateId> → { date: '2026-12-05', time: '19:00' }
        └── votes
              └── <voterId> → { name, email, votesJson: '{"<dateId>":"yes", ...}' }
```

De stemmen van één deelnemer worden als één JSON-string weggeschreven
(`votesJson`) in plaats van als losse geneste velden per datum. Dat
houdt elke stem-update een enkele, atomaire `.put()`-call — belangrijk
bij Gun, waar losse geneste writes anders apart zouden synchroniseren
en tijdelijk inconsistent kunnen lijken.

## Beperkingen / dingen om zelf uit te breiden

- **Organisator-herkenning** gebeurt nu puur op e-mailadres. Voor een
  groep vrienden/collega's is dat voldoende, maar iemand die toevallig
  hetzelfde e-mailadres intypt zou zich kunnen voordoen als
  organisator. Wil je dat dichttimmeren, gebruik dan
  [Gun SEA](https://gun.eco/docs/SEA) (ingebouwde crypto-auth van Gun)
  om de organisator een keypair te geven bij het aanmaken van de poll.
- **E-mailnotificaties** (bv. "je bent uitgenodigd" of "de datum is
  gekozen") verstuurt deze app niet — Gun.js synct enkel data, het
  stuurt geen mail. Daarvoor heb je een klein stukje server nodig die
  een mailservice zoals Resend of Postmark aanroept op het moment dat
  iemand stemt of de poll sluit.
- Als een `?poll=`-link ongeldig is, blijft de pagina op "laden" staan
  in plaats van een duidelijke foutmelding te tonen — prima voor een
  MVP, maar iets om later te verbeteren.
