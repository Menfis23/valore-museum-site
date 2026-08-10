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
