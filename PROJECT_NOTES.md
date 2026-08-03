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

## Environment notes

- **No git repo** in this project directory. When diffing "what changed
  recently," there's no history — the only real diff baseline found so far
  was `Gallery room improvements.zip` (a full site snapshot from 2026-08-02
  09:30, uploaded to the project root). Worth suggesting `git init` at some
  point so future changes are actually diffable.
- Static preview server used for verification: `python -m http.server 8901`
  from the project root (plain static file serving — the real
  `museum_server.py` needs Postgres creds and isn't needed just to view pages).
