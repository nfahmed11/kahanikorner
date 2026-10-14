# Clean URL migration — audit report

Branch `perf/homepage-batch1` · tested 2026-10-11 against the Firebase Hosting emulator (firebase-tools 15.22.1).
**Nothing has been committed, pushed, merged or deployed.**

## A. Project inspection

| Item | Value |
|---|---|
| Hosting public directory | `.` (repo root), single hosting target, project `kahanikorner-8c61e` |
| HTML files discovered (deployed) | **63** |
| QR HTML files | **35** (11 monthly issues, 8 book pages, 16 shared games) |
| Directory `index.html` pages | **20** (+ root `index.html`) |
| Files excluded from clean URLs | **0** — all 63 are served at a clean URL |
| Name collisions checked | `resources/tutors.html` vs `resources/tutors/`, `quicklinks.html` vs `quicklinks/` — both resolve correctly |

## B. Firebase configuration (`firebase.json`)

```diff
     "public": ".",
+    "cleanUrls": true,
 ...
+    "redirects": [
+      { "source": "/index.html", "destination": "/", "type": 301 },
+      { "regex": "^/(?P<dir>.+)/index\\.html$", "destination": "/:dir/", "type": 301 },
+      { "regex": "^/(?P<dir>resources/free|qr/tkt/[^/.]+|qr/tkt/20[0-9]{2}/[^/.]+|qr/book/[^/.]+|qr/book/[^/.]+/TheKahaniTimes)$",
+        "destination": "/:dir/", "type": 301 }
+    ],
```

Headers, the three Cloud Functions rewrites, `public`, and `ignore` are unchanged. Redirects are evaluated before cleanUrls and before the rewrites; none of the patterns overlap `/create-checkout-session` or `/api/*`.

Why the three redirects are needed (all found in emulator testing):

1. **`/index.html` → `/`** — with cleanUrls alone, `/index.html?utm_source=x` produced `Location: ?utm_source=x`, an infinite redirect loop.
2. **`/<dir>/index.html` → `/<dir>/`** — cleanUrls alone redirected printed QR URLs like `/qr/tkt/2026/1026otc/index.html` to `/qr/tkt/2026/1026otc` (no slash), where every `./assets/…` image and audio path resolves one folder too high.
3. **bare `/<dir>` → `/<dir>/`** — cleanUrls alone served directory pages at the slash-less URL (same broken relative assets). Production today 301s these to the slash; this keeps that behaviour. The pattern covers future issues (`qr/tkt/20YY/<slug>`) and books (`qr/book/<slug>`) automatically.

Every legacy URL reaches its final page in exactly one 301, with the query string preserved.

## C. Site-wide URL migration

| Category | Pages discovered | Migrated | Exceptions | Route tests passed |
|---|---:|---:|---:|---:|
| Root pages (home, about, privacy, terms) | 4 | 4 | 0 | 4/4 |
| Shop / checkout (products, subscribe, success) | 3 | 3 | 0 | 3/3 |
| Free resources (`resources/free/`) | 3 | 3 | 0 | 3/3 |
| Other resources (`resources/`, tutors) | 12 | 12 | 0 | 12/12 |
| Quicklinks | 4 | 4 | 0 | 4/4 |
| QR monthly issues (archives) | 11 | 11 | 0 | 11/11 |
| QR book pages | 8 | 8 | 0 | 8/8 |
| QR shared games | 16 | 16 | 0 | 16/16 |
| Shared partials (navbar/footer, fetched) | 2 | 2 | 0 | 2/2 |
| **TOTAL** | **63** | **63** | **0** | **63/63** |

`tools/test-clean-urls.mjs`: 63 files · 210 checks · **0 failed** (clean 200 + exact file content, legacy 301 + query preserved, single hop, bare-dir 301, 404 for unknown route).

## D. Complete QR audit

Query-parameter test = legacy URL requested with `?kk_test=1&issue=1026otc`; the Location header kept it intact.

