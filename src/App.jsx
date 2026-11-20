import React, { useMemo } from 'react';
import CreatePollPage from './components/CreatePollPage.jsx';
import PollPage from './components/PollPage.jsx';

function getPollIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('poll');
}

export default function App() {
  const pollId = useMemo(getPollIdFromUrl, []);

  if (!pollId) {
    return <CreatePollPage />;
  }

  return <PollPage pollId={pollId} />;
}
