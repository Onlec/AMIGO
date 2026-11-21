import React, { useMemo } from 'react';
import CreatePollPage from './components/CreatePollPage.jsx';
import PollPage from './components/PollPage.jsx';

function getPollIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('poll');
}

export default function App() {
  const pollId = useMemo(getPollIdFromUrl, []);

  return (
    <>
      <header className="brand-header">
        <span className="brand-wordmark">AMIGO</span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-tool-label">Planner</span>
      </header>
      {pollId ? <PollPage pollId={pollId} /> : <CreatePollPage />}
    </>
  );
}
