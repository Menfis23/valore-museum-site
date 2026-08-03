# Working notes — Valore Library gallery

Last updated: 2026-08-03

## Live architecture (confirmed correct as of today)

The 3D gallery experience is `gallery.html` + `js/gallery3d.js`. This is the
canonical, currently-served implementation:

- `explore.html` redirects to `gallery.html?<same query>`.
- `gallery.html` loads `data/countries.js`, `data/artists.js`, and
  `js/gallery3d.js` (module).
- `gallery3d.js` builds artist rooms first (`ARTIST_ORDER = ['bahati', 'olgalene']`),
  then country rooms, pulling straight from each entry's `photos[]` array.
- Artwork frames in `gallery3d.js` are built correctly: frame box sits fully
  behind the canvas (`frame.position.z = -D/2`, front face at `z=0`), art a
  few mm in front — no occlusion possible. See `buildPiece()` around line 284.

## `js/museum-room.js` + `js/museum-ui.js` — orphaned, not live

These were the *old* 3D gallery implementation, loaded only by
`explore-legacy.html`. That HTML file existed in an Aug-2 site snapshot
(`Gallery room improvements.zip`) but has since been deleted from the
project — no page currently references `museum-room.js` or `museum-ui.js`
anywhere except comments. **Nothing a visitor sees runs through these files.**

- `museum-room.js` had a real bug in `buildFrame()`: the frame box's z-offset
  straddled the photo/matt/glass stack, so its solid front face could sit in
  front of the artwork ("every artwork rendered as a blank frame"). This was
  fixed once already (comment documenting it existed in the Aug-2 snapshot),
  then silently reverted by an Aug-3 edit that reset the z-offsets back to
  the reference build's raw values. I re-applied the fix (frame `-0.055`,
  matt `-0.012`, hitMesh `0.05`, glass `0.03`) — but since the file is dead
  code, this is cosmetic/consistency-only, not visitor-facing.
- Same Aug-3 edit also stripped the wall-texture "museum wash" (baked AO
  gradient + film grain in `finalizeWallTexture()`) and removed the entire
  scroll-driven corridor navigation system (`navMode`, `travelToStation`,
  `enterRoom`, `exitRoom`, `handleScrollStep`, ~75 lines). Also dead-code-only.
- **Open decision:** delete `museum-room.js`/`museum-ui.js` outright, or leave
  them as-is. Leaning toward delete since nothing loads them, but not yet done.

## Artist roster

- `ARTIST_SLUGS`/`ARTIST_ORDER` = `bahati`, `olgalene`.
- "bahati" was a typo fix from "bahaty" (old slug/folder `img/artists/bahaty`
  renamed to `img/artists/bahati`).
- `olgalene` is a new artist room added today (`img/artists/olgalene/1.jpg`–`9.jpg`).
- Bahati piece #4, "Dancers of the Congo / Daughter of the Continent" (one
  canvas photographed as two halves — DR Congo flag/dancers scene + gold-jewelry
  portrait), confirmed rendering correctly today in: the 3D room wall, the 3D
  lightbox panel, and the 2D `country.html?c=bahati` story page.

## Bahati room — expanded to 14 works (2026-08-03)

