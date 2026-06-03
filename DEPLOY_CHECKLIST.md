# Deploy Checklist - SYSTEM_AUDIT M3–M10

Shipping the features built from `SYSTEM_AUDIT_REPORT.md` (milestones **M3–M10**).
Work through top to bottom. Nothing here has been run against the live
Supabase/Brevo/Paystack/Cloudinary stack yet - it is verified at the
syntax/logic level only, so do a **staging pass first**.

---

## 0. Pre-flight

- [ ] Branch is up to date and the app boots locally (`npm install` then `npm start`).
- [ ] `.npmrc` (now in the repo, `legacy-peer-deps=true`) is committed - Render's
      `npm install` needs it so multer 2.x doesn't `ERESOLVE` against
      `multer-storage-cloudinary@4`'s stale peer range.
- [ ] Confirm the deploy host runs `npm install` (Render `buildCommand`) - not
      `npm ci`. (If you switch to `npm ci`, the committed `package-lock.json`
      already has multer 2.1.1, so it's fine either way.)

---

## 1. Database migrations - APPLY IN ORDER

Run against the production Supabase/Postgres DB **before** the new server code
serves traffic. All are idempotent (`IF NOT EXISTS`), so re-running is safe.

- [ ] `migrations/006_add_2fa.sql` - TOTP columns on `users`, `students`, `lecturers`
- [ ] `migrations/007_audit_log.sql` - `audit_log` table (admin audit trail)
- [ ] `migrations/008_payment_recovery.sql` - retry/SMS/proforma columns on `payments`
- [ ] `migrations/009_chat.sql` - `chat_threads`, `chat_participants`, `chat_messages`

**Failure modes if skipped:**
- 006 missing → logins still work (`totp_enabled` reads as falsy), but 2FA enrol throws.
- 007 missing → audit writes fail **soft** (wrapped in try/catch, fire-and-forget after response) - requests still succeed.
- 008 missing → payment confirm/proforma/retry endpoints throw on the new columns.
- 009 missing → the Messages tab and all `/api/messages` calls throw.

> How to apply: paste each file into the Supabase SQL editor in order, or run
> via `psql`. Verify afterwards (see §5).

---

## 2. Environment variables

Set in the Render dashboard (or host env). Existing secrets are already configured;
these are the **new / relevant** ones:

- [ ] `BREVO_SMS_SENDER` - **new.** Alphanumeric sender ID (≤11 chars, e.g. `Goallord`).
      Required for bank-transfer **SMS** confirmations (M7). Without it, SMS
      no-ops silently (logs a warning) and the email receipt still sends - safe to defer.
- [ ] `NODE_ENV=production` - **important for M9.** The auth cookie is only marked
      `Secure` when `NODE_ENV==='production'`. Confirm it's set so the JWT cookie
      is HTTPS-only in prod. (Render: add it as an env var.)
- [ ] Confirm existing: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
      `PAYSTACK_SECRET_KEY`, `BREVO_API_KEY`, `EMAIL_FROM`, `HOST`,
      `CLOUDINARY_*` are all present.

---

## 3. External service config

- [ ] **Paystack webhook** → enable the `charge.failed` event (in addition to
      `charge.success`) pointing at `https://<domain>/api/webhooks/paystack`.
      M7's retry-email-on-failed-charge depends on it. (Signature is HMAC-verified.)
- [ ] **Brevo** → confirm SMS credits/sender are provisioned if you set
      `BREVO_SMS_SENDER`.

---

## 4. Smoke tests after deploy (do these in a real browser)

### 4a. 🔴 Auth cookie cutover (M9) - HIGHEST RISK, test first
The JWT moved from localStorage to an httpOnly cookie. Cookie misconfig can't be
caught without a real browser + domain.
- [ ] Admin: log in at `/login.html` → lands on dashboard → refresh keeps session → **Sign Out** returns to login and the session is gone.
- [ ] Student: same via `/student-login.html`.
- [ ] Lecturer: same via `/lecturer-login.html`.
- [ ] In DevTools → Application → Cookies: confirm `gl_token` / `gl_student_token` /
      `gl_lecturer_token` is present, **HttpOnly = true**, **Secure = true** (prod).
- [ ] Confirm localStorage holds only the sentinel `'cookie-session'` (no real JWT).
- [ ] Existing users who were logged in before deploy keep working (Bearer fallback)
      until they re-login - verify one isn't force-logged-out.

> **Rollback (if auth breaks):** revert the one-line token-store change in the 3
> login pages (`login.html`, `student-login.html`, `lecturer-login.html`) back to
> `localStorage.setItem(..., json.token)`. The cookie-first middleware still accepts
> the Bearer token, so this restores the old flow immediately.

### 4b. 2FA (M5)
- [ ] Student/lecturer/admin → Security → Enable Two-Factor → scan QR (or manual key)
      → confirm code → backup codes shown once.
- [ ] Log out, log in → prompted for the 6-digit code → succeeds. Try a backup code.
- [ ] Disable 2FA (password + code) works.

### 4c. In-app chat (M8)
- [ ] As a student and a lecturer **in the same batch**, open Messages.
- [ ] Student DMs the lecturer; lecturer sees it (live via socket, or within ~15s poll).
- [ ] Batch group chat works both ways; unread badges update; access control blocks
      messaging someone outside your batch.

### 4d. Payments (M7)
- [ ] Admin → Payments → a pending **bank transfer** → **Confirm** → student gets
      email receipt + (if SMS configured) an SMS; receipt opens.
- [ ] A pending row → **Proforma** → enter company details → invoice emails out.
- [ ] (If possible) trigger a failed Paystack charge → student receives the retry email.

### 4e. Audit log (M6)
- [ ] As admin, perform an action (edit a student) then open **Audit Log** - the entry
      appears with actor, action, IP, status. Confirm logins (success + failure) are logged.
- [ ] Confirm the Audit Log nav item is **hidden** for non-admin staff.

### 4f. Syllabus calendar (M3) & mobile (M4)
- [ ] Student → Syllabus Calendar shows week/day/topic with real dates + deadline chips,
      current week highlighted.
- [ ] On a ~375px viewport, student + lecturer dashboards render tables as cards;
      tab bars scroll.

---

## 5. Post-deploy verification queries (Supabase SQL)

```sql
-- 2FA columns exist
select column_name from information_schema.columns
 where table_name='students' and column_name like 'totp%';
-- audit log receiving entries
select count(*), max(created_at) from audit_log;
-- chat tables exist
select to_regclass('chat_threads'), to_regclass('chat_messages');
-- payment recovery columns exist
select column_name from information_schema.columns
 where table_name='payments' and column_name in
 ('retry_email_sent_at','proforma_number','confirmation_sms_sent_at');
```

---

## 6. Known follow-ups (NOT blocking this deploy)

- [ ] **Cloudinary SDK CVE (HIGH)** - `npm audit` flags `cloudinary@1.x`
      argument-injection (GHSA-g4mf-96x5-5m2c). Fix is a **cloudinary 2.x major
      upgrade** affecting `routes/upload.js`; needs live image/file-upload testing.
      Tracked separately - do not bundle with this deploy.
- [ ] **Chat socket hardening** - `chat:open` joins a thread room without re-verifying
      participation (relies on unguessable thread UUIDs + REST being authoritative).
      Add a server-side participant check for defence-in-depth if desired.
- [ ] `package.json` `engines` says `node: 18.x` but `render.yaml` sets
      `NODE_VERSION: 20`. Harmless (warning only) - align when convenient.

---

## 7. Rollback summary

| Area | Rollback |
|------|----------|
| Auth cookie (M9) | Revert token-store line in the 3 login pages; Bearer fallback keeps working. |
| multer 2.x (M10) | `npm install multer@1.4.5-lts.2 --legacy-peer-deps` + revert `package.json`. |
| Any feature | Migrations are additive (new tables/columns only) - leaving them applied is harmless even if code is rolled back. |
