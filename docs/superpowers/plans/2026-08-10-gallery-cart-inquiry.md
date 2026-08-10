# Gallery Cart & Inquiry Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor browsing any artist room in the Valore Library 3D gallery select one or more pieces into a cart, submit their contact info once, and have that inquiry land where the site admin can see it and follow up — no payment collected on-site.

**Architecture:** A new `gallery_inquiries` Postgres table, backed by matching endpoints in both of the project's existing parallel backends (`museum_server.py` for local dev, `netlify/functions/api.mjs` for prod). A new shared client-side module (`js/gallery-cart.js`) holds a `localStorage`-backed cart and renders a floating cart button + submission panel, loaded on both `gallery.html` (3D rooms) and `country.html` (artist bio pages). "Add to cart" buttons are wired into the existing piece lightbox (`js/gallery3d.js`) and the existing artist-bio photo carousel (`js/country-gallery.js`). A new "Gallery inquiries" tab in `admin.html` lets the admin review and track follow-up status.

**Tech Stack:** Python stdlib `http.server` + `psycopg` (dev backend), Netlify Functions + `@netlify/database` (prod backend), Postgres, vanilla JS (no framework, IIFE modules attached to `window`), existing project CSS conventions (no CSS framework).

**Spec:** `docs/superpowers/specs/2026-08-10-gallery-cart-inquiry-design.md`

## Global Constraints

- Every backend route in this plan must be implemented identically in both `museum_server.py` and `netlify/functions/api.mjs` — this project's established convention (see `netlify/functions/api.mjs`'s own header comment).
- Admin endpoints reuse the existing HTTP Basic Auth gate (`_require_admin`/`requireAdmin`) — no new auth mechanism.
- The new public submit endpoint must check the honeypot `website` field, matching the existing `/api/submissions` pattern.
- `notify_n8n`/`notifyN8n` must be reused as-is (no modification) for new-inquiry notifications.
- No payment processing anywhere in this feature — it is a contact/lead-gen flow only.
- Field length caps, matching existing conventions in `_api_create_submission`/`/api/submissions`: `buyer_name` 120 chars, `buyer_email` 200 chars, `buyer_message` 2000 chars, per-item `artist_slug` 60 / `artist_name` 120 / `piece_title` 200 / `piece_src` 300 chars. Cart capped at 20 items per inquiry.
- **This repo has no automated test framework** (no pytest, no JS test runner — confirmed via `package.json`/`requirements.txt`, and no `*test*` files anywhere in the project). All verification in this plan uses the project's existing real convention instead: `curl`/`python -c` against the local dev server (`python museum_server.py`, which already has a working `POSTGRES_DSN` in `.env`), and manual browser checks via `python -m http.server 8901` (see `PROJECT_NOTES.md`'s "Environment notes" section). Do not introduce a test framework as part of this plan — follow the existing convention.
- `netlify/functions/api.mjs` cannot be run standalone without `netlify dev` (needs `@netlify/database`/`@netlify/blobs` bindings only available under the Netlify CLI/runtime). Its tasks are verified by a careful side-by-side read against the already-verified Python implementation, confirming identical routing, validation, and response shapes — not by executing it locally. If `netlify dev` happens to be available and already authenticated in your environment, running it for a live check is a bonus, not a requirement.

---

### Task 1: Database schema — `gallery_inquiries` table

**Files:**
- Create: `netlify/database/migrations/002_gallery_inquiries/migration.sql`
- Modify: `museum_server.py:60` (add `VALID_INQUIRY_STATUSES` near `VALID_STATUSES`)
- Modify: `museum_server.py:152-167` (`_ensure_schema_unsafe`, add table creation)

**Interfaces:**
- Produces: table `gallery_inquiries(id, buyer_name, buyer_email, buyer_message, items JSONB, status, created_at)`, used by every later task.
- Produces: `VALID_INQUIRY_STATUSES = {"new", "contacted", "closed"}` (Python) — Task 3 imports/uses this name directly.

- [ ] **Step 1: Create the migration file**

Create `netlify/database/migrations/002_gallery_inquiries/migration.sql`:

```sql
-- Backs the gallery cart & inquiry flow (docs/superpowers/specs/2026-08-10-gallery-cart-inquiry-design.md).
-- One row per cart submission, not per item — there's no need to track each
-- piece's follow-up status independently; the whole inquiry is one
-- conversation with one buyer.

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

- [ ] **Step 2: Add `VALID_INQUIRY_STATUSES` to `museum_server.py`**

In `museum_server.py`, find this line (currently line 60):
```python
VALID_STATUSES = {"pending", "needs_review", "approved", "rejected"}
```
Add directly below it:
```python
VALID_INQUIRY_STATUSES = {"new", "contacted", "closed"}
```

- [ ] **Step 3: Add the table creation to `_ensure_schema_unsafe`**

In `museum_server.py`, inside `_ensure_schema_unsafe()`, find the end of the `museum_submissions` table creation (currently lines 133-153, ending with `)` then a blank line before the `for c in COUNTRIES_SEED:` loop at line 154). Insert this new `conn.execute(...)` call between the `museum_submissions` creation and the `COUNTRIES_SEED` loop:

```python
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gallery_inquiries (
                id SERIAL PRIMARY KEY,
                buyer_name TEXT NOT NULL,
                buyer_email TEXT NOT NULL,
                buyer_message TEXT,
                items JSONB NOT NULL,
                status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
```

Also update the print statement at the end of the function (currently line 167):
```python
    print("museum_countries / museum_submissions schema ready.")
```
to:
```python
    print("museum_countries / museum_submissions / gallery_inquiries schema ready.")
```

- [ ] **Step 4: Verify the schema is created**

Run:
```bash
cd "path/to/valore-museum-site"
python -c "
import museum_server as m
m.ensure_schema()
with m.db_connect() as conn:
    row = conn.execute(\"SELECT to_regclass('gallery_inquiries')\").fetchone()
    print(row)
"
```
Expected output: `{'to_regclass': 'gallery_inquiries'}` (not `{'to_regclass': None}`). If it prints `None`, the table wasn't created — check for a typo in the SQL block placement inside `_ensure_schema_unsafe`.

- [ ] **Step 5: Commit**

```bash
git add netlify/database/migrations/002_gallery_inquiries/migration.sql museum_server.py
git commit -m "Add gallery_inquiries table for the cart & inquiry flow"
```

---

### Task 2: Public submit endpoint — `POST /api/gallery-inquiries`

**Files:**
- Modify: `museum_server.py:352-354` (`do_POST` routing)
- Modify: `museum_server.py` (new method, placed after `_save_image`, before `_api_admin_queue` — currently between lines 503 and 505)
- Modify: `netlify/functions/api.mjs:9-15` (add `VALID_INQUIRY_STATUSES`, needed by Task 3 but declared here alongside the other `VALID_*` constants)
- Modify: `netlify/functions/api.mjs:229-294` (POST routing, new route added after the `/api/submissions` block)

**Interfaces:**
- Consumes: `db_connect()`, `POSTGRES_DSN`, `notify_n8n()` (Python, already exist); `db.sql`, `notifyN8n()` (JS, already exist).
- Produces: `POST /api/gallery-inquiries` — request `{ buyer_name, buyer_email, buyer_message, items: [{artist_slug, artist_name, piece_title, piece_src}], website }`, response `200 { ok: true, id }` on success or `400 { error }` on validation failure. Task 4's cart submit form calls this exact endpoint/shape.

- [ ] **Step 1: Add the route in `museum_server.py`'s `do_POST`**

Find (currently lines 352-354):
```python
        if path == "/api/submissions":
            return self._api_create_submission()
```
Add directly below it:
```python
        if path == "/api/gallery-inquiries":
            return self._api_create_inquiry()
```

- [ ] **Step 2: Implement `_api_create_inquiry` in `museum_server.py`**

Insert this new method right after `_save_image` ends and before `_api_admin_queue` begins (currently between lines 503 and 505):

```python
    def _api_create_inquiry(self):
        try:
            data = self._read_json_body()
        except Exception:
            return self._send_json(400, {"error": "invalid JSON body"})

        if data.get("website"):  # honeypot field, must stay empty
            return self._send_json(400, {"error": "spam detected"})

        buyer_name = (data.get("buyer_name") or "").strip()[:120]
        buyer_email = (data.get("buyer_email") or "").strip()[:200]
        buyer_message = (data.get("buyer_message") or "").strip()[:2000]

        if not buyer_name or not buyer_email:
            return self._send_json(400, {"error": "buyer_name and buyer_email are required"})

        items = data.get("items")
        if not isinstance(items, list) or not items or len(items) > 20:
            return self._send_json(400, {"error": "items must be a non-empty array of at most 20 pieces"})

        clean_items = []
        for item in items:
            if not isinstance(item, dict):
                return self._send_json(400, {"error": "each item must be an object"})
            artist_slug = (item.get("artist_slug") or "").strip()[:60]
            artist_name = (item.get("artist_name") or "").strip()[:120]
            piece_title = (item.get("piece_title") or "").strip()[:200]
            piece_src = (item.get("piece_src") or "").strip()[:300]
            if not artist_slug or not artist_name or not piece_title or not piece_src:
                return self._send_json(400, {"error": "each item requires artist_slug, artist_name, piece_title, piece_src"})
            clean_items.append({
                "artist_slug": artist_slug, "artist_name": artist_name,
                "piece_title": piece_title, "piece_src": piece_src,
            })

        if not POSTGRES_DSN:
            return self._send_json(503, {"error": "database not configured"})

        with db_connect() as conn:
            row = conn.execute(
                """
                INSERT INTO gallery_inquiries (buyer_name, buyer_email, buyer_message, items, status)
                VALUES (%s, %s, %s, %s, 'new')
                RETURNING id
                """,
                (buyer_name, buyer_email, buyer_message, json.dumps(clean_items)),
            ).fetchone()
            inquiry_id = row["id"]
            conn.commit()

        notify_n8n(inquiry_id, {
            "kind": "gallery_inquiry", "buyer_name": buyer_name, "buyer_email": buyer_email,
            "buyer_message": buyer_message, "items": clean_items,
        })

        self._send_json(200, {"ok": True, "id": inquiry_id})
```

- [ ] **Step 3: Verify locally with `curl`**

```bash
cd "path/to/valore-museum-site"
python museum_server.py &
SERVER_PID=$!
sleep 1

# Valid request — expect 200 {"ok": true, "id": <n>}
curl -s -X POST http://127.0.0.1:8899/api/gallery-inquiries \
  -H "Content-Type: application/json" \
  -d '{"buyer_name":"Test Buyer","buyer_email":"test@example.com","buyer_message":"Interested in this piece.","items":[{"artist_slug":"bahati","artist_name":"Bahati","piece_title":"Equity","piece_src":"img/artists/bahati/3.jpg"}]}'
echo ""

# Honeypot filled — expect 400 {"error":"spam detected"}
curl -s -X POST http://127.0.0.1:8899/api/gallery-inquiries \
  -H "Content-Type: application/json" \
  -d '{"buyer_name":"Bot","buyer_email":"bot@example.com","website":"http://spam.example","items":[{"artist_slug":"bahati","artist_name":"Bahati","piece_title":"Equity","piece_src":"img/artists/bahati/3.jpg"}]}'
echo ""

# Missing email — expect 400 {"error":"buyer_name and buyer_email are required"}
curl -s -X POST http://127.0.0.1:8899/api/gallery-inquiries \
  -H "Content-Type: application/json" \
  -d '{"buyer_name":"No Email","items":[{"artist_slug":"bahati","artist_name":"Bahati","piece_title":"Equity","piece_src":"img/artists/bahati/3.jpg"}]}'
echo ""

# Empty items — expect 400 {"error":"items must be a non-empty array of at most 20 pieces"}
curl -s -X POST http://127.0.0.1:8899/api/gallery-inquiries \
  -H "Content-Type: application/json" \
  -d '{"buyer_name":"No Items","buyer_email":"test@example.com","items":[]}'
echo ""

kill $SERVER_PID
```

Then confirm the one valid row actually landed in Postgres:
```bash
python -c "
import museum_server as m
with m.db_connect() as conn:
    rows = conn.execute('SELECT id, buyer_name, buyer_email, items, status FROM gallery_inquiries ORDER BY id DESC LIMIT 1').fetchall()
    print(rows)
"
```
Expected: one row with `buyer_name='Test Buyer'`, `status='new'`, `items` containing the Equity piece — and only one row total from this test run (the three invalid requests must not have inserted anything).

- [ ] **Step 4: Add `VALID_INQUIRY_STATUSES` to `netlify/functions/api.mjs`**

Find (currently line 11):
```javascript
const VALID_STATUSES = new Set(["pending", "needs_review", "approved", "rejected"]);
```
Add directly below it:
```javascript
const VALID_INQUIRY_STATUSES = new Set(["new", "contacted", "closed"]);
```

- [ ] **Step 5: Add the route to `netlify/functions/api.mjs`'s POST block**

Find the end of the `/api/submissions` block (currently ending at line 294):
```javascript
      return json(200, { ok: true, id: submissionId, status: finalStatus });
    }
```
Insert this new block directly after that closing `}` (before the `let m = path.match(/^\/api\/admin\/submissions...` line that currently follows at line 296):

```javascript
    if (path === "/api/gallery-inquiries") {
      let data;
      try {
        data = await req.json();
      } catch {
        return json(400, { error: "invalid JSON body" });
      }

      if (data.website) return json(400, { error: "spam detected" }); // honeypot

      const buyerName = (data.buyer_name || "").trim().slice(0, 120);
      const buyerEmail = (data.buyer_email || "").trim().slice(0, 200);
      const buyerMessage = (data.buyer_message || "").trim().slice(0, 2000);

      if (!buyerName || !buyerEmail) return json(400, { error: "buyer_name and buyer_email are required" });

      const items = data.items;
      if (!Array.isArray(items) || !items.length || items.length > 20) {
        return json(400, { error: "items must be a non-empty array of at most 20 pieces" });
      }

      const cleanItems = [];
      for (const item of items) {
        if (typeof item !== "object" || item === null) return json(400, { error: "each item must be an object" });
        const artistSlug = (item.artist_slug || "").trim().slice(0, 60);
        const artistName = (item.artist_name || "").trim().slice(0, 120);
        const pieceTitle = (item.piece_title || "").trim().slice(0, 200);
        const pieceSrc = (item.piece_src || "").trim().slice(0, 300);
        if (!artistSlug || !artistName || !pieceTitle || !pieceSrc) {
          return json(400, { error: "each item requires artist_slug, artist_name, piece_title, piece_src" });
        }
        cleanItems.push({ artist_slug: artistSlug, artist_name: artistName, piece_title: pieceTitle, piece_src: pieceSrc });
      }

      const [inserted] = await db.sql`
        INSERT INTO gallery_inquiries (buyer_name, buyer_email, buyer_message, items, status)
        VALUES (${buyerName}, ${buyerEmail}, ${buyerMessage}, ${JSON.stringify(cleanItems)}, 'new')
        RETURNING id
      `;
      const inquiryId = inserted.id;

      notifyN8n(inquiryId, {
        kind: "gallery_inquiry", buyer_name: buyerName, buyer_email: buyerEmail,
        buyer_message: buyerMessage, items: cleanItems,
      });

      return json(200, { ok: true, id: inquiryId });
    }
```

- [ ] **Step 6: Verify parity by side-by-side read**

Re-read both the new Python method (Step 2) and the new JS block (Step 5) together. Confirm for each: same field names, same length caps (120/200/2000/60/120/200/300), same honeypot check, same 20-item cap, same validation order, same success response shape (`{ ok: true, id }`), same error response shape (`{ error: "..." }` with matching messages). Fix any mismatch before continuing.

- [ ] **Step 7: Commit**

```bash
git add museum_server.py netlify/functions/api.mjs
git commit -m "Add POST /api/gallery-inquiries endpoint (both backends)"
```

---

### Task 3: Admin endpoints — list & update inquiry status

**Files:**
- Modify: `museum_server.py:341-346` (`do_GET` routing)
- Modify: `museum_server.py:355-363` (`do_POST` routing)
- Modify: `museum_server.py` (two new methods, placed after `_api_admin_decide`, before `_api_screen_callback` — currently between lines 529 and 531)
- Modify: `netlify/functions/api.mjs:215-225` (GET routing)
- Modify: `netlify/functions/api.mjs:296-304` (POST routing, new route added after the approve/reject block)

**Interfaces:**
- Consumes: `_require_admin()`/`requireAdmin()`, `VALID_INQUIRY_STATUSES` (from Task 2).
- Produces: `GET /api/admin/gallery-inquiries?status=<optional>` → `200 { items: [...] }` (each item has `id, buyer_name, buyer_email, buyer_message, items, status, created_at`); `POST /api/admin/gallery-inquiries/:id/status` with body `{ status }` → `200 { ok: true, id, status }`. Task 7's admin panel calls both of these exactly.

- [ ] **Step 1: Add the GET route in `museum_server.py`'s `do_GET`**

Find (currently lines 341-344):
```python
        if path == "/api/admin/queue":
            if not self._require_admin():
                return
            return self._api_admin_queue(qs.get("status", [None])[0])
```
Add directly below it:
```python
        if path == "/api/admin/gallery-inquiries":
            if not self._require_admin():
                return
            return self._api_admin_inquiries(qs.get("status", [None])[0])
```

- [ ] **Step 2: Add the POST route in `museum_server.py`'s `do_POST`**

Find the end of the approve/reject block (currently lines 355-359):
```python
        m = re.match(r"^/api/admin/submissions/(\d+)/(approve|reject)$", path)
        if m:
            if not self._require_admin():
                return
            return self._api_admin_decide(int(m.group(1)), m.group(2))
```
Add directly below it (before the existing `screen-result` regex block):
```python
        m = re.match(r"^/api/admin/gallery-inquiries/(\d+)/status$", path)
        if m:
            if not self._require_admin():
                return
            return self._api_admin_inquiry_status(int(m.group(1)))
```

- [ ] **Step 3: Implement both new methods in `museum_server.py`**

Insert these two methods right after `_api_admin_decide` ends and before `_api_screen_callback` begins (currently between lines 529 and 531):

```python
    def _api_admin_inquiries(self, status_filter):
        if not POSTGRES_DSN:
            return self._send_json(200, {"items": []})
        query = "SELECT * FROM gallery_inquiries"
        params = []
        if status_filter and status_filter in VALID_INQUIRY_STATUSES:
            query += " WHERE status = %s"
            params.append(status_filter)
        query += " ORDER BY created_at DESC LIMIT 200"
        with db_connect() as conn:
            rows = conn.execute(query, params).fetchall()
        for r in rows:
            r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
        self._send_json(200, {"items": rows})

    def _api_admin_inquiry_status(self, inquiry_id: int):
        try:
            data = self._read_json_body()
        except Exception:
            return self._send_json(400, {"error": "invalid JSON body"})
        new_status = data.get("status")
        if new_status not in VALID_INQUIRY_STATUSES:
            return self._send_json(400, {"error": "status must be new, contacted, or closed"})
        with db_connect() as conn:
            conn.execute(
                "UPDATE gallery_inquiries SET status = %s WHERE id = %s",
                (new_status, inquiry_id),
            )
            conn.commit()
        self._send_json(200, {"ok": True, "id": inquiry_id, "status": new_status})
```

- [ ] **Step 4: Verify locally with `curl`**

This relies on the row inserted during Task 2 Step 3 still being present (or insert a fresh one first the same way).

```bash
cd "path/to/valore-museum-site"
python museum_server.py &
SERVER_PID=$!
sleep 1

# No credentials — expect 401
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8899/api/admin/gallery-inquiries

# With credentials — expect 200 and at least one item (use the ADMIN_USERNAME/ADMIN_PASSWORD from .env)
curl -s -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://127.0.0.1:8899/api/admin/gallery-inquiries
echo ""

# Update status of inquiry id 1 to "contacted" — expect 200 {"ok":true,"id":1,"status":"contacted"}
# (replace 1 with the actual id printed above if different)
curl -s -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" -X POST http://127.0.0.1:8899/api/admin/gallery-inquiries/1/status \
  -H "Content-Type: application/json" -d '{"status":"contacted"}'
echo ""

# Filter by status=contacted — expect the updated item to show up
curl -s -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" "http://127.0.0.1:8899/api/admin/gallery-inquiries?status=contacted"
echo ""

kill $SERVER_PID
```

If `$ADMIN_USERNAME`/`$ADMIN_PASSWORD` aren't already exported in your shell, read them from `.env` first (do not print `ADMIN_PASSWORD`'s value in any commit message or log you keep).

- [ ] **Step 5: Add the GET route to `netlify/functions/api.mjs`**

Find the end of the `/api/admin/queue` block (currently lines 215-223):
```javascript
    if (path === "/api/admin/queue") {
      const denied = requireAdmin(req);
      if (denied) return denied;
      const statusFilter = url.searchParams.get("status");
      const rows = statusFilter && VALID_STATUSES.has(statusFilter)
        ? await db.sql`SELECT * FROM museum_submissions WHERE status = ${statusFilter} ORDER BY created_at DESC LIMIT 200`
        : await db.sql`SELECT * FROM museum_submissions ORDER BY created_at DESC LIMIT 200`;
      return json(200, { items: rows.map((r) => rowDates(r, "created_at", "reviewed_at")) });
    }
```
Add directly below it (before `return json(404, { error: "not found" });` at line 225):
```javascript
    if (path === "/api/admin/gallery-inquiries") {
      const denied = requireAdmin(req);
      if (denied) return denied;
      const statusFilter = url.searchParams.get("status");
      const rows = statusFilter && VALID_INQUIRY_STATUSES.has(statusFilter)
        ? await db.sql`SELECT * FROM gallery_inquiries WHERE status = ${statusFilter} ORDER BY created_at DESC LIMIT 200`
        : await db.sql`SELECT * FROM gallery_inquiries ORDER BY created_at DESC LIMIT 200`;
      return json(200, { items: rows.map((r) => rowDates(r, "created_at")) });
    }
```

- [ ] **Step 6: Add the POST route to `netlify/functions/api.mjs`**

Find the end of the approve/reject block (currently lines 296-304):
```javascript
    let m = path.match(/^\/api\/admin\/submissions\/(\d+)\/(approve|reject)$/);
    if (m) {
      const denied = requireAdmin(req);
      if (denied) return denied;
      const [, id, decision] = m;
      const newStatus = decision === "approve" ? "approved" : "rejected";
      await db.sql`UPDATE museum_submissions SET status = ${newStatus}, reviewed_at = now() WHERE id = ${Number(id)}`;
      return json(200, { ok: true, id: Number(id), status: newStatus });
    }
```
Add directly below it (before the `screen-result` block that currently starts at line 306):
```javascript
    m = path.match(/^\/api\/admin\/gallery-inquiries\/(\d+)\/status$/);
    if (m) {
      const denied = requireAdmin(req);
      if (denied) return denied;
      let data;
      try {
        data = await req.json();
      } catch {
        return json(400, { error: "invalid JSON body" });
      }
      if (!VALID_INQUIRY_STATUSES.has(data.status)) {
        return json(400, { error: "status must be new, contacted, or closed" });
      }
      const [, id] = m;
      await db.sql`UPDATE gallery_inquiries SET status = ${data.status} WHERE id = ${Number(id)}`;
      return json(200, { ok: true, id: Number(id), status: data.status });
    }
```

- [ ] **Step 7: Verify parity by side-by-side read**

Compare the new Python methods (Step 3) against the new JS blocks (Steps 5-6): same auth gate, same status filter behavior, same status validation, same response shapes. Fix any mismatch before continuing.

- [ ] **Step 8: Commit**

```bash
git add museum_server.py netlify/functions/api.mjs
git commit -m "Add admin endpoints for listing and updating gallery inquiries"
```

---

### Task 4: Shared cart module — `js/gallery-cart.js`

**Files:**
- Create: `js/gallery-cart.js`

**Interfaces:**
- Consumes: `POST /api/gallery-inquiries` (Task 2).
- Produces: `window.ValoreGalleryCart` with methods `add(item)`, `remove(index)`, `getAll()`, `clear()`, where `item = { artistSlug, artistName, pieceTitle, pieceSrc }`. Tasks 5 and 6 call `add()` and `getAll()` with exactly this shape.

- [ ] **Step 1: Create `js/gallery-cart.js`**

```javascript
// Shared cross-page cart for the gallery inquiry flow: lets a visitor
// collect artist pieces from the 3D room lightbox (gallery.html, via
// js/gallery3d.js) and the artist bio page carousel (country.html, via
// js/country-gallery.js) into one localStorage-backed cart, then submit a
// single contact-info inquiry to POST /api/gallery-inquiries. This is a
// lead-gen form, not checkout — no payment is collected here.
//
// Renders its own floating button + slide-over panel with self-contained
// injected CSS (fixed colors, not page CSS variables) because gallery.html
// has no shared stylesheet link at all (it's a fully custom dark-chrome
// page with its own inline <style>), and country.html's light --paper/--ink
// theme wouldn't suit a floating overlay consistently on both pages anyway.
window.ValoreGalleryCart = (function () {
  const STORAGE_KEY = "valoreGalleryCart";
  let items = loadItems();

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  function saveItems() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (err) {}
    renderBadge();
  }

  function add(item) {
    const exists = items.some((i) => i.artistSlug === item.artistSlug && i.pieceTitle === item.pieceTitle);
    if (exists) return false;
    items.push(item);
    saveItems();
    return true;
  }
  function remove(index) {
    items.splice(index, 1);
    saveItems();
    renderPanelItems();
  }
  function getAll() { return items.slice(); }
  function clear() { items = []; saveItems(); }

  /* ---- UI: floating button + slide-over panel, built once per page load ---- */
  let root, btn, badge, panel, itemsList, statusEl;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function injectStyles() {
    if (document.getElementById("valoreCartStyles")) return;
    const style = document.createElement("style");
    style.id = "valoreCartStyles";
    style.textContent = `
      .vg-cart-btn{position:fixed;right:20px;bottom:20px;z-index:900;width:56px;height:56px;
        border-radius:50%;background:#B8791A;color:#fff;border:none;cursor:pointer;
        box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;
        font-family:'Archivo',system-ui,sans-serif;}
      .vg-cart-btn:hover{background:#8F5C12;}
      .vg-cart-btn[hidden]{display:none;}
      .vg-cart-btn svg{width:24px;height:24px;stroke:#fff;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
      .vg-cart-badge{position:absolute;top:-4px;right:-4px;background:#A8362B;color:#fff;
        font-size:11px;font-weight:700;min-width:18px;height:18px;border-radius:9px;
        display:flex;align-items:center;justify-content:center;padding:0 4px;}
      .vg-cart-panel{position:fixed;inset:0;z-index:950;display:none;}
      .vg-cart-panel.open{display:block;}
      .vg-cart-backdrop{position:absolute;inset:0;background:rgba(8,6,5,.6);}
      .vg-cart-sheet{position:absolute;top:0;right:0;bottom:0;width:min(380px,100%);
        background:#14100C;color:#F1E6CE;display:flex;flex-direction:column;
        font-family:'Archivo',system-ui,sans-serif;box-shadow:-8px 0 24px rgba(0,0,0,.4);}
      .vg-cart-head{display:flex;align-items:center;justify-content:space-between;
        padding:18px 20px;border-bottom:1px solid rgba(241,230,206,.16);}
      .vg-cart-head h3{margin:0;font-size:18px;}
      .vg-cart-close{background:none;border:none;color:#F1E6CE;font-size:20px;cursor:pointer;}
      .vg-cart-items{flex:1;overflow-y:auto;padding:12px 20px;}
      .vg-cart-item{display:flex;gap:10px;align-items:center;padding:10px 0;
        border-bottom:1px solid rgba(241,230,206,.1);}
      .vg-cart-item img{width:48px;height:48px;object-fit:cover;border-radius:4px;flex:none;}
      .vg-cart-item-info{flex:1;min-width:0;}
      .vg-cart-item-info .t{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .vg-cart-item-info .a{font-size:12px;opacity:.65;}
      .vg-cart-item-remove{background:none;border:none;color:#F1E6CE;opacity:.6;cursor:pointer;font-size:16px;}
      .vg-cart-item-remove:hover{opacity:1;}
      .vg-cart-empty{opacity:.6;font-size:14px;padding:20px 0;}
      .vg-cart-form{padding:16px 20px 20px;border-top:1px solid rgba(241,230,206,.16);}
      .vg-cart-form label{display:block;font-size:12px;text-transform:uppercase;
        letter-spacing:.06em;opacity:.7;margin-bottom:4px;}
      .vg-cart-form input,.vg-cart-form textarea{width:100%;background:rgba(241,230,206,.06);
        border:1px solid rgba(241,230,206,.2);border-radius:6px;color:#F1E6CE;
        padding:9px 10px;font-family:inherit;font-size:14px;margin-bottom:12px;box-sizing:border-box;}
      .vg-cart-form textarea{min-height:70px;resize:vertical;}
      .vg-cart-submit{width:100%;background:#B8791A;color:#fff;border:none;border-radius:6px;
        padding:12px;font-size:14px;font-weight:700;cursor:pointer;}
      .vg-cart-submit:hover{background:#8F5C12;}
      .vg-cart-submit:disabled{opacity:.5;cursor:not-allowed;}
      .vg-cart-status{margin-top:10px;font-size:13px;}
      .vg-cart-status.err{color:#E8897A;}
      .vg-cart-status.ok{color:#8FCB9C;}
      .vg-cart-website{position:absolute;left:-9999px;}
    `;
    document.head.appendChild(style);
  }

  function renderBadge() {
    if (!btn || !badge) return;
    const n = items.length;
    badge.textContent = String(n);
    btn.hidden = n === 0;
  }

  function renderPanelItems() {
    if (!itemsList) return;
    if (!items.length) {
      itemsList.innerHTML = '<p class="vg-cart-empty">Your cart is empty. Add a piece from any artist room to inquire about it.</p>';
      return;
    }
    itemsList.innerHTML = items.map((it, i) => `
      <div class="vg-cart-item">
        <img src="${it.pieceSrc}" alt="">
        <div class="vg-cart-item-info">
          <div class="t">${escapeHtml(it.pieceTitle)}</div>
          <div class="a">${escapeHtml(it.artistName)}</div>
        </div>
        <button class="vg-cart-item-remove" data-idx="${i}" aria-label="Remove">&times;</button>
      </div>
    `).join("");
    itemsList.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("click", () => remove(Number(el.dataset.idx)));
    });
  }

  function open() {
    renderPanelItems();
    statusEl.textContent = "";
    statusEl.className = "vg-cart-status";
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }
  function close() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }

  async function submit() {
    const name = root.querySelector("#vgCartName").value.trim();
    const email = root.querySelector("#vgCartEmail").value.trim();
    const message = root.querySelector("#vgCartMessage").value.trim();
    const honeypot = root.querySelector("#vgCartWebsite").value;
    const submitBtn = root.querySelector(".vg-cart-submit");

    if (!name || !email) {
      statusEl.textContent = "Name and email are required.";
      statusEl.className = "vg-cart-status err";
      return;
    }
    if (!items.length) {
      statusEl.textContent = "Add at least one piece to your cart first.";
      statusEl.className = "vg-cart-status err";
      return;
    }

    submitBtn.disabled = true;
    statusEl.textContent = "Sending…";
    statusEl.className = "vg-cart-status";

    try {
      const res = await fetch("/api/gallery-inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyer_name: name,
          buyer_email: email,
          buyer_message: message,
          website: honeypot,
          items: items.map((it) => ({
            artist_slug: it.artistSlug, artist_name: it.artistName,
            piece_title: it.pieceTitle, piece_src: it.pieceSrc,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      clear();
      statusEl.textContent = "Thanks — a curator will follow up by email.";
      statusEl.className = "vg-cart-status ok";
      root.querySelector("#vgCartName").value = "";
      root.querySelector("#vgCartEmail").value = "";
      root.querySelector("#vgCartMessage").value = "";
      renderPanelItems();
    } catch (err) {
      statusEl.textContent = err.message || "Couldn't send your inquiry. Please try again.";
      statusEl.className = "vg-cart-status err";
    } finally {
      submitBtn.disabled = false;
    }
  }

  function buildUI() {
    injectStyles();
    root = document.createElement("div");
    root.innerHTML = `
      <button class="vg-cart-btn" id="vgCartBtn" aria-label="View cart" hidden>
        <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="vg-cart-badge" id="vgCartBadge">0</span>
      </button>
      <div class="vg-cart-panel" id="vgCartPanel" aria-hidden="true">
        <div class="vg-cart-backdrop" id="vgCartBackdrop"></div>
        <div class="vg-cart-sheet">
          <div class="vg-cart-head">
            <h3>Your cart</h3>
            <button class="vg-cart-close" id="vgCartClose" aria-label="Close">&times;</button>
          </div>
          <div class="vg-cart-items" id="vgCartItems"></div>
          <div class="vg-cart-form">
            <label for="vgCartName">Name</label>
            <input type="text" id="vgCartName" autocomplete="name">
            <label for="vgCartEmail">Email</label>
            <input type="email" id="vgCartEmail" autocomplete="email">
            <label for="vgCartMessage">Message (optional)</label>
            <textarea id="vgCartMessage"></textarea>
            <input type="text" id="vgCartWebsite" class="vg-cart-website" tabindex="-1" autocomplete="off">
            <button class="vg-cart-submit" id="vgCartSubmit" type="button">Send inquiry</button>
            <div class="vg-cart-status" id="vgCartStatus"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    btn = root.querySelector("#vgCartBtn");
    badge = root.querySelector("#vgCartBadge");
    panel = root.querySelector("#vgCartPanel");
    itemsList = root.querySelector("#vgCartItems");
    statusEl = root.querySelector("#vgCartStatus");

    btn.addEventListener("click", open);
    root.querySelector("#vgCartClose").addEventListener("click", close);
    root.querySelector("#vgCartBackdrop").addEventListener("click", close);
    root.querySelector("#vgCartSubmit").addEventListener("click", submit);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    renderBadge();
  }

  document.addEventListener("DOMContentLoaded", buildUI);

  return { add, remove, getAll, clear };
})();
```

- [ ] **Step 2: Verify manually in the browser**

```bash
cd "path/to/valore-museum-site"
python -m http.server 8901 &
SERVER_PID=$!
```

Open `http://127.0.0.1:8901/gallery.html` in a browser, open devtools console, and run:
```javascript
window.ValoreGalleryCart.add({ artistSlug: "bahati", artistName: "Bahati", pieceTitle: "Equity", pieceSrc: "img/artists/bahati/3.jpg" });
```
Confirm:
- A round cart button appears bottom-right with a badge showing "1".
- Clicking it opens a slide-over panel from the right showing the Equity thumbnail, title, and artist name, with a working remove (×) button.
- Adding the same item again (re-run the same `add(...)` call) does **not** create a duplicate row — badge stays at "1".
- Typing a name/email and clicking "Send inquiry" without a local backend running shows an error message (expected — no server yet) rather than crashing silently.
- Reloading the page keeps the cart item (confirms `localStorage` persistence).

Run `window.ValoreGalleryCart.clear()` in the console afterward to reset state, then:
```bash
kill $SERVER_PID
```

- [ ] **Step 3: Verify the full submit flow against the real backend**

```bash
cd "path/to/valore-museum-site"
python museum_server.py &
SERVER_PID=$!
```

Open `http://127.0.0.1:8899/gallery.html`, repeat the `window.ValoreGalleryCart.add(...)` call from Step 2 in devtools, open the cart panel, fill in a name and email, click "Send inquiry". Confirm the success message "Thanks — a curator will follow up by email." appears, the item list empties, and:
```bash
python -c "
import museum_server as m
with m.db_connect() as conn:
    rows = conn.execute('SELECT id, buyer_name, items FROM gallery_inquiries ORDER BY id DESC LIMIT 1').fetchall()
    print(rows)
"
kill $SERVER_PID
```
Expected: the new row with the Equity item and the name you entered.

- [ ] **Step 4: Commit**

```bash
git add js/gallery-cart.js
git commit -m "Add shared gallery cart module with floating button and submit panel"
```

---

### Task 5: 3D room lightbox entry point

**Files:**
- Modify: `gallery.html:305-306` (panel body markup) and its `<style>` block (add `.panel-cart-btn`)
- Modify: `gallery.html:346` (script include, add `js/gallery-cart.js` before the `gallery3d.js` module script)
- Modify: `js/gallery3d.js:712-729` (`openPanel`) and add a new click listener near the other panel listeners (currently lines 736-743)

**Interfaces:**
- Consumes: `window.ValoreGalleryCart.add()`/`getAll()` (Task 4), `ROOMS[currentRoom]` (`.slug`, `.title`, `.kind`), `placedPieces[openIndex].data` (`.title`, `.src`) — all already exist in `js/gallery3d.js`.

- [ ] **Step 1: Add the button markup and CSS in `gallery.html`**

Find (currently lines 301-307):
```html
  <div class="panel-body">
    <h3 id="panelTitle"></h3>
    <div class="sec-head" id="panelSectionHead"></div>
    <p class="story" id="panelStory"></p>
    <p class="credit" id="panelCredit"></p>
    <p style="margin:14px 0 0;font-size:12px;"><a id="panelMore" href="#">Read the full story</a></p>
  </div>
```
Replace with:
```html
  <div class="panel-body">
    <h3 id="panelTitle"></h3>
    <div class="sec-head" id="panelSectionHead"></div>
    <p class="story" id="panelStory"></p>
    <p class="credit" id="panelCredit"></p>
    <button class="panel-cart-btn" id="panelAddCart" type="button">+ Add to cart</button>
    <p style="margin:14px 0 0;font-size:12px;"><a id="panelMore" href="#">Read the full story</a></p>
  </div>
```

Find the `.credit{...}` rule inside the `<style>` block (currently line 122):
```css
  .credit{font-size:11px;line-height:1.55;color:rgba(241,230,206,.45);padding-top:14px;border-top:1px solid var(--hairline);}
```
Add directly below it:
```css
  .panel-cart-btn{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:10px 16px;
    border-radius:8px;border:1px solid var(--saffron);background:rgba(184,121,26,.14);color:var(--saffron);
    font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
    font-family:inherit;transition:background .18s ease;}
  .panel-cart-btn:hover{background:rgba(184,121,26,.24);}
  .panel-cart-btn.added{border-color:#8FCB9C;color:#8FCB9C;background:rgba(60,140,90,.12);}
```

- [ ] **Step 2: Load `js/gallery-cart.js` before the `gallery3d.js` module script**

Find (currently lines 345-347):
```html
<script src="data/countries.js"></script>
<script src="data/artists.js"></script>
<script type="module" src="js/gallery3d.js"></script>
```
Replace with:
```html
<script src="data/countries.js"></script>
<script src="data/artists.js"></script>
<script src="js/gallery-cart.js"></script>
<script type="module" src="js/gallery3d.js"></script>
```

- [ ] **Step 3: Show/hide and reset the button state in `openPanel`**

In `js/gallery3d.js`, find `openPanel` (currently lines 712-729):
```javascript
function openPanel(i) {
  const p = placedPieces[i];
  if (!p) return;
  openIndex = i;
  const room = ROOMS[currentRoom];
  updatePanelLabel();
  const im = document.getElementById('panelImg');
  im.src = p.data.src; im.alt = p.data.title;
  document.getElementById('panelTitle').textContent = p.data.title;
  const sec = p.data.section;
  document.getElementById('panelSectionHead').textContent = sec ? sec.heading : '';
  document.getElementById('panelStory').textContent = sec ? sec.body : room.blurb;
  document.getElementById('panelCredit').textContent = p.data.source;
  document.getElementById('panelMore').href = 'country.html?c=' + room.slug;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('roomCaption').classList.add('hidden');
}
```
Replace with:
```javascript
function openPanel(i) {
  const p = placedPieces[i];
  if (!p) return;
  openIndex = i;
  const room = ROOMS[currentRoom];
  updatePanelLabel();
  const im = document.getElementById('panelImg');
  im.src = p.data.src; im.alt = p.data.title;
  document.getElementById('panelTitle').textContent = p.data.title;
  const sec = p.data.section;
  document.getElementById('panelSectionHead').textContent = sec ? sec.heading : '';
  document.getElementById('panelStory').textContent = sec ? sec.body : room.blurb;
  document.getElementById('panelCredit').textContent = p.data.source;
  document.getElementById('panelMore').href = 'country.html?c=' + room.slug;
  const cartBtn = document.getElementById('panelAddCart');
  cartBtn.style.display = room.kind === 'artist' ? '' : 'none';
  const inCart = room.kind === 'artist' && window.ValoreGalleryCart &&
    window.ValoreGalleryCart.getAll().some((it) => it.artistSlug === room.slug && it.pieceTitle === p.data.title);
  cartBtn.textContent = inCart ? 'Added ✓' : '+ Add to cart';
  cartBtn.classList.toggle('added', inCart);
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('roomCaption').classList.add('hidden');
}
```

- [ ] **Step 4: Wire the click handler**

In `js/gallery3d.js`, find the `resetBtn` listener (currently line 743):
```javascript
document.getElementById('resetBtn').addEventListener('click', () => { closePanel(); resetView(); });
```
Add directly below it:
```javascript
document.getElementById('panelAddCart').addEventListener('click', () => {
  const room = ROOMS[currentRoom];
  const p = placedPieces[openIndex];
  if (!room || !p || room.kind !== 'artist' || !window.ValoreGalleryCart) return;
  window.ValoreGalleryCart.add({
    artistSlug: room.slug, artistName: room.title,
    pieceTitle: p.data.title, pieceSrc: p.data.src,
  });
  const btn = document.getElementById('panelAddCart');
  btn.textContent = 'Added ✓';
  btn.classList.add('added');
});
```

- [ ] **Step 5: Verify manually in the browser**

```bash
cd "path/to/valore-museum-site"
python -m http.server 8901 &
SERVER_PID=$!
```

Open `http://127.0.0.1:8901/gallery.html`, click through the entry overlay, navigate to the Bahati room (use the "All rooms" sheet if faster than walking), click any piece to open its lightbox panel. Confirm:
- A "+ Add to cart" button appears below the credit line, styled with a gold outline.
- Clicking it changes the button to "Added ✓" with a green outline, and the floating cart button (bottom-right) appears with badge "1".
- Clicking Next/Previous to a different piece and back shows "+ Add to cart" again for the new piece, then "Added ✓" again when you return to the one you added.
- Navigate to a **country** room (not an artist room) — confirm the "+ Add to cart" button does not appear at all in that room's lightbox.

```bash
kill $SERVER_PID
```

- [ ] **Step 6: Commit**

```bash
git add gallery.html js/gallery3d.js
git commit -m "Wire add-to-cart into the 3D gallery piece lightbox"
```

---

### Task 6: Artist bio page carousel entry point

**Files:**
- Modify: `js/country-gallery.js` (add `titleFromCredit` helper, extend `init()` signature, add cart buttons to orbit items)
- Modify: `country.html:80-83, 139` (script include + `init()` call site)
- Modify: `css/style.css:927-935` (`.country-orbit-item`, add `.orbit-cart-btn`)

**Interfaces:**
- Consumes: `window.ValoreGalleryCart.add()`/`getAll()` (Task 4).
- Produces: `ValoreCountryGallery.init({ container, photos, countryName, isArtist, artistSlug })` — `isArtist`/`artistSlug` are new, optional (falsy by default preserves current country-page behavior with no cart button).

- [ ] **Step 1: Add the `titleFromCredit` helper and cart buttons in `js/country-gallery.js`**

Find the top of the file (currently lines 6-11):
```javascript
window.ValoreCountryGallery = (function () {
  function init({ container, photos, countryName }) {
    if (!container || !photos || !photos.length || !window.gsap) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = photos.length;
```
Replace with:
```javascript
window.ValoreCountryGallery = (function () {
  // Same extraction logic as js/gallery3d.js's titleFromCredit() — kept as
  // its own small copy here rather than shared, since it's five lines and
  // this file has no existing import mechanism (plain classic script, no
  // module boundary to share one across).
  function titleFromCredit(credit) {
    const quoted = (credit || "").match(/[“"]([^”"]+)[”"]/);
    if (quoted) return quoted[1];
    return (credit || "").split(" · ")[0].trim().replace(/,\s*$/, "");
  }

  function init({ container, photos, countryName, isArtist, artistSlug }) {
    if (!container || !photos || !photos.length || !window.gsap) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = photos.length;
```

Find the `items` construction (currently lines 25-31):
```javascript
    const items = photos.map((p, i) => {
      const el = document.createElement("div");
      el.className = "country-orbit-item glow-frame-hover";
      el.innerHTML = `<img src="${p.src}" alt="${countryName}" loading="lazy">`;
      stage.appendChild(el);
      return { el, p, index: i };
    });
```
Replace with:
```javascript
    const items = photos.map((p, i) => {
      const el = document.createElement("div");
      el.className = "country-orbit-item glow-frame-hover";
      const cartBtnHtml = isArtist ? `<button type="button" class="orbit-cart-btn" data-idx="${i}">+ Cart</button>` : "";
      el.innerHTML = `<img src="${p.src}" alt="${countryName}" loading="lazy">${cartBtnHtml}`;
      stage.appendChild(el);
      return { el, p, index: i };
    });

    // Cart buttons only exist when isArtist is set (never on country/culture
    // photos — those were never for sale and have no artist to attribute a
    // cart line to). e.stopPropagation() below keeps a button click from
    // also triggering this item's own rotate-to-front click handler further
    // down, or bubbling up to js/main.js's document-level lightbox handler.
    if (isArtist && window.ValoreGalleryCart) {
      const existing = window.ValoreGalleryCart.getAll();
      items.forEach(({ el, p }) => {
        const cartBtn = el.querySelector(".orbit-cart-btn");
        if (!cartBtn) return;
        const pieceTitle = titleFromCredit(p.credit);
        const already = existing.some((it) => it.artistSlug === artistSlug && it.pieceTitle === pieceTitle);
        if (already) {
          cartBtn.textContent = "Added ✓";
          cartBtn.classList.add("added");
        }
        cartBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.ValoreGalleryCart.add({
            artistSlug, artistName: countryName,
            pieceTitle, pieceSrc: p.src,
          });
          cartBtn.textContent = "Added ✓";
          cartBtn.classList.add("added");
        });
      });
    }
```

- [ ] **Step 2: Add `.orbit-cart-btn` CSS in `css/style.css`**

Find (currently lines 927-935):
```css
.country-orbit-item{
  position:absolute; top:50%; left:50%;
  width:190px; height:230px; margin:-115px 0 0 -95px;
  border-radius:10px; overflow:hidden;
  box-shadow:0 16px 36px rgba(29,19,15,.22);
  will-change:transform, opacity;
  transform-style:preserve-3d;
}
.country-orbit-item img{width:100%; height:100%; object-fit:cover; display:block; cursor:zoom-in;}
```
Add directly below it:
```css
.orbit-cart-btn{
  position:absolute; right:6px; bottom:6px; z-index:2;
  background:rgba(29,19,15,.72); color:#F1E6CE; border:none; border-radius:6px;
  padding:6px 10px; font-size:11px; font-weight:600; letter-spacing:.03em; cursor:pointer;
  font-family:inherit;
}
.orbit-cart-btn:hover{background:rgba(29,19,15,.9);}
.orbit-cart-btn.added{background:#2F7047;}
```

- [ ] **Step 3: Load `js/gallery-cart.js` and pass `isArtist`/`artistSlug` in `country.html`**

Find (currently lines 80-83):
```html
<script src="data/countries.js"></script>
<script src="data/artists.js"></script>
<script src="js/travel-transition.js"></script>
<script src="js/country-gallery.js"></script>
```
Replace with:
```html
<script src="data/countries.js"></script>
<script src="data/artists.js"></script>
<script src="js/travel-transition.js"></script>
<script src="js/gallery-cart.js"></script>
<script src="js/country-gallery.js"></script>
```

Find (currently line 139):
```javascript
    window.ValoreCountryGallery?.init({ container: galleryEl, photos: c.photos || [], countryName: c.name });
```
Replace with:
```javascript
    window.ValoreCountryGallery?.init({ container: galleryEl, photos: c.photos || [], countryName: c.name, isArtist, artistSlug: slug });
```

- [ ] **Step 4: Verify manually in the browser**

```bash
cd "path/to/valore-museum-site"
python -m http.server 8901 &
SERVER_PID=$!
```

Open `http://127.0.0.1:8901/country.html?c=bahati`. Confirm:
- Each photo card in the right-column carousel shows a small "+ Cart" button in its bottom-right corner.
- Clicking it (without dragging) adds the piece and changes the button to "Added ✓" (green), and the floating cart button appears/updates.
- Dragging the carousel to spin it still works normally (the button click's `stopPropagation()` didn't break rotation).
- Clicking the front item's *image* (not the cart button) still opens the existing simple lightbox from `js/main.js` — confirms the cart button didn't interfere with that separate click handler.
- Open `http://127.0.0.1:8901/country.html?c=iraq` (a country page, not an artist page) — confirm no "+ Cart" button appears on any photo card.

```bash
kill $SERVER_PID
```

- [ ] **Step 5: Commit**

```bash
git add js/country-gallery.js country.html css/style.css
git commit -m "Wire add-to-cart into the artist bio page photo carousel"
```

---

### Task 7: Admin panel — "Gallery inquiries" tab

**Files:**
- Modify: `admin.html:37-50` (markup)
- Modify: `admin.html:54-165` (inline script)
- Modify: `css/style.css:1149-1155` (queue tab styling, extend to the new view-switcher) and add new rules for inquiry pieces/status select

**Interfaces:**
- Consumes: `GET /api/admin/gallery-inquiries`, `POST /api/admin/gallery-inquiries/:id/status` (Task 3), `authHeader()` (already defined in `admin.html`).

- [ ] **Step 1: Restructure the panel markup in `admin.html`**

Find (currently lines 37-50):
```html
    <div id="queuePanel" style="display:none;">
      <div class="section-head-row" style="margin-bottom:24px;">
        <h2>Moderation queue</h2>
        <button id="logoutBtn" class="btn btn-outline btn-sm">Log out</button>
      </div>
      <div class="queue-tabs">
        <button class="queue-tab active" data-status="pending">Pending</button>
        <button class="queue-tab" data-status="needs_review">Needs review</button>
        <button class="queue-tab" data-status="approved">Approved</button>
        <button class="queue-tab" data-status="rejected">Rejected</button>
        <button class="queue-tab" data-status="">All</button>
      </div>
      <div id="queueList"></div>
    </div>
```
Replace with:
```html
    <div id="queuePanel" style="display:none;">
      <div class="section-head-row" style="margin-bottom:24px;">
        <h2>Admin</h2>
        <button id="logoutBtn" class="btn btn-outline btn-sm">Log out</button>
      </div>
      <div class="queue-tabs">
        <button class="admin-view-tab active" data-view="moderation">Moderation queue</button>
        <button class="admin-view-tab" data-view="inquiries">Gallery inquiries</button>
      </div>

      <div id="moderationView">
        <div class="queue-tabs">
          <button class="queue-tab active" data-status="pending">Pending</button>
          <button class="queue-tab" data-status="needs_review">Needs review</button>
          <button class="queue-tab" data-status="approved">Approved</button>
          <button class="queue-tab" data-status="rejected">Rejected</button>
          <button class="queue-tab" data-status="">All</button>
        </div>
        <div id="queueList"></div>
      </div>

      <div id="inquiriesView" style="display:none;">
        <div class="queue-tabs">
          <button class="queue-tab active" data-istatus="new">New</button>
          <button class="queue-tab" data-istatus="contacted">Contacted</button>
          <button class="queue-tab" data-istatus="closed">Closed</button>
          <button class="queue-tab" data-istatus="">All</button>
        </div>
        <div id="inquiryList"></div>
      </div>
    </div>
```

- [ ] **Step 2: Add the JS for the new tab in `admin.html`**

Find (currently lines 59-65):
```javascript
  const loginPanel = document.getElementById("loginPanel");
  const queuePanel = document.getElementById("queuePanel");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const loginError = document.getElementById("loginError");
  const queueList = document.getElementById("queueList");
  const tabs = document.querySelectorAll(".queue-tab");
```
Replace with:
```javascript
  const loginPanel = document.getElementById("loginPanel");
  const queuePanel = document.getElementById("queuePanel");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const loginError = document.getElementById("loginError");
  const queueList = document.getElementById("queueList");
  const tabs = document.querySelectorAll("#moderationView .queue-tab");
  const moderationView = document.getElementById("moderationView");
  const inquiriesView = document.getElementById("inquiriesView");
  const inquiryList = document.getElementById("inquiryList");
  const viewTabs = document.querySelectorAll(".admin-view-tab");
  const inquiryTabs = document.querySelectorAll("#inquiriesView .queue-tab");
```

Note: `tabs` now scopes to `#moderationView .queue-tab` — without this scoping the existing `tabs.forEach` status-toggle logic further down would also match the new inquiry status tabs, since both use the shared `.queue-tab` class.

Find the `tabs.forEach(...)` block (currently lines 101-107):
```javascript
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      loadQueue(tab.dataset.status);
    });
  });
```
Add directly below it:
```javascript
  viewTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      viewTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const view = tab.dataset.view;
      moderationView.style.display = view === "moderation" ? "block" : "none";
      inquiriesView.style.display = view === "inquiries" ? "block" : "none";
      if (view === "inquiries") {
        const activeIT = document.querySelector("#inquiriesView .queue-tab.active");
        loadInquiries(activeIT ? activeIT.dataset.istatus : "new");
      }
    });
  });

  inquiryTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      inquiryTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      loadInquiries(tab.dataset.istatus);
    });
  });

  async function loadInquiries(status) {
    inquiryList.innerHTML = '<p style="opacity:.6;">Loading…</p>';
    const url = status ? `/api/admin/gallery-inquiries?status=${status}` : "/api/admin/gallery-inquiries";
    const res = await fetch(url, { headers: authHeader() });
    if (res.status === 401) {
      queuePanel.style.display = "none";
      loginPanel.style.display = "block";
      return;
    }
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) {
      inquiryList.innerHTML = '<p style="opacity:.6;">Nothing here.</p>';
      return;
    }
    inquiryList.innerHTML = "";
    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "queue-item";
      const piecesHtml = (item.items || []).map((p) => `
        <div class="inquiry-piece">
          <img src="${escapeHtml(p.piece_src)}" alt="">
          <span>${escapeHtml(p.artist_name)} — ${escapeHtml(p.piece_title)}</span>
        </div>
      `).join("");
      el.innerHTML = `
        <div class="queue-item-head">
          <h3>${escapeHtml(item.buyer_name)} <a href="mailto:${escapeHtml(item.buyer_email)}" style="font-size:13px; font-weight:400;">${escapeHtml(item.buyer_email)}</a></h3>
          <select class="inquiry-status-select" data-id="${escapeHtml(item.id)}">
            <option value="new" ${item.status === "new" ? "selected" : ""}>New</option>
            <option value="contacted" ${item.status === "contacted" ? "selected" : ""}>Contacted</option>
            <option value="closed" ${item.status === "closed" ? "selected" : ""}>Closed</option>
          </select>
        </div>
        <div style="font-size:12px; opacity:.6; margin-bottom:10px;">
          ${item.created_at ? new Date(item.created_at).toLocaleString() : ""}
        </div>
        ${item.buyer_message ? `<div class="queue-item-body">${escapeHtml(item.buyer_message)}</div>` : ""}
        <div>${piecesHtml}</div>
      `;
      inquiryList.appendChild(el);
    });

    inquiryList.querySelectorAll(".inquiry-status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const id = sel.dataset.id;
        sel.disabled = true;
        await fetch(`/api/admin/gallery-inquiries/${id}/status`, {
          method: "POST",
          headers: { ...authHeader(), "content-type": "application/json" },
          body: JSON.stringify({ status: sel.value }),
        });
        sel.disabled = false;
      });
    });
  }
```

- [ ] **Step 3: Add CSS for the view tabs, inquiry pieces list, and status select in `css/style.css`**

Find (currently lines 1150-1155):
```css
.queue-tab{
  padding:9px 18px; border-radius:999px; font-size:13px; font-weight:700;
  border:1px solid rgba(42,29,22,.2); cursor:pointer; background:transparent; color:var(--paper-on-ink-70);
  font-family:inherit;
}
.queue-tab.active{background:var(--accent); border-color:var(--accent); color:#fff;}
```
Replace with:
```css
.queue-tab, .admin-view-tab{
  padding:9px 18px; border-radius:999px; font-size:13px; font-weight:700;
  border:1px solid rgba(42,29,22,.2); cursor:pointer; background:transparent; color:var(--paper-on-ink-70);
  font-family:inherit;
}
.queue-tab.active, .admin-view-tab.active{background:var(--accent); border-color:var(--accent); color:#fff;}
.inquiry-piece{display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:6px;}
.inquiry-piece img{width:32px; height:32px; object-fit:cover; border-radius:4px; flex:none;}
.inquiry-status-select{
  padding:6px 10px; border-radius:6px; border:1px solid rgba(42,29,22,.2);
  background:#fff; color:var(--paper-on-ink); font-family:inherit; font-size:13px;
}
```

- [ ] **Step 4: Verify manually in the browser**

This needs the local backend running so the admin login actually authenticates and both the Task 2/3 test data (from earlier tasks) is visible.

```bash
cd "path/to/valore-museum-site"
python museum_server.py &
SERVER_PID=$!
```

Open `http://127.0.0.1:8899/admin.html`, log in with the credentials from `.env` (`ADMIN_USERNAME`/`ADMIN_PASSWORD`). Confirm:
- The default view is "Moderation queue" (existing behavior unchanged) with its own Pending/Needs review/etc. tabs still working.
- Clicking "Gallery inquiries" switches to a list showing the inquiry row(s) created during Task 2/3 testing, each with buyer name (as a mailto link), message (if any), the piece thumbnail + artist — title, submitted date, and a status dropdown.
- Changing an inquiry's status dropdown, then switching tabs away and back (or reloading the page and clicking "Gallery inquiries" again), shows the new status persisted.
- Filtering by the New/Contacted/Closed/All sub-tabs under "Gallery inquiries" correctly narrows the list.
- Switching back to "Moderation queue" still shows the original Voices/Perspectives submissions correctly — confirms the `tabs` scoping fix in Step 2 didn't break the original tab behavior.

```bash
kill $SERVER_PID
```

- [ ] **Step 5: Commit**

```bash
git add admin.html css/style.css
git commit -m "Add Gallery inquiries tab to the admin panel"
```

---

### Task 8: End-to-end verification pass

**Files:** None (verification only).

- [ ] **Step 1: Full local walkthrough with the real backend**

```bash
cd "path/to/valore-museum-site"
python museum_server.py &
SERVER_PID=$!
```

In a browser:
1. Open `http://127.0.0.1:8899/gallery.html`, enter the gallery, go to the Bahati room, open two different pieces' lightboxes, add both to cart.
2. Navigate to `http://127.0.0.1:8899/country.html?c=olgalene` (a different artist), add one piece to cart from the carousel there — confirms the cart persists **across pages** and **across artists** (mixed-artist cart).
3. Open the floating cart button — confirm all three items are listed, correctly attributed to the right artist each.
4. Remove one item via its × button, confirm it disappears from the list and the badge count drops.
5. Fill in name/email/message, submit. Confirm the success message and that the cart empties (badge disappears).
6. Open `http://127.0.0.1:8899/admin.html`, log in, go to "Gallery inquiries" → "New" tab, confirm the submitted inquiry appears with both remaining pieces correctly listed (one Bahati, one Olgalene), correct buyer name/email/message.
7. Change its status to "Contacted", confirm it moves out of the "New" filter and into "Contacted".

```bash
kill $SERVER_PID
```

- [ ] **Step 2: Confirm no regressions in existing flows**

With the same server running (or restarted), spot-check that nothing already working broke:
- `http://127.0.0.1:8899/gallery.html` in a **country** room (not artist) — lightbox still opens correctly, no cart button appears, Previous/Next still work.
- `http://127.0.0.1:8899/country.html?c=iraq` — carousel drag-to-rotate and click-to-lightbox both still work, no cart button appears anywhere on the page.
- `http://127.0.0.1:8899/admin.html` — "Moderation queue" tab (the original feature) still loads and its Approve/Reject buttons still work on a real pending submission if one exists, or at minimum the tab renders without JS errors in the console.

- [ ] **Step 3: Final commit (if any fixups were needed)**

If Steps 1-2 surfaced any bugs, fix them in the relevant file from the task above that owns it, then:
```bash
git add -A
git commit -m "Fix issues found during gallery cart end-to-end verification"
```
If no fixes were needed, skip this step — nothing to commit.
