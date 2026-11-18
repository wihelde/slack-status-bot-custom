---
name: Slack Status Bot
description: Compact desktop controls for Slack status, presence and automation.
colors:
  canvas-light: '#f5f5f7'
  canvas-dark: '#14191d'
  surface-light: '#fff'
  surface-dark: '#20272c'
  surface-muted-light: '#f7f9fb'
  surface-muted-dark: '#293238'
  surface-hover-light: '#f2f6fa'
  surface-hover-dark: '#324047'
  surface-disabled-light: '#e4ebf0'
  surface-disabled-dark: '#39434a'
  ink-light: '#1a1a1a'
  ink-dark: '#f0f4f6'
  heading-light: '#20364b'
  heading-dark: '#f2f7f9'
  muted-light: '#596575'
  muted-dark: '#bac9d1'
  border-light: '#e2e8ee'
  border-dark: '#3c4a52'
  border-strong-light: '#cbd3dc'
  border-strong-dark: '#596a75'
  accent-fill: '#17777d'
  accent-hover: '#13676d'
  accent-soft-light: '#e4f2f3'
  accent-soft-dark: '#28464a'
  accent-soft-ink-light: '#143b40'
  accent-soft-ink-dark: '#dbf7f8'
  link-light: '#13676d'
  link-dark: '#8edce1'
  success-light: '#197044'
  success-dark: '#80dea9'
  success-soft-light: '#e7f5e7'
  success-soft-dark: '#203b2d'
  danger-light: '#a1342f'
  danger-dark: '#ffa19b'
  danger-fill-light: '#ad3531'
  danger-fill-dark: '#9e3430'
  danger-soft-light: '#fee2e2'
  danger-soft-dark: '#43282c'
  warning-light: '#925900'
  warning-dark: '#f6c982'
  warning-soft-light: '#fff3cd'
  warning-soft-dark: '#45391f'
  console-bg-light: '#eef2f5'
  console-bg-dark: '#121a20'
  console-ink-light: '#33424d'
  console-ink-dark: '#dce8ee'
  console-track-light: '#e3e9ed'
  console-track-dark: '#253039'
  console-thumb-light: '#aab8c0'
  console-thumb-dark: '#647681'
  on-accent: '#ffffff'
  primary-top: '#237a7f'
  primary-bottom: '#126a70'
  primary-hover-top: '#267d82'
  primary-hover-bottom: '#156b71'
  source-switch-on: '#63c1c6'
  source-switch-disabled-on: '#a0c4a0'
  daemon-running: '#58e89b'
  daemon-stopped: '#ffb4a9'
  warning-border: '#ffc107'
typography:
  headline:
    fontSize: 28px
    fontWeight: 700
    letterSpacing: -0.02em
  section-title:
    fontSize: 18px
    fontWeight: 700
  brand:
    fontSize: 1.25rem
    fontWeight: 600
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif
    fontSize: 1rem
    fontWeight: 400
  button-label:
    fontSize: 14px
    fontWeight: 600
  navigation:
    fontSize: 0.95rem
    fontWeight: 500
  checkbox-label:
    fontSize: 1rem
    fontWeight: 400
  compact-checkbox-label:
    fontSize: 13px
    fontWeight: 400
  status-text:
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
  technical-input:
    fontFamily: Monaco, Menlo, monospace
    fontSize: 14px
  help:
    fontSize: 12px
  compact-button-label:
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
rounded:
  compact-field: 4px
  notice: 6px
  field: 8px
  control: 10px
  section: 16px
  holiday-dialog: 18px
  switch-track: 24px
spacing:
  checkbox-text: 4px
  tight: 6px
  related: 8px
  control-group: 12px
  section-gap: 16px
  page: 20px
  section-padding: 22px
  shell: 24px
