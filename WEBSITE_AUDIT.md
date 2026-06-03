# Goallord Creativity - Website Audit

_Generated 2026-05-29 via multi-agent audit - 11 agents, 82 raw findings across 10 dimensions._

## 1. Executive Summary

The Goallord Creativity site is structurally well-built - on-page SEO fundamentals (canonicals, OG/Twitter, JSON-LD, single H1 per page) are above template-default quality, the mobile experience is strong, and the service worker is genuinely well-implemented. However, three classes of problems are serious enough to undermine the rest. First, **trust and conversion are broken on the money paths**: the academy advertises NGN 300,000 but charges NGN 320,000 at checkout, markets an Online plan that does not exist at payment, and the shop displays a **fake bank account** - alongside a complete absence of legal pages (Privacy/Terms/Refund) despite collecting personal data and real payments (likely an NDPR gap). Second, **performance is the weakest dimension**: every page ships ~900KB of render-blocking CSS and ~1.5MB of JavaScript with zero `defer`/`async`, including a full GSAP+Swiper+Slick+jQuery stack on simple pages like shop and blog-single. Third, **a server-side catch-all returns index.html at HTTP 200 for every unknown URL**, creating a site-wide soft-404 and duplicate-content trap while the polished 404.html sits unused. Fixing the pricing/trust contradictions, deferring scripts, and correcting the catch-all route are the highest-leverage moves available.

## 2. Scorecard

| Dimension | Grade | Verdict |
|---|---|---|
| SEO | B− | Strong on-page basics; orphan landing page, dual conflicting sitemaps, JS-only shop/blog content, and over-long titles/descriptions hold it back. |
| User Flow/Conversion | D | Money paths contradict each other (price surprise, phantom plan, fake bank details) and key utility pages are orphaned. |
| Accessibility | C | Multiple WCAG failures: pinch-zoom disabled, low-contrast text, removed focus outlines, skipped heading levels. |
| Performance | D− | Render-blocking 900KB CSS + 1.5MB undeferred JS on every page, heavy Spline + @import fonts, no LCP optimization. |
| Content/Trust | D+ | No legal/cookie policy, fake/duplicate testimonials, empty portfolio, mixed USD/NGN currency confusion. |
| Mobile | B | Generally strong; pricing tab overflow, clipped FAQ accordion, and 100vh hero issues are the main defects. |
| Technical | C− | Soft-404 catch-all, no www→apex redirect, indexable thin utility pages, inconsistent lang, OG image misconfigured. |

## 3. Top 10 Prioritized Action Items

| # | Priority | Area | Issue | Fix | Effort |
|---|---|---|---|---|---|
| 1 | P0 | Conversion | Academy advertises NGN 300,000 but checkout charges NGN 320,000 (undisclosed NGN 20,000 application fee); advertised Online plan (NGN 80,000) does not exist at payment. | Disclose the application fee on academy.html/apply.html and add the Online plan to apply-payment.html + server fees config (or remove the Online card). Make all pages match. | M |
| 2 | P0 | Trust | Shop checkout shows fake bank details (Access Bank, acct 1234567890). | Fetch real bank accounts from `/api/config/public` like apply-payment.html, or disable bank transfer until real details exist. | S |
| 3 | P0 | Trust/Legal | No Privacy/Terms/Refund pages or footer links despite forms + real payments (NDPR risk); no cookie/data notice. | Create and footer-link Privacy, Terms, Refund policies; add a cookie/data-use notice linking to Privacy. | M |
| 4 | P0 | Technical | `app.get('*')` serves index.html at HTTP 200 for any unmatched URL - site-wide soft-404 + duplicate content; 404.html never served. | Change fallback to `res.status(404).sendFile('404.html')`; convert 404.html asset/nav paths to root-absolute. | S |
| 5 | P0 | Performance | 15 `<script>` tags (~1.5MB JS) with zero defer/async; full animation stack loaded on every page incl. shop/blog-single. | Add `defer` to all `<script src>`; build per-page bundles so shop/blog-single drop GSAP/Swiper/Slick. | M |
| 6 | P1 | Performance | ~900KB render-blocking CSS in head (bootstrap 312KB, styles 148KB, animate.css 68KB unused); Spline + Google Fonts @import in critical path. | Purge unused CSS, remove animate.css, self-host/preload fonts (drop @import), lazy-load Spline behind a poster image. | L |
| 7 | P1 | SEO | shop.html and blog-single.html have no crawlable content/structured data - products and articles are JS-rendered; blog-single serves generic title/canonical and `{}` JSON-LD without JS. | Server-render (or pre-render) titles, canonical, OG, H1 and Product/Article JSON-LD; add BreadcrumbList to shop. | L |
| 8 | P1 | SEO | learn-coding-onitsha.html is fully orphaned (0 inbound links); two sitemaps conflict (server dynamic omits shop + learn-coding-onitsha). | Link learn-coding-onitsha from academy/footer; add it + shop.html to the server.js staticPages array and retire the static sitemap.xml. | S |
| 9 | P1 | Accessibility | `maximum-scale=1` disables pinch-zoom on academy/apply/shop/services/pricing (WCAG 1.4.4); global `outline:0` removes focus indicators. | Remove `maximum-scale=1` from all five viewport metas; add `:focus-visible` styles meeting 3:1 non-text contrast. | S |
| 10 | P1 | Content/UX | Currency contradictions site-wide (pricing in USD, academy/checkout in NGN; Course schema USD 100 vs NGN 300,000); empty portfolio + duplicate testimonial avatars. | Standardize on NGN as primary display currency across pages/schema; publish real case studies; use distinct testimonial photos. | M |

