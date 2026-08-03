// Shared "traveling through space" page-entry transition — used when a
// visitor selects a country from a glowing map point or from the orbital
// gallery on Explore, so arriving at the country page feels like one
// continuous motion instead of an abrupt reload.
//
// Two halves, because a page navigation always throws away JS state:
//   1. travelToFromPoint() — runs on the *departing* page. Grows a small
//      flying image from a screen point (e.g. a clicked map marker) while
//      fading in a full-screen dark overlay, then navigates.
//   2. revealOnEntry() — runs on the *arriving* page. If the departing page
//      set a sessionStorage flag, the arriving page starts with that same
//      dark overlay already covering the screen (inserted synchronously,
//      before first paint, via the inline snippet at the top of <body> —
//      see country.html) and this call fades it back out with GSAP.
//
// The orbital gallery (js/orbit-gallery.js) implements its own version of
// half 1 inline (it grows the *actual* clicked photo element for a crisper
// shared-element feel, rather than a synthetic point-sourced image) but
// calls markTravelStart()/uses the same overlay id so half 2 covers both entry
// paths identically.
window.ValoreTravelTransition = (function () {
  const OVERLAY_ID = "orbitTravelOverlay"; // reuse Explore's static overlay div when present
  const STORAGE_KEY = "valoreTravelTransition";

  function getOrCreateOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.className = "orbit-travel-overlay";
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function markTravelStart() {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch (err) { /* private mode etc — non-fatal */ }
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // sourceRect: {x, y, w, h} in viewport (fixed) coordinates — e.g. a globe
  // marker's screen position. imageSrc: the destination country's flag, so
  // entering always feels like flying into that country's flag.
  function travelToFromPoint({ sourceRect, imageSrc, href }) {
    if (prefersReducedMotion() || !window.gsap) {
      window.location.href = href;
      return;
    }
    markTravelStart();
    const overlay = getOrCreateOverlay();

    const flyer = document.createElement("img");
    flyer.src = imageSrc;
    flyer.alt = "";
    flyer.style.cssText = `position:fixed; left:${sourceRect.x}px; top:${sourceRect.y}px; width:${sourceRect.w}px; height:${sourceRect.h}px; object-fit:cover; border-radius:8px; z-index:998; box-shadow:0 12px 32px rgba(0,0,0,.4); transform-origin:center center;`;
    document.body.appendChild(flyer);

    // Scale is computed from the real viewport so the flag always ends up
    // covering the entire screen edge-to-edge, regardless of how small the
    // starting point (a globe marker, a ring card) or the screen itself is.
    const scale = Math.max(window.innerWidth / sourceRect.w, window.innerHeight / sourceRect.h) * 1.15;
    const DURATION = 4.2;

    gsap.to(overlay, { opacity: 1, duration: 1.6, ease: "power2.in" });
    gsap.to(flyer, {
      scale,
      borderRadius: 0,
      boxShadow: "0 0 0 rgba(0,0,0,0)",
      zIndex: 999,
      duration: DURATION,
      ease: "power1.inOut",
      onComplete: () => { window.location.href = href; },
    });
  }

  // Called at the very start of the arriving page (after GSAP is available —
  // i.e. inside a DOMContentLoaded handler). The overlay div itself must
  // already exist in the DOM at full opacity before this runs — see the
  // synchronous snippet at the top of country.html's <body>.
  function revealOnEntry() {
    let flagged = false;
    try { flagged = sessionStorage.getItem(STORAGE_KEY) === "1"; } catch (err) {}
    if (!flagged) return;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (err) {}

    const overlay = document.getElementById("valoreEntryOverlay");
    if (!overlay) return;
    if (!window.gsap || prefersReducedMotion()) {
      overlay.remove();
      return;
    }
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.55,
      delay: 0.05,
      ease: "power1.out",
      onComplete: () => overlay.remove(),
    });
  }

  return { travelToFromPoint, revealOnEntry, markTravelStart, prefersReducedMotion };
})();
