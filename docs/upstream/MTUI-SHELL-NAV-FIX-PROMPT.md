# Prompt: fixes for MoreThanUI `shell-nav` (morethanui@1.0.0)

Paste everything below the line into an agent session opened in the MTUI library repo.

---

Fix the following issues with `.shell-nav`, found while integrating
morethanui@1.0.0 into a Svelte 5 app. All line references are against the
published 1.0.0 package. Measurements were taken in Chrome 147 with stock
tokens (`data-theme` light and dark, `data-accent="cobalt"`,
`data-density="comfortable"`), using the two-item `shell` example from
`llms.txt:60-68` verbatim.

## 1. Nav placement is the one appearance decision with no knob

Every other appearance decision in MTUI is a `data-*` attribute on `<html>` —
`data-theme`, `data-accent`, `data-radius`, `data-density`, `data-tint`
(`llms.txt:24-34`). Nav placement is not:

- `layout.css:91` hardcodes bottom tab bar `<768px`, 5rem inline-start rail
  `>=768px`. `grep -rn "data-nav\|nav-position" css/ js/` returns nothing.
- `layout.css:19` and the `shell` row of the DESIGN.md component table
  (`DESIGN.md:237`) both *describe* the behavior, so it isn't undocumented —
  it's just not selectable.
- `layout.css:5-6` states "App code never writes layout CSS or media queries —
  the media queries in THIS file are the only sanctioned ones."

Those two facts together leave no legal path. An app that wants the tab bar at
every width (common: few destinations, or a desktop-first tool where an 80px
rail is mostly empty) must override the library's own media query, which the
guide forbids. There is no MTUI-sanctioned answer to "I don't want the rail."

**Fix:** add `data-nav` to the `<html>` knob set — `auto` (default, today's
responsive behavior) | `bar` (tab bar at all widths) | `rail` (rail at all
widths). Implement by scoping the `@media (min-width: 768px)` block to
`:root:not([data-nav="bar"])` and adding an unconditional rail block for
`[data-nav="rail"]`. Then list it in the theming section of `llms.txt` beside
the other five knobs, and in DESIGN.md.

## 2. The rail clips any label longer than ~9 characters

Measured at 1200x900:

| Label | Label span width | Right edge | Rail right edge | Result |
| --- | --- | --- | --- | --- |
| `Transcribe` | 66.0px | 73.0px | 80px | fits, but 2px past its 64px item box |
| `Notifications` | 81.6px | 80.8px | 80px | overflows |
| `Transcriptions` | 90.1px | 85.1px | 80px | overflows by 5px |

`nav.scrollWidth` is 81 against `clientWidth` 80, confirming real overflow.

**Root cause:** `.shell-nav` at `>=768px` is `inline-size: 5rem` (80px) with
`padding-inline: var(--sp-8)` (`layout.css:100-107`), leaving 64px usable.
`.shell-nav > *` (`layout.css:63-85`) sets no `overflow`, `text-overflow`,
`hyphens`, or `word-break`, and the label is a bare `<span>` — so it neither
wraps nor truncates, it just spills. Because items are centered, it spills from
both sides; against the viewport's inline start the text is simply cut in half.

Every `shell` example in `llms.txt` and DESIGN.md uses short labels ("Home",
"Inbox", "New"), so the ceiling is invisible until a real label ships. Nothing
states one exists.

**Fix (pick one, then document the resulting constraint in the `shell` section
of `llms.txt`):**

1. Size the rail to its content with bounds —
   `inline-size: auto; min-inline-size: 5rem; max-inline-size: 9rem` — so
   normal labels fit and pathological ones still can't eat the screen.
2. Allow two lines: `display: -webkit-box; -webkit-line-clamp: 2;
   -webkit-box-orient: vertical; overflow: hidden` on the label.
3. Keep 5rem and truncate: `overflow: hidden; text-overflow: ellipsis;
   white-space: nowrap` on `.shell-nav > *`, plus an explicit
   "rail labels must be <= 9 characters" note in the docs.

Option 1 or 2 is preferable — 3 makes the library silently hide app content.

## 3. Tab bar items are small islands in a mostly dead bar

At the bottom-bar size (`<768px`, and any width once §1 is fixed),
`.shell-nav` is `justify-content: space-evenly` (`layout.css:51-61`) and
`.shell-nav > *` is sized only by its content plus
`min-inline-size: var(--tap-min)` (`layout.css:63-85`). Measured at 390x844,
each tab is ~64px wide in a 390px bar — about 33% of the bar is pressable, and
the rest silently does nothing.

Two consequences:

1. **Nothing marks the target.** `.shell-nav > *:hover` (`layout.css:86`) and
   the `aria-current` rule (`layout.css:89`) both change `color` only, so at
   rest a tab is unstyled text on the bar's `--surface`. There is no edge, no
   fill, nothing that says where to press — you aim at the glyph. On touch
   there is no hover state at all, so the affordance is zero.
2. **`background-color` is transitioned but never set.** `layout.css:81-84`
   declares `transition: color …, background-color …` on `.shell-nav > *`, and
   no rule in the library ever assigns a background. The transition is dead
   code today — which suggests a fill was intended and dropped.

Every other pressable surface in MTUI has a resting fill: `.btn` defaults to
`--surface-2` (`components.css:99`), `.chip` likewise (`components.css:399`),
and the selected chip gets `--accent-tint` / `--accent-text`
(`components.css:422-423`). Nav tabs are the only interactive control with
none.

**Fix:** let tab items flex to fill the bar (`flex: 1 1 0`, plus a
`max-inline-size` so a two-item bar on a wide screen doesn't produce
600px-wide tabs), give them `--surface-2` at rest and `--surface-3` on hover,
and give the `aria-current` tab `--accent-tint` / `--accent-text` to match the
selected-chip treatment. That also makes the existing `background-color`
transition do something. Add `padding-block` on `.shell-nav` while you're
there: today the only block padding is
`padding-block-end: env(safe-area-inset-bottom, 0px)`, which is `0` on desktop
and on any device without a home indicator, leaving the labels flush against
the viewport edge.

## Reference: what the consuming app has to write today

25 lines of layout CSS the guide says apps must never write, to get all three:

```css
@media (min-width: 768px) {
  body.shell {
    grid-template-areas: 'header' 'content' 'nav';
    grid-template-rows: auto 1fr auto;
    grid-template-columns: 1fr;
  }
  body.shell .shell-nav { flex-direction: row; inline-size: auto; }
}

body.shell .shell-nav {
  justify-content: center;
  gap: var(--sp-8);
  padding-inline: var(--pad);
  padding-block: var(--sp-8);
  padding-block-end: calc(var(--sp-8) + env(safe-area-inset-bottom, 0px));
}
body.shell .shell-nav > * {
  flex: 1 1 0;
  max-inline-size: 20rem;
  padding-block: var(--sp-8);
  background: var(--surface-2);
}
body.shell .shell-nav > *:hover { background: var(--surface-3); }
body.shell .shell-nav > [aria-current]:not([aria-current="false"]) {
  background: var(--accent-tint);
  color: var(--accent-text);
}
```

Note the `body.shell` prefix: `.shell` alone ties the override to stylesheet
order, and `body.shell > .shell-nav` doesn't match at all under SvelteKit,
which renders the app inside a `display: contents` wrapper — the nav is a grid
item of `body` but not its element child.

After fixing, republish and update the theming knob list in `llms.txt` so
`data-nav` sits alongside the other five, and the `shell` section so the label
constraint and the tab fill behavior are stated rather than discovered.