| Original QR URL | Canonical URL | Query parameter test | Redirect test | Functional test |
|---|---|---|---|---|
| `/qr/assets/html/allvocab.html` | `/qr/assets/html/allvocab` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/assets/html/audionewsletter.html` | `/qr/assets/html/audionewsletter` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — 1026otc + 0926sep: audio sections resolve 200, tap sets player |
| `/qr/assets/html/fallingwords.html` | `/qr/assets/html/fallingwords` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/assets/html/fill-the-kahani.html` | `/qr/assets/html/fill-the-kahani` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — word chosen, blank filled (?issue=1026otc, via legacy .html URL) |
| `/qr/assets/html/fillblank.html` | `/qr/assets/html/fillblank` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/assets/html/flashcards.html` | `/qr/assets/html/flashcards` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — card shown, next 1/10→2/10, quiz cross-link clean |
| `/qr/assets/html/matching.html` | `/qr/assets/html/matching` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — loads from 0826aug, board renders |
| `/qr/assets/html/memory.html` | `/qr/assets/html/memory` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — loads from 0626jun, cards render |
| `/qr/assets/html/quiz.html` | `/qr/assets/html/quiz` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — loads from flashcards link with ?words= |
| `/qr/assets/html/riddles.html` | `/qr/assets/html/riddles` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — loads from aaloomiyan book page |
| `/qr/assets/html/speedgrid.html` | `/qr/assets/html/speedgrid` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/assets/html/thekahanitimes.html` | `/qr/assets/html/thekahanitimes` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/assets/html/urdu-mad-lib.html` | `/qr/assets/html/urdu-mad-lib` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — 12 blanks filled, story rendered (?issue=1026otc) |
| `/qr/assets/html/vocabdatabase.html` | `/qr/assets/html/vocabdatabase` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/assets/html/wordsearch.html` | `/qr/assets/html/wordsearch` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | PASS — loads from 1225, grid renders |
| `/qr/assets/html/wordsort.html` | `/qr/assets/html/wordsort` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — .html → clean (1 hop) | UNTESTED interactively — route + asset references verified only |
| `/qr/book/aaloomiyan-kis2uo/index.html` | `/qr/book/aaloomiyan-kis2uo/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/book/abbulayemotorcar-wghfkg/index.html` | `/qr/book/abbulayemotorcar-wghfkg/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load; pre-existing bookcover.png 404 |
| `/qr/book/buskaypiyay-mee7kb/index.html` | `/qr/book/buskaypiyay-mee7kb/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/book/chhotasamakora-dn6ggj/index.html` | `/qr/book/chhotasamakora-dn6ggj/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/book/chuchuchacha-qnvvv2/index.html` | `/qr/book/chuchuchacha-qnvvv2/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/book/dadajeekakhet-mtsp3i/index.html` | `/qr/book/dadajeekakhet-mtsp3i/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load; pre-existing bookcover.png 404 |
| `/qr/book/naaniterimorni-p7zbp9/TheKahaniTimes/index.html` | `/qr/book/naaniterimorni-p7zbp9/TheKahaniTimes/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load; pre-existing /quicklinks/images/logo.png 404 |
| `/qr/book/naaniterimorni-p7zbp9/index.html` | `/qr/book/naaniterimorni-p7zbp9/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load; pre-existing bookcover.png 404 |
| `/qr/tkt/0126/index.html` | `/qr/tkt/0126/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/1225/index.html` | `/qr/tkt/1225/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/0226bef/index.html` | `/qr/tkt/2026/0226bef/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/0326mar/index.html` | `/qr/tkt/2026/0326mar/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/0426ril/index.html` | `/qr/tkt/2026/0426ril/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/0526yam/index.html` | `/qr/tkt/2026/0526yam/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/0626jun/index.html` | `/qr/tkt/2026/0626jun/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/0826aug/index.html` | `/qr/tkt/2026/0826aug/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/1026otc/index.html` | `/qr/tkt/2026/1026otc/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/jul0726/index.html` | `/qr/tkt/2026/jul0726/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |
| `/qr/tkt/2026/sept0926/index.html` | `/qr/tkt/2026/sept0926/` | PASS (`?kk_test=1&issue=1026otc` preserved) | PASS — /index.html → slash (1 hop); bare dir → slash (1 hop) | PASS — opened via legacy URL in browser, game links clean, images load |

**QR games not interaction-tested** (route, redirect and asset references verified; gameplay not exercised): `allvocab`, `fallingwords`, `fillblank`, `speedgrid`, `thekahanitimes`, `vocabdatabase`, `wordsort`. Their URLs are built the same way as the tested games (`/qr/assets/html/<game>?words=…`).

## E. Internal link audit

| Metric | Count |
|---|---:|
| Deployable source files inspected (html/js/xml/css/json) | 147 |
| Files modified by this migration | 47 (46 source files + `firebase.json`) |
| Navigation/URL references updated | 246 (224 via scripted root-relative/absolute rewrite that only touched links whose target file exists; 22 relative links edited by hand) |
| Legacy references intentionally preserved | 14 — 4 Stripe URLs in `functions/index.js` (your decision); 10 `./video.html` in 5 book pages (pre-existing, your decision) |
| Unresolved references | 0 |
| Comments mentioning file names (e.g. "edit in /components/navbar.html") | left as-is (they name files, not URLs) |

Notable non-`href` changes:
- `assets/js/navbar-loader.js`, `footer-loader.js` — fetch `/components/navbar` / `/components/footer` (avoids a 301 on every page view).
- `qr/assets/js/issue-loader.js` — fetches `/qr/tkt/<year>/<slug>/` instead of `…/index.html` (avoids a 301 per game load; `baseUrl` still resolves `./assets/…` to the same folder).
- `qr/assets/js/index.js` `GAME_ROUTES` + generated `?words=` links; `route` values in `qr/tkt/2026/1026otc/index.html` issue-config.
- `products.html` `pageUrl` (`/subscribe`, `/subscribe#archive`); `subscribe.html` client-side `cancelUrl` → `https://kahanikorner.com/subscribe` (passed to Stripe by the unchanged function).
- `quicklinks.html` submit-form `_redirect` → `https://www.kahanikorner.com/`.
- Relative links (`quicklinks.html`, `resources/resources.html`, `resources/tutors*.html`, `quicklinks/review.html`) converted to root-relative clean URLs; destinations unchanged.

