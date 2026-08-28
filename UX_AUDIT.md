# Goallord Creativity Academy — UX / Usability Audit (First Deliverable)

Date: 2026-08-28. Auditor role: senior UX auditor + QA + first-time user.
Status: **Findings only. No broad changes made. Awaiting approval before implementation.**

Evidence key:
- **[B]** = reproduced live in the production browser (goallordcreativity.com)
- **[C]** = derived from the shipped code map (high confidence; to re-verify in browser during implementation)
- **[API]** = confirmed via a live unauthenticated production API read

---

## Phase 1 — Route + Feature + Role Matrix (summary)

| Area | Route(s) | Role | Core features |
|---|---|---|---|
| Public / marketing | `/`, `/academy.html`, `/about`, `/pricing`, `/services`, `/alumni`, `/students`, `/contact` | Public | Programme discovery, fees, CTAs |
| Enrolment | `/apply.html` → email verify → `/apply-payment.html` → `/application-status.html` | Applicant | Application form, Paystack (backend-verified), status checker |
| Auth | `/login`, `/student-login`, `/lecturer-login`, `/forgot-password`, `/reset-password` | All | 3 parallel auth systems, 2FA, role-aware reset |
| Student | `/student-dashboard.html`, `/portal.html` | Student | 11 tabs: Overview, Attendance, Payments, Curriculum, Materials, Assignments, Flashcards, Lectures, Notifications, Messages, Profile |
| Lecturer | `/lecturer-dashboard.html` | Lecturer | 11 tabs incl. batch picker, lecture lifecycle (generate→review→publish→republish), attendance, curriculum |
| Admin | `/dashboard.html` | Admin | ~19 sidebar sections; Academy: Applicants, Students, Batches, Lecturers, Attendance, Payments, Reminders, Audit |

Full per-role feature maps were produced and are retained in the session notes.

---

## Friction Register (prioritised)

### P0 / P1 — blocking or serious

| ID | Role | Screen | Problem | Why it hurts | Sev | Evidence |
|---|---|---|---|---|---|---|
| F-01 | Public | All 15 marketing pages (`gsapAnimation.js` preloader) | The full-screen splash can hang forever. `window.load` clears the 5s safety timer, then hands off to a GSAP rAF-driven animation; if rAF is throttled (background-tab load, janky device) the animation stalls and the safety net is already disarmed → page stuck behind splash at `opacity:1`. | Landing page becomes unusable for affected users; total bounce. Also: page content is `opacity:0` until GSAP reveals it, so any GSAP stall = blank page. | **P0/P1** | [B] Reproduced: `.preloader` stayed `display:block, opacity:1` for 124s+; fresh reload never dismissed in 12s of polling; `readyState:complete`, zero console errors. Root-caused in code. |
| F-02 | Applicant/Public | `/academy.html` pricing card vs FAQ | Online tuition shown as **₦580,000** (pricing card, = configured value) and **₦280,000** (FAQ answer) on the same page. | "What is the price?" is the #1 purchase question; a self-contradiction destroys trust and can trigger payment disputes. | **P1** | [B]+[API] Both figures present in page text; `academySettings.tuition.online = 580000` is authoritative; FAQ hardcodes stale ₦280,000. |
| F-03 | Applicant/Public | `/academy.html` "Choose Your Track" | Track cards are **Web Design**, **WordPress Developer**, **Web Development** — but **Web Design and Web Development have identical descriptions and topic lists**. The hero + apply form advertise different tracks (AI Software Development, UI/UX, WordPress, AI App Development, Videography). | User can't tell programmes apart; the track they pick on the landing page may not exist on the application form → confusion + drop-off. | **P1** | [B] Verified in page text: duplicate copy; advertised-vs-displayed track mismatch. |

### P2 — noticeable

