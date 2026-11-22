import React, { useMemo } from 'react';
import SiteHeader from './components/SiteHeader.jsx';
import HomePage from './components/HomePage.jsx';
import CreatePollPage from './components/CreatePollPage.jsx';
import PollPage from './components/PollPage.jsx';

function getRoute() {
  const params = new URLSearchParams(window.location.search);
  const pollId = params.get('poll');
  if (pollId) {
    return { name: 'poll', pollId };
  }
  if (params.get('page') === 'planner') {
    return { name: 'planner' };
  }
  return { name: 'home' };
}

export default function App() {
  const route = useMemo(getRoute, []);

  return (
    <>
      <SiteHeader />
      {route.name === 'poll' && <PollPage pollId={route.pollId} />}
      {route.name === 'planner' && <CreatePollPage />}
      {route.name === 'home' && <HomePage />}
    </>
  );
}
