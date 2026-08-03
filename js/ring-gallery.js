// The "step into the gallery" section on Explore — every country's flag
// hangs as a fixed card around the globe, like paintings mounted on the wall
// of a round gallery room with a rotating centerpiece sculpture in the
// middle (the globe). The cards themselves never move on their own — there's
// no ambient auto-rotation — but the visitor can "look around the room" two
// ways: dragging anywhere in the frame free-rotates the view, or the
// prev/next arrows step it by exactly one card position at a time. The globe
// keeps its own independent slow rotation and stays separately
// draggable/clickable on its own glowing dots, same as before.
//
// There's no real depth compositing available between the WebGL globe canvas
// and DOM cards, so occlusion is faked: whichever cards are currently on the
// near half of the ring render in a DOM layer stacked above the globe canvas,
// the far-half cards render in a layer stacked below it.
document.addEventListener("DOMContentLoaded", () => {
  const frame = document.getElementById("globeRingFrame");
  const frontLayer = document.getElementById("ringFront");
  const backLayer = document.getElementById("ringBack");
  const hudRegion = document.getElementById("ringHudRegion");
  const hudName = document.getElementById("ringHudName");
  const hudBlurb = document.getElementById("ringHudBlurb");
  if (!frame || !frontLayer || !backLayer || !window.gsap) return;

  const countries = window.VALORE_COUNTRIES || {};
  const entries = Object.entries(countries).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const N = entries.length;
  if (!N) return;

  const ANGLE_STEP = 360 / N;
  const RADIUS = 300;
  const DEPTH = 130;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const items = entries.map(([slug, c], i) => {
    const el = document.createElement("a");
    el.href = `country.html?c=${slug}`;
    el.className = "ring-card";
    el.setAttribute("aria-label", `${c.name} — ${c.tag}`);
    const img = c.flag || c.heroImage || "";
    el.innerHTML = `<img src="${img}" alt="Flag of ${c.name}" loading="lazy"><span class="ring-card-name">${c.name}</span>`;
    frontLayer.appendChild(el);
    return { el, slug, c, index: i, inFront: true };
  });

  // state.rot only ever changes via the prev/next arrows (a discrete,
  // animated step of one ANGLE_STEP) — the cards are otherwise static.
  const state = { rot: 0 };
  let stepping = false;

  function render() {
    let bestItem = items[0], bestVal = -Infinity;
    items.forEach((it) => {
      const angleDeg = it.index * ANGLE_STEP - state.rot;
      const norm = ((angleDeg % 360) + 360) % 360;
      const rad = (norm * Math.PI) / 180;
      const facing = Math.cos(rad); // 1 = dead front, -1 = dead back
      const x = Math.sin(rad) * RADIUS;
      const z = facing * DEPTH;
      const scale = 0.55 + 0.45 * Math.max(0, facing);
      const opacity = 0.32 + 0.68 * Math.max(0, (facing + 1) / 2);
      const wantFront = facing > -0.05;
      if (wantFront !== it.inFront) {
        it.inFront = wantFront;
        (wantFront ? frontLayer : backLayer).appendChild(it.el);
      }
      gsap.set(it.el, {
        x, z, scale, opacity,
        zIndex: Math.round(1000 + z),
      });
      if (facing > bestVal) { bestVal = facing; bestItem = it; }
    });

    if (hudName && hudName.textContent !== bestItem.c.name) {
      hudRegion.textContent = bestItem.c.tag;
      hudName.textContent = bestItem.c.name;
      if (hudBlurb) hudBlurb.textContent = bestItem.c.blurb || "";
    }
  }

  function step(delta) {
    if (stepping) return;
    stepping = true;
    gsap.to(state, {
      rot: state.rot + delta * ANGLE_STEP,
      duration: prefersReducedMotion ? 0.01 : 0.6,
      ease: "power2.inOut",
      onUpdate: render,
      onComplete: () => { stepping = false; },
    });
  }

  document.getElementById("ringPrev")?.addEventListener("click", () => step(-1));
  document.getElementById("ringNext")?.addEventListener("click", () => step(1));
  frame.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
  });

  // Free "look around the room" by dragging anywhere in the frame — the
  // cards themselves never move on their own, this only changes which of
  // the static cards the current view is facing.
  let dragging = false, moved = 0, startX = 0, startRot = 0;
  frame.addEventListener("pointerdown", (e) => {
    // The globe canvas has its own independent drag-to-rotate — don't also
    // start a ring-look-around drag from the same gesture.
    if (document.getElementById("exploreGlobe")?.contains(e.target)) return;
    dragging = true; moved = 0;
    startX = e.clientX; startRot = state.rot;
    gsap.killTweensOf(state);
    stepping = false;
    frame.classList.add("dragging");
    try { frame.setPointerCapture(e.pointerId); } catch (err) {}
  });
  frame.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    state.rot = startRot - dx * 0.22;
    render();
  });
  function endFrameDrag(e) {
    if (!dragging) return;
    dragging = false;
    frame.classList.remove("dragging");
    try { frame.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  frame.addEventListener("pointerup", endFrameDrag);
  frame.addEventListener("pointercancel", endFrameDrag);

  items.forEach(({ el, slug, c }) => {
    el.addEventListener("click", (e) => {
      if (moved > 8) { e.preventDefault(); return; }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sourceRect = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      const href = `country.html?c=${slug}`;
      if (window.ValoreTravelTransition) {
        window.ValoreTravelTransition.travelToFromPoint({
          sourceRect, imageSrc: c.flag || c.heroImage || "", href,
        });
      } else {
        window.location.href = href;
      }
    });
  });

  render();

  // The globe itself: fully independent — its own slow idle rotation, and
  // still separately draggable and clickable on its own glowing dots. It is
  // not tied to the (now static) ring's rotation state at all.
  const globeEl = document.getElementById("exploreGlobe");
  const tooltip = document.getElementById("globeTooltip");
  const ACCENTS = {
    iraq: "#2A5C9E", eritrea: "#2E8CA3", south_sudan: "#A8522E", ethiopia: "#3C8C5A",
    venezuela: "#2E6BC2", haiti: "#3454A8", nigeria: "#2A4B7C", syria: "#2E7D8C",
    vietnam: "#A6242E", ukraine: "#C23B32", bhutan: "#B5342A", dr_congo: "#6B4226",
    afghanistan: "#1F5C7A", myanmar: "#B8860B", somalia: "#1D6E8C",
  };

  function enterCountry(slug, screenRect) {
    const c = countries[slug];
    if (!c) return;
    const hint = document.getElementById("mapHint");
    hint && hint.classList.add("faded");
    const href = `country.html?c=${slug}`;
    if (window.ValoreTravelTransition && screenRect) {
      window.ValoreTravelTransition.travelToFromPoint({
        sourceRect: screenRect, imageSrc: c.flag || c.heroImage || "", href,
      });
    } else {
      window.location.href = href;
    }
  }

  function hoverCountry(slug, screenRect) {
    if (!tooltip) return;
    if (!slug || !screenRect) { tooltip.classList.remove("visible"); return; }
    const c = countries[slug];
    if (!c) return;
    const frameRect = frame.getBoundingClientRect();
    tooltip.textContent = `${c.name} — click to enter`;
    tooltip.style.left = `${screenRect.x - frameRect.left + screenRect.w / 2}px`;
    tooltip.style.top = `${screenRect.y - frameRect.top - 10}px`;
    tooltip.classList.add("visible");
  }

  if (globeEl && window.ValoreGlobe) {
    window.ValoreGlobe.init({
      container: globeEl,
      countries,
      accents: ACCENTS,
      onEnter: enterCountry,
      onHover: hoverCountry,
      cameraDistance: 2.1,
    });
  }

  const countEl = document.getElementById("regionCount");
  if (countEl) countEl.textContent = `${N} countries`;

  const hint = document.getElementById("mapHint");
  if (hint) setTimeout(() => hint.classList.add("faded"), 9000);
});
