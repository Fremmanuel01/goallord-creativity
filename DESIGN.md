# Goallord Portal - Design System

Dark, warm, app-native. Tokens below already exist in the dashboards; this file
records the decisions and the mobile-first additions (bottom nav, sheet, scale).

## Color (existing, kept - palette is on-brand and stable)
- `--bg #0F1115` base, `--card #171A21` surface, `--border #2A2F3A`
- `--text #F4F6FA`, `--muted #A0A6B3`
- Accent warm orange `--orange #D66A1F` (active nav, primary action, ≤10% of surface)
- Secondary `--blue #1E4BFF`; status: green/red/yellow
- Strategy: **Restrained** - tinted-dark neutrals + one warm accent. No gradient text,
  no decorative glass, no side-stripe accent borders.

## Mobile-first additions (this redesign)
- `--nav-h: 58px` bottom tab bar height (plus safe-area-inset-bottom).
- Bottom nav: fixed, thumb-zone, solid `--card` surface, 1px top border, 4 primary
  destinations (Home · Assignments · Messages · More). Active = orange icon+label.
- "More" opens a bottom sheet (slides up, rounded top, list rows) for the secondary
  screens: Attendance, Payments, Curriculum, Materials, Flashcards, Profile.
- Top `.tabs` strip is hidden ≤640px (replaced by bottom nav + sheet); unchanged on desktop.
- Content reserves `calc(--nav-h + safe-b + 16px)` bottom padding so nav never overlaps.

## Type scale (1.25 ratio, mobile)
- h1 / page title: 22px / 700
- section title: 15px / 700, with letter-spacing -0.01em
- body: 14–15px, labels 11–12px uppercase tracked
- One focal number per screen (progress ring) at 28px+; demote repeated stats.

## Spacing & rhythm
- Section gap 24–28px (varied, not uniform). Group related blocks; breathe between groups.
- Card radius 12–16px. Touch rows ≥48px.

## Motion
- Ease-out only (`cubic-bezier(.22,.61,.36,1)`), 180–320ms. No bounce/elastic.
- Nav press: scale 0.92. Sheet: translateY in. Tab change: 200ms content fade.

## Bans honored
No side-stripe borders, no gradient text, no default glass, no identical hero-metric
card grids as the page opener, no modal-first patterns.
