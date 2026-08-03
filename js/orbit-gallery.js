// Circular/orbital gallery for the Explore page — plain HTML/CSS/JS + GSAP,
// no WebGL/ogl/React. Countries sit on a virtual circle; only a comfortable
// arc around the "front" item is visible/interactive at once, positioned with
// CSS 3D transforms (translateX/Z + rotateY + scale + opacity) computed from
// a single continuous `rot` value. Drag/swipe/arrow-keys move `rot`; GSAP
// tweens it (and, on release, snaps to the nearest integer index).
document.addEventListener("DOMContentLoaded", () => {
  const stage = document.getElementById("orbitStage");
  const gallery = document.getElementById("orbitGallery");
  if (!stage || !gallery || !window.gsap) return;

  const countries = window.VALORE_COUNTRIES || {};
  const entries = Object.entries(countries).sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (!entries.length) return;
  const N = entries.length;

  const ANGLE_STEP = 26;       // degrees between adjacent items
  const RADIUS = 300;          // px — horizontal spread
  const DEPTH = 220;           // px — how far items recede in Z
  const MAX_VISIBLE_DEG = 100; // beyond this angle, an item is invisible/inert
  const DRAG_PX_PER_STEP = 110;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const items = entries.map(([slug, c], i) => {
    const el = document.createElement("div");
    el.className = "orbit-item";
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${c.name} — ${c.tag}`);
    const img = c.flag || c.heroImage || (c.photos && c.photos[0] && c.photos[0].src) || "";
    el.innerHTML = `<img src="${img}" alt="Flag of ${c.name}" loading="lazy">`;
    stage.appendChild(el);
    return { el, slug, c, index: i };
  });

  const hudRegion = document.getElementById("orbitHudRegion");
  const hudName = document.getElementById("orbitHudName");
  const hudCta = document.getElementById("orbitHudCta");
  const overlay = document.getElementById("orbitTravelOverlay");

  const state = { rot: 0 };
  let traveling = false;

  function wrappedRelative(i, rot) {
    let rel = ((i - rot + N / 2) % N + N) % N - N / 2;
    return rel;
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
      const scale = Math.max(0.5, Math.cos(angleRad));
      const rotateY = -angleDeg * 0.55;
      const visible = absAngle <= MAX_VISIBLE_DEG;
      const opacity = visible ? 1 - Math.min(1, (absAngle / MAX_VISIBLE_DEG) * 0.85) : 0;
      const brightness = 0.45 + 0.55 * Math.max(0, Math.cos(angleRad));
      gsap.set(el, {
        x, z, rotateY, scale,
        opacity,
        filter: `brightness(${brightness})`,
        zIndex: Math.round(200 - absAngle),
        pointerEvents: visible ? "auto" : "none",
      });
      el.classList.toggle("is-front", index === frontIndex);
    });

    const front = items[frontIndex];
    if (front && hudName && hudName.textContent !== front.c.name) {
      hudRegion.textContent = front.c.tag;
      hudName.textContent = front.c.name;
    }
  }

  function rotateBy(delta) {
    if (traveling) return;
    gsap.killTweensOf(state);
    gsap.to(state, { rot: state.rot + delta, duration: prefersReducedMotion ? 0.01 : 0.55, ease: "power3.out", onUpdate: render });
  }

  function goToIndex(index) {
    if (traveling) return;
    const rel = wrappedRelative(index, state.rot);
    gsap.killTweensOf(state);
    gsap.to(state, { rot: state.rot + rel, duration: prefersReducedMotion ? 0.01 : 0.55, ease: "power3.out", onUpdate: render });
  }

  function travelInto(index) {
    if (traveling) return;
    traveling = true;
    const { el, slug } = items[index];
    const go = () => { window.location.href = `country.html?c=${slug}`; };
    if (prefersReducedMotion) { go(); return; }
    window.ValoreTravelTransition?.markTravelStart();

    // Scale computed from the item's actual current on-screen size (it's
    // sitting inside a perspective-transformed 3D stage, so its rendered
    // pixel size already accounts for that) so it always ends up covering
    // the full viewport, not just growing by a fixed guessed multiplier.
    const rect = el.getBoundingClientRect();
    const currentScale = gsap.getProperty(el, "scale");
    const targetScale = currentScale * Math.max(window.innerWidth / rect.width, window.innerHeight / rect.height) * 1.15;
    const DURATION = 4.2;

    gsap.to([hudRegion, hudName, hudCta, ".orbit-nav"], { opacity: 0, duration: 0.3, ease: "power1.out" });
    items.forEach((it) => { if (it.index !== index) gsap.to(it.el, { opacity: 0, duration: 0.5, ease: "power1.out" }); });
    gsap.to(overlay, { opacity: 1, duration: 1.6, ease: "power2.in" });
    gsap.to(el, {
      scale: targetScale, z: 900, zIndex: 999,
      duration: DURATION, ease: "power1.inOut",
      onComplete: go,
    });
  }

  // Pointer drag (mouse + touch, unified via Pointer Events)
  let dragging = false, startX = 0, startRot = 0, moved = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (traveling) return;
    dragging = true; moved = 0;
    startX = e.clientX; startRot = state.rot;
    gsap.killTweensOf(state);
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    state.rot = startRot - dx / DRAG_PX_PER_STEP;
    render();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("dragging");
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    gsap.to(state, { rot: Math.round(state.rot), duration: prefersReducedMotion ? 0.01 : 0.45, ease: "power3.out", onUpdate: render });
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  // Click / tap a specific item — front item enters it, side items bring it to front
  items.forEach(({ el, index }) => {
    el.addEventListener("click", () => {
      if (moved > 8) return; // was a drag, not a tap
      const frontIndex = Math.round(((Math.round(state.rot) % N) + N) % N);
      if (index === frontIndex) travelInto(index);
      else goToIndex(index);
    });
  });

  if (hudCta) hudCta.addEventListener("click", () => {
    const frontIndex = Math.round(((Math.round(state.rot) % N) + N) % N);
    travelInto(frontIndex);
  });

  document.getElementById("orbitPrev")?.addEventListener("click", () => rotateBy(-1));
  document.getElementById("orbitNext")?.addEventListener("click", () => rotateBy(1));

  gallery.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); rotateBy(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); rotateBy(1); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const frontIndex = Math.round(((Math.round(state.rot) % N) + N) % N);
      travelInto(frontIndex);
    }
  });

  render();
});