Added 7 more of Bahati's paintings (`img/artists/bahati/8.jpg`–`14.jpg`,
`data/artists.js` `photos[]`), titled by me since the user said to pick
whatever fits: "Keep Earth's Environment Clean, Safe, and Healthy" (the
piece's own lettered headline), "Shielded", "Just Another Day in Paradise",
"Veiled in Red", "Crowned in Kente", "Coronation", "Autumn Watch". Updated
the room intro text from "seven" to "fourteen" paintings. Note: the existing
curatorial essay (sections 2–3) still only describes the original 7 by
theme (DRC heritage, inner-worlds portraiture) — it doesn't organically
cover the new environmental-poster or blue-jay pieces, which are a genuine
subject-matter departure from the rest of the room. Left as-is since
rewriting the essay is a bigger content call; flag to the user if it's
worth revisiting.

## Large-format wall pieces (2026-08-03)

Some of Bahati's newly added source photos were casual snapshots (painting
on an easel, lots of surrounding room in frame) — cropping them to the
standard grid frame size made the actual artwork nearly invisible. Added a
`large: true` flag to `data/artists.js` photo entries (currently set on
"Just Another Day in Paradise" and "Crowned in Kente") that routes a piece
onto its own big back-wall placement instead of the regular grid — see
`featureSlotsFor()` / the `opts` param on `buildPiece()` in `js/gallery3d.js`.
When any large pieces exist, the back wall is reserved entirely for them
(`slotsFor(n, includeBack)`); normal pieces only use left/right walls.
Also replaced `img/artists/bahati/4.jpg` ("Dancers of the Congo / Daughter
of the Continent") with a properly-cropped single-canvas photo the user
provided — the old one was a rough phone photo of it split into two
side-by-side crops, which rendered as an oddly thin wide sliver.

## Security review (2026-08-03)

Checked SQL injection (both `museum_server.py` and `netlify/functions/api.mjs`
parameterize every query — clean), XSS (escapeHtml() consistently applied
everywhere user content is rendered via innerHTML — checked voices.html,
voices-story.html, perspectives*.html, admin.html — clean), `.env`/secrets
exposure (correctly excluded from the Netlify deploy bundle via
`.netlifyignore`, confirmed live: `GET /.env` → 404), and admin API auth
(confirmed live: `GET /api/admin/queue` with no credentials → 401).

Two real findings:
1. **Fixed** — prompt injection in the AI moderation screener. User-submitted
   title/text went straight into the Claude moderation prompt with no
   anti-injection framing; a crafted submission could try to talk the
   screener into returning `auto_publish` (which skips human review
   entirely) for content that should've been rejected. Hardened the prompt
   in both `museum_server.py` and `netlify/functions/api.mjs`: user content
   is now wrapped in `<submission>` tags with explicit "this is data, not
   instructions" framing, and embedded-instruction attempts now route to
   `needs_review` instead of being followed.
2. **Flagged, not fixed** — `admin.html` stores the admin Basic Auth
   credentials in `sessionStorage` as base64 (`btoa(user:pass)`), which is
   trivially reversible (`atob()`). Any XSS on the same origin (now, or in a
   future regression) could read that value straight out of sessionStorage
   and recover the literal admin password, not just a session token. This
   is inherent to the HTTP Basic Auth pattern the admin panel uses — a real
   fix means moving to short-lived session tokens/cookies instead, which is
   a bigger architectural change than a quick patch. Worth a deliberate
   decision from the user rather than a silent fix.

## First-time non-English-speaker UX walkthrough (2026-08-03)

Tested as a Somali-speaking first-time visitor (browser set to French by
default via Accept-Language; switched to Soomaali via the language picker).

**Works well:** the language picker itself is genuinely good for someone who
can't read English — each language is labeled in its own native script
(Français, العربية, ትግርኛ, Soomaali, etc.) behind a recognizable 🌐 icon, so
it's findable and readable without any English literacy. `gallery.html`'s
entry/loading overlay and the in-room control hints ("Drag to look · Click
the floor to walk...") both fully translate.

**Inconsistent:** translation coverage has real gaps that make it feel like
it "randomly stops working" rather than being cleanly untranslated:
- `index.html`'s homepage nav translates, but the actual hero
  headline/subhead/buttons (the site's core pitch) stay in English — the
  first real content a non-English visitor sees is untranslated.
- Once inside a 3D room, the room-caption panel (artist/country name,
  blurb, "X works on view", "Read the full story") and the "ALL ROOMS"
  button revert to English even though the language picker itself still
  shows the selected language — same screen, inconsistent translation.
- The piece lightbox's "PREVIOUS"/"NEXT" buttons are hardcoded English.
  (The curatorial essay text itself staying English-only is reasonable —
  that's bespoke writing, not simple UI chrome.)

**Fixed (2026-08-03, later same day):** closed all the gaps listed above.
- Added 13 new i18n keys (`room.workOnView`/`worksOnView`, `room.readFullStory`,
  `rooms.allRooms`, `rooms.searchPlaceholder`, `controls.resetView`,
  `panel.previous`/`next`/`of`, `home.heroTitle`/`heroLede`/`startExploring`/
  `ourMission`) to all 15 `data/i18n/<lang>.json` files.
- `index.html` hero (eyebrow/title/lede/both buttons) now has `data-i18n`
  tags, picked up by the existing `site-lang.js` loader — reuses
  `entry.eyebrow` since it's the same string gallery.html already had.
- `gallery.html`: added ids (`roomsBtnLabel`, `roomsSheetTitle`) so JS can
  target the "All rooms" button/sheet-heading text without clobbering the
  button's SVG icon.
- `js/gallery3d.js`: `applyUiStrings()` now also sets all rooms/reset-view/
  read-full-story/previous/next/search-placeholder text. Added
  `updateCaptionCount()` and `updatePanelLabel()` helpers (called from
  `showRoom()`/`openPanel()` respectively, and re-run from `applyUiStrings()`
  on every language switch) so the room-caption "N works on view" and the
  lightbox "Title · N of M" label build from `uiStrings` instead of
  hardcoded English string concatenation.
- Verified live across French, Spanish, Arabic, and Somali via direct DOM
  checks — homepage hero, in-room UI chrome, and lightbox nav all translate
  correctly now. Per-room content (artist/country name, blurb, curatorial
  essay text) intentionally still English-only — that's bespoke writing, not
  UI chrome, out of scope for this pass.

## Fable 5 senior-dev review + two real bugs caught and fixed (2026-08-03)

Asked Fable 5 (fresh agent, no prior context) to browse the live local site
as an independent senior-dev first-look review. It caught a real regression
I'd introduced earlier the same session:

1. **Fixed — lightbox never opened, silent crash.** When `updatePanelLabel()`
   was extracted out of `openPanel()` during the i18n fix (see below),
   `const room = ROOMS[currentRoom];` was removed from `openPanel()` itself,
   but the rest of the function still used `room.blurb`/`room.slug` a few
   lines down — `ReferenceError: room is not defined`, thrown on every
   single click on a piece, panel never opened. This is also why I couldn't
   get the lightbox to open earlier this session while testing the i18n
   panel-label fix — I misread it as a raycast/click-targeting problem, it
   was actually this crash the whole time. Fixed by re-adding the `const
   room = ROOMS[currentRoom];` line to `openPanel()`.
2. **Fixed — WebGL shader compile error, found while verifying #1** (not
   in Fable 5's report): `FRAGMENT shader texture image units count exceeds
   MAX_TEXTURE_IMAGE_UNITS(16)`, in the Bahati room specifically. Every
   piece's spotlight had `castShadow = true` unconditionally on desktop;
   expanding Bahati from 7 → 14 pieces today pushed the room's total
   shadow-map texture units past the WebGL-guaranteed minimum of 16 (a
   real risk on lower-end/integrated GPUs, which the site's actual
   audience — schools/libraries — is likely to have). Added `SHADOW_BUDGET
   = 8` in `js/gallery3d.js`: only the first 8 pieces built in a room cast
   shadows now, the rest still get lit normally, just no shadow. Confirmed
   the shader error is gone after the fix.

Fable 5's other findings (not yet acted on, for the user to weigh in on):
- Homepage translation is still partial beyond the hero — the "Discover"
  marquee and "Three ways in" cards have no `data-i18n` tags, so switching
  language mid-page reads as broken. Same category as the fix earlier
  today, just not-yet-covered surface area.
- `js/site-lang.js` fetches all 15 `data/i18n/*.json` files on every page
  load just to read each file's `langName` for the dropdown — could
  hardcode the display names instead and drop 15 HTTP requests.
- Three.js is loaded live from `unpkg.com` at runtime (no self-hosted/
  bundled copy) — a CDN hiccup takes the whole 3D gallery down. Also a
  `THREE.Clock` deprecation warning (three.js r184 wants `THREE.Timer`).
- Voices/Perspectives pages show "couldn't load" locally — expected, the
  local static server has no backend API; not verified against the
  production Netlify functions.
- "♫ Ambient sound, coming soon" pill on country pages — this is a known,
  intentional stub (see the 2026-07-20 entry above), not a bug, flagged by
  Fable 5 as unpolished-looking regardless.
- Mobile-viewport responsiveness wasn't actually confirmed live by either
  Fable 5 or this session — CSS has real breakpoints and `gallery3d.js` has
  an `isCoarse` mobile-control path, so it was clearly built for, just
  worth an explicit manual phone-width pass.

## Bahati room only showing 10 of 14 works — fixed (2026-08-03)

User caught this live. Root cause: `slotsFor()`'s fixed 3.1m piece spacing
was never capped to the wall's actual physical length. With the 2 large
pieces reserving the whole back wall, the other 12 pieces split 6-per-side
wall — spread = `(6-1)*3.1 = 15.5m`, but the side walls are only `ROOM_D =
11m` long, so the outermost 2 pieces per wall landed past the room's real
bounds (unreachable/invisible). Fixed in `slotTransform()`: spread is now
capped to `(wall === 'back' ? ROOM_W : ROOM_D) - 2.4`, so a busy wall packs
pieces tighter instead of overflowing it. Verified all 14 pieces are now
present and reachable (cycled the lightbox's Next button through all 14,
confirmed 14 distinct titles, no gaps/duplicates).

## Bahati back wall was mostly empty around the 2 large pieces — fixed (2026-08-03)

User noticed the back wall had a lot of unused space either side of the two
large-format pieces while the side walls were crowded (6 pieces each).
Replaced `featureSlotsFor()` with `backWallSlots(largeCount, flankCount)` in
`js/gallery3d.js`: large pieces still centered on the back wall, but now up
to 2 standard-size pieces flank them (`backFlankCount = min(2,
gridPieces.length)`, positioned near the wall's far ends via
`flankX = min(maxHalf - 1.1, largeSpread/2 + 3.1)`), pulled from the front
of the grid-pieces list before the rest get split across the side walls —
so Bahati is now back:4 (2 large + 2 flank) / left:5 / right:5 instead of
back:2 / left:6 / right:6. Verified live, no overlap between flank and
large pieces.

## Olgalene's photos enhanced for clarity/vibrance (2026-08-03)

User asked for the photos in `img/artists/olgalene/` (1-9.jpg) to look
"clearer and lively" — they're phone photos of physical paintings, mostly a
bit soft/muted. Applied via Pillow (`ImageFilter.UnsharpMask(radius=2,
percent=110, threshold=3)`, then `Contrast` 1.15x, `Color` (saturation)
1.28x, `Brightness` 1.04x) to all 9. Previewed each before overwriting —
genuine improvement, no over-sharpening halos or blown-out color. Originals
are still recoverable via git if this ever needs reverting (they're in the
initial commit).

## Stopped fetching all 15 i18n files just for the language-picker labels (2026-08-03)

Both `js/site-lang.js` and `js/gallery3d.js` were fetching every
`data/i18n/*.json` file on every page load just to read each one's
`langName` field for the dropdown menu (gallery3d.js did this twice — once
per switcher instance). Added a hardcoded `LANG_NAMES` map to both files
instead; the actual translation strings for whichever language gets picked
still load lazily via the existing `loadLang()`/`setLang()` caching.
Verified via network log: page-load i18n fetches dropped from 15 to 1 (just
the active language).

## Three.js self-hosted instead of loaded from unpkg CDN (2026-08-03)

`gallery.html`'s import map pointed `"three"` at `https://unpkg.com/three@0.184.0/build/three.module.js` at runtime — a CDN outage would have taken the whole 3D gallery down. Downloaded both halves of the r184 module build (`three.module.js` imports from a sibling `three.core.js`, both needed) into `js/vendor/three/`, not excluded by `.gitignore`/`.netlifyignore` so it deploys normally. Import map now points at `./js/vendor/three/three.module.js` — **note the required `./` prefix**: a bare relative path with no leading `./` silently resolves to a blocked/null entry in Chrome's import-map parser (`Failed to resolve module specifier "three" ... blocked by a null value`), which is exactly what happened on the first attempt. Also fixed the `THREE.Clock` deprecation warning while in here — replaced with `THREE.Timer` (`clock.update()` then `clock.getDelta()`, rather than Clock's single-call `getDelta()`). Verified live: room loads correctly, console clean, network log confirms Three.js now loads from `127.0.0.1` not unpkg.

## Mobile responsiveness — actually verified live, 2 real bugs found and fixed (2026-08-03)

Neither Fable 5's review nor this session could get the browser tool's
`resize_window` to actually change `window.innerWidth` (stayed pinned at
desktop width regardless) — a real environment limitation, not a false
alarm. Worked around it with a throwaway wrapper page embedding the site in
a fixed-width `<iframe width="390">` (iframes get a genuine narrow layout
viewport independent of the outer window) — deleted after use, was never
meant to ship.

Found two real overflow bugs at ~390px:
1. **`.site-nav` (index.html and every other non-gallery page)** had no
   mobile treatment at all — the brand subtitle and the 4 nav links (plus
   the language switcher, which `site-lang.js` appends as `.nav-links`'
   own last child) fought for one row and visibly overlapped. Fixed in
   `css/style.css`'s existing `@media (max-width:640px)` block: hide the
   brand subtitle, let `.nav-links` wrap onto its own full-width centered
   row below the brand.
2. **`gallery.html`'s topbar** overflowed off the right edge entirely below
   ~430px — the "All rooms" button (icon + text label) was completely
   unreachable, cut off past the viewport edge. Fixed by hiding
   `#roomsBtnLabel` in the existing `@media (max-width:820px)` block,
   matching the icon-only treatment `.lang-switch` already got.

Everything else checked out already working: the gallery's entry overlay,
room-caption panel, and reset-view/fullscreen controls all had solid
pre-existing mobile CSS.

## Netlify deployment status (checked 2026-08-03)

- Site is linked (`valore-library-museum`, site id `471575b2-c965-4899-9547-1c6f365d7e65`,
  admin: https://app.netlify.com/projects/valore-library-museum). Deploys here
  are **manual** (`netlify deploy`), not git-linked — pushing to the new
  GitHub repo does **not** trigger a Netlify redeploy.
- The Netlify hosting itself is healthy: default URL
  `https://valore-library-museum.netlify.app` loads correctly, latest deploy
  ("Add Olgalene artist spotlight room") is in `ready`/`current` state.
- **Custom domain `library.valore-arc.com` is broken** — DNS doesn't resolve
  at all (NXDOMAIN) even though Netlify has it configured as the site's
  custom domain (`ssl: false` in the API response confirms Netlify never
  finished SSL provisioning, consistent with DNS not pointing at it). The
  apex `valore-arc.com` resolves fine, but to GitHub Pages IPs
  (185.199.108–111.153), unrelated to this Netlify site. This needs a DNS
  fix at whatever registrar/DNS host manages `valore-arc.com` (an A/CNAME
  record for the `library` subdomain pointing at Netlify) — not something
  fixable from the codebase.
- **The live deploy is stale relative to local files.** It predates today's
  edits: the artist room still reads "Bahaty" (pre-rename) with 8 separate
  works, not the current local state (renamed to "Bahati", 7 works with the
  DR Congo/portrait photos merged into one "two halves" piece, plus
  `museum-room.js`/`museum-ui.js` deleted and the repo pushed to GitHub).
  Needs a fresh `netlify deploy --prod` (or a git-linked build) to catch up.

## Environment notes

- **No git repo** in this project directory. When diffing "what changed
  recently," there's no history — the only real diff baseline found so far
  was `Gallery room improvements.zip` (a full site snapshot from 2026-08-02
  09:30, uploaded to the project root). Worth suggesting `git init` at some
  point so future changes are actually diffable.
- Static preview server used for verification: `python -m http.server 8901`
  from the project root (plain static file serving — the real
  `museum_server.py` needs Postgres creds and isn't needed just to view pages).