## 4. Detailed Findings by Dimension

### SEO

**P1 - index.html / academy.html: Meta descriptions exceed SERP limit.** index.html description is 227 chars (truncates "SEO & content strategy that drives real results"); academy.html is 216 chars (truncates "12-week programmes with job placement support"). *Fix:* trim each to ~155 chars, front-loading local + service keywords, e.g. "Web design, WordPress, web apps & e-commerce agency in Onitsha, Nigeria. SEO and content strategy that drives real results."

**P1 - shop.html: No structured data and JS-only product content.** `grep 'ld+json'` returns nothing - no Product/ItemList/Offer, no BreadcrumbList. All product names/prices/descriptions are built in JS via `fetch('/api/products')` (line 473, card H3 ~line 526); served HTML only contains "Loading products..." (line 249). *Fix:* server-render the grid or inject Product/ItemList JSON-LD; add a static BreadcrumbList in `<head>`.

**P1 - blog-single.html: Title/canonical/OG/Article schema empty without JS.** Served HTML shows `<title>Blog | Goallord Creativity</title>`, generic canonical `https://goallordcreativity.com/blog-single.html` (not the post URL), empty H1, and `<script id="schemaScript">{}</script>` (line 34). All populated only via JS (lines 966–1049). *Fix:* server-render or pre-render per-article metadata + Article schema.

**P1 - learn-coding-onitsha.html: Orphan page.** Canonical present and sitemap priority 0.9, but zero inbound internal links from nav, footer, or body of any page. *Fix:* add a contextual link from academy.html body / homepage academy section / footer with anchor "Learn coding in Onitsha."

**P1 - server.js: Two conflicting sitemaps.** server.js dynamically overrides `/sitemap.xml` and its staticPages array (lines 144–155) omits learn-coding-onitsha.html and shop.html, both of which the static sitemap.xml includes (lines 8, 14). The live sitemap drops two indexable pages. *Fix:* add both to staticPages; delete the stale static file.

**P2 - services.html / pricing.html / academy.html: Brand-first generic titles.** "Services | Goallord Creativity Limited", "Pricing | …", "Academy | …" bury service + location keywords behind the brand. *Fix:* lead with keyword + location, e.g. "Web Design, WordPress & Web App Services | Onitsha, Nigeria"; "Web Design Pricing in Nigeria | Goallord Creativity"; "Coding & Design Bootcamp Onitsha | Goallord Academy."

**P2 - learn-coding-onitsha.html: 89-char title.** Three pipe-separated segments will truncate mid-phrase (likely dropping "Goallord Academy"). *Fix:* "Learn Coding in Onitsha | Goallord Academy."

