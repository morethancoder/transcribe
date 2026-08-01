/**
 * No server rendering, in either build.
 *
 * The app build can't have it — Tauri serves the frontend as static files from
 * its webview, with Rust rather than a Node server behind it. But it was never
 * doing anything for the server build either: history lives in localStorage,
 * the file is picked with the File API, and model and job state are fetched on
 * mount, so every route server-rendered the same empty skeleton the client
 * shows for a moment anyway. Off in both keeps one behaviour to reason about.
 *
 * This does not affect `src/routes/api/*` — those are server routes, and the
 * server build still runs them.
 */
export const ssr = false;

/** `/history/[id]` is keyed by an id that only exists in a given device's
 *  localStorage, so there is no set of pages to render ahead of time. */
export const prerender = false;
