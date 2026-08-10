---
version: alpha
name: Industry
description: >-
  A steel-blue technical wireframe for Media Studio. Barlow Condensed over
  Barlow on a light ground, a modular grid, and cards, figures and buttons
  framed as blueprint objects — square-cornered, hairline-bordered, with "+"
  registration marks at the corners.
colors:
  bg: "#f2f2f3"
  surface: "#e9e9ea"
  text: "#1d1f20"
  accent: "#597ea3"
  accent-100: "#eef6ff"
  accent-200: "#d6ebff"
  accent-300: "#b5d9fd"
  accent-400: "#94bce3"
  accent-500: "#749dc4"
  accent-600: "#597ea3"
  accent-700: "#416180"
  accent-800: "#2c455d"
  accent-900: "#1d2d3d"
  neutral-100: "#f5f5f8"
  neutral-200: "#e7e7ea"
  neutral-300: "#d4d4d7"
  neutral-400: "#b7b7ba"
  neutral-500: "#98989b"
  neutral-600: "#7a7a7d"
  neutral-700: "#5d5d60"
  neutral-800: "#424244"
  neutral-900: "#2b2b2d"
  divider: "color-mix(in srgb, #1d1f20 16%, transparent)"
  muted: "color-mix(in srgb, #1d1f20 55%, transparent)"
  danger: "#8a2f2f"
typography:
  h1:
    fontFamily: Barlow Condensed
    fontSize: 2.625rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.015em
  h2:
    fontFamily: Barlow Condensed
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.015em
  h3:
    fontFamily: Barlow Condensed
    fontSize: 1.5625rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.015em
  h4:
    fontFamily: Barlow Condensed
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.015em
  h5:
    fontFamily: Barlow Condensed
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.015em
  h6:
    fontFamily: Barlow Condensed
    fontSize: 0.8125rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: 0.08em
  body:
    fontFamily: Barlow
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: Barlow
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.4
  support:
    fontFamily: Barlow
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Barlow
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
  meta:
    fontFamily: Barlow
    fontSize: 0.6875rem
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.08em
  action:
    fontFamily: Barlow Condensed
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.2
rounded:
  none: 0px
  full: 9999px
spacing:
  1: 3.4px
  2: 6.8px
  3: 10.2px
  4: 13.6px
  6: 20.4px
  8: 27.2px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: 6.8px 12.24px
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.text}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: 6.8px 12.24px
  button-icon:
    backgroundColor: transparent
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    size: 30px
  nav-link:
    backgroundColor: transparent
    textColor: "{colors.text}"
    typography: "{typography.ui}"
    rounded: "{rounded.none}"
    padding: 6.8px 10.2px
  nav-link-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.ui}"
    rounded: "{rounded.none}"
    padding: 6.8px 10.2px
  sidebar:
    backgroundColor: "color-mix(in srgb, {colors.surface} 60%, transparent)"
    width: 16.25rem
    padding: 10.2px
  navbar:
    backgroundColor: "{colors.bg}"
    typography: "{typography.h4}"
    height: 3.5rem
    padding: 0 20.4px
  panel-body:
    backgroundColor: "{colors.bg}"
    padding: 20.4px
  blueprint:
    backgroundColor: transparent
    rounded: "{rounded.none}"
  menu:
    backgroundColor: "{colors.bg}"
    typography: "{typography.ui}"
    rounded: "{rounded.none}"
    padding: 6.8px
---

## Overview

Industry is a wireframe. The interface reads as a technical drawing: a light
paper ground, a single steel-blue accent, condensed headings over a plain body
face, and every container drawn as a line — square-cornered, hairline-bordered,
transparent — with `+` registration marks at its four corners. Nothing is a soft
filled rounded block. The one deliberate exception is the primary button, which
is the single solid object on the board.

The system runs at 0.85× density: the spacing scale steps in units of 3.4px
rather than 4px, so the frame is tighter than a default component library
without any size changing.

**Where it lives.** The tokens are CSS custom properties in
`frontend/app/assets/css/`, split in two tiers:

