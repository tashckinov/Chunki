# Material 3 Design System

A working recreation of **Material Design 3 (Material You)** — Google's open-source design system —
built from the attached *Material 3 Design Kit (Community)* Figma file. Every colour, corner, type
size and component metric in this project was read out of that file, not from memory of the public
spec.

Material 3 describes itself as personal, adaptive and expressive: colour schemes are generated from
a seed rather than fixed; layouts change form across five window size classes; shape, motion and
type carry the personality. Depth is communicated by **tonal surface colour first**, with shadow
reserved for elements that need separating from busy content.

## Sources

| Source | What was taken from it |
| --- | --- |
| `Material 3 Design Kit (Community).fig` (attached, read-only) | 309 Figma Variables (colour schemes, typescale, shape, font theme), component geometry, 119 Material Symbols glyphs, 3D avatar illustrations, the grey image placeholder |
| https://github.com/hamen/material-3-skill (`master`) | `skills/material-3/SKILL.md` — platform guidance, motion tokens, elevation table, anti-patterns. Worth exploring further: it carries reference docs on colour, typography, navigation, layout and dynamic-color theming that go beyond what is encoded here |
| https://m3.material.io | Public spec, used only to confirm what the file said |

The kit ships **no logo or brand mark**, so nothing in this system draws one — the project thumbnail
and any place a mark would go render the words "M3" / "Material 3" in the brand typeface. Do not
invent a Google or Material logo; there is none in the source.

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | The one file consumers link. `@import`s everything below. |
| `tokens/fig-tokens.css` | Generated from Figma Variables: 309 variables across 40 modes (light, dark, 3 contrast levels, 26 preset colour schemes, wireframe). |
| `tokens/md-sys.css` | The semantic layer — `--md-sys-color-*`, `--md-sys-shape-corner-*`, `--md-sys-typescale-*`, elevation, state, motion, spacing, breakpoints. **Use these, not the raw tokens.** |
| `tokens/fonts.css` | Roboto, Roboto Mono, Flow Circular, Material Symbols Outlined. |
| `tokens/base.css` | Document reset, link colours, the `.md-symbol` icon-font class. |
| `components/m3.css` | Component CSS. Class-based so hover/focus/press states are real CSS states. |
| `components/<group>/` | 44 React components in seven groups (below). |
| `ui_kits/mobile/` | Compact-window app: home, messages, settings. |
| `ui_kits/expanded/` | Expanded-window list–detail layout. |
| `guidelines/` | 16 foundation specimen cards. |
| `assets/icons/` | `Icon.jsx` + `icon-data.js`: 119 glyphs extracted from the kit's Icons page. |
| `assets/images/` | Four 3D avatar illustrations, the avatar placeholder SVG, the kit's grey image placeholder. |
| `templates/mobile-app/` | "Compact app screen" starting template. |
| `templates/list-detail/` | "List–detail screen" starting template. |
| `SKILL.md` | Agent Skill wrapper for use outside this project. |
| `github.md` | Source-repo association for one-click upstream sync. |

### Components

**Actions** — `Button`, `IconButton`, `Fab`, `FabMenu`, `ButtonGroup`, `SplitButton`, `SegmentedButton`
**Communication** — `Badge`, `ProgressIndicator`, `Snackbar`, `Tooltip`
**Containment** — `Card`, `Carousel`, `Dialog`, `Divider`, `BottomSheet`, `SideSheet`
**Inputs** — `TextField`, `Chip` (+`ChipSet`), `Checkbox`, `RadioButton`, `Switch`, `Slider`, `Menu`, `DatePicker`, `TimePicker`
**Navigation** — `TopAppBar`, `NavigationBar`, `NavigationRail`, `NavigationDrawer`, `SearchBar` (+`SearchView`), `Tabs`, `Toolbar`
**Data display** — `List`, `ListItem`, `Avatar`, `StatusBar`
**Utilities** — `DeviceFrame`, `Keyboard`, `Scrim`, `FocusIndicator`
**Icons** — `Icon`

That set is the kit's public component inventory: one component per component page in scope.

### Deliberately not built as components

The Figma file reports 813 component *sets*. That number counts Figma's internal machinery, not
distinct UI parts. Broken down:

| Group | Roughly | Why it is not a component here |
| --- | --- | --- |
| `.Building Blocks/*` — state layers, handles, track segments, track stops, value indicators, thumbnails, hour lines, calendar cells, menu list items, segment elements | ~500 sets | These are the parts Figma needs to *assemble* variants. In code they are CSS (`.m3-state`, `:focus-visible`, `.m3-slider-handle`) or props on the parent component. A consumer never places a "state-layer" by hand. |
| Per-variant symbols (`Size=Large, Color=Filled, State=Hovered`, `Type=Round, Size=Small…`) | ~150 sets | Every size × colour × state combination is its own set in Figma. In code these are the `variant` / `size` / `shape` / `selected` / `disabled` props on one component. |
| Icon symbols (~260 glyphs) | 1 family | Extracted as data into `assets/icons/icon-data.js` and rendered by one `Icon` component, not 260 files. |
| 3D avatar renders (30 sets) | 30 sets | Image assets, not components. Four are copied into `assets/images/`; `Avatar` renders any of them. |
| Kit documentation furniture — `.Header`, `.Schematic group`, `.Tonal palettes`, `Colourful logo`, `Favicon`, spec annotations, window-size-class diagrams | ~40 sets | These belong to the Figma file's own documentation pages, not to the product surface. The colour and shape information they illustrate lives in `guidelines/` instead. |
| Deprecated sets (`?Deprecated? Button`, `FAB`, `Icon button`) | 3 sets | Marked deprecated in the source. |
| `Examples/*` sample screens | ~26 sets | Full product screens, reproduced as the two UI kits in `ui_kits/` rather than as reusable primitives. |

If you want any of these promoted to a real component — an editable keyboard, a standalone focus
indicator, the tonal-palette diagram — say which and it can be built.

**Intentional additions:** `Icon` (a wrapper over the extracted glyph data — the kit has 260 icon
symbols but no icon component) and `ChipSet` / `SearchView` (containers the kit draws as frames
rather than named components).

## Content fundamentals

The kit's own copy is spare, lower-case-averse and functionally literal. Its placeholder strings are
literally `Label`, `Headline`, `Supporting text`, `Section title`, `Select date`, `Select time` —
the system never writes marketing copy into a component.

- **Sentence case everywhere.** Buttons, tabs, list headlines, dialog titles: "Save changes", not
  "Save Changes". Only proper nouns capitalise mid-sentence. Nothing is ALL CAPS — the label
  typescale carries emphasis through weight (500) and tracking (0.1–0.5px), not case.
- **Second person, implied.** UI text addresses the user without saying "you" where it can be
  avoided: "Reset settings?" rather than "Do you want to reset your settings?". First person is
  used only for the user's own data ("my account").
- **Verbs for actions, nouns for destinations.** Button labels are one or two words and start with a
  verb ("Play", "Save changes", "Learn more"). Navigation labels are nouns ("Inbox", "Settings").
- **Dialogs ask a question and answer it.** Title is a question or an outcome ("Reset settings?"),
  body is one or two sentences of consequence, actions are the two verbs.
- **Snackbars state what happened, past tense, plus one undo.** "Photo archived", "Conversation
  archived".
- **Errors say what is wrong, not that something is wrong.** "Incorrect password", not "Error".
- **No emoji.** The kit contains none; iconography carries visual tone instead.
- **Numbers are plain.** Badges cap at "999+"; times are "10:24", "Tue", "Mon"; durations are
  "18 min".

## Visual foundations

**Colour.** One seed colour generates the whole scheme. Baseline: primary `#6750A4`, secondary
`#625B71`, tertiary `#7D5260`, error `#B3261E`, surface `#FEF7FF`, on-surface `#1D1B20`. Roles come
in pairs — always put `on-primary` on `primary`, `on-surface-variant` on `surface`. Never pair
arbitrarily and never hardcode a hex. Five surface container tones (`lowest` → `highest`) replace
elevation shadows as the main depth cue. Twenty-six preset schemes ship in the file
(`data-mode="blue-lt"` … `"purple-dt"`), plus a full dark scheme on `.dark` / `data-theme="dark"`
and medium/high-contrast variants.

**Type.** Roboto for both the brand and plain roles — this is one of the few systems where Roboto is
correct, not a default. Fifteen roles in five families: display 57/45/36, headline 32/28/24, title
22/16/14, body 16/14/12, label 14/12/11. Display, headline and title-large are Regular (400); title
medium/small and all labels are Medium (500); each role has an "emphasized" weight one step up.
Tracking is positive and small at body and label sizes (0.1–0.5px) and slightly negative only at
display-large (−0.25px).

**Shape.** A ten-step corner scale: 0, 4, 8, 12, 16, 20, 28, 32, 48, full (1000px). Buttons, chips
and FAB menus are fully rounded; cards are 12; text fields and menus are 4–8; dialogs, sheets and
search views are 28. The expressive shape morph is real: square-shaped buttons drop one corner step
while pressed (16 → 12, 28 → 16).

**Spacing.** 4dp base with an 8dp rhythm. Screen margin 16, card padding 16, list row padding
8/16, dialog padding 24, button gaps 4–16 by size. Minimum touch target 48×48 regardless of the
visible control (an 18px checkbox lives inside a 40px button inside a 48px row).

