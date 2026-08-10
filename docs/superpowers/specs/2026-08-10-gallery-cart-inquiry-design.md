# Gallery cart & inquiry flow — design spec

Date: 2026-08-10
Status: Approved by user, ready for implementation planning.

## Problem

Artists (starting with Bahati/BHTart) have no way for gallery visitors to find
them or express interest in buying a piece after browsing a room. There's
currently no path from "I like this painting" to "someone follows up with
me about it" anywhere on the site.

## Goal

A visitor browsing any artist room (currently Bahati and Olgalene, extensible
to future artists with no code changes) can select one or more pieces into a
cart, submit their name/email/message once, and that inquiry becomes visible
to the site admin (the user) to follow up and connect the buyer with the
artist. **This is a lead-gen mechanism, not checkout** — no payment is
collected on the site; the artist/admin arranges payment and delivery however
they normally would, off-site.

## Non-goals (this pass)

- No real payment/checkout (no Stripe or similar).
- No per-piece "sold"/inventory tracking.
- No automated confirmation email to the buyer beyond an on-page success
  message (could be added later via the existing n8n webhook if wanted).
- No per-artist social/contact fields (Instagram, etc.) — the cart+inquiry
  flow is the primary "find me / buy" mechanism for now, superseding the
  original narrower request for a static contact link.

## Existing architecture this plugs into

The project already has a working submission → admin-review pipeline (Voices/
Perspectives) that this feature deliberately mirrors:

