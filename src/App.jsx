import React, { useState } from 'react';
import SiteHeader from './components/SiteHeader.jsx';
import HomePage from './components/HomePage.jsx';
import CreatePollPage from './components/CreatePollPage.jsx';
import PollPage from './components/PollPage.jsx';

function getRoute() {
  const params = new URLSearchParams(window.location.search);
  const pollId = params.get('poll');
  if (pollId) {
    return { name: 'poll', pollId, share: params.get('screen') === 'share' };
  }
  if (params.get('page') === 'planner') {
    return { name: 'planner' };
  }
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(getRoute);

  function showShare(pollId, link, initialCopy) {
    window.history.replaceState(null, '', link + '&screen=share');
    setRoute({ name: 'poll', pollId, share: true, initialCopy });
  }

  if (route.name === 'home') {
    return <HomePage />;
  }

  return (
    <>
      <SiteHeader />
      {route.name === 'poll' && <PollPage pollId={route.pollId} share={route.share} initialCopy={route.initialCopy} />}
      {route.name === 'planner' && <CreatePollPage onCreated={showShare} />}
    </>
  );
}