**Backgrounds.** Flat tonal surfaces. No gradients, no photographic hero backgrounds, no textures,
no patterns. Imagery is content, placed inside cards, carousels and list leading slots, always
cropped to a shape token. The kit's own placeholder is a flat `#D9DCE0` rectangle with grey
primitives — that neutrality is the point.

**Elevation.** Six levels (0–5). Level 0 is flat, 1 for elevated cards, 2 for menus and toolbars, 3
for FABs, dialogs, search and pickers, 4–5 only as hover/focus increases. Shadows are the kit's
`rgba(0,0,0,.3)` umbra + `rgba(0,0,0,.15)` penumbra pair — never a soft coloured glow.

**States.** A state layer of the element's own content colour sits over the container: hover 8%,
focus 10%, pressed 10%, dragged 16%. Press does *not* shrink or scale the element — it darkens and,
on square shapes, morphs the corner. Disabled is 12% container / 38% content.

**Motion.** Emphasized easing `cubic-bezier(0.2,0,0,1)` at 500ms for changes that begin and end on
screen; decelerate `cubic-bezier(0.05,0.7,0.1,1)` 400ms entering; accelerate
`cubic-bezier(0.3,0,0.8,0.15)` 200ms leaving. Standard easing at 200–300ms for utility transitions
(state layers, colour). No bounce, no spring in the web implementation — the M3 Expressive spring
physics are Compose-only.

**Borders and transparency.** One border weight: 1px. `outline` (#79747E) for meaningful boundaries
like text-field borders; `outline-variant` (#CAC4D0) for dividers and decorative outlines — mixing
them up is the most common M3 mistake. Transparency appears in exactly three places: state layers,
the 32% scrim behind modals, and disabled tokens. No frosted glass, no backdrop blur.

**Layout.** Five window size classes: compact <600, medium 600–839, expanded 840–1199, large
1200–1599, extra-large 1600+. Navigation follows the class — bar at compact, rail at medium and
above, drawer when there are five or more destinations. Constrain reading columns to 840–1040dp on
large windows; the 380px list pane in the expanded kit is the canonical list–detail split.

## Iconography

**Material Symbols** is the icon system, and it is the *only* one. Two ways to use it here:

1. `assets/icons/icon-data.js` + `Icon.jsx` — 119 glyphs extracted directly from the kit's Icons
   page as SVG path data on a 24×24 grid, painted with `currentColor`. Names match the Figma layer
   names (`AccountCircle`, `KeyboardArrowDown`, `StarsFilled`). Read `Icon.d.ts` for the full list.
   Prefer this: it is the exact geometry the file ships.
2. The **Material Symbols Outlined** webfont, linked from Google Fonts in `tokens/fonts.css` and
   exposed as `.md-symbol`, for anything outside the extracted subset (the family carries ~2,500
   glyphs). The kit's own Icons page points readers at the Material Symbols plugin for the rest.

Icons are line-weight outlined at 24dp by default (20dp inside small buttons and chips, 18dp inside
chips' leading slots, 32–40dp in large/XL buttons). Filled counterparts exist for selected states —
`Star` / `StarFilled`, `Bookmark` / `BookmarkFilled`, `PlayArrow` / `PlayArrowFilled` — and that
outline→fill swap, not a colour change alone, is how selection reads. Icons take their colour from
the surrounding role (`on-surface-variant` at rest, `primary` or `on-secondary-container` when
selected). No emoji, no unicode symbols standing in for icons, no multi-colour icons.

Illustration: the kit ships 30 **3D avatar** renders (rounded, soft studio lighting, pastel
backdrops, single figure per frame). Four are copied into `assets/images/`. There is no other
illustration style in the file.

## Known substitutions and gaps

- **Fonts.** The kit's own annotation layers use *Google Sans* and *Google Sans Text*, which are not
  publicly distributable. The file's own Font-theme variables resolve to **Roboto** for both brand
  and plain roles, so components use Roboto — no substitution was needed for UI type. Roboto,
  Roboto Mono and Flow Circular load from Google Fonts; if you have licensed Google Sans binaries,
  drop them in and point `--static-font-brand` / `--static-font-plain` at them.
- The kit's `--static-weight-*` variables hold weight *names* ("Regular", "Medium", "SemiBold");
  they are emitted here as 400 / 500 / 600 with the original value kept in a comment.
- `VolumeUp` had no decodable vector geometry in the file and is absent from `icon-data.js`; use the
  Material Symbols webfont for it.
- Contrast-level modes (medium/high) are present in the tokens but no specimen card demonstrates
  them yet.
