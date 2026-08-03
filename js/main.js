// Shared behavior across all Valore Library pages: nav active state + GSAP scroll reveals.

document.addEventListener("DOMContentLoaded", () => {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href").split("?")[0];
    if (href === here) link.classList.add("active");
  });

  const reveals = document.querySelectorAll(".reveal");
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    reveals.forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 85%" }
      });
    });
  } else if ("IntersectionObserver" in window) {
    // Fallback if GSAP fails to load (e.g. offline) — plain CSS class toggle.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  initDiscoverMarquee();
  initLightbox();
});

// Homepage-only: build a continuously sliding strip of real photography drawn
// from every country's `photos` array, interleaved so it isn't one country
// at a time. Doubled so the CSS loop (translateX -50%) is seamless.
function initDiscoverMarquee() {
  const track = document.getElementById("discoverTrack");
  if (!track || !window.VALORE_COUNTRIES) return;

  const byCountry = Object.entries(window.VALORE_COUNTRIES).map(([slug, c]) => ({
    slug, name: c.name, photos: c.photos || [],
  }));
  const interleaved = [];
  const maxLen = Math.max(0, ...byCountry.map((c) => c.photos.length));
  for (let i = 0; i < maxLen; i++) {
    byCountry.forEach((c) => { if (c.photos[i]) interleaved.push({ ...c.photos[i], slug: c.slug, name: c.name }); });
  }
  if (!interleaved.length) return;

  const sizeCycle = ["", "size-tall", "size-short"];
  const tileHtml = (p, i) => `
    <a class="discover-tile glow-frame-hover ${sizeCycle[i % sizeCycle.length]}" href="country.html?c=${p.slug}" title="${p.credit}">
      <img src="${p.src}" alt="${p.name}" loading="lazy">
      <span class="discover-tile-label">${p.name}</span>
    </a>`;

  track.innerHTML = interleaved.map(tileHtml).join("") + interleaved.map(tileHtml).join("");

  requestAnimationFrame(() => {
    const pxPerSecond = 40;
    const duration = Math.max(20, (track.scrollWidth / 2) / pxPerSecond);
    track.style.setProperty("--discover-duration", `${duration}s`);
  });
}

// Click any .photo-strip or .country-float-gallery image to view it full-size
// with its credit.
function initLightbox() {
  if (!document.querySelector(".photo-strip, .country-float-gallery")) return;

  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close">&times;</button>
    <div class="glow-frame">
      <img src="" alt="">
      <div class="lightbox-caption"></div>
    </div>`;
  document.body.appendChild(overlay);
  const imgEl = overlay.querySelector("img");
  const captionEl = overlay.querySelector(".lightbox-caption");

  function open(src, alt, caption) {
    imgEl.src = src;
    imgEl.alt = alt;
    captionEl.textContent = caption || "";
    overlay.classList.add("open");
  }
  function close() { overlay.classList.remove("open"); }

  document.addEventListener("click", (e) => {
    const img = e.target.closest(".photo-strip img, .country-float-gallery img");
    if (!img) return;
    const caption = img.closest("figure")?.querySelector("figcaption")?.textContent || "";
    open(img.src, img.alt, caption);
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".lightbox-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