## F. SEO changes

- **Canonical tags updated (4):** `terms`, `resources/parentguide`, `resources/free/20-bilingual-games`, `resources/free/dinner-table-urdu-starters`. (`resources/free/` already pointed at `/resources/free/`.)
- **Open Graph `og:url` updated (7):** `terms`, `products`, `subscribe`, `resources/resources`, `resources/parentguide`, both free-resource pages.
- **Sitemap:** 13 `<loc>` entries rewritten to clean URLs; the set of URLs is unchanged (14 entries).
- **Structured data / JSON-LD:** contained no `.html` URLs — no change.
- **Indexing exclusions preserved:** `robots.txt` untouched (`Disallow: /qr/`); no QR, checkout or thank-you pages added to the sitemap.
- **Duplicate prevention:** every `.html` URL now 301s to its clean URL, so the old URLs no longer serve duplicate 200 pages.
- **Recommendation (not done — would add new tags):** most pages have no canonical tag at all (home, products, subscribe, about, privacy, most of `resources/`, quicklinks). Adding self-referencing canonicals is a worthwhile follow-up.

## G. Functional testing (Playwright, headless Chromium, against the emulator)

144 browser checks: **139 pass, 5 fail — all 5 pre-existing** (section L).

| Area | Status |
|---|---|
| Main navigation (desktop) | VERIFIED — navbar/footer injected from `/components/*`, 30 links none `.html`; Shop, Subscribe, About, Privacy clicks land on clean URLs; Shop active-state works on `/products`; all 7 Resources dropdown links 200 |
| Mobile navigation (iPhone 13) | VERIFIED — hamburger opens, 15 links none `.html`, tap Subscribe → `/subscribe`, tap Resources → `/resources/resources` |
| Products | VERIFIED — `/products.html` → `/products`; category → product cards; `pageUrl`s clean |
| Cart | VERIFIED — "Add" stores the item in the cart |
| Checkout entry | NOT EXECUTED — `/create-checkout-session` and stripe.com were blocked in tests by design; no session created |
| Subscription page | VERIFIED — `/subscribe#archive` loads, no errors |
| Stripe return | VERIFIED — `/success.html?session_id=cs_test_abc` → `/success?session_id=cs_test_abc` |
| Free resources | VERIFIED — hub + both pages via legacy URLs; download form present; no failed requests |
| Downloads (PDF delivery after form submit) | UNTESTED — form submission not performed |
| QR codes (all 19 landing pages via printed `/index.html` URL) | VERIFIED |
| Monthly issue navigation | VERIFIED — generated game links clean on all 11 issues |
| Urdu games | VERIFIED for 9 games (table D); 7 not interaction-tested |
| Game query parameters | VERIFIED — `?issue=` (mad lib, fill-the-kahani, audio newsletter ×2 issues) and `?words=` (flashcards, quiz, matching, memory, wordsearch, riddles) |

