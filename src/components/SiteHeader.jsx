import React from 'react';
import ThemeToggle from './ThemeToggle.jsx';

// Enkel gebruikt op de planner-/stempagina's: de homepage (HomePage.jsx)
// heeft haar eigen koptekst, in dezelfde stijl.
export default function SiteHeader() {
  return (
    <header className="top">
      <div className="wrap">
        <a className="logo" href="?">
          AMIGO
        </a>
        <nav aria-label="Hoofdmenu">
          <a href="?">Index</a>
          <a href="?page=planner">Nieuwe prikker</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