**P2 - learn-coding-onitsha.html: Pricing contradiction in schema.** Course offer declares price "100" USD (lines 63–68) while the FAQ/on-page copy says NGN 300,000 in-person / NGN 80,000 online (line 115). *Fix:* set Course Offer to NGN with real prices; align LocalBusiness/academy priceRange site-wide.

**P2 - academy / pricing / learn-coding-onitsha: Heading hierarchy skips.** Pages jump h2 → h4 with no h3 (academy h1/6×h2/0×h3/h4/7×h5; pricing h1/2×h2/12×h4; learn-coding h1/7×h2/4×h4/5×h5). *Fix:* use h3 for subsection/plan titles so levels descend without gaps.

**P2 - pricing.html: No Offer/PriceSpecification or FAQPage schema.** JSON-LD is only WebPage + BreadcrumbList. *Fix:* add Service + Offer/AggregateOffer per package and a FAQPage block for the pricing FAQ.

**P2 - shop.html: No analytics wiring.** Every other page includes the `/api/content/analytics` GA4+Clarity loader; shop.html has 0 markers, so shop/checkout traffic is untracked. *Fix:* add the analytics loader block before `</body>`.

**P2 - site-wide: OG image misconfigured.** og-image.jpg is actually a 1536×1024 PNG at 1.7MB, but pages declare 1200×630 (1.91:1). Wrong aspect ratio → cropped previews; oversized for scrapers. *Fix:* export a real 1200×630 JPEG under ~300KB at the referenced path.

**P3 - index.html: H1 lacks keyword/location.** H1 is only the slogan "We Build Brands That Get Noticed" (lines 649–651). *Fix:* add a crawlable keyworded eyebrow/subheading near it.

**P3 - site-wide: lang/locale mismatch.** Pages declare en-US while copy uses British spellings ("programmes", "specialise"); manifest/offline use en-NG. *Fix:* standardize on en-NG.

**P3 - blog-single.html: Article schema image bug.** `"image": ogImg` (the static fallback logo, line 1009) instead of `ogImgUrl` (the real cover, lines 994–996). *Fix:* change to `ogImgUrl`.

**P3 - site-wide: Shared OG image / no hreflang / academy vs learn-coding cannibalization risk.** All static pages share one og:image; no hreflang anywhere; academy and learn-coding-onitsha target similar local intent (both self-canonicalize, so no penalty). *Fix:* add per-page OG images for high-traffic pages; optionally add self-referencing hreflang en-ng; keep the two pages differentiated by intent and cross-link them.

### User Flow / Conversion

**P0 - apply-payment.html / academy.html: Price surprise (NGN 320,000).** academy.html:450 advertises NGN 300,000 with no application fee; apply-payment.html:521 computes total = appFee + full and the pay button (line 524) reads NGN 320,000. *Fix:* disclose the NGN 20,000 fee upstream.

**P0 - apply-payment.html / academy.html: Phantom Online plan.** academy.html:467 markets a featured Online track at USD 50 (NGN 80,000); apply-payment.html:266–278 only offers Full NGN 300,000 and Monthly NGN 100,000×3. *Fix:* add the Online plan to payment + server config, or remove the card.

**P1 - shop.html: Fake bank details.** shop.html:272–274 hard-codes Access Bank acct 1234567890 (not fetched from server config like apply-payment). *Fix:* fetch real accounts from `/api/config/public` or remove bank transfer.

**P1 - apply-payment.html: No trust signals at pay step.** payCard (lines 286–298) shows only the fee sentence and pay button - no refund policy, cohort date, seat scarcity, Paystack badge, or testimonial. *Fix:* add a reassurance block (secured by Paystack, refund policy, cohort start, one alumni/placement stat).

**P1 - contact.html: No validation, blocking alert.** Form is `novalidate` (line 193); submit handler (367–403) POSTs without checking required fields and uses `alert()` (line 400); Service required (line 217) never enforced. *Fix:* add inline validation (reuse apply.html `has-error` pattern); replace alert with inline banner.

**P1 - application-status.html: Orphaned recovery page.** No public page links it; apply success (lines 201–204) links only academy.html and index.html; resume link lives only in email. *Fix:* link it from apply success, academy, footer, and the verification email.

