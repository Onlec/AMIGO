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
  goats: <><path d="M9 7C5 7 5 3 7 2m8 5c4 0 4-4 2-5M8 8 3 7l2 5 3 1m8-5 5-1-2 5-3 1M8 8l1 10 3 3 3-3 1-10-4-2-4 2Zm2 5h.1m3.8 0h.1M11 17h2" /></>,
  meetings: <><circle cx="7" cy="6" r="2" /><circle cx="17" cy="6" r="2" /><path d="M3 13v-1a4 4 0 0 1 8 0m2 0a4 4 0 0 1 8 0v1M5 14h14M7 14v7m10-7v7M3 17h3m12 0h3" /></>,
};

export default function StatisticIcon({ id }) {
  return <span className="office-statistic-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" data-statistic-icon={id}>
      {icons[id]}
    </svg>
  </span>;
}
