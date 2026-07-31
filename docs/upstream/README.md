# Upstream reports

Bugs found in [MoreThanUI](https://www.npmjs.com/package/morethanui) 1.0.0 while
building Transcrape's UI, written up as prompts to paste into an agent session
opened in the MTUI repo. They're kept here so the workarounds in
`src/app.css` and `src/routes/+layout.svelte` have something to point at, and so
they can be dropped once the library ships fixes.

| File | About |
| --- | --- |
| [MTUI-FIX-PROMPT.md](MTUI-FIX-PROMPT.md) | `x-select` panel positioning, and its undocumented dependency on `menu.js` |
| [MTUI-SHELL-NAV-FIX-PROMPT.md](MTUI-SHELL-NAV-FIX-PROMPT.md) | `.shell-nav` placement having no `data-*` knob, unlike every other appearance decision |
