# Goallord Portal - Product Context

**Register:** product (app UI - the design serves the work, it is not the work).

## Product purpose
The Goallord Portal is the logged-in side of Goallord Creativity Limited, a creative
agency + coding/design academy based in Onitsha, Nigeria. It is a single installable
PWA with three audiences sharing one codebase:

- **Students** - check course progress, see the current week/lesson, submit assignments,
  track attendance, view payments/fees, and message lecturers. Highest-volume mobile users.
- **Lecturers** - manage batches, mark attendance, post materials, grade submissions,
  and message students. Mixed phone/desktop.
- **Admin/Staff** - run the whole operation: applicants, payments, content, products,
  projects, team. Primarily desktop, occasionally phone.

## Primary context of use (the scene that forces design decisions)
A student in Onitsha glancing at their phone in the evening - often on mobile data,
sometimes a mid-range Android - to answer one question fast: *"Is anything due, and did
my lecturer reply?"* They are not sitting at a desk. They are checking, not browsing.

This scene forces: **dark theme** (evening, glance, battery, OLED), **one answer per
screen** (not a wall of equal metrics), **thumb-reach navigation** (one-handed), and
**fast perceived load** (skeletons, no layout shift).

## Users
- Young adults (≈16–28), phone-native, WhatsApp-literate, value speed and clarity over chrome.
- Lecturers: time-pressed, want to mark/grade in seconds between sessions.
- Admin: power user, dense data is acceptable on desktop.

## Brand & tone
- Confident, warm, locally proud (Onitsha / Nigerian creative scene), not corporate-sterile.
- Accent is a warm burnt orange (#D66A1F) - energy, creativity. Secondary electric blue (#1E4BFF).
- Tone of copy: direct, encouraging, plain. No filler, no hype.

## Anti-references (what it must NOT look like)
- Generic dark SaaS admin template (rows of identical hero-metric cards, gradient accents).
- A desktop dashboard shrunk onto a phone with a horizontally-scrolling tab strip.
- Bootstrap-default spacing and flat type hierarchy.
- "Education = blue + teal" category cliché.

## Strategic principles
1. **Mobile-first, app-native.** The phone experience is the product for students/lecturers;
   desktop is the wider canvas, not the source of truth.
2. **One focal answer per screen.** Lead with the single most important thing; demote the rest.
3. **Thumb-reachable navigation.** Primary destinations live at the bottom on mobile.
4. **Quiet by default, warm on purpose.** Restrained neutrals; orange earns attention only
   for the active state and primary action.
5. **Fast and forgiving.** Skeletons over spinners, optimistic UI, clear empty/error states.