components:
  button-primary:
    textColor: '{colors.on-accent}'
    typography: '{typography.button-label}'
    rounded: '{rounded.control}'
    padding: 10px 20px
  button-secondary:
    typography: '{typography.compact-button-label}'
    rounded: '{rounded.control}'
    padding: 7px 11px
  settings-tab:
    typography: '{typography.button-label}'
    rounded: '{rounded.control}'
    padding: 9px 13px
  navigation-item:
    typography: '{typography.navigation}'
    rounded: '{rounded.control}'
    padding: 9px 14px
  settings-field:
    typography: '{typography.technical-input}'
    rounded: '{rounded.field}'
    padding: 10px 12px
  editor-field:
    rounded: '{rounded.compact-field}'
    padding: 8px 10px
  native-checkbox:
    typography: '{typography.checkbox-label}'
  source-switch:
    width: 50px
    height: 24px
    rounded: '{rounded.switch-track}'
  section:
    rounded: '{rounded.section}'
    padding: '{spacing.section-padding}'
---

# Design System: Slack Status Bot

## Overview

**Creative North Star: "Pragmatic, direct, unobtrusive."**

This is the visual contract for the existing Electron app. Use it when adding,
changing or reviewing frontend UI. [PRODUCT.md](PRODUCT.md) defines the product
purpose; this file makes its visual decisions concrete. Product history and
implementation reports remain in Martin's LLM wiki.

The app is a compact desktop tool, primarily used on macOS. Make current Slack
status, automation readiness and the next useful action easy to scan. Use the
established system typeface, restrained teal accent and existing surface treatment.
Keep labels and explanations short. Product UI copy is English.

**Key Characteristics:**

- Information density through alignment, grouping and concise labels.
- Native checkboxes for preferences; retained switches for source enable/disable.
- Existing materials on navigation, panels and buttons, applied consistently.
- Light, dark and system appearance with meaningful text as well as color states.

**The Reuse Rule.** Start from the matching existing component and shared styling.
A new feature must look like part of this app before it receives custom styling.

### Authority and maintenance

The frontmatter records the approved visual values and roles. CSS is their
executable implementation; update both together when an approved design decision
changes. Reuse CSS variables rather than copying documented hex values into new
components. An unexplained disagreement is design drift to resolve, not permission
to introduce another variant. Incomplete legacy patterns are identified below.

| Responsibility | Implementation reference |
| --- | --- |
| Semantic colors, system typeface, native color scheme | [src/index.css](src/index.css) |
| Theme selection and persistence | [src/theme.ts](src/theme.ts) |
| Shared button/panel materials and interaction overrides | [src/styles/Materials.css](src/styles/Materials.css) |
| Navigation, content shell and accessibility fallbacks | [src/App.css](src/App.css), [src/App.tsx](src/App.tsx) |
| Dashboard entities, status, actions and source switches | [src/styles/Dashboard.css](src/styles/Dashboard.css), [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) |
| Settings, preference rows and technical fields | [src/styles/Settings.css](src/styles/Settings.css), [src/pages/Settings.tsx](src/pages/Settings.tsx) |
| First-run preference and its native checkbox | [src/styles/FirstRunDialog.css](src/styles/FirstRunDialog.css), [src/components/FirstRunDialog.tsx](src/components/FirstRunDialog.tsx) |
| Status fields, DND and weekday checkboxes | [src/styles/StatusConfigEditor.css](src/styles/StatusConfigEditor.css), [src/components/StatusConfigEditor.tsx](src/components/StatusConfigEditor.tsx) |
| Focused date-entry dialog | [src/styles/HolidayModal.css](src/styles/HolidayModal.css), [src/components/HolidayModal.tsx](src/components/HolidayModal.tsx) |
| Dense diagnostic text and log controls | [src/styles/LogViewer.css](src/styles/LogViewer.css), [src/components/LogViewer.tsx](src/components/LogViewer.tsx) |

Shared material rules override several component base rules. Evaluate the complete
cascade in [src/index.tsx](src/index.tsx), including selector specificity, when
extracting a value; a base button radius alone is not its final appearance.

### Layout and spacing

