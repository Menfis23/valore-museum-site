// Rotating 3D globe for the Explore page — replaces the old flat Leaflet map.
// Plain Three.js (global build via CDN, no bundler), reusing the same
// world-country GeoJSON outline already used by the flat map so both the
// globe's texture and the country markers share one accurate, dependency-free
// data source rather than an external Earth-photo texture.
//
// Technique: the GeoJSON country polygons are drawn once onto an offscreen
// 2D canvas using a simple equirectangular projection (same terracotta land /
// ink ocean palette as the old map), and that canvas becomes a Three.js
// texture wrapped around a sphere. Each country gets a glowing sprite marker
// placed at its real lat/lon on the sphere surface — sprites always face the
// camera, which makes click/hover raycasting simple and reliable.
window.ValoreGlobe = (function () {
  const WORLD_GEOJSON_URL = "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json";
  const TEX_W = 2048, TEX_H = 1024;
  const OCEAN = "#1D130F";
  const LAND = "#4A3527";
  const BORDER = "rgba(185,139,62,.55)";
  const RADIUS = 1;

  function project(lon, lat) {
    return [((lon + 180) / 360) * TEX_W, ((90 - lat) / 180) * TEX_H];
  }

  function drawPolygon(ctx, rings) {
    ctx.beginPath();
    rings.forEach((ring) => {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    });
    ctx.fill();
    ctx.stroke();
  }

  function buildMapTexture(geojson) {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = LAND;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1.25;
    (geojson.features || []).forEach((f) => {
      const g = f.geometry;
      if (!g) return;
      if (g.type === "Polygon") drawPolygon(ctx, g.coordinates);
      else if (g.type === "MultiPolygon") g.coordinates.forEach((poly) => drawPolygon(ctx, poly));
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  function latLonToVector3(lat, lon, radius) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function makeDotTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  // container: DOM element to mount the canvas in.
  // countries: window.VALORE_COUNTRIES-shaped object.
  // accents: { slug: "#hexcolor" } marker tint per country.
  // onEnter(slug, screenRect): called on a confirmed marker click.
  // onHover(slug|null): called as the hovered marker changes.
  // externalDrag: when true, this module skips its own drag-to-rotate and
  // idle auto-rotate (an outer caller — the ring gallery — owns rotation of
  // the whole scene instead, so the globe and the ring around it turn as one
  // unit). Hover/click raycasting on the markers still works as normal.
  function init({ container, countries, accents, onEnter, onHover, externalDrag = false, cameraDistance = 2.7 }) {
    if (!window.THREE || !container) return null;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, cameraDistance);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x1d130f, 1);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xfff2df, 0.85));
    const sun = new THREE.DirectionalLight(0xfff2df, 0.9);
    sun.position.set(3, 2, 4);
    scene.add(sun);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const sphereGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
    const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 1 });
    const sphere = new THREE.Mesh(sphereGeo, placeholderMat);
    globeGroup.add(sphere);

    // A faint outer shell for a soft atmosphere-glow read, in the site's saffron accent.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.03, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xb8791a, transparent: true, opacity: 0.06, side: THREE.BackSide })
    );
    globeGroup.add(glow);

    fetch(WORLD_GEOJSON_URL)
      .then((res) => res.json())
      .then((geojson) => {
        sphere.material.map = buildMapTexture(geojson);
        sphere.material.color.set(0xffffff);
        sphere.material.needsUpdate = true;
      })
      .catch(() => { /* markers still work with the placeholder-colored sphere */ });

    const dotTexture = makeDotTexture();
    const markers = [];
    Object.entries(countries).forEach(([slug, c]) => {
      const color = accents[slug] || "#E3A430";
      const mat = new THREE.SpriteMaterial({ map: dotTexture, color, transparent: true, depthTest: true });
      const sprite = new THREE.Sprite(mat);
      const pos = latLonToVector3(c.lat, c.lon, RADIUS * 1.015);
      sprite.position.copy(pos);
      sprite.scale.set(0.09, 0.09, 1);
      sprite.userData = { slug, baseScale: 0.09, phase: Math.random() * Math.PI * 2 };
      globeGroup.add(sprite);
      markers.push(sprite);
    });

    // ---- interaction: drag-to-rotate, click/hover raycast on markers ----
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let dragging = false, moved = 0, lastX = 0, lastY = 0;
    let autoRotate = !prefersReducedMotion && !externalDrag;
    let idleTimer = null;
    let hovered = null;

    function resumeAutoRotateLater() {
      if (externalDrag) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { autoRotate = !prefersReducedMotion; }, 2600);
    }

    function setPointerFromEvent(e) {
      const rect = container.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function screenRectFor(sprite) {
      const pos = sprite.position.clone().applyMatrix4(globeGroup.matrixWorld);
      pos.project(camera);
      const rect = container.getBoundingClientRect();
      const x = rect.left + ((pos.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - pos.y) / 2) * rect.height;
      const size = 18;
      return { x: x - size / 2, y: y - size / 2, w: size, h: size };
    }

    function facingCamera(sprite) {
      // Hide/ignore markers currently on the far side of the globe.
      const worldPos = sprite.position.clone().applyMatrix4(globeGroup.matrixWorld);
      const toCam = camera.position.clone().sub(worldPos).normalize();
      const outward = worldPos.clone().normalize();
      return toCam.dot(outward) > 0.05;
    }

    renderer.domElement.style.cursor = externalDrag ? "pointer" : "grab";
    renderer.domElement.addEventListener("pointerdown", (e) => {
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      if (!externalDrag) autoRotate = false;
      clearTimeout(idleTimer);
      if (!externalDrag) renderer.domElement.style.cursor = "grabbing";
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
    });
    renderer.domElement.addEventListener("pointermove", (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (!externalDrag) {
          globeGroup.rotation.y += dx * 0.005;
          globeGroup.rotation.x = Math.max(-1.1, Math.min(1.1, globeGroup.rotation.x + dy * 0.005));
        }
        lastX = e.clientX; lastY = e.clientY;
        return;
      }
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const visible = markers.filter(facingCamera);
      const hits = raycaster.intersectObjects(visible);
      const slug = hits.length ? hits[0].object.userData.slug : null;
      if (slug !== hovered) {
        hovered = slug;
        renderer.domElement.style.cursor = slug ? "pointer" : "grab";
        onHover && onHover(slug, slug ? screenRectFor(hits[0].object) : null);
      }
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      if (!externalDrag) renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
      resumeAutoRotateLater();
      if (moved < 6) {
        // Treat as a click/tap.
        setPointerFromEvent(e);
        raycaster.setFromCamera(pointerNdc, camera);
        const visible = markers.filter(facingCamera);
        const hits = raycaster.intersectObjects(visible);
        if (hits.length) {
          const sprite = hits[0].object;
          onEnter && onEnter(sprite.userData.slug, screenRectFor(sprite));
        }
      }
    }
    renderer.domElement.addEventListener("pointerup", endDrag);
    renderer.domElement.addEventListener("pointercancel", endDrag);
    renderer.domElement.addEventListener("pointerleave", () => {
      if (hovered) {
        hovered = null; onHover && onHover(null, null);
        renderer.domElement.style.cursor = externalDrag ? "pointer" : "grab";
      }
    });

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", resize);

    let t = 0;
    function tick() {
      t += 0.016;
      if (autoRotate) globeGroup.rotation.y += 0.0018;
      if (!prefersReducedMotion) {
        markers.forEach((m) => {
          const s = m.userData.baseScale * (1 + 0.14 * Math.sin(t * 1.6 + m.userData.phase));
          const boost = m.userData.slug === hovered ? 1.5 : 1;
          m.scale.set(s * boost, s * boost, 1);
        });
      }
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();

    return { renderer, scene, camera, globeGroup };
  }

  return { init };
})();
