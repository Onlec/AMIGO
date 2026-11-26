import React, { useEffect, useState } from 'react';
import SiteHeader from './components/SiteHeader.jsx';
import HomePage from './components/HomePage.jsx';
import CreatePollPage from './components/CreatePollPage.jsx';
import PollPage from './components/PollPage.jsx';
import { PLANNER_ONLY } from './config.js';
import { useLocale } from './i18n/react.js';
import { t } from './i18n/index.js';

function getRoute() {
  const params = new URLSearchParams(window.location.search);
  const pollId = params.get('poll');
  if (pollId) {
    return { name: 'poll', pollId, share: params.get('screen') === 'share' };
  }
  if (params.get('page') === 'planner') {
    return { name: 'planner' };
  }
  return { name: PLANNER_ONLY ? 'planner' : 'home' };
}

export default function App() {
  const locale = useLocale();
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    if (route.name !== 'home') document.title = t('app.documentTitle');
  }, [route.name, locale]);

  function showShare(pollId, link) {
    window.history.replaceState(null, '', link + '&screen=share');
    setRoute({ name: 'poll', pollId, share: true });
  }

  if (route.name === 'home') {
    return <HomePage />;
  }

  return (
    <>
      <SiteHeader />
      {route.name === 'poll' && <PollPage pollId={route.pollId} share={route.share} />}
      {route.name === 'planner' && <CreatePollPage onCreated={showShare} />}
    </>
  );
}