**P2 - shop.html: Stale hardcoded FX rate + thin checkout.** `USD_TO_NGN=1560` (line 448) used at 599/628/668–670; checkout collects only name+email (no phone). *Fix:* fetch live/admin rate or price in one currency; show real NGN before Paystack; add optional phone.

**P2 - apply.html: Button styling destroyed on error.** Error handler resets label via `.text()` (line 604), wiping the styled inner span (lines 342–344). *Fix:* reset via the span as the resend button does (line 627).

**P2 - apply.html: Heavy first-touch form.** ~11 fields + photo, 5 required including two open-ended single-line motivation inputs (goal line 326, why line 331). *Fix:* make goal/why optional or post-acceptance; convert to textareas if kept.

**P2 - services.html / pricing.html: No phone CTA.** Clickable `tel:` only on about.html:625 and contact.html:168. *Fix:* add a visible clickable phone/WhatsApp CTA on every page.

### Accessibility

**P1 - academy/apply/shop/services/pricing: `maximum-scale=1` disables zoom (WCAG 1.4.4).** Five pages use `width=device-width, initial-scale=1, maximum-scale=1`; index.html does not, so behavior is inconsistent. *Fix:* remove `maximum-scale=1` everywhere.

**P2 - site-wide CSS: Focus outlines removed.** `outline:0/none` in styles.css (209, 3669, 3744, 6831) and goallord.css (857, 2482, 2578) with no replacement; no focus styling in markup. *Fix:* add `:focus-visible` styles meeting 3:1 non-text contrast.

**P2 - academy.html: Low-contrast menu label.** `#4a5060` 10px bold uppercase on a dark panel (line 190) ≈ 2:1, fails 4.5:1. *Fix:* lighten to ~`#A0A6B3`.

**P2 - shop.html: Low-contrast body text.** `#6b7280` 12–13px on dark cards (lines 723, 728) ≈ 3.9:1. *Fix:* use existing `shop-muted #A0A6B3`.

**P2 - index/apply/academy/services: Heading hierarchy skips.** e.g. index has h2→h4/h6 jumps; academy has no h3; services uses h3 then h6. *Fix:* reassign tags to descend without gaps; convert decorative eyebrow text in h6 to `p`/`span` with a class.

**P3 - apply/contact/shop: Required state conveyed by asterisk/placeholder only.** apply.html:233 bare placeholder + asterisk-in-label; shop.html:261 placeholder is the only hint. *Fix:* add `aria-required="true"` and convey required state in the programmatic label; don't rely on placeholders.

**P3 - apply.html: #photoPreview img missing alt.** Line 214 `<img id="photoPreview">` has no alt. *Fix:* add `alt="Uploaded photo preview"` (or `alt=""` if decorative).

**P3 - blog.html: #featuredImg empty alt on content image.** Line 166 content thumbnail uses `alt=""`. *Fix:* populate alt dynamically with the featured post title. (Decorative bg-3.png `alt=""` on about/portfolio/alumni is correct.)

### Performance

**P0 - site-wide: 1.5MB JS, zero defer/async.** index.html L2807–2820 loads jquery (200KB), gsap (164KB), swiper-bundle (148KB), bootstrap.js (128KB), ScrollTrigger (104KB), slick (76KB), SplitText (24KB), ScrollSmoother (16KB) + more; 0 of 15 have defer/async. *Fix:* add `defer` to all; code-split the animation stack to pages that use it.

**P0 - shop.html / blog-single.html: Full animation stack on simple pages.** Both load the identical 14-script ~1MB+ bundle (shop L400–414, blog-single L785–799) though they mainly need Paystack + basic JS. *Fix:* per-page bundles dropping GSAP/Swiper/Slick.

**P1 - site-wide: ~900KB render-blocking CSS.** 10 stylesheets in head: bootstrap.min.css 312KB (mostly unused), styles.css 148KB, goallord.css 80KB, animate.css 68KB. *Fix:* PurgeCSS, concatenate small files, inline critical CSS + preload the rest.

