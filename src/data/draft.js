import { PLANNER_STORAGE_NAMESPACE } from '../config.js';
const key = PLANNER_STORAGE_NAMESPACE + ':create-draft';
export function readDraft() {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
export function saveDraft(value) {
  // Deliberately whitelist non-secret fields; never persist credentials here.
  const { title='', description='', organizerName='', participating=true, selectedDates={}, timesEnabled=false, defaultTime='' } = value;
  try { localStorage.setItem(key, JSON.stringify({ title, description, organizerName, participating, selectedDates, timesEnabled, defaultTime })); } catch {}
}
export function clearDraft() { try { localStorage.removeItem(key); } catch {} }
