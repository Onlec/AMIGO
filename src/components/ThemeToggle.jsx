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
      <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
    </button>
  );
}
