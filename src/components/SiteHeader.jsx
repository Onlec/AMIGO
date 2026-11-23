import React from 'react';

// Enkel gebruikt op de planner-/stempagina's: de homepage (HomePage.jsx)
// heeft haar eigen koptekst, overgenomen uit het AMIGO-homepage-artefact.
export default function SiteHeader() {
  return (
    <header className="top">
      <div className="wrap">
        <a className="logo" href="?">
          <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" fill="#D21F26" />
            <path d="M8 28V13a6 6 0 0 1 12 0v15z" fill="#EEEBDD" />
          </svg>
          AMIGO
        </a>
        <nav aria-label="Hoofdmenu">
          <a href="?">Index</a>
          <a href="?page=planner">Nieuwe prikker</a>
        </nav>
      </div>
    </header>
  );
}
