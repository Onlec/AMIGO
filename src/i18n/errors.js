import dutch from './nl-BE.js';
import { message } from './index.js';

// The RPC currently returns Dutch messages. Map that contract to stable client keys.
const serverKeys = new Map(Object.entries(dutch)
  .filter(([, value]) => typeof value === 'string' && !value.includes('{'))
  .map(([key, value]) => [value, key]));

export function errorMessage(error) {
  if (error?.localizationKey) return message(error.localizationKey);
  const key = serverKeys.get(error?.message);
  if (key) return message(key);
  const removedDate = /^De datum (\d{4}-\d{2}-\d{2}) is verwijderd\. Controleer je keuzes\.$/.exec(error?.message || '');
  if (removedDate) return message('server.specificDateRemoved', { date: removedDate[1] });
  return message('error.generic');
}
