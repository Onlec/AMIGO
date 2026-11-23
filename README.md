# AMIGO Planner

Een Doodle/Cally-achtige webapp om met een groep een datum te prikken,
gebouwd met **React** en **Gun.js** (realtime, peer-to-peer sync, geen
eigen database nodig). Gestyled volgens de **AMIGO**-huisstijl
("Institutional Analog Modernism"): Inter + Space Grotesk, een strak
rood/blauw/ivoor-palet, rechte hoeken en technische lijnen i.p.v.
zachte kaartjes.

## Site-structuur

De app heeft drie "pagina's", gestuurd via de query string (geen
router-library nodig voor zoiets kleins):

- `/` (geen parameters) → de **homepage** (`HomePage.jsx`): een hero
  met een SVG-kaartenwiel (scrollen, slepen, pijltjestoetsen of de
  Vorige/Volgende-knoppen), en daaronder een raster met **alle 13
  tools**. Twaalf daarvan — Agenda, Btw-calculator, Datumrekenaar,
  Eenhedenomrekenaar, Factuurnummers, Kilometervergoeding,
  Leningcalculator, Margecalculator, Notities, Procentrekenaar,
  Tijdschrijver, Uurtariefberekening — zijn **echt werkende** kleine
  rekenmachines/lijstjes, direct overgenomen uit het AMIGO-homepage-
  artefact en volledig los van Gun.js (ze bewaren hun data, waar van
  toepassing, gewoon in `localStorage`). De dertiende, **Datumprikker**,
  is onze eigen tool: in plaats van in-pagina te openen (zoals de
  andere twaalf, via `location.hash`) navigeert die naar `?page=planner`.
- `?page=planner` → de "Nieuwe datumprikker"-pagina.
- `?poll=<id>` → de stempagina, ongewijzigd qua werking.

De koptekst op de planner-/stempagina (`SiteHeader.jsx`) linkt terug
naar de homepage via het AMIGO-logo. De homepage heeft haar eigen,
iets eenvoudigere koptekst (enkel "AMIGO", geen rode "GO"-opsplitsing)
rechtstreeks in `HomePage.jsx`, zoals in het artefact zelf.

### Waarom de homepage geen React-state gebruikt

`HomePage.jsx` rendert enkel de statische buitenkant (header, lege
`<svg id="sv">`, lege `<nav id="grid">`, ...) als JSX. De eigenlijke
werking — het veermodel achter alle beweging, de SVG-perspectiefwiskunde
voor het kaartenwiel, de 12 reken-/lijsttools, de in-pagina
hash-routering — staat in een string (`HOME_SCRIPT`) die in een
`useEffect` als een **echt, zelf uitvoerend `<script>`-element** aan de
pagina wordt toegevoegd. Dat is bewust: dit is dichte, onderling
afhankelijke wiskunde (perspectief-projecties, SVG-padopbouw,
kritisch gedempte veerfysica) waarin een handmatige omzetting naar
React-state een reëel risico op transcriptiefouten geeft. Het is dus
vrijwel 1-op-1 overgenomen; de enige inhoudelijke wijziging is de
toegevoegde Datumprikker-entry (met een extra array-element voor de
externe link) en de paar plekken die daarmee rekening houden
(zie de code-comment bovenaan `HomePage.jsx` voor het exacte overzicht).
Om diezelfde reden staat `<React.StrictMode>` niet meer in `main.jsx`:
die zou dit script in ontwikkelmodus twee keer laten draaien.

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

De homepage-CSS (`.top`, `.hero`, `svg#sv` + `.k/.kb/.ln/.sm/.smb/.tx`,
`.ctl`, `.all/.grid/.tl`, `.tp`, `.tgrid/.fld/.res/.stat/.add/.it`, ...)
is letterlijk overgenomen uit het AMIGO-homepage-artefact, met enkel de
`var(--...)`-namen als aliassen op het bestaande kleursysteem geplakt
(`--ivory`, `--black`, `--sig`, `--paper`, `--back` wijzen naar onze
eigen tokens) — zie de code-comment bovenaan dat CSS-blok in
`styles.css`.