**P1 - index.html: Render-blocking Spline.** Spline viewer ES module from unpkg (L120) + multi-MB WebGL scene (L626–630) in the hero/LCP path. *Fix:* lazy-load on scroll/after load behind a poster image + reduced-motion/mobile gate; self-host the viewer.

**P1 - fonts.css: Google Fonts via @import.** L1 `@import` chains HTML → fonts.css → googleapis → gstatic, serializing font load. *Fix:* use a direct `<link>` or self-host Figtree woff2 with `font-display:swap` + preload; trim the weight range.

**P1 - index.html: No LCP optimization.** Zero `rel=preload`, zero `fetchpriority`, zero `srcset`, no Cloudinary. *Fix:* preload + `fetchpriority=high` on the LCP image; serve responsive srcset/sizes (or image CDN) for the mobile-first Nigerian market.

**P2 - shop/apply-payment: Paystack eager + cold connection.** inline.js loaded synchronously (shop L415), no preconnect to js/api.paystack.co anywhere. *Fix:* defer or load on Pay click; add `preconnect` to Paystack origins.

**P2 - index.html: animate.css unused.** 68KB render-blocking with 0 `animate__`/`wow` usages. *Fix:* remove the link (verify across pages first).

**P2 - icomoon style.css: Legacy icon font.** eot/ttf/woff/svg, no woff2, no font-display (L3–7). *Fix:* add woff2 + `font-display`, drop eot/svg/ttf; ideally replace with inline SVG.

**P2 - assets: Oversized images.** og-image.jpg 1.7MB, SEF (1).png 1.4MB. *Fix:* recompress OG to <200KB; convert large PNGs to WebP; drop unused large assets.

**P3 - index.html: 248KB single-document HTML.** 4070 lines, 20+ inline scripts/styles inflate critical-path payload. *Fix:* extract repeated inline JS to cached main.js; verify gzip/brotli enabled.

**P3 - sw.js: Strength - sound caching strategy.** Network-first HTML with offline fallback, cache-first images with SWR, navigation preload, versioned cleanup. Minor: PRECACHE omits core CSS/JS. *Fix (optional):* add core assets to PRECACHE_URLS.

### Content / Trust

**P0 - site-wide: No legal pages.** No Privacy/Terms/Refund files or footer links despite forms collecting name/email/phone and real payments (NGN 300,000). Likely NDPR gap. *Fix:* create and footer-link all three.

**P1 - site-wide: No cookie/data-collection notice.** Forms + analytics fetch (index.html:309) with no consent/notice. *Fix:* add a cookie/data-use notice linked to Privacy.

**P1 - portfolio.html: Empty portfolio.** API-driven (`/api/content/portfolio`) with "No projects yet" fallback (index.html:271/278) - zero proof of work. *Fix:* publish 6–9 real case studies (client, problem, solution, screenshots, metric).

**P1 - index.html: Fake/duplicate testimonials + unverifiable stats.** Six testimonials reuse three byte-identical avatars (Ngozi Adeleke and Amaka Nwosu share tes-2.jpg, all 15490 bytes, lines 2970–2977); "50+ projects / 98% satisfaction" (line 662) unverifiable. *Fix:* use distinct real photos/logos; back stats with proof or soften.

**P1 - pricing.html / academy.html: Currency confusion.** Agency pricing all USD (499–9,000+, "All prices in USD") while academy/checkout in NGN; academy lists same 12-week programme at NGN 300,000 in-person vs USD 50 / NGN 80,000 online (~3.75× gap unexplained). *Fix:* standardize on NGN primary and reconcile/explain the in-person vs online gap.

**P2 - about.html: Empty "Trusted By" + brand-casing drift.** `glLogoGrid` via `/api/logos/public` early-returns empty (lines 504–520), leaving a header over blank space; "Goallord Creativity Limited" (69×) vs "Goallord Creativity" (13×). *Fix:* add real logos or hide the section; standardize on one brand name.

**P3 - shop.html: Hard-coded USD currency label.** priceDisplay renders the Naira symbol when NGN (line 508) but appends `<span>USD</span>` unconditionally (line 528). *Fix:* render the matching currency label.

### Mobile

