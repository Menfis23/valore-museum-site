// Country-page photo gallery — a small coverflow-style orbiting carousel in
// the right column, using the same trig-based technique as the Explore flag
// carousel (js/orbit-gallery.js) rather than the old idle-bob float cards.
// Auto-idles slowly, drag/swipe to spin through the rest of the photos, and
// the credit line below always describes whichever photo is currently front.
window.ValoreCountryGallery = (function () {
  function init({ container, photos, countryName }) {
    if (!container || !photos || !photos.length || !window.gsap) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = photos.length;

    container.innerHTML = `
      <div class="country-orbit-stage" id="countryOrbitStage"></div>
      <p class="country-orbit-credit" id="countryOrbitCredit"></p>
    `;
    const stage = container.querySelector("#countryOrbitStage");
    const creditEl = container.querySelector("#countryOrbitCredit");

    const ANGLE_STEP = N > 1 ? Math.min(34, 200 / N) : 0;
    const RADIUS = 105;
    const DEPTH = 90;
    const MAX_VISIBLE_DEG = 110;

    const items = photos.map((p, i) => {
      const el = document.createElement("div");
      el.className = "country-orbit-item glow-frame-hover";
      el.innerHTML = `<img src="${p.src}" alt="${countryName}" loading="lazy">`;
      stage.appendChild(el);
      return { el, p, index: i };
    });

    const state = { rot: 0 };
    let dragging = false, startX = 0, startRot = 0, moved = 0;
    let autoRotate = !prefersReducedMotion;
    let idleTimer = null;

    function wrappedRelative(i, rot) {
      return ((i - rot + N / 2) % N + N) % N - N / 2;
    }

    function render() {
      let frontIndex = Math.round(((Math.round(state.rot) % N) + N) % N);
      items.forEach(({ el, index }) => {
        const rel = wrappedRelative(index, state.rot);
        const angleDeg = rel * ANGLE_STEP;
        const angleRad = (angleDeg * Math.PI) / 180;
        const absAngle = Math.abs(angleDeg);
        const x = Math.sin(angleRad) * RADIUS;
        const z = (Math.cos(angleRad) - 1) * DEPTH;
        const scale = Math.max(0.55, Math.cos(angleRad));
        const visible = absAngle <= MAX_VISIBLE_DEG;
        const opacity = visible ? 1 - Math.min(1, (absAngle / MAX_VISIBLE_DEG) * 0.8) : 0;
        gsap.set(el, {
          x, z, scale, opacity,
          rotateY: -angleDeg * 0.5,
          zIndex: Math.round(200 - absAngle),
          pointerEvents: visible ? "auto" : "none",
        });
      });
      const front = items[frontIndex];
      if (front && creditEl.textContent !== front.p.credit) {
        creditEl.textContent = front.p.credit || "";
      }
    }

    function resumeAutoRotateLater() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { autoRotate = !prefersReducedMotion; }, 3200);
    }

    stage.addEventListener("pointerdown", (e) => {
      dragging = true; moved = 0;
      startX = e.clientX; startRot = state.rot;
      autoRotate = false;
      clearTimeout(idleTimer);
      gsap.killTweensOf(state);
      // No setPointerCapture here — only once pointermove below confirms an
      // actual drag. Capturing unconditionally on every pointerdown (the
      // old behavior) meant a plain click's pointerup *and* the click event
      // that follows it were both dispatched with the stage itself as
      // e.target, per the Pointer Events spec, instead of whatever picture
      // was actually under the cursor — silently defeating both the
      // rotate-to-front handler below and main.js's lightbox handler on
      // every single click, drag or not.
    });
    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      // Only now — once movement crosses the same threshold the click
      // handler below uses to distinguish a click from a drag — do we
      // capture the pointer, so a genuine drag keeps tracking smoothly even
      // if the cursor leaves the stage's bounds, without a plain click ever
      // triggering capture at all.
      if (moved > 8 && !stage.classList.contains("dragging")) {
        stage.classList.add("dragging");
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      }
      state.rot = startRot - dx / 70;
      render();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("dragging");
      try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
      resumeAutoRotateLater();
      gsap.to(state, { rot: Math.round(state.rot), duration: 0.45, ease: "power3.out", onUpdate: render });
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    // Pause the idle auto-rotation as soon as the pointer enters the stage,
    // not just once a drag actually starts — otherwise the carousel keeps
    // drifting for the entire time a visitor is moving their mouse toward a
    // picture, so by the time they click, that picture has already slid out
    // from under the cursor and the click lands on empty stage background
    // instead (silently doing nothing, no rotate-to-front, no lightbox).
    // Touch has no real "hover" (pointerenter fires right alongside
    // pointerdown there), so this is effectively mouse-only, same as the
    // click-vs-drag distinction elsewhere in this file.
    stage.addEventListener("pointerenter", () => {
      autoRotate = false;
      clearTimeout(idleTimer);
    });
    stage.addEventListener("pointerleave", () => {
      if (!dragging) resumeAutoRotateLater();
    });

    items.forEach(({ el, index }) => {
      el.addEventListener("click", (e) => {
        if (moved > 8) return;
        const frontIndex = Math.round(((Math.round(state.rot) % N) + N) % N);
        if (index !== frontIndex) {
          e.preventDefault();
          e.stopPropagation();
          autoRotate = false;
          clearTimeout(idleTimer);
          const rel = wrappedRelative(index, state.rot);
          gsap.to(state, { rot: state.rot + rel, duration: 0.45, ease: "power3.out", onUpdate: render });
          resumeAutoRotateLater();
        }
        // else: front item — let the click through to main.js's lightbox handler.
      });
    });

    render();

    if (!prefersReducedMotion) {
      let last = performance.now();
      function tick(now) {
        const dt = now - last;
        last = now;
        if (autoRotate && !dragging) {
          state.rot += dt * 0.00018;
          render();
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }

  return { init };
})();
