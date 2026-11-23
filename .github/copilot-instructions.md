# Project instructions

## Project overview

- This is `datumprikker`, a Dutch-language React 18 and Vite web app for scheduling group dates.
- Supabase stores shared polls. IndexedDB retains their local copy and pending operations.
- Keep the app statically deployable. See README.md for the public Supabase configuration.

## Source layout

- Keep route-level behavior in `src/App.jsx`.
- Put reusable UI in `src/components/`.
- Keep local poll storage and synchronization in `src/data/`.
- Put pure helpers in `src/utils/`; follow the existing `.js` and `.jsx` ES-module conventions.
- Keep the CSS entry point in `src/styles.css` and the ordered stylesheets under `src/styles/`.

## React and data conventions

- Use function components and React hooks. Match the existing plain JavaScript style; TypeScript and state-management libraries are not currently configured.
- Commit pending edits atomically in IndexedDB. Deduplicate retries in the same database transaction as the corresponding change.
- Use `src/utils/votes.js` for vote values and parsing. Valid values are `none`, `yes`, `maybe`, and `no`.
- Authorize writes on the server. Anonymous sessions identify voters and the organizer password unlocks management per browser.

## UI conventions

- Preserve the Dutch user-facing text and existing form terminology.
- Use the existing CSS classes and variables in `src/styles.css` rather than introducing a CSS framework or inline layout system.
- Keep form validation and clear inline error behavior consistent with `CreatePollPage` and `VoterForm`.
- Preserve live updates and the poll link behavior (`?poll=<pollId>`).
- Add appropriate button types and accessible labels for interactive controls.

## Commands

- Install dependencies with `npm install`.
- Start the app with `npm run dev`.
- For a production build, run `npm run build`.
- There is currently no test script. For behavior changes, run `npm run build` and, when practical, manually verify the relevant flow in a browser with two tabs.
- Do not add or replace dependencies unless the change requires it.