The desktop window starts at 1200 × 800 and has an 800 × 600 minimum in
[src/main/windowLifecycle.ts](src/main/windowLifecycle.ts). The content shell owns
scrolling and reserves room for the top navigation. Dashboard content is centered
with a 1200px maximum; settings use a 900px maximum. Both use the documented page
spacing and section rhythm.

Use the existing flex/grid patterns. Let button groups, long workspace names and
field/action rows wrap. Keep readable content and click targets within their
container at the minimum window size and increased text size. Existing narrower
CSS fallbacks are useful resilience, not a claim of a supported mobile app.
Breakpoints live with their relevant components; the local design sidecar records
the current set.

## Colors

One teal accent sits on neutral light or dark surfaces. Choose semantic roles,
not a new palette for each feature. The `-light` and `-dark` frontmatter suffixes
record the two branches of the corresponding CSS variable; they are not new CSS
variable names. `--on-accent` supplies text on filled actions. The primary-gradient
entries record the existing shared material literals.

### Primary

Use `--accent-fill` and `--accent-hover` for accent interactions, `--accent-soft`
and `--accent-soft-ink` for selected or active context, and `--link` for links.
Primary button gradients are defined in the shared material stylesheet. Keep
these assignments separate: the link color is not a checkbox accent override.

### Neutral

| CSS role | Use |
| --- | --- |
| `--canvas` | App background |
| `--surface`, `--surface-muted`, `--surface-hover`, `--surface-disabled` | Content and control surfaces with distinct interaction roles |
| `--ink`, `--heading`, `--muted` | Main text, heading emphasis and secondary information |
| `--border`, `--border-strong` | Functional boundaries and field/control definition |
| `--console-bg`, `--console-ink`, `--console-track`, `--console-thumb` | Diagnostic log area |

### Semantic states and appearance

Use the existing success, danger and warning foreground/background pairs. Pair
state color with a word, icon or labelled control; a source can be enabled while
currently inactive, and a running app can still have failed delivery. Preserve
these distinctions in copy and layout.

Daemon indicators, enabled/disabled source switches and the warning outline use
the named state variables in `src/index.css`, preserving the established colors.
Editor focus and hover shadows use the shared variables in `Materials.css`.
Component-specific translucent materials and structural shadows keep their
existing light/dark formulas; these are deliberate material definitions.

The default is system appearance. Explicit Light or Dark selection uses the
existing theme preference and CSS `light-dark()` values. Both text and backgrounds
must respond to that selection. Keep native form controls on the same color scheme.

**The Contrast Rule.** Normal text, helper text and placeholders need at least
4.5:1; large text and essential control boundaries/focus indicators need at least
3:1 against their adjacent colors. Check both themes and composed/translucent
surfaces. Validating solid palette pairs alone does not certify the whole UI.

## Typography

Use the system sans-serif stack in the frontmatter. It gives macOS its familiar
native face while retaining the existing platform fallbacks. Preserve Monaco/Menlo
for setup links, diagnostic identifiers and other technical values; ordinary
editable status text uses the system face. Log output retains its existing
Courier New/monospace treatment.

Other roles inherit the body family unless their context explicitly uses monospace.
Use `font: inherit` on new controls before applying their role-specific size and
weight. The shared button base inherits the system family while component rules
keep each button's existing size and weight.

The frontmatter names the established roles: page headline, section title, brand, body,
button label, navigation, checkbox labels, status text, technical input and help.
There is no separate marketing/display font. Do not promote tool headings into
hero typography.

- Use semibold for controls and important state; normal weight for checkbox copy.
- Keep compact weekday labels and supporting data smaller than the main preference
  copy. Checkbox geometry stays native in both contexts.
- Keep helper text short, adjacent to its control and in the readable muted role.
- Preserve wrapping for status text, workspace names and long technical values.
  Read-only identifiers must remain selectable or copyable.
- Use sentence case for UI labels and actions. Existing weekday abbreviations and
  technical acronyms retain their natural casing.

