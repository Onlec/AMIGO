// Zelfde sleutel/waarden als het vóór-de-paint scriptje in index.html.
// Beide kopteksten gebruiken deze logica via ThemeToggle.jsx.
const STORAGE_KEY = 'amigo-theme';

export function getStoredTheme() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return null;
  }
}

export function applyTheme(theme) {
  if (theme === 'dark' || theme === 'light') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function getEffectiveTheme() {
  // De actieve keuze blijft geldig als opslaan in localStorage mislukt.
  const applied = document.documentElement.getAttribute('data-theme');
  if (applied === 'dark' || applied === 'light') return applied;
  const stored = getStoredTheme();
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (err) {
    /* negeerbaar: thema werkt dan gewoon niet over bezoeken heen */
  }
  applyTheme(theme);
}