| ID | Role | Screen | Problem | Sev | Evidence |
|---|---|---|---|---|---|
| F-04 | Applicant | `/academy.html` hero + FAQ | "Next batch: **Contact us for next batch date**" — no concrete date anywhere; `nextBatchDate` empty. A first-time user can't tell when they'd start or feel urgency. | P2 | [B]+[API] |
| F-05 | Lecturer | `/lecturer-dashboard.html` batch picker | Selected batch is a plain `<select>` and **is not persisted on refresh** — silently reverts to the first batch. A lecturer who switches to their 2nd batch then refreshes/reopens is now editing/publishing against the wrong batch with no indication. | **P2 (P1 on publish)** | [B] Reproduced live: switched to batch 2 → reloaded → picker reverted to batch 1; no active-batch value stored in localStorage. |
| F-06 | Lecturer | Lecture Publish / Republish | **No confirmation dialog** before Publish/Republish, which emails + pushes all students. One misclick notifies a whole batch. | P2 | [C] |
| F-07 | Admin | Students/Payments/Attendance/Lecturers tables | On desktop these tables are clean and well-built (readable Track/Status labels, **no UUID leakage**, good filters). Concern is phone width: wide tables have **no horizontal-scroll wrapper**; likely overflow/clip. Inline batch-assign dropdown can overflow. | P2 | [C] — desktop verified clean [B]; true mobile width could not be forced (see limitation) |
| F-08 | All | Public pages | Content is hidden (`opacity:0`) until GSAP reveals it (same dependency as F-01). Any script/animation hiccup yields a blank page with a working nav only. | P2 | [B] Observed blank content when splash removed without GSAP reveal. |

### P3 — polish

| ID | Screen | Problem | Sev | Evidence |
|---|---|---|---|---|
| F-09 | `/academy.html` hero | Text artifact: "AI App **|** Development" (stray pipe character). | P3 | [B] |
| F-10 | Payment config | Bank transfer account 2 is a personal name ("Emmanuel Nwabufo Kenechukwu") vs company account 1; may cause payer hesitation. Confirm intended. | P3 | [API] |
| F-11 | Empty states | Student/lecturer empty states are decent ("🎓 No lectures published yet.") but inconsistent tone/format across tabs; some (Flashcards, Notifications) lack the icon/guidance others have. | P3 | [C] |

---

## Authenticated audit — new findings (Phases 4–6, live with UX_TEST_ accounts)

| ID | Role | Screen | Problem | Why it hurts | Sev | Evidence |
|---|---|---|---|---|---|---|
| F-12 | Student | `/student-dashboard.html` Overview | Dashboard **leads with a "37% OVERALL" progress ring**, not the questions that matter: "what do I have today?", "when is my next class?", "what should I do next?". The class schedule ("Tue & Wed · 4:00 PM") is a **small badge buried in the profile hero**, not a prominent "Next class" card. | Students must hunt for today's essentials — the exact anti-pattern the brief warns against. | **P1** | [B] Overview screenshot: progress ring + stat cards first; no today/next-class card; schedule badge only. |
| F-13 | Student | Overview progress ring | "37% overall progress" is **pure time-elapsed** (week 5 of 12) while attendance = 0% and assignments = 0%. A student who has attended nothing and submitted nothing sees "37% complete". | Misleads students about real standing; erodes trust in the metric. | P2 | [B]+[API] `progress.overall=37` with `attendance.pct=0`, `assignments.pct=0`, `nextDeadline=null`. |
| F-14 | Student | Dashboard tab bar | 11 tabs overflow the width and are **cut off at "Lectur…"** with no scroll/more affordance; Notifications, Messages, Profile are hidden past the cut edge. (Lecturer dashboard instead **wraps** tabs to 2 rows — inconsistent tab handling between the two portals.) | Important actions look like they don't exist; inconsistent across portals. | P2 | [B] Student screenshot shows cut-off "Lectur"; lecturer screenshot shows wrapped 2-row tabs. |
| F-15 | Student | Overview stat cards | Naira zero renders as "₦0" that reads like "NO" at the large stat-card size (₦ glyph + 0). | Momentary "is this an error?" confusion on Total Paid / Outstanding. | P3 | [B] |
| F-16 | Student | Lectures/other empty states | Empty states exist ("🎓 No lectures published yet.") but **don't say when/where content will appear**, and on desktop float in a large empty void. | Reads as sparse/unfinished; misses a chance to orient the student. | P3 | [B] |