## Elevation

The established app uses tonal layering and shared gradients, edges and modest
control shadows. The navigation and holiday dialog also use translucent material.
Reuse those existing treatments for the same roles. Ordinary form rows and help
text need alignment and spacing, not another layer or container.

| Layer | Existing treatment and source |
| --- | --- |
| App canvas and content | Semantic background/surface roles |
| Dashboard/settings section | Shared section material; geometry comes from the page stylesheet |
| Secondary control | Shared `--control-glass`, hover material, edge and `--control-shadow` |
| Primary action | Existing teal gradient with light text and a defined pressed state |
| Navigation | Existing translucent shell and active-page indicator in App.css |
| Holiday dialog | Existing overlay and raised, translucent date-entry surface |

Shadow expressions, material gradients and motion cannot be represented by the
frontmatter component schema. Their exact references and self-contained previews
are in the local `.impeccable/design.json` extension. The application reads CSS,
not that preview file. The sidecar is ignored local tooling data and can be absent
in a fresh clone; all implementation values remain available in the linked CSS.

Preserve opaque fallbacks when backdrop filtering is unavailable, transparency
is reduced or contrast is increased. Preserve existing material identity without
spreading blur, glow or additional decoration across new controls.

## Components

### Buttons and navigation

Use the current primary action for the operation that advances the task. Use the
existing secondary treatment for supporting actions, and danger styling only for
destructive actions. Geometry varies by role: the frontmatter primary example is
the Settings save action; do not impose its padding on every navigation or modal
button. Shared materials own the common control radius and visual states.

Keep Dashboard/Settings navigation distinct from the settings sub-section buttons.
Preserve visible selected state and their existing semantic current/pressed state.
Allow navigation and local actions to wrap rather than hiding important actions.

Hover, keyboard focus, pressed, disabled and saving states must remain distinct.
Show a short in-place progress label and prevent duplicate submission while an
operation is pending. Preserve the user's values and surface an actionable error
if saving fails. Do not show success before the operation succeeds.

### Native checkboxes

**The Native Checkbox Rule.** Preferences use real `input[type="checkbox"]`
elements at their intrinsic browser/platform size. Do not set their width, height,
`appearance` or `accent-color` to create a larger or branded checkbox.

Use the existing preference-row treatment: center the checkbox with its label,
keep it from shrinking, and use the documented checkbox-to-text spacing. Label
weight is normal. Make the label clickable and keep native checked, focus and
disabled feedback. Associate explanatory text through `aria-describedby` when
needed. Compact editor labels may keep their existing text size.

References: Meetings, Startup and Usage and diagnostics in Settings; startup
choice in FirstRunDialog; DND and weekdays in StatusConfigEditor. Log auto-refresh
also retains its native checkbox inside a compact toolbar.

### Source switches

Source enable/disable switches are intentionally retained. Use the established
track dimensions from the frontmatter, the existing 18px thumb, 3px inset and
26px checked translation. Reuse the current checked and disabled treatments from
Dashboard.css. A visible source label and accessible input name identify the
controlled source; keyboard focus remains visible on the track.

A checked switch means tracking is enabled. The adjacent Active/Inactive text
reports detection. Treat those as two different states. New preferences use
checkboxes unless the product decision explicitly calls for a switch.

### Fields and form rows

Reuse the existing field family for its context: technical settings fields,
compact status-editor fields, or the holiday date field. The frontmatter records
the first two; the holiday field keeps its existing context-specific material.
Give every input a persistent label. Keep validation and helper text beside the
relevant field, and retain entered values after a recoverable failure.

Use a visible focus treatment. Read-only values remain readable and copyable;
disabled controls communicate why the action is unavailable. Wrap combined
input/button rows before they overflow. Avoid introducing global selectors that
change unrelated fields or labels.

### Sections, status and feedback

