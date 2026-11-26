import { message } from './index.js';

// The RPC currently returns Dutch messages. Map that contract to stable client keys.
// Keep the server's fixed message contract separate from editable translations.
const serverKeys = new Map([
  ['De gekozen datum blijft behouden.', 'server.keepDate'],
  ['De prikker is gesloten of verwijderd.', 'server.closedOrRemoved'],
  ['De prikker is gesloten.', 'server.closed'],
  ['Deze aanmelding is niet geldig. Probeer opnieuw.', 'server.invalidLogin'],
  ['Deze datum is verwijderd.', 'server.dateRemoved'],
  ['Deze deelnemer is verwijderd.', 'server.voterRemoved'],
  ['Deze naam is al in gebruik. Kies je bestaande stem of gebruik een andere naam.', 'server.nameTaken'],
  ['Kies een stemwachtwoord.', 'server.passwordRequired'],
  ['Kies minstens twee datums.', 'server.twoDates'],
  ['Onbekende wijziging.', 'server.unknownChange'],
  ['Ontgrendel eerst de bewerkmodus.', 'server.organizerRequired'],
  ['Sessie ontbreekt.', 'server.sessionMissing'],
  ['Vul je beschikbaarheid in.', 'server.availabilityRequired'],
  ['Vul je naam in.', 'validation.nameRequired'],
  ['Wachtwoord klopt niet.', 'server.wrongPassword'],
  ['Prikker niet gevonden.', 'sync.missing'],
  ['Heropen de poll om datums aan te passen.', 'organizer.reopenForDates'],
  ['De gekozen einddatum blijft behouden.', 'organizer.keepFinalDate'],
]);

export function errorMessage(error) {
  if (error?.localizationKey) return message(error.localizationKey);
  const key = serverKeys.get(error?.message);
  if (key) return message(key);
  const removedDate = /^De datum (\d{4}-\d{2}-\d{2}) is verwijderd\. Controleer je keuzes\.$/.exec(error?.message || '');
  if (removedDate) return message('server.specificDateRemoved', { date: removedDate[1] });
  return message('error.generic');
}
