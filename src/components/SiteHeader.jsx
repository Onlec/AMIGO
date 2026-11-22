import React from 'react';

export default function SiteHeader() {
  return (
    <header className="head">
      <div className="wrap">
        <a className="logo" href="?">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" fill="#A83232" />
            <path d="M8 28V13a6 6 0 0 1 12 0v15z" fill="#EEEBDD" />
          </svg>
          AMI<em>GO</em>
        </a>
        <span className="lab ref">Ref. AMG-3.0 · Planner</span>
        <nav aria-label="Hoofdmenu">
          <a href="?">Home</a>
          <a href="?page=planner">Planner</a>
        </nav>
      </div>
    </header>
  );
}