Existing panels group meaningful tasks or entities. Reuse them for the matching
Settings or Dashboard section. Use plain rows within a section. New settings use
the established section wrapper, heading, control row and compact helper text.

Keep the Dashboard's status/workspace separators. They make multiple workspace
rows distinct and connect each workspace name with its status and delivery
columns. These functional separators are an approved part of this view. The
status editor's footer uses spacing without a separator. Holiday errors use
compact 13px regular text, 1.45 line height and 10px 12px padding on the semantic
error background, with no border or accent stripe. Editor and holiday buttons
inherit the system typeface while retaining their existing sizes and weights.

Distinguish configuration, current detection, daemon readiness and delivery outcome.
Use the established labelled status presentation for complete, partial, failed,
skipped or unavailable results. Support links mean opening support; release-link
selection is not a completed download or installation. User-facing copy should
explain the action or remedy, not SDK, queue or retention internals.

Use readable semantic feedback near its cause. Dynamic errors must be announced
appropriately; destructive actions use the existing explicit confirmation pattern.
A loading or empty state must say what is pending or what the user can do next.

### Dialogs, density and motion

Use dialogs for the existing focused date-entry workflow or a task that genuinely
requires interruption. Keep straightforward configuration inline. A dialog must
have a name, appropriate semantics, keyboard containment, Escape/cancel handling
and focus restoration to the invoking control. Keep the primary action reachable
without horizontal scrolling.

Use short state transitions from the matching existing component. The sidecar
records the current durations rather than inventing a uniform timing for legacy
controls. Add reduced-motion handling whenever touching an animated interaction;
keep the state change perceivable without relying on motion. Preserve existing
reduced-transparency and increased-contrast fallbacks.

The holiday dialog focuses its date field on opening, contains keyboard focus,
skips disabled controls and restores focus to its invoking control when closed.
Escape, Cancel and the close button dismiss it; a failed save keeps the entered
date and announces the error. The application-wide reduced-motion rule disables
animations, transitions and smooth scrolling, including source-switch movement.

Component styles belong to their owning root. Use `:where(.component-root)` when
qualifying a legacy selector so its specificity stays compatible with shared
materials. Settings, the status editor, holiday dialog, first-run dialog,
dashboard and log viewer use this boundary. Keep editor and holiday form/message
classes distinct from Settings. Shared tokens and the control families in
`Materials.css` deliberately remain shared. Give component animations unique
names. Each component defines its own layout instead of inheriting accidental
rules from another component.

## Do's and Don'ts

### Do

- **Do** reuse the matching existing component, semantic tokens and shared material
  before creating a visual variant.
- **Do** keep preferences as small native checkboxes and preserve the source-switch
  distinction.
- **Do** use concise English labels, readable helper text and explicit operational
  states; keep implementation details in technical documentation.
- **Do** validate light/dark/system appearance, keyboard focus, checked/unchecked,
  disabled/loading/error states, long values and minimum-window layout when UI changes.
- **Do** check reduced motion, transparency and contrast preferences for affected
  interactions and layers.
- **Do** update this contract, its token snapshot and the relevant CSS together
  after an approved visual change.

### Don't

- **Don't** introduce the PRODUCT.md anti-references: "Decorative dashboards, nested
  cards, pill-heavy controls, verbose guidance, and unfamiliar replacements for
  standard form controls."
- **Don't** add a new card for every setting, decorative section dividers, accent
  stripes, decorative animation, extra gradients or extra glass surfaces.
- **Don't** enlarge or recolor ordinary checkboxes, replace retained source switches
  with checkboxes, or make a new custom checked/focus indicator for native inputs.
- **Don't** treat legacy styling inconsistencies as permission for another visual
  system, new font, component library or broad redesign.
- **Don't** rely on color alone, hide focus outlines without a replacement, claim
  success from a click alone, or equate app activity with successful automation.

For completion, inspect the affected component states against this contract and
its references, run the relevant existing checks, and report any remaining gap.
This source-based reference does not claim a fresh visual or accessibility audit.