- **Two parallel backends, same routes**: `museum_server.py` (local dev,
  stdlib `http.server` + `psycopg`) and `netlify/functions/api.mjs` (prod, a
  single catch-all function at `/api/*`). Every route added here must be
  implemented in both files, matching the project's existing convention
  (`netlify/functions/api.mjs`'s header comment: "Netlify Functions port of
  museum_server.py's JSON API. Same routes, same behavior").
- **Postgres**, schema created idempotently on startup (`_ensure_schema_unsafe`
  in the Python server; equivalent inline SQL in the Netlify function).
- **Admin auth**: HTTP Basic Auth checked via `_is_admin`/`_require_admin`
  (Python) and `isAdmin`/`requireAdmin` (JS) — reused as-is, no new auth
  mechanism.
- **`notify_n8n`/`notifyN8n`**: best-effort, non-blocking POST to an optional
  `N8N_WEBHOOK_URL` — reused as-is for the new inquiry type.
- **Honeypot spam field**: existing submissions require a `website` field to
  stay empty. Reused for the new endpoint.

## Data model

New table, created in both backends' schema-init code:

```sql
CREATE TABLE IF NOT EXISTS gallery_inquiries (
    id SERIAL PRIMARY KEY,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_message TEXT,
    items JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`items` is a JSON array, one entry per cart line at time of submission:
```json
[{ "artist_slug": "bahati", "artist_name": "Bahati", "piece_title": "Equity", "piece_src": "img/artists/bahati/3.jpg" }]
```

One row per cart submission, not per item — there's no need to track each
piece's follow-up status independently; the whole inquiry is one
conversation with one buyer.

## Frontend

### Cart state — new `js/gallery-cart.js`

Shared module loaded on both `gallery.html` and `country.html`. Responsibilities:
- Cart array persisted to `localStorage` (key: `valoreGalleryCart`), so the
  cart survives navigation between the 3D gallery and artist bio pages.
- Item shape: `{ artistSlug, artistName, pieceTitle, pieceSrc }`.
- Dedup on add: same `artistSlug` + `pieceTitle` won't add a duplicate line.
- Exposes `add(item)`, `remove(index)`, `getAll()`, `clear()`, and a
  `count-changed` event (or simple callback) so both pages can update a cart
  badge without polling.
- Renders the floating cart button + slide-over panel UI itself (single
  source of truth for the markup), so both pages get it by including one
  `<script>` tag — no per-page duplication.

### Cart button + panel

- Floating button, fixed bottom-right, badge shows item count, hidden
  entirely when cart is empty (no empty badge/0).
- Clicking opens a panel: list of cart items (thumbnail, artist name, piece
  title, remove button), then a form (name, email, optional message), then
  "Send inquiry". Honeypot `website` field included but visually hidden,
  matching the existing Voices/Perspectives submission form pattern.
- On submit: `POST /api/gallery-inquiries` with `{ buyer_name, buyer_email,
  buyer_message, items, website }`. On success: clear cart, close panel, show
  a confirmation state ("Thanks — a curator will follow up by email"). On
  failure: show inline error, keep cart intact so the visitor can retry.

### Entry points ("Add to cart")

1. **3D room lightbox** (`js/gallery3d.js`, `openPanel()`) — an "Add to cart"
   button next to the existing Previous/Next controls, using the currently
   open piece's data (already has title/credit available in this scope).
2. **Artist bio page carousel** (`js/country-gallery.js`) — a small button on
   each photo card, but **only rendered when the page is an artist room**
   (`isArtist` — the same flag `country.html` already computes), not on
   country/culture photos, since those were never for sale and have no
   artist attribution to attach to a cart line.

Both entry points call the same `window.ValoreGalleryCart.add(item)`.

## Backend API

Implemented identically in `museum_server.py` and `netlify/functions/api.mjs`.

### `POST /api/gallery-inquiries` (public)

Request body: `{ buyer_name, buyer_email, buyer_message, items: [...], website }`.

Validation (mirrors `_api_create_submission`'s style):
- `website` (honeypot) must be empty → else `400 spam detected`.
- `buyer_name` and `buyer_email` required, trimmed, length-capped (120 /
  200 chars respectively, matching existing `display_name`/`contact_email`
  caps).
- `buyer_message` optional, capped at 2000 chars.
- `items` must be a non-empty array, capped at 20 entries; each entry must
  have non-empty `artist_slug`, `artist_name`, `piece_title`, `piece_src`
  (strings, length-capped). Reject with `400` if the shape is wrong.
- No AI moderation screening on this endpoint — it's a private contact
  request, not public content, so there's nothing to screen for publication
  safety the way Voices/Perspectives text is screened.

On success: insert row (`status = 'new'`), call `notify_n8n`/`notifyN8n` with
`{ inquiry_id, buyer_name, buyer_email, buyer_message, items }`, respond
`200 { ok: true, id }`.

### `GET /api/admin/gallery-inquiries?status=<optional>` (admin only)

Same auth gate as `/api/admin/queue`. Optional `status` filter (`new` /
`contacted` / `closed`); omitted = all. Returns rows ordered by
`created_at DESC`, `created_at` ISO-formatted, capped at 200 rows — same
pattern as `_api_admin_queue`.

### `POST /api/admin/gallery-inquiries/:id/status` (admin only)

Body: `{ status: "new" | "contacted" | "closed" }`. Updates the row, returns
`200 { ok: true, id, status }`. No `reviewed_at` concept needed here (that
field exists on submissions for moderation timing; this is just a follow-up
tracker for the admin's own use).

## Admin panel (`admin.html`)

New tab, "Gallery inquiries", alongside the existing Pending / Needs review /
Approved / Rejected / All tabs. Each row card shows: buyer name + email
(mailto link), message, the list of pieces (small thumbnail using the stored
`piece_src`, plus artist name — piece title), submitted date, and a status
`<select>` (New / Contacted / Closed) that PATCHes the status endpoint on
change — reuses the existing queue card visual style, just without the
approve/reject moderation actions (nothing to moderate here).

## Notifications

`notify_n8n`/`notifyN8n` fires on every new inquiry if `N8N_WEBHOOK_URL` is
configured, same best-effort/non-blocking behavior as existing submission
notifications (failure is logged, never blocks the API response).

## Error handling

- Cart submit failures (network error, 4xx/5xx) leave the cart intact and
  show an inline error in the panel — never silently lose the visitor's
  selections.
- Backend validation errors return descriptive `400`s matching the existing
  `{ error: "..." }` shape used throughout both API files.
- `notify_n8n` failures never block or fail the inquiry submission itself
  (existing pattern, reused as-is).

## Testing plan

- Local: run `python museum_server.py` against a local/dev Postgres, verify
  `gallery_inquiries` table is created on startup.
- Add a piece to cart from the 3D lightbox, verify it also appears (same
  item) if the cart panel is opened from `country.html` after navigating
  there — confirms `localStorage` persistence works across pages.
- Submit an inquiry with 1 item and with multiple items (mixed artists —
  e.g. one Bahati + one Olgalene piece in the same cart) — verify both show
  up correctly attributed in the admin panel's item list.
- Submit with the honeypot field populated (simulate via devtools) — verify
  `400 spam detected` and no row is inserted.
- Submit with missing `buyer_email` — verify `400` and no row inserted.
- Verify admin panel's new tab requires login (401 without credentials, same
  as the existing queue).
- Change an inquiry's status in the admin panel, reload, verify it persisted.
- If `N8N_WEBHOOK_URL` is set locally to a test endpoint (e.g. a webhook.site
  URL), verify it receives a POST on new inquiry.
