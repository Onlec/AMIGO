import React from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import { PLANNER_ONLY } from '../config.js';

// Enkel gebruikt op de planner-/stempagina's: de homepage (HomePage.jsx)
// heeft haar eigen koptekst, in dezelfde stijl.
export default function SiteHeader() {
  return (
    <header className="top planner-header">
      <div className="wrap">
        <a className="logo" href="?">
          AMIGO
        </a>
        <nav aria-label="Hoofdmenu">
          {!PLANNER_ONLY && <a href="?">Index</a>}
          <a href="?page=planner">Nieuwe prikker</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