**P1 - pricing.html: Tab bar overflow on phones.** Single-row flex, no wrap, `white-space:nowrap`, and the only `max-width:206px` rule is gated behind `min-width:576px` (styles.css 3579–3616). Four tab labels overflow/crush at 320–375px. *Fix:* add a `max-width:575px` query with `flex-wrap:wrap` (width auto) or make the bar `overflow-x:auto`.

**P2 - academy.html: FAQ answers clipped.** `.ac-faq-a` open state caps `max-height:300px` with overflow hidden (lines 167–169); JS-injected long answers exceed this on narrow phones. *Fix:* use a scrollHeight transition or a large cap (~1200px).

**P2 - index.html + offcanvas: 100vh viewport units.** Hero (index.html 356–358) and offcanvas (styles.css 1755–1756) use 100vh; mobile dynamic toolbars clip the hero bottom and offcanvas footer. *Fix:* use `svh`/`dvh` with a 100vh fallback.

**P3 - apply.html: nice-select placeholder ambiguity.** Placeholder repeats as value with no selected-vs-placeholder visual cue (lines 277/574). *Fix:* style the selected state distinctly.

### Technical

**P0 - server.js: Catch-all soft-404.** `app.get('*', …res.sendFile('index.html'))` (lines 278–280) returns the homepage at HTTP 200 for any unmatched URL - duplicate content at scale; 404.html never served. *Fix:* `res.status(404).sendFile('404.html')`.

**P1 - server.js: No www→apex redirect.** Host redirect (27–36) forces https and redirects herokuapp.com but not www→apex; www is CORS-allowed and resolves, duplicating apex canonicals. *Fix:* add a www→apex 301.

**P2 - 404.html: Relative asset/nav paths.** Stylesheets/logo/nav links are relative (lines 12–21, 64) while manifest is absolute; will break when served for deep URLs. *Fix:* convert to root-absolute paths alongside the P0 fix.

**P2 - apply-payment.html / application-status.html: Indexability.** Both lack canonical and robots noindex; apply-payment is Disallowed but not noindexed; application-status is neither. *Fix:* add `noindex,nofollow` to both; add application-status.html to robots.txt Disallow.

**P2 - site-wide: Inconsistent html lang.** Marketing pages en-US; apply-payment/application-status `en`; offline.html/manifest en-NG. *Fix:* standardize on en-NG.

**P3 - index.html / manifest.json: Favicon path + permissions.** Shortcut icon uses a relative path (`assets/images/logo/favicon.svg?v=2`) breaking in subdirectories; manifest `goallord_icon.svg` has owner-only `-rw-------` perms (may 403 in prod). *Fix:* use root-absolute favicon path; `chmod 644 goallord_icon.svg`.

## 5. Quick Wins (<1hr, high impact)

- **Add `defer` to all 15 `<script src>` tags** site-wide - single largest TBT/TTI improvement (P0 Performance).
- **Fix the catch-all route** in server.js to `res.status(404).sendFile('404.html')` - kills the site-wide soft-404 in one line (P0 Technical).
- **Replace the fake shop bank account** (1234567890) by fetching `/api/config/public`, or remove bank transfer (P0 Trust).
- **Remove `maximum-scale=1`** from the five viewport metas (academy/apply/shop/services/pricing) - restores pinch-zoom, fixes WCAG 1.4.4 (P1 Accessibility).
- **Remove the unused `animate.css` link** - drops 68KB of render-blocking CSS (P2 Performance).
- **Trim index.html and academy.html meta descriptions** to ~155 chars (P1 SEO).
- **Add shop.html + learn-coding-onitsha.html to the server.js staticPages sitemap array** and add one internal link to learn-coding-onitsha (P1 SEO).
- **Add the GA4/Clarity analytics block to shop.html** to match every other page (P2 SEO).
- **Fix the blog-single Article schema image** (`ogImg` → `ogImgUrl`, line 1009) (P3 SEO).
- **Recompress og-image.jpg** to a true 1200×630 JPEG under ~300KB (P2 SEO/Performance).
- **Add `preconnect` to js.paystack.co / api.paystack.co** (P2 Performance).
- **`chmod 644` the manifest icon** to prevent a production 403 (P3 Technical).
