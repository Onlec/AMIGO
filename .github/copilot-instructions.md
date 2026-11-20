# Project instructions

## Project overview

- This is `datumprikker`, a Dutch-language React 18 and Vite web app for scheduling group dates.
- Gun.js provides peer-to-peer realtime synchronization; there is no application database or REST API.
- The Express process in `server/relay.js` is only a Gun relay and optionally stores Gun data under `data/`.
- Keep the app statically deployable. Use `VITE_GUN_RELAY` for the relay URL; local development uses `http://localhost:8765/gun`.

## Source layout

- Keep route-level behavior in `src/App.jsx`.
- Put reusable UI in `src/components/`.
- Put Gun subscriptions in `src/hooks/`; keep the shared Gun instance in `src/gun.js`.
- Put pure helpers in `src/utils/`; follow the existing `.js` and `.jsx` ES-module conventions.
- Keep application styling in `src/styles.css`.

## React and Gun conventions

- Use function components and React hooks. Match the existing plain JavaScript style; TypeScript and state-management libraries are not currently configured.
- Preserve stable Gun node references. Create poll, dates, and votes nodes with `useMemo` where they feed a subscription hook.
- Keep Gun cleanup correct: subscription hooks must unsubscribe through `node.off()` and list hooks must reset stale items when their node changes.
- Strip Gun's internal `_` metadata field before storing subscription values in React state.
- Keep vote data atomic. Store each participant's votes as JSON in `votesJson`, using one `put()` call for a vote update.
- Use `src/utils/votes.js` for vote values and parsing. Valid values are `none`, `yes`, `maybe`, and `no`.
- Preserve the existing Gun data model documented in `README.md`; especially use `polls/<pollId>`, `dates`, `votes`, and the poll fields `status` and `finalDateId`.
- Normalize organizer and voter e-mail addresses to lowercase before storing or comparing them.
- Do not introduce authentication or server-side authorization as part of unrelated UI changes; existing organizer recognition is intentionally e-mail-based.

## UI conventions

- Preserve the Dutch user-facing text and existing form terminology.
- Use the existing CSS classes and variables in `src/styles.css` rather than introducing a CSS framework or inline layout system.
- Keep form validation and clear inline error behavior consistent with `CreatePollPage` and `VoterForm`.
- Preserve live updates and the poll link behavior (`?poll=<pollId>`).
- Add appropriate button types and accessible labels for interactive controls.

## Commands

- Install dependencies with `npm install`.
- Start the Relay with `npm run relay` and the app with `npm run dev`.
- For a production build, run `npm run build`.
- There is currently no test script. For behavior changes, run `npm run build` and, when practical, manually verify the relevant flow in a browser with two tabs.
- Do not add or replace dependencies unless the change requires it.