| File | Holds |
| --- | --- |
| `main.css` | Primitives — tonal ramps, type scale, density scale. The only place a literal colour or length appears. Tailwind reads `@theme` from the entry stylesheet only, which is why they cannot be extracted. |
| `tokens.css` | Semantic roles built from the primitives, and the bridge that hands those roles to the Nuxt UI `--ui-*` tokens. |
| `base.css` | Element defaults: the heading face, links, focus rings, selection, scrollbars. |
| `blueprint.css` | The primitives the component library has no equivalent for: `.blueprint` (+ corner marks), `.wireframe` and `.duotone`. |

Application code reads roles, never primitives, and never a literal value. If
something needs a colour or a length that no token carries, add the token.

## Colors

A light ground (`--color-bg` `#f2f2f3`) with `--color-text` `#1d1f20` and a
single accent, `#597ea3`. This is a mono scheme — there is no second accent, and
none should be introduced.

Each role carries a 100–900 tonal ramp generated in OKLCH on one shared
lightness scale, so the same step of any ramp has the same visual weight. Use
the light steps (100–300) for tinted fills, hovers and subtle borders, 600 as
the accent's base on the light ground, and the dark steps (700–900) for text on
tinted fills and for pressed states. Prefer a ramp step over an ad-hoc
`color-mix()`.

**Roles, not ramps.** Components read semantic names:

| Role | Means |
| --- | --- |
| `--color-bg` / `--color-surface` | The ground, and the sunk plane on it |
| `--color-text` | Ink |
| `--color-accent` / `--color-accent-hover` / `--color-accent-active` | The accent and its two interaction steps |
| `--color-on-accent` | Text on a solid accent field |
| `--color-tint` / `--color-on-tint` | An accent-tinted fill and its text |
| `--color-tint-strong` / `--color-on-tint-strong` | The heavier tint, for identity chips |
| `--color-mark` / `--color-on-mark` | The solid brand plate |
| `--color-divider` / `--color-divider-strong` | Hairlines |
| `--color-toned` / `--color-muted` / `--color-dimmed` | Text at 70% / 55% / 40% of the ink |
| `--color-hover` / `--color-pressed` / `--color-row-hover` | Interaction tints |
| `--color-link` / `--color-link-hover` | Body-copy links |
| `--color-danger` | Destructive actions — the one colour outside the mono scheme |

**Dark theme.** The ink becomes the ground and the paper becomes the ink: `--color-bg`
drops to `#1d1f20`, `--color-text` rises to `#f2f2f3`, and the accent moves one
step lighter (`accent-400`) so it keeps its contrast against the dark ground.
Roles that are expressed as a proportion of the ink — dividers, muted text,
hovers — flip on their own and are defined once for both themes. Only the
handful of roles that genuinely change get a `.dark` entry.

**Contrast.** The accent-to-ground pair is tuned to about 3:1 — enough for
icons, large text and interface chrome, not for body copy. For paragraph-size
text in the accent use `--color-link`, which resolves to a deep ramp step.

## Typography

Barlow Condensed at weight 600 for headings over Barlow at 400 for body text,
both served locally. Headings run at a fixed scale (42 / 32 / 25 / 20 / 16 /
13px) with a 1.12 line-height and -0.015em tracking; `h6` inverts to uppercase
with +0.08em tracking. Density moves spacing, not sizes.

Interface text has its own steps, named by role rather than t-shirt size:
`--text-meta` (11px, captions and tags), `--text-label` (12px), `--text-support`
(13px, secondary copy), `--text-ui` (14px, controls and navigation) and
`--text-body` (15px, running text). Use these in stylesheets; in Tailwind class
strings use `text-xs` and `text-sm`, which carry identical values and let
tailwind-merge tell a size from a colour.

Actions are set in the condensed face — buttons, not just headings, speak in
Barlow Condensed. Navigation items and the account row are the exception: they
drop back to Barlow at 400 so the sidebar reads as a list, not a row of buttons.

## Layout

The spacing scale is `--space-1` … `--space-8` at 3.4 / 6.8 / 10.2 / 13.6 /
20.4 / 27.2px. Tailwind's `--spacing` base is rebased onto the same 3.4px step,
so every `p-*`, `gap-*` and `size-*` utility already lands on the grid: `p-3` is
`--space-3`. Never write a raw length.