**Positive findings (no action needed):** Admin desktop tables are clean, readable, and leak no internal IDs. Student/lecturer isolation and the batch architecture behave correctly (already verified in the prior E2E phase). Lecturer Overview clearly labels the active batch in the subtitle.

## Testing limitations this pass

- **Mobile / responsive not verifiable in-browser.** The automation window would not honour narrow sizes (requested 375px → got 781px; requested 390px → reported 1728px). A true mobile (375/768) sweep — Phase 11 — and F-07's overflow check need device emulation or on-device testing.
- **Accessibility (Phase 12)** and **payment simulated-failure UX (Phase 7)** not yet run.
- **Publish/Republish confirmation (F-06)** verified from code only — testing it live would require generating a real AI lecture (cost + would notify students), so deferred.

## Temporary data still live (delete only after you approve)

`UX_TEST_`-prefixed: 2 batches, 1 student, 1 lecturer, 1 admin (`users`), 2 curriculum entries, 2 payments, 2 lecturer-batch links. Retained so you (or I) can re-inspect the evidence. I will remove all of it — and verify zero remain — once you approve the audit results.

## Mobile testing note

The automation browser could not be forced to a true mobile viewport this pass (see limitations). A full mobile sweep (Phase 11) is **staged for after approval**, and will need either device emulation or on-device checks.

---

## Fix already applied (permitted P0-blocker only, NOT yet deployed)

**F-01 preloader** — edited `assets/js/gsapAnimation.js`: the 5s→6s safety cap is **no longer cleared on `window.load`**, so the splash is always removed even if the GSAP animation stalls. One-file change; covers all 15 public pages (no build/minified copy). Root-cause fix, minimal diff. Applied now because it blocks all further public-page browser testing; staged in the working tree, awaiting your approval to deploy with the rest.

---

## Proposed remediation plan (for approval)

**Batch 1 — P0/P1 (ship first, low-risk, high-impact)**
1. F-01 preloader safety cap (done, needs deploy).
2. F-02 fix stale FAQ online price ₦280,000 → ₦580,000 (edit `academySettings.faqs`; verify no other hardcoded price drift).
3. F-03 reconcile track cards: dedupe Web Design/Web Development, align landing-page tracks with the apply-form track list and hero copy (single source of truth in `academySettings.tracks`).

**Batch 2 — P2 (workflow safety)**
4. F-05 make lecturer batch selection prominent + persist to localStorage; show active batch as a visible header chip.
5. F-06 add a confirm step to Publish/Republish stating "this notifies N students".
6. F-07 wrap admin tables in a responsive scroll container; verify at 375px.
7. F-04 surface a concrete next-batch date (or reword to a clear "rolling admissions" message).

**Batch 3 — P3 polish**
8. F-08 add a CSS fallback so content is visible even if GSAP never runs (reveal on `load` + `no-js`/timeout).
9. F-09 fix hero text artifact. F-10 confirm bank account naming. F-11 standardise empty states.

After each batch: re-test in the browser (Phase 16), then a full role-based E2E + true-mobile pass using temporary `UX_TEST_`-prefixed accounts (created only with your go-ahead; deleted only after you approve results).

---

## What I still need to do (after your review)

- Authenticated real-browser passes for Student, Lecturer, Admin using `UX_TEST_` accounts (Phases 4–6).
- True mobile (375/768) sweep (Phase 11) + accessibility pass (Phase 12).
- Payment UX simulated failure/cancel/duplicate checks (Phase 7) — no real charges.

**Stopping here for your review before implementing broad changes, per the mandate.**
