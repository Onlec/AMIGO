import React from 'react';

const icons = {
  planners: <><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M8 3v4m8-4v4M4 10h16m-12 4h3m2 3h3" /></>,
  registrations: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
  answers: <><path d="M9 5h11M9 12h11M9 19h11M3 5l1 1 2-3m-3 9 1 1 2-3m-3 9 1 1 2-3" /></>,
  finalizedPlanners: <><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5" /></>,
  doubt: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1" /></>,
  monday: <><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M8 3v4m8-4v4M4 10h16m-12 4 8 4m0-4-8 4" /></>,
  weekend: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  agreement: <><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>,
  singleOption:<><rect x="4" y="5" width="16" height="15" rx="1"/><path d="M8 3v4m8-4v4M4 10h16m-9 4 2-1v5"/></>,
  timeless:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M4 20 20 4"/></>,
  sameTime:<><circle cx="8" cy="10" r="6"/><path d="M8 7v3l2 1m5-3a6 6 0 1 1-7 9m8-4v3l2 1"/></>,
  choiceStress:<><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="19" r="2"/></>,
};

export default function StatisticIcon({ id }) {
  return <span className="office-statistic-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-statistic-icon={id}>
      {icons[id]}
    </svg>
  </span>;
}