The app frame is a fixed shell:

- **Sidebar** — `--layout-sidebar-width` (16.25rem / 260px), collapsible to
  icons and resizable. Three bands separated by hairlines: brand, navigation,
  account.
- **Navbar** — `--layout-header-height` (3.5rem / 56px), aligned with the
  sidebar's brand band. Sidebar toggle, page title, then actions pushed right.
- **Panel body** — scrolls independently at `--space-6` padding.

Layouts inside the body are modular: content in equal-width cells, strong
horizontal and vertical rhythm, visible structure.

## Elevation & Depth

Three levels, derived from the ground: `--shadow-sm` for a resting lift,
`--shadow-md` for menus and popovers, `--shadow-lg` for modals. On the light
theme they are soft ink-tinted shadows; on the dark theme they become ambient
darkness. Use the tokens rather than an ad-hoc `box-shadow`.

Depth is otherwise carried by hairlines, not by fills. A panel is separated from
its neighbour by a 1px `--color-divider`, not by a raised surface.

## Shapes

Everything is square. `--ui-radius` is `0`, which squares the entire component
library in one move; the only rounded shape in the system is a full circle, used
for identity chips. Do not reintroduce a corner radius.

The frame itself is the shape: a 1px `--color-divider` border plus four 11px `+`
registration marks that sit 6px outside the box. `.blueprint` draws the border
and positions the marks; `<AppBlueprint>` renders both. Where an element cannot
host the four mark children — a popover rendered by the component library, say —
`.blueprint-marks` paints the same crosses inside the box from background
layers.

A plane that holds nothing yet — a cover, a thumbnail, a preview — is drawn with
`.wireframe`: the crossed diagonals a technical drawing puts on an empty face.
It is the placeholder, not a filled grey box.

Icons are Lucide at stroke-width 1.5. The width is applied globally by an
`icon.customize` hook in `app.config.ts`, so icons never need per-use styling.

## Components

Nuxt UI provides the interactive components; the token bridge in `tokens.css`
re-skins all of them at once, and `app.config.ts` carries only what CSS cannot
express. The shell adds:

| Component | What it is |
| --- | --- |
| `<AppBlueprint>` | The wireframe frame — border plus four registration marks. `dashed` for reserved space. |
| `<AppMark>` | A lettered plate: square and solid for the brand, round and tinted for identity. |
| `<AppBrand>` | The sidebar's brand band. |
| `<AppNavLink>` | A sidebar row. Active is the one solid accent field in the sidebar; collapsed falls back to an icon with a tooltip. |
| `<AppUserMenu>` | The account row and its menu: profile, theme (light / dark), sign out. |
| `<AppSidebar>` | The three sidebar bands assembled. |
| `<AppPage>` | A section: navbar over a scrolling body. Every route renders one. |
| `<AppPageSlot>` | A dashed frame naming a section that has no screen yet. |

Interaction states are themed, never browser defaults. Every interactive element
gets a `:hover` tint and a pressed state one step further along the accent ramp;
keyboard focus is `2px solid var(--color-accent)` at `2px` offset; `::selection`
is an accent tint; disabled controls drop to 45% opacity. These are set once, in
`base.css` and the token bridge — do not restyle them per component.

## Do's and Don'ts

**Do**

- Read roles (`--color-muted`, `--space-3`) and let the theme resolve them.
- Frame containers as blueprint objects: the frame plus all four marks.
- Keep the grid visible — equal cells, strong horizontal and vertical rhythm.
- Set headings and actions in Barlow Condensed, body copy in Barlow.
- Add a token when a value is missing, instead of writing a literal.
- Wrap photographs in `.duotone` so they take the accent.

**Don't**

- Do not hard-code a hex, a font name, or a px value the tokens already carry.
- Do not round anything, and do not give a card or figure a surface fill — they
  are line drawings. The solid accent primary button is the one exception.
- Do not drop the registration marks from a framed element.
- Do not thicken the icon stroke; the set is Lucide at 1.5.
- Do not add decorative colour beyond the steel accent. `--color-danger` exists
  for destructive actions and nothing else.
- Do not reach past the bridge to style a Nuxt UI component with literal
  values — retune the token instead, so every component follows.