## H. Performance checks

- **Redirect chains/loops:** none. All legacy URLs = 1 hop. One loop found in emulator (`/index.html?…`) and fixed.
- **New per-page-view redirects:** none. Navbar/footer and issue-config fetches use final URLs; all generated links are final URLs.
- **Asset regressions:** none. Standalone pages keep the same parent folder (`/x.html` → `/x`), so relative paths resolve identically; directory pages keep their trailing slash.
- **Console errors:** no JS errors on any tested page.
- **Performance work preserved:** no CSS, image, font, script-loading, header or layout changes. The `/assets/images/opt/**` cache header is untouched.
- **Lighthouse:** not run (the emulator doesn't reproduce production CDN/compression, so a comparison wouldn't be meaningful).

## I. Git change summary

- Branch: `perf/homepage-batch1`
- Migration changes: 47 files. The 42 files with no prior WIP: `+235 / −217` lines. The 5 coexisting files: 32 changed URL lines (`index.js` 18, `quiz.js` 2, `allvocab.js` 1, `aaloomiyan` 6, `abbulayemotorcar` 5)
- New untracked files (this task): `tools/test-clean-urls.mjs`, `tools/clean-url-migration-report.md` (both under `tools/`, which hosting ignores)
- **Files where your pre-existing uncommitted changes and migration changes coexist (5):** `qr/assets/js/index.js`, `qr/assets/js/quiz.js`, `qr/assets/js/allvocab.js`, `qr/book/aaloomiyan-kis2uo/index.html`, `qr/book/abbulayemotorcar-wghfkg/index.html`. Only `.html` link strings were changed in these; your edits (aliases, `buildWordsParam`, etc.) are intact.
- Pre-existing WIP untouched: the other 8 `qr/assets/js/*.js` files, `.firebase/hosting..cache`, the `crossword-answer-key.png` deletion, and the new `story-audio.*`, `book-words.js`, `wordsearch-answer-key.png`.
- `functions/` not modified.

## J. Remaining risks

1. **Emulator ≠ production.** Verify on a preview channel before going live: regex redirects with named groups, query-string preservation on 301s, and that production doesn't add its own slash handling on top of these rules (which would be a loop risk). Re-running `node tools/test-clean-urls.mjs https://<preview-url>` covers all of this.
2. **Payment provider URLs:** Stripe `success_url`/`cancel_url` in `functions/index.js` still use `.html`. They will 301 to the clean pages with `session_id` intact. No external update is required, but they could be cleaned up in a future Functions deploy.
3. **Stripe Payment Links / Dashboard settings** (e.g. `buy.stripe.com/...` after-payment redirects) are configured in Stripe, not this repo, and weren't inspected. If any point to `….html`, they'll keep working through the 301. The Stripe connector needs to be authorised in claude.ai connector settings before it can be checked.
4. **Untested functionality:** 7 QR games (table D), real checkout, and free-resource download delivery.
5. **Search Console:** after deploy, resubmit the sitemap. Google will follow the 301s.

## K. Recommendation

Ready for a **Firebase preview-channel deploy** (`firebase hosting:channel:deploy clean-urls`) followed by `node tools/test-clean-urls.mjs <preview-url>`. Not deployed — awaiting your approval.

## L. Pre-existing issues (not caused by this migration)

All of these 404 in production today or come from uncommitted WIP; the URL changes don't affect them.

