import React, { useEffect, useState } from 'react';
import { getEffectiveTheme, setTheme } from '../utils/theme.js';

export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getEffectiveTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => setThemeState(getEffectiveTheme());
    updateTheme();
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, []);

  function handleClick() {
    const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button type="button" className="theme-toggle" role="switch" aria-label="Donker thema" aria-checked={theme === 'dark'} onClick={handleClick}>
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24">
          {theme === 'dark' ? (
            <path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
            </>
          )}
        </svg>
      </span>
    </button>
  );
}
