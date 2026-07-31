# Prompt: fixes for MoreThanUI (morethanui@1.0.0)

Paste everything below the line into an agent session opened in the MTUI library repo.

---

Fix the following issues found while integrating morethanui@1.0.0 into a Svelte 5 app.
All line references are against the published 1.0.0 package.

## 1. `x-select` panel opens at the top-left corner (0,0) of the viewport

**Symptom:** with only `js/x-select.js` loaded (no `js/menu.js`), opening the select
renders the listbox panel pinned to the viewport origin instead of anchored under
its trigger.

**Root cause chain:**
- `js/x-select.js:76` appends the panel to `document.body` with the comment
  "anchored by js/menu.js" — all positioning is delegated to `menu.js`.
- `llms.txt` says enhanced inputs "each need their script tag once per page" and the
  x-select section lists only `js/x-select.js`; nothing states `menu.js` is a hard
  dependency for anchoring, so integrators load x-select alone.
- Even the documented no-JS fallback ("the popover opens centered in the top layer",
  `js/menu.js:8`) doesn't hold: `css/base.css:63` `* { margin: 0 }` overrides the UA
  popover default `margin: auto`, so an unpositioned `[popover]` sits at `inset: 0`'s
  top-left corner — literally 0,0 — instead of centered.

**Fix (do all three):**
1. Make `x-select.js` self-anchoring: extract the `place()`/tracking logic from
   `menu.js` into a small shared helper included in both files (or have x-select
   register the same document-level `toggle` capture listener when it isn't already
   registered). A user loading only `x-select.js` must get an anchored panel.
2. Restore the centered fallback in CSS so unanchored popovers are never at 0,0:
   in `components.css`, give `.menu[popover]` (and any popover-based panel)
   `margin: auto`, which re-establishes UA centering that the `* { margin: 0 }`
   reset destroys.
3. Update `llms.txt`: if any component still relies on `menu.js` for anchoring
   (`.menu` used by the menu component, x-select, x-contextmenu templates…), say so
   explicitly in each affected component's section, not just in a comment in the
   source.

## 2. `x-select` face goes stale when the value is changed programmatically

`x-select.js` only calls `syncFace()` from its own `commit()`. If app code or a
framework binding sets `select.value` / `selectedIndex` directly (very common with
Svelte/Vue/React bindings), the trigger label and `aria-selected` states keep
showing the old value.

**Fix:** call `syncFace()` when the panel opens (in the existing `toggle` handler,
`x-select.js:127-134`), listen for native `change` events on the wrapped select
(guard against recursion with the synthetic change dispatched in `commit()`), and
expose a public `sync()` method on the element for imperative refresh. Also re-read
`select.disabled` there so a dynamically disabled select disables its trigger.

## 3. Panel min-width is applied after positioning

Order of operations when the panel opens: `menu.js`'s document-level capture
listener fires first and calls `place()` (measuring the panel at its natural
width), then `x-select`'s own `toggle` listener sets
`panel.style.minWidth = trigger width` (`x-select.js:131`). The panel can grow
after it was measured and clamped, so the viewport clamping and the RTL
right-alignment in `place()` (`menu.js:25-26`) are computed against the wrong
width.

**Fix:** set the min-width in a `beforetoggle` listener (runs before the panel is
shown and before `toggle`), or have the positioning helper re-run `place()` after
layout (rAF or ResizeObserver on the panel).

## 4. The documented dark-mode switch does not persist

`llms.txt` offers two theming paths: `<x-theme>` (persists to `mtui-theme` etc.)
and the inline "Dark mode" switch snippet (`llms.txt:44-47`) that flips
`documentElement.dataset.theme` and persists nothing — users toggle dark, reload,
and are back to light, which reads as a bug.

**Fix:** ship a tiny helper (e.g. `mtui.theme.set('dark')`) that writes the same
`mtui-theme` localStorage key x-theme uses, and update the snippet in `llms.txt` to
use it (plus a note that a pre-paint inline script — or loading x-theme.js — is
needed to restore the stored value without a flash).

## 5. Minor a11y/UX issues in `x-select`

- Tab while the panel is open moves focus out but leaves the panel open
  (`keydown` handler `x-select.js:101-125` doesn't handle `Tab`). Close the panel
  (and skip the trigger refocus) on Tab, matching native select behavior.
- Type-ahead only matches a single character; typing "sw" focuses "Spanish" then
  "Swedish" instead of accumulating a buffer. Accumulate keystrokes with a ~500 ms
  reset timer.
- `Escape` inside the panel closes it via the popover light-dismiss, but focus is
  not returned to the trigger — return it explicitly.

After fixing, republish and update the "Enhanced inputs" section of `llms.txt` so
every component's listed script tags are truly sufficient on their own.
