# AMIGO Planner

AmiGo is een React/Vite-app met dertien tools. De rotary-index op de homepage werkt met het scrollwiel, slepen, pijltjestoetsen en Vorige/Volgende. Agenda en Notities bewaren hun gegevens in de browser. De Datumprikker gebruikt IndexedDB op het toestel en Supabase voor het delen en synchroniseren.

## Installeren

1. Installeer Node.js 22.12 of nieuwer en voer `npm ci` uit.
2. Maak een Supabase-project. Schakel **Allow anonymous sign-ins** in onder Authentication. Deelnemers vullen in de app alleen hun naam in.
3. Voer de SQL uit `supabase/migrations/202611230001_planner.sql` eenmaal uit in de SQL Editor van het nieuwe project. De migratie maakt de privétabellen, RPC-functies en het toegangsbeleid voor de privékanalen in Realtime aan. Gebruik een eigen project voor deze app.
4. Kopieer `.env.example` naar `.env`. Vul `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY` in met de project-URL en publieke sleutel van dit project. Vite neemt deze waarden op tijdens de build.
5. Start met `npm run dev`. Voor de productieversie voer je `npm run build` uit en publiceer je de inhoud van `dist/` op de root van een HTTPS-site. Met `npm run preview` test je die versie op localhost.

Dit is een schone start voor de Datumprikker. Prikkers uit de Gun-prerelease worden niet geïmporteerd. Houd bij een upgrade hetzelfde webadres aan voor toegang tot de bestaande lokale Agenda, Notities en themakeuze.

## Gebruik en offline werken

- Open `/` voor de index of `?page=planner` voor een nieuwe prikker. Kies minstens twee datums, eventueel met tijdstip, en een organisatorwachtwoord.
- Deel de link met `?poll=<id>`. Deelnemers doorlopen per datum Ja, Misschien, Nee en leeg. De organisator kan de gegevens bewerken, deelnemers verwijderen en een datum bevestigen. Een ander toestel kan online met het wachtwoord ontgrendelen.
- Open de productieversie eenmaal online zodat de serviceworker de app en de lettertypen kan opslaan. Open een gedeelde prikker eenmaal online om ook de gegevens op dat toestel te bewaren. Je kunt daarna offline herladen, prikkers aanmaken, stemmen en ontgrendelde prikkers beheren.
- Elke lokale wijziging krijgt een eigen ID. Bij herverbinden verstuurt de geopende app de wachtrij in volgorde. Na het sluiten van de browser gaat dit verder bij het volgende bezoek. Een nieuwe offline prikker is voor anderen bereikbaar zodra de eerste synchronisatie is bevestigd.
- Stemmen op verschillende datums worden afzonderlijk verwerkt. Bij wijzigingen aan hetzelfde veld geldt de laatst door de server geaccepteerde opdracht. De server weigert onder meer stemmen op verwijderde datums en gesloten prikkers. De pagina toont het resultaat.
- De lokale kopie, anonieme sessie en nog te versturen wijzigingen horen bij dit browserprofiel. Het wissen van sitegegevens verwijdert ze.

## Onderhoud en controle

De plannercomponenten lezen uit de lokale kopie. `src/data/polls.js` beheert de IndexedDB-transacties en past openstaande opdrachten toe op het laatst bevestigde resultaat. `src/data/sync.js` verzorgt de Supabase-sessie, bevestigingen, retries en Realtime. Alleen de publieke RPC-functies geven toegang tot de gegevens. Een privébericht meldt dat er iets is gewijzigd, waarna de browser de actuele prikker ophaalt.

De huisstijl staat onder `src/styles/`, met aparte bestanden voor lettertypen, thema, homepage met tools en Datumprikker. `src/styles.css` bepaalt de laadvolgorde. De lettertypen worden lokaal uit de Fontsource-pakketten meegebouwd. De persoonlijke tools gebruiken hun bestaande localStorage-sleutels.

De SQL-regressietest in `supabase/tests/planner.sql` controleert rechten, dubbele opdrachten, afzonderlijke stemmen en conflicten. Voer deze in een gemigreerde testdatabase uit met `psql -v ON_ERROR_STOP=1 -f supabase/tests/planner.sql`. De test gebruikt een transactie en draait die terug.

Test offline met de productiebuild. Maak in een browserprofiel offline een prikker aan, stem en herlaad. Herstel de verbinding en open de link in een tweede profiel. Controleer live stemmen, ontgrendelen en het bevestigen van een datum terwijl het andere profiel offline is.