| Issue | Where |
|---|---|
| `./video.html` doesn't exist (10 links) | `qr/book/{abbulayemotorcar,buskaypiyay,chhotasamakora,chuchuchacha,dadajeekakhet}` — 5 pages (earlier I said 6; it's 5) |
| `images/bookcover.png` missing | `qr/book/{abbulayemotorcar,dadajeekakhet,naaniterimorni}` |
| `/quicklinks/images/logo.png` missing | `qr/assets/html/thekahanitimes.html`, `qr/book/naaniterimorni-p7zbp9/TheKahaniTimes/` |
| "Back to Quick Links" → `index.html` resolves to nonexistent `/quicklinks/index.html` | `quicklinks/contactus-thankyou.html`, `quicklinks/review-thankyou.html` |
| "Back to Quick Links" on tutor page actually goes to the homepage | `resources/tutors/fatima-a.html` (destination preserved as-is) |
| `crossword-answer-key.png` deleted in working tree, still referenced by the 1026otc issue-config | **uncommitted WIP** — the config probably needs to point at `wordsearch-answer-key.png` |
| Cloudflare `/cdn-cgi/…/email-decode.min.js` script tag (site isn't on Cloudflare) | `products.html` |
| Relative image names in `subscribe.html` JS data (`newspaper.png`, `jan.png`…) | flagged by the link scanner; they're lookup keys, not requests |

## Appendix — complete old → new URL inventory

| Physical file | New URL | Category | Route type | Params | SEO | Legacy compatibility | Route test |
|---|---|---|---|---|---|---|---|
| `/about.html` | `/about` | Root page | Standalone | — | Not in sitemap (unchanged) | /about.html (301 → new) | PASS |
| `/components/footer.html` | `/components/footer` | Shared partial (fetched) | Standalone | — | Not in sitemap (unchanged) | /components/footer.html (301 → new) | PASS |
| `/components/navbar.html` | `/components/navbar` | Shared partial (fetched) | Standalone | — | Not in sitemap (unchanged) | /components/navbar.html (301 → new) | PASS |
| `/index.html` | `/` | Root page | Directory index | — | In sitemap | /index.html (301 → new) | PASS |
| `/privacy.html` | `/privacy` | Root page | Standalone | — | Not in sitemap (unchanged) | /privacy.html (301 → new) | PASS |
| `/products.html` | `/products` | Shop / checkout | Standalone | — | In sitemap | /products.html (301 → new) | PASS |
| `/qr/assets/html/allvocab.html` | `/qr/assets/html/allvocab` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/allvocab.html (301 → new) | PASS |
| `/qr/assets/html/audionewsletter.html` | `/qr/assets/html/audionewsletter` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/audionewsletter.html (301 → new) | PASS |
| `/qr/assets/html/fallingwords.html` | `/qr/assets/html/fallingwords` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/fallingwords.html (301 → new) | PASS |
| `/qr/assets/html/fill-the-kahani.html` | `/qr/assets/html/fill-the-kahani` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/fill-the-kahani.html (301 → new) | PASS |
| `/qr/assets/html/fillblank.html` | `/qr/assets/html/fillblank` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/fillblank.html (301 → new) | PASS |
| `/qr/assets/html/flashcards.html` | `/qr/assets/html/flashcards` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/flashcards.html (301 → new) | PASS |
| `/qr/assets/html/matching.html` | `/qr/assets/html/matching` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/matching.html (301 → new) | PASS |
| `/qr/assets/html/memory.html` | `/qr/assets/html/memory` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/memory.html (301 → new) | PASS |
| `/qr/assets/html/quiz.html` | `/qr/assets/html/quiz` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/quiz.html (301 → new) | PASS |
| `/qr/assets/html/riddles.html` | `/qr/assets/html/riddles` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/riddles.html (301 → new) | PASS |
| `/qr/assets/html/speedgrid.html` | `/qr/assets/html/speedgrid` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/speedgrid.html (301 → new) | PASS |
| `/qr/assets/html/thekahanitimes.html` | `/qr/assets/html/thekahanitimes` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/thekahanitimes.html (301 → new) | PASS |
| `/qr/assets/html/urdu-mad-lib.html` | `/qr/assets/html/urdu-mad-lib` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/urdu-mad-lib.html (301 → new) | PASS |
| `/qr/assets/html/vocabdatabase.html` | `/qr/assets/html/vocabdatabase` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/vocabdatabase.html (301 → new) | PASS |
| `/qr/assets/html/wordsearch.html` | `/qr/assets/html/wordsearch` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/wordsearch.html (301 → new) | PASS |
| `/qr/assets/html/wordsort.html` | `/qr/assets/html/wordsort` | QR · shared game | Standalone | ?issue= or ?words= | robots-disallowed (/qr/) | /qr/assets/html/wordsort.html (301 → new) | PASS |
| `/qr/book/aaloomiyan-kis2uo/index.html` | `/qr/book/aaloomiyan-kis2uo/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/aaloomiyan-kis2uo/index.html (301 → new); /qr/book/aaloomiyan-kis2uo (301 → new) | PASS |
| `/qr/book/abbulayemotorcar-wghfkg/index.html` | `/qr/book/abbulayemotorcar-wghfkg/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/abbulayemotorcar-wghfkg/index.html (301 → new); /qr/book/abbulayemotorcar-wghfkg (301 → new) | PASS |
| `/qr/book/buskaypiyay-mee7kb/index.html` | `/qr/book/buskaypiyay-mee7kb/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/buskaypiyay-mee7kb/index.html (301 → new); /qr/book/buskaypiyay-mee7kb (301 → new) | PASS |
| `/qr/book/chhotasamakora-dn6ggj/index.html` | `/qr/book/chhotasamakora-dn6ggj/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/chhotasamakora-dn6ggj/index.html (301 → new); /qr/book/chhotasamakora-dn6ggj (301 → new) | PASS |
| `/qr/book/chuchuchacha-qnvvv2/index.html` | `/qr/book/chuchuchacha-qnvvv2/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/chuchuchacha-qnvvv2/index.html (301 → new); /qr/book/chuchuchacha-qnvvv2 (301 → new) | PASS |
| `/qr/book/dadajeekakhet-mtsp3i/index.html` | `/qr/book/dadajeekakhet-mtsp3i/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/dadajeekakhet-mtsp3i/index.html (301 → new); /qr/book/dadajeekakhet-mtsp3i (301 → new) | PASS |
| `/qr/book/naaniterimorni-p7zbp9/TheKahaniTimes/index.html` | `/qr/book/naaniterimorni-p7zbp9/TheKahaniTimes/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/naaniterimorni-p7zbp9/TheKahaniTimes/index.html (301 → new); /qr/book/naaniterimorni-p7zbp9/TheKahaniTimes (301 → new) | PASS |
| `/qr/book/naaniterimorni-p7zbp9/index.html` | `/qr/book/naaniterimorni-p7zbp9/` | QR · book page | Directory index | — | robots-disallowed (/qr/) | /qr/book/naaniterimorni-p7zbp9/index.html (301 → new); /qr/book/naaniterimorni-p7zbp9 (301 → new) | PASS |
| `/qr/tkt/0126/index.html` | `/qr/tkt/0126/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/0126/index.html (301 → new); /qr/tkt/0126 (301 → new) | PASS |
| `/qr/tkt/1225/index.html` | `/qr/tkt/1225/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/1225/index.html (301 → new); /qr/tkt/1225 (301 → new) | PASS |
| `/qr/tkt/2026/0226bef/index.html` | `/qr/tkt/2026/0226bef/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/0226bef/index.html (301 → new); /qr/tkt/2026/0226bef (301 → new) | PASS |
| `/qr/tkt/2026/0326mar/index.html` | `/qr/tkt/2026/0326mar/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/0326mar/index.html (301 → new); /qr/tkt/2026/0326mar (301 → new) | PASS |
| `/qr/tkt/2026/0426ril/index.html` | `/qr/tkt/2026/0426ril/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/0426ril/index.html (301 → new); /qr/tkt/2026/0426ril (301 → new) | PASS |
| `/qr/tkt/2026/0526yam/index.html` | `/qr/tkt/2026/0526yam/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/0526yam/index.html (301 → new); /qr/tkt/2026/0526yam (301 → new) | PASS |
| `/qr/tkt/2026/0626jun/index.html` | `/qr/tkt/2026/0626jun/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/0626jun/index.html (301 → new); /qr/tkt/2026/0626jun (301 → new) | PASS |
| `/qr/tkt/2026/0826aug/index.html` | `/qr/tkt/2026/0826aug/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/0826aug/index.html (301 → new); /qr/tkt/2026/0826aug (301 → new) | PASS |
| `/qr/tkt/2026/1026otc/index.html` | `/qr/tkt/2026/1026otc/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/1026otc/index.html (301 → new); /qr/tkt/2026/1026otc (301 → new) | PASS |
| `/qr/tkt/2026/jul0726/index.html` | `/qr/tkt/2026/jul0726/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/jul0726/index.html (301 → new); /qr/tkt/2026/jul0726 (301 → new) | PASS |
| `/qr/tkt/2026/sept0926/index.html` | `/qr/tkt/2026/sept0926/` | QR · monthly issue | Directory index | — | robots-disallowed (/qr/) | /qr/tkt/2026/sept0926/index.html (301 → new); /qr/tkt/2026/sept0926 (301 → new) | PASS |
| `/quicklinks.html` | `/quicklinks` | Quicklinks | Standalone | — | In sitemap | /quicklinks.html (301 → new) | PASS |
| `/quicklinks/contactus-thankyou.html` | `/quicklinks/contactus-thankyou` | Quicklinks | Standalone | — | Not in sitemap (unchanged) | /quicklinks/contactus-thankyou.html (301 → new) | PASS |
| `/quicklinks/review-thankyou.html` | `/quicklinks/review-thankyou` | Quicklinks | Standalone | — | Not in sitemap (unchanged) | /quicklinks/review-thankyou.html (301 → new) | PASS |
| `/quicklinks/review.html` | `/quicklinks/review` | Quicklinks | Standalone | — | In sitemap | /quicklinks/review.html (301 → new) | PASS |
| `/resources/cartoons.html` | `/resources/cartoons` | Resources | Standalone | — | In sitemap | /resources/cartoons.html (301 → new) | PASS |
| `/resources/free/20-bilingual-games.html` | `/resources/free/20-bilingual-games` | Free resource | Standalone | — | Not in sitemap (unchanged) | /resources/free/20-bilingual-games.html (301 → new) | PASS |
| `/resources/free/dinner-table-urdu-starters.html` | `/resources/free/dinner-table-urdu-starters` | Free resource | Standalone | — | Not in sitemap (unchanged) | /resources/free/dinner-table-urdu-starters.html (301 → new) | PASS |
| `/resources/free/index.html` | `/resources/free/` | Free resource | Directory index | — | Not in sitemap (unchanged) | /resources/free/index.html (301 → new); /resources/free (301 → new) | PASS |
| `/resources/parentguide.html` | `/resources/parentguide` | Resources | Standalone | — | In sitemap | /resources/parentguide.html (301 → new) | PASS |
| `/resources/podcasts.html` | `/resources/podcasts` | Resources | Standalone | — | Not in sitemap (unchanged) | /resources/podcasts.html (301 → new) | PASS |
| `/resources/printables.html` | `/resources/printables` | Resources | Standalone | — | In sitemap | /resources/printables.html (301 → new) | PASS |
| `/resources/resources.html` | `/resources/resources` | Resources | Standalone | — | In sitemap | /resources/resources.html (301 → new) | PASS |
| `/resources/socialmedia.html` | `/resources/socialmedia` | Resources | Standalone | — | Not in sitemap (unchanged) | /resources/socialmedia.html (301 → new) | PASS |
| `/resources/songs.html` | `/resources/songs` | Resources | Standalone | — | In sitemap | /resources/songs.html (301 → new) | PASS |
| `/resources/teachers.html` | `/resources/teachers` | Resources | Standalone | — | In sitemap | /resources/teachers.html (301 → new) | PASS |
| `/resources/tutors.html` | `/resources/tutors` | Resources | Standalone | — | In sitemap | /resources/tutors.html (301 → new) | PASS |
| `/resources/tutors/fatima-a.html` | `/resources/tutors/fatima-a` | Resources | Standalone | — | In sitemap | /resources/tutors/fatima-a.html (301 → new) | PASS |
| `/resources/vlogs.html` | `/resources/vlogs` | Resources | Standalone | — | In sitemap | /resources/vlogs.html (301 → new) | PASS |
| `/resources/worksheets.html` | `/resources/worksheets` | Resources | Standalone | — | Not in sitemap (unchanged) | /resources/worksheets.html (301 → new) | PASS |
| `/subscribe.html` | `/subscribe` | Shop / checkout | Standalone | — | In sitemap | /subscribe.html (301 → new) | PASS |
| `/success.html` | `/success` | Shop / checkout | Standalone | ?session_id= | Not in sitemap (unchanged) | /success.html (301 → new) | PASS |
| `/terms.html` | `/terms` | Root page | Standalone | — | Not in sitemap (unchanged) | /terms.html (301 → new) | PASS |