- **Typografie**: Space Grotesk voor titels, labels en het wiel; Inter
  voor lopende tekst en formuliervelden; **Sora SemiBold (600)** specifiek
  voor het "AMIGO"-wordmerk zelf (`.logo`). Geladen via Google Fonts in
  `index.html`. Het logo is bewust een puur letterlogo — geen icoon/
  rode boog meer.
- **Dropdowns**: `<select>`-elementen (bv. het btw-tarief, de
  eenhedenomrekenaar) krijgen hun lettertype nu ook expliciet op hun
  `<option>`-elementen (`.fld select option`) — sommige browsers nemen
  de `font`-shorthand van de `<select>` zelf niet automatisch over in de
  openklapbare lijst.
- **Kleur**: dit homepage-artefact gebruikt bewust een beperkter
  palet dan het eerdere merkboek — in essentie ivoor/zwart/Signal Red.
  De planner-/stempagina's behielden wel hun bredere palet (Deep Blue,
  Forest/Mustard/Red voor de stemkleuren in de kalender) — dat was geen
  onderdeel van "gebruik dit als homepage". De focus-ring (`:focus-visible`)
  is wel overal naar Signal Red gebracht, voor consistentie.
- **Geometrie**: rechte hoeken (geen afronding op de homepage-
  elementen zelf — vierkante `.tl`-tegels, vierkante knoppen), 2px
  randen, geen schaduwen.
- **SVG-kaartenwiel**: een geprojecteerd 3D-perspectief (geen CSS
  `transform: rotateX`, maar een eigen `P()`-projectiefunctie die
  coördinaten uitrekent), een kritisch gedempt veermodel voor alle
  beweging (scroll/sleep/toetsen/knoppen lopen allemaal naar hetzelfde
  doel `tg`), en 13 tools in het "alle tools"-raster eronder.
- **Dark mode**: volgt standaard `prefers-color-scheme: dark`
  (achtergrond/tekst/randen wisselen mee; letterlijke merkkleuren zoals
  Signal Red blijven ongewijzigd, net als in het artefact) — én is nu
  **handmatig te kiezen** via de thema-knop in de koptekst (☾/☀︎), die
  een eigen keuze opslaat in `localStorage` (`amigo-theme`) via het
  `data-theme="dark"`/`"light"`-attribuut op `<html>`. Een klein
  scriptje vóór de rest van `index.html` past die keuze meteen toe, nog
  voor de eerste paint, zodat je niet eerst kort het verkeerde thema
  ziet opflitsen. Beide kopteksten gebruiken `ThemeToggle.jsx` en de
  gedeelde logica in `src/utils/theme.js`, met dezelfde sleutel/waarden
  als het scriptje in `index.html`. Een keuze op de ene pagina geldt
  daardoor ook op de andere. Zonder eigen keuze volgt ook het label van
  de knop wijzigingen van het systeemthema. Als `localStorage` niet
  beschikbaar is, blijft wisselen binnen de huidige pagina werken.
- **Reduced motion**: de volledige `prefers-reduced-motion`-regel uit
  het artefact (schakelt alle transities/animaties uit) — het
  kaartenwiel springt dan meteen naar de gekozen kaart i.p.v. te
  glijden.

Bewust **niet** overgenomen: de iconenset en illustratiestijl uit het
bredere merkboek (dit artefact gaat over de homepage zelf, niet over
dat volledige systeem) — en de eigenlijke Datumprikker-tool (prikker
aanmaken/stemmen) blijft, zoals eerder al zo gekozen, rustiger dan de
homepage: "de identiteit mag expressief zijn, de tools zelf moeten kalm
en praktisch blijven" (merkboek, 7.1).

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
