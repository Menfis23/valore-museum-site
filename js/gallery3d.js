// Valore Library virtual gallery engine.
//
// One room per country (data/countries.js) plus the artist spotlight rooms
// (data/artists.js). The room shell is built once and re-dressed on every
// switch: walls re-tinted, artwork and lighting torn down and rebuilt, so
// changing rooms is instant and costs no scene rebuild.
//
// Navigation is deliberately not pointer-lock and not on rails. Drag to
// look, click the floor to walk there, click a piece to be walked up to it.
// Pointer-lock reads as a game; a gallery should feel like a room you are
// standing in.

import * as THREE from 'three';

/* ============================================================
   CONTENT: assembled from the site's own data files
   ============================================================ */
// south_sudan and dr_congo were missing from this list — both are real
// rooms in data/countries.js (window.VALORE_COUNTRIES has 15 country keys
// total; this list only had 13), so those two rooms would have silently
// never appeared anywhere in the gallery. Added back in the same order
// countries.js itself defines them, matching the rest of the site.
const COUNTRY_ORDER = [
  'iraq', 'eritrea', 'south_sudan', 'ethiopia', 'venezuela', 'haiti', 'somalia', 'myanmar',
  'afghanistan', 'bhutan', 'dr_congo', 'nigeria', 'syria', 'ukraine', 'vietnam'
];
const ARTIST_ORDER = ['bahati', 'olgalene'];

// Three neutral wall tones on rotation, so consecutive rooms read as
// different spaces without the gallery turning into a colour wheel.
const WALL_TONES = ['#F2F1EC', '#E9EAE4', '#EFEAE2'];

function titleFromCredit(credit) {
  const quoted = credit.match(/[“"]([^”"]+)[”"]/);
  if (quoted) return quoted[1];
  const beforeDash = credit.split(' · ')[0].trim();
  return beforeDash.replace(/,\s*$/, '');
}
function sourceFromCredit(credit) {
  const parts = credit.split(' \u00b7 ');
  const rest = parts.length > 1 ? parts.slice(1).join(' ').trim() : credit;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function buildRooms() {
  const countries = window.VALORE_COUNTRIES || {};
  const artists = window.VALORE_ARTISTS || {};
  const rooms = [];

  const push = (slug, entry, kind) => {
    if (!entry || !entry.photos || !entry.photos.length) return;
    const sections = (entry.sections || []).map(s => ({
      heading: s.heading && (s.heading.en || s.heading) || '',
      body: s.body && (s.body.en || s.body) || ''
    })).filter(s => s.body);

    rooms.push({
      slug, kind,
      title: entry.name,
      nativeName: entry.nativeName || '',
      eyebrow: entry.tag || entry.region || '',
      region: entry.region || '',
      blurb: entry.blurb || '',
      flag: entry.flag || entry.heroImage || (entry.photos[0] && entry.photos[0].src),
      wall: WALL_TONES[rooms.length % WALL_TONES.length],
      pieces: entry.photos.map((p, i) => ({
        src: p.src,
        title: titleFromCredit(p.credit),
        source: sourceFromCredit(p.credit),
        credit: p.credit,
        // Each piece carries one of the room's exhibition texts, so the
        // reading is the site's real writing rather than invented captions.
        section: sections.length ? sections[i % sections.length] : null
      }))
    });
  };

  ARTIST_ORDER.forEach(s => push(s, artists[s], 'artist'));
  COUNTRY_ORDER.forEach(s => push(s, countries[s], 'country'));
  return rooms;
}

const ROOMS = buildRooms();

/* ============================================================
   SCENE CONSTANTS
   ============================================================ */
const ROOM_W = 15, ROOM_D = 11, ROOM_H = 4.2;
const EYE = 1.62;
const HANG_Y = 1.58;                 // museum standard: centre of the work about 1.55m
const BOUND_X = ROOM_W / 2 - 0.9, BOUND_Z = ROOM_D / 2 - 0.9;
const isCoarse = window.matchMedia('(pointer: coarse)').matches;

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = !isCoarse;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated in this three.js version, falls back to this anyway
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a08);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, EYE, ROOM_D / 2 - 1.8);

const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);
const loadBar = document.getElementById('loadBar');
const loadNote = document.getElementById('loadNote');
manager.onProgress = (_u, loaded, total) => {
  if (loadBar) loadBar.style.width = Math.round((loaded / total) * 100) + '%';
};

/* ============================================================
   SURFACES
   ============================================================ */
const floorTex = texLoader.load('img/textures/floor/diffuse.jpg');
const floorNrm = texLoader.load('img/textures/floor/normal.jpg');
const floorArm = texLoader.load('img/textures/floor/arm.jpg');
[floorTex, floorNrm, floorArm].forEach(t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ROOM_W / 1.9, ROOM_D / 1.9);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
});
floorTex.colorSpace = THREE.SRGBColorSpace;

const wallNrm = texLoader.load('img/textures/wall/normal.jpg');
wallNrm.wrapS = wallNrm.wrapT = THREE.RepeatWrapping;
wallNrm.repeat.set(4, 1.4);

const floorMat = new THREE.MeshStandardMaterial({
  map: floorTex, normalMap: floorNrm, roughnessMap: floorArm, aoMap: floorArm,
  color: 0xb08558, roughness: 0.54, metalness: 0.0
});
// Flat wall colour plus normal relief only. The plaster photo's own beige
// tint fought every room's wall tone.
const wallMat = new THREE.MeshStandardMaterial({
  normalMap: wallNrm, normalScale: new THREE.Vector2(0.35, 0.35),
  color: 0xF2F1EC, roughness: 0.95, metalness: 0.0
});
const ceilMat = new THREE.MeshStandardMaterial({ color: 0xF2F0EB, roughness: 0.96 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1815, roughness: 0.6 });
const railMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.42, metalness: 0.65 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.55, metalness: 0.12 });
const benchTopMat = new THREE.MeshStandardMaterial({ color: 0x3b2c1e, roughness: 0.5 });

const shell = new THREE.Group();
scene.add(shell);
const plane = (w, h, m) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);

const floor = plane(ROOM_W, ROOM_D, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.geometry.setAttribute('uv2', floor.geometry.attributes.uv);
shell.add(floor);

const ceiling = plane(ROOM_W, ROOM_D, ceilMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = ROOM_H;
shell.add(ceiling);

const walls = [];
function addWall(w, x, z, rotY) {
  const m = plane(w, ROOM_H, wallMat.clone());
  m.position.set(x, ROOM_H / 2, z);
  m.rotation.y = rotY;
  m.receiveShadow = true;
  shell.add(m);
  walls.push(m);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.05), trimMat);
  base.position.set(x, 0.07, z); base.rotation.y = rotY; base.translateZ(0.03);
  shell.add(base);
  const reveal = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.04), trimMat);
  reveal.position.set(x, ROOM_H - 0.025, z); reveal.rotation.y = rotY; reveal.translateZ(0.02);
  shell.add(reveal);
}
addWall(ROOM_W, 0, -ROOM_D / 2, 0);
addWall(ROOM_W, 0, ROOM_D / 2, Math.PI);
addWall(ROOM_D, -ROOM_W / 2, 0, Math.PI / 2);
addWall(ROOM_D, ROOM_W / 2, 0, -Math.PI / 2);

const bench = new THREE.Group();
const benchTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.62), benchTopMat);
benchTop.position.y = 0.44; benchTop.castShadow = true; benchTop.receiveShadow = true;
bench.add(benchTop);
[-0.85, 0.85].forEach(x => {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.5), trimMat);
  leg.position.set(x, 0.22, 0);
  bench.add(leg);
});
bench.position.set(0, 0, 1.2);
shell.add(bench);

// ceiling track rails
[{ geo: [ROOM_W - 2, 0.05, 0.05], pos: [0, ROOM_H - 0.06, -ROOM_D / 2 + 1.15] },
 { geo: [0.05, 0.05, ROOM_D - 2], pos: [-ROOM_W / 2 + 1.15, ROOM_H - 0.06, 0] },
 { geo: [0.05, 0.05, ROOM_D - 2], pos: [ROOM_W / 2 - 1.15, ROOM_H - 0.06, 0] }].forEach(r => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...r.geo), railMat);
  m.position.set(...r.pos);
  shell.add(m);
});

/* ambient rig, kept low so the spots do the work */
scene.add(new THREE.HemisphereLight(0xf6f3ec, 0x6b5946, 0.92));
scene.add(new THREE.AmbientLight(0xfff6ea, 0.36));
[[-4.5, -2.5], [4.5, -2.5], [-4.5, 2.5], [4.5, 2.5], [0, 0]].forEach(([x, z]) => {
  const dl = new THREE.PointLight(0xfff4e4, 14, 17, 2);
  dl.position.set(x, ROOM_H - 0.45, z);
  scene.add(dl);
});

/* ============================================================
   ARTWORK
   ============================================================ */
const artGroup = new THREE.Group();
scene.add(artGroup);
let hitMeshes = [];
let placedPieces = [];

const poolTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,215,.9)');
  g.addColorStop(1, 'rgba(255,240,215,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(' ');
  let line = '', lines = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lh; line = w;
      if (++lines >= maxLines) return;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
function labelTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#F7F5F0'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#1D130F'; x.font = '600 34px Archivo, sans-serif';
  wrapText(x, title, 28, 70, 456, 40, 3);
  x.fillStyle = '#7d7267'; x.font = '400 22px Archivo, sans-serif';
  wrapText(x, sub, 28, 190, 456, 28, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Left wall front to back, back wall left to right, right wall back to front
function slotsFor(n) {
  const back = Math.min(4, Math.max(2, Math.ceil(n / 2)));
  const rest = Math.max(0, n - back);
  const left = Math.ceil(rest / 2), right = rest - left;
  const out = [];
  const add = (wall, count) => {
    for (let i = 0; i < count; i++) out.push({ wall, t: count > 1 ? i / (count - 1) : 0.5, count });
  };
  add('left', left); add('back', back); add('right', right);
  return out;
}
function slotTransform(slot) {
  // Fixed 3.1m between centres. Two works on a 15m wall should not sit 6m apart.
  const spread = (slot.count - 1) * 3.1;
  const off = (slot.t - 0.5) * spread;
  if (slot.wall === 'back')
    return { pos: new THREE.Vector3(off, HANG_Y, -ROOM_D / 2 + 0.07), rotY: 0, normal: new THREE.Vector3(0, 0, 1) };
  if (slot.wall === 'left')
    return { pos: new THREE.Vector3(-ROOM_W / 2 + 0.07, HANG_Y, -off), rotY: Math.PI / 2, normal: new THREE.Vector3(1, 0, 0) };
  return { pos: new THREE.Vector3(ROOM_W / 2 - 0.07, HANG_Y, off), rotY: -Math.PI / 2, normal: new THREE.Vector3(-1, 0, 0) };
}

function buildPiece(data, tex, slot, index) {
  const { pos, rotY, normal } = slotTransform(slot);
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = rotY;

  const img = tex.image;
  const aspect = (img && img.width && img.height) ? img.width / img.height : 1;
  let h = 1.42, w = h * aspect;
  if (w > 2.15) { w = 2.15; h = w / aspect; }
  if (h > 1.75) { h = 1.75; w = h * aspect; }

  const B = 0.075, D = 0.07;
  // Frame box sits entirely behind the canvas, front face at z=0 and the
  // artwork a few mm in front, so no face of it can ever occlude the art.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + B * 2, h + B * 2, D), frameMat);
  frame.position.z = -D / 2;
  frame.castShadow = true;
  g.add(frame);

  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 })
  );
  art.position.z = 0.006;
  g.add(art);

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(w + B * 2, h + B * 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.z = 0.05;
  hit.userData.pieceIndex = index;
  g.add(hit);
  hitMeshes.push(hit);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshBasicMaterial({ map: labelTexture(data.title, data.source), toneMapped: false })
  );
  label.position.set(w / 2 + B + 0.24, -h / 2 + 0.08, 0.004);
  g.add(label);
  artGroup.add(g);

  const fixturePos = pos.clone().add(normal.clone().multiplyScalar(1.15)).setY(ROOM_H - 0.22);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.062, 0.15, 12), railMat);
  head.position.copy(fixturePos);
  head.lookAt(pos);
  head.rotateX(Math.PI / 2);
  artGroup.add(head);

  const spot = new THREE.SpotLight(0xfff2e0, 20, 9, Math.PI / 7, 0.75, 1.4);
  spot.position.copy(fixturePos);
  spot.target.position.copy(pos);
  if (!isCoarse) {
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.bias = -0.001;
    spot.shadow.camera.near = 0.4;
    spot.shadow.camera.far = 10;
  }
  artGroup.add(spot, spot.target);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 24),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(pos.x + normal.x * 0.9, 0.012, pos.z + normal.z * 0.9);
  artGroup.add(pool);

  const viewDist = Math.max(1.9, w * 1.35);
  placedPieces.push({
    data, index,
    focusPos: pos.clone().add(normal.clone().multiplyScalar(viewDist)).setY(EYE),
    focusYaw: Math.atan2(-normal.x, -normal.z)
  });
}

/* ============================================================
   ROOM SWITCHING
   ============================================================ */
let currentRoom = -1;
const textureCache = new Map();

function loadTexture(src) {
  if (textureCache.has(src)) return Promise.resolve(textureCache.get(src));
  return new Promise(resolve => {
    texLoader.load(src, t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textureCache.set(src, t);
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

function clearRoom() {
  hitMeshes = [];
  placedPieces = [];
  for (let i = artGroup.children.length - 1; i >= 0; i--) {
    const child = artGroup.children[i];
    artGroup.remove(child);
    child.traverse && child.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      // Artwork textures stay in textureCache for instant re-entry; only the
      // per-piece label canvas is disposed here.
      if (o.material) {
        if (o.material.map && o.material.map.isCanvasTexture && o.material.map !== poolTex) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

let switching = false;
async function showRoom(index, opts = {}) {
  if (switching || index === currentRoom || !ROOMS[index]) return;
  switching = true;
  const room = ROOMS[index];
  currentRoom = index;

  clearRoom();
  walls.forEach(w => w.material.color.set(room.wall));

  const slots = slotsFor(room.pieces.length);
  const texes = await Promise.all(room.pieces.map(p => loadTexture(p.src)));
  texes.forEach((tex, i) => { if (tex) buildPiece(room.pieces[i], tex, slots[i], i); });

  document.getElementById('captionEyebrow').textContent = room.eyebrow;
  document.getElementById('captionTitle').textContent = room.title;
  const nativeEl = document.getElementById('captionNative');
  nativeEl.textContent = room.nativeName && room.nativeName !== room.title ? room.nativeName : '';
  nativeEl.style.display = nativeEl.textContent ? '' : 'none';
  document.getElementById('captionBlurb').textContent = room.blurb;
  document.getElementById('captionCount').textContent =
    room.pieces.length + (room.pieces.length === 1 ? ' work on view' : ' works on view');
  document.getElementById('captionMore').href = 'country.html?c=' + room.slug;
  document.getElementById('roomPosition').textContent = (index + 1) + ' / ' + ROOMS.length;

  document.querySelectorAll('.room-card').forEach((el, i) =>
    el.setAttribute('aria-current', String(i === index)));

  if (!opts.keepUrl) {
    const u = new URL(location.href);
    u.searchParams.set('room', room.slug);
    history.replaceState(null, '', u);
  }
  closePanel();
  resetView(true);
  switching = false;
}

/* ============================================================
   CAMERA
   ============================================================ */
const HOME = { pos: new THREE.Vector3(0, EYE, ROOM_D / 2 - 1.8), yaw: 0, pitch: -0.02 };
let yaw = 0, pitch = -0.02, yawT = 0, pitchT = -0.02;
let glide = null;
const keys = Object.create(null);

const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
function shortestTo(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}
function startGlide(toPos, toYaw, toPitch, dur, ease = 'out') {
  glide = {
    fromPos: camera.position.clone(), toPos: toPos.clone(),
    fromYaw: yawT, toYaw: shortestTo(yawT, toYaw),
    fromPitch: pitchT, toPitch: toPitch, t: 0, dur, ease
  };
}
function resetView(instant = false) {
  if (instant) {
    camera.position.copy(HOME.pos);
    yaw = yawT = HOME.yaw; pitch = pitchT = HOME.pitch;
    glide = null;
  } else startGlide(HOME.pos, HOME.yaw, HOME.pitch, 0.75, 'inout');
}
function focusPiece(i) {
  const p = placedPieces[i];
  if (!p) return;
  startGlide(p.focusPos, p.focusYaw, -0.01, 0.7, 'out');
  openPanel(i);
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let dragging = false, dragged = false, lastX = 0, lastY = 0, downTime = 0;
const setNdc = e => {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
};

renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true; dragged = false;
  lastX = e.clientX; lastY = e.clientY; downTime = performance.now();
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (dragging) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true;
    lastX = e.clientX; lastY = e.clientY;
    if (dragged) {
      glide = null;
      yawT -= dx * 0.0032;
      pitchT = Math.max(-0.55, Math.min(0.42, pitchT - dy * 0.0028));
      hideHint();
    }
  } else {
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    renderer.domElement.style.cursor = ray.intersectObjects(hitMeshes, false)[0] ? 'pointer' : 'grab';
  }
});
renderer.domElement.addEventListener('pointerup', e => {
  const wasDrag = dragged, dt = performance.now() - downTime;
  dragging = false;
  if (renderer.domElement.releasePointerCapture) {
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  if (wasDrag || dt > 500) return;
  setNdc(e);
  ray.setFromCamera(ndc, camera);
  const artHit = ray.intersectObjects(hitMeshes, false)[0];
  if (artHit) { focusPiece(artHit.object.userData.pieceIndex); hideHint(); return; }
  const floorHit = ray.intersectObject(floor, false)[0];
  if (floorHit) {
    const t = floorHit.point.clone();
    t.x = Math.max(-BOUND_X, Math.min(BOUND_X, t.x));
    t.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, t.z));
    t.y = EYE;
    startGlide(t, yawT, pitchT, 0.62, 'inout');
    hideHint();
  }
});
renderer.domElement.addEventListener('wheel', e => {
  const dir = Math.sign(e.deltaY);
  const fwd = new THREE.Vector3(-Math.sin(yawT), 0, -Math.cos(yawT)).multiplyScalar(-dir * 1.1);
  const target = (glide ? glide.toPos.clone() : camera.position.clone()).add(fwd);
  target.x = Math.max(-BOUND_X, Math.min(BOUND_X, target.x));
  target.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, target.z));
  target.y = EYE;
  startGlide(target, yawT, pitchT, 0.35, 'out');
  hideHint();
}, { passive: true });

window.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input, textarea')) return;
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (roomsOpen()) { closeRooms(); return; }
    if (panel.classList.contains('open')) { closePanel(); resetView(); return; }
    resetView();
  }
  if (e.code === 'BracketRight') showRoom((currentRoom + 1) % ROOMS.length);
  if (e.code === 'BracketLeft') showRoom((currentRoom - 1 + ROOMS.length) % ROOMS.length);
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    glide = null; hideHint();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

/* ============================================================
   UI
   ============================================================ */
const roomGrid = document.getElementById('roomGrid');
// ROOMS is artist rooms first, then country rooms (see ARTIST_ORDER/
// COUNTRY_ORDER above) — a group header dropped in whenever r.kind changes
// visually separates the two instead of leaving them as one undifferentiated
// grid, so it's immediately clear which cards are artist spotlights and
// which are countries.
let lastRoomKind = null;
ROOMS.forEach((r, i) => {
  if (r.kind !== lastRoomKind) {
    const h = document.createElement('div');
    h.className = 'room-group-header';
    h.textContent = r.kind === 'artist' ? 'Artist spotlights' : 'Countries';
    roomGrid.appendChild(h);
    lastRoomKind = r.kind;
  }
  const b = document.createElement('button');
  b.className = 'room-card';
  b.type = 'button';
  b.dataset.name = (r.title + ' ' + r.region + ' ' + r.eyebrow).toLowerCase();
  b.innerHTML =
    '<img src="' + r.flag + '" alt="" loading="lazy">' +
    '<span class="rc-name">' + r.title + '</span>' +
    '<span class="rc-meta">' + (r.kind === 'artist' ? 'Artist Spotlight' : r.region) +
    ' · ' + r.pieces.length + '</span>';
  b.addEventListener('click', () => { showRoom(i); closeRooms(); });
  roomGrid.appendChild(b);
});

const roomsSheet = document.getElementById('roomsSheet');
const roomsOpen = () => roomsSheet.classList.contains('open');
function openRooms() {
  roomsSheet.classList.add('open');
  roomsSheet.setAttribute('aria-hidden', 'false');
  const s = document.getElementById('roomSearch');
  s.value = ''; filterRooms('');
  setTimeout(() => { if (!isCoarse) s.focus(); }, 60);
}
function closeRooms() {
  roomsSheet.classList.remove('open');
  roomsSheet.setAttribute('aria-hidden', 'true');
}
function filterRooms(q) {
  const term = q.trim().toLowerCase();
  let header = null, headerHasVisible = false;
  [...roomGrid.children].forEach(el => {
    if (el.classList.contains('room-group-header')) {
      if (header) header.style.display = headerHasVisible ? '' : 'none';
      header = el; headerHasVisible = false;
      return;
    }
    const match = !term || el.dataset.name.includes(term);
    el.style.display = match ? '' : 'none';
    if (match) headerHasVisible = true;
  });
  if (header) header.style.display = headerHasVisible ? '' : 'none';
}
document.getElementById('roomsBtn').addEventListener('click', () => roomsOpen() ? closeRooms() : openRooms());
document.getElementById('roomsClose').addEventListener('click', closeRooms);
document.getElementById('roomSearch').addEventListener('input', e => filterRooms(e.target.value));
document.getElementById('prevRoom').addEventListener('click', () => showRoom((currentRoom - 1 + ROOMS.length) % ROOMS.length));
document.getElementById('nextRoom').addEventListener('click', () => showRoom((currentRoom + 1) % ROOMS.length));

const panel = document.getElementById('panel');
let openIndex = -1;
function openPanel(i) {
  const p = placedPieces[i];
  if (!p) return;
  openIndex = i;
  const room = ROOMS[currentRoom];
  document.getElementById('panelLabel').textContent = room.title + ' · ' + (i + 1) + ' of ' + placedPieces.length;
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
function closePanel() {
  openIndex = -1;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.getElementById('roomCaption').classList.remove('hidden');
}
document.getElementById('panelClose').addEventListener('click', () => { closePanel(); resetView(); });
document.getElementById('prevPiece').addEventListener('click', () => {
  if (placedPieces.length) focusPiece((openIndex - 1 + placedPieces.length) % placedPieces.length);
});
document.getElementById('nextPiece').addEventListener('click', () => {
  if (placedPieces.length) focusPiece((openIndex + 1) % placedPieces.length);
});
document.getElementById('resetBtn').addEventListener('click', () => { closePanel(); resetView(); });
const fsBtn = document.getElementById('fsBtn');
// iOS Safari has no reliable Fullscreen API for arbitrary elements — a button
// that silently does nothing is worse than no button, especially on mobile.
if (!document.fullscreenEnabled) {
  fsBtn.hidden = true;
} else {
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
}

const hintEl = document.getElementById('hint');
let hintTimer = setTimeout(hideHint, 9000);
function hideHint() { hintEl.classList.add('faded'); clearTimeout(hintTimer); }

/* ============================================================
   I18N — entry overlay + hint bar. One language per data/i18n/<code>.json;
   adding a language is just dropping another file here and listing its
   code below. Covers English plus the native language of every country
   and artist room currently in the gallery (ar/ti/am/ht/so/my/prs/ne/sw/yo/
   uk/vi), plus fr as a general-reach option.
   Section 7 (full site translation) will build on this same loader.
   ============================================================ */
const SUPPORTED_LANGS = ['en', 'fr', 'es', 'ar', 'ti', 'am', 'ht', 'so', 'my', 'prs', 'ne', 'sw', 'yo', 'uk', 'vi'];
const i18nCache = new Map();
let uiStrings = null;

function detectDefaultLang() {
  const saved = localStorage.getItem('valoreLang');
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGS.includes(nav) ? nav : 'en';
}
async function loadLang(lang) {
  if (i18nCache.has(lang)) return i18nCache.get(lang);
  const data = await fetch(`data/i18n/${lang}.json`).then(r => r.json());
  i18nCache.set(lang, data);
  return data;
}
// Two switcher instances share this same state: one on the entry overlay,
// one a persistent HUD button inside the museum itself (Section 6 asked for
// both). "Translate" as the button's own label, in the current language,
// reads as an action a first-time visitor recognizes on sight — showing
// just the current language name doesn't obviously say "tap to change it."
const SWITCHERS = [
  { btn: 'langSwitchBtn', label: 'langSwitchLabel', menu: 'langMenu' },
  { btn: 'hudLangBtn', label: 'hudLangLabel', menu: 'hudLangMenu' },
];

function applyUiStrings() {
  const s = uiStrings;
  document.getElementById('ovEyebrow').textContent = s['entry.eyebrow'];
  document.getElementById('ovTitle').textContent = s['entry.title'];
  document.getElementById('ovDesc').textContent = s['entry.desc'];
  document.getElementById('ovHowtoLabel').textContent = s['entry.howto.label'];
  document.getElementById('ovHowtoText').textContent = isCoarse ? s['entry.howto.mobile'] : s['entry.howto.desktop'];
  document.getElementById('ovEnterLabel').textContent = s['entry.enter'];
  hintEl.innerHTML = isCoarse ? s['hint.mobile'] : s['hint.desktop'];
  if (enterBtn.classList.contains('ready')) {
    document.getElementById('loadNote').textContent = ROOMS.length + ' ' + s['entry.roomsReady'];
  } else {
    document.getElementById('loadNote').textContent = s['entry.loading'];
  }
  SWITCHERS.forEach(({ btn, label }) => {
    document.getElementById(label).textContent = s['lang.translate'];
    document.getElementById(btn).title = s['lang.switch'];
  });
}
async function setLang(lang, opts = {}) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'en';
  uiStrings = await loadLang(lang);
  if (opts.save !== false) localStorage.setItem('valoreLang', lang);
  applyUiStrings();
  document.querySelectorAll('.lang-menu button').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.lang === lang)));
}

function closeLangMenu(menuEl, btnEl) {
  menuEl.classList.remove('open');
  btnEl.setAttribute('aria-expanded', 'false');
}
SWITCHERS.forEach(({ btn, menu }) => {
  const btnEl = document.getElementById(btn);
  const menuEl = document.getElementById(menu);
  (async () => {
    for (const lang of SUPPORTED_LANGS) {
      const data = await loadLang(lang);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = lang;
      b.setAttribute('role', 'menuitem');
      b.textContent = data.langName;
      b.addEventListener('click', () => { setLang(lang); closeLangMenu(menuEl, btnEl); });
      menuEl.appendChild(b);
    }
  })();
  btnEl.addEventListener('click', () => {
    const open = menuEl.classList.toggle('open');
    btnEl.setAttribute('aria-expanded', String(open));
    // Only one menu open at a time.
    SWITCHERS.forEach(other => {
      if (other.menu !== menu) closeLangMenu(document.getElementById(other.menu), document.getElementById(other.btn));
    });
  });
  document.addEventListener('click', (e) => {
    if (!menuEl.contains(e.target) && !btnEl.contains(e.target)) closeLangMenu(menuEl, btnEl);
  });
});
setLang(detectDefaultLang(), { save: false });

/* ============================================================
   LOOP
   ============================================================ */
// Tunables (see the end-of-project constants list for the full set).
const WALK_SPEED = 4.2;    // m/s, base walk speed
const SPRINT_MULT = 1.9;   // multiplier on WALK_SPEED while Shift is held
const WALK_ACCEL = 26;     // m/s^2, how fast velocity ramps up toward target speed
const WALK_FRICTION = 18;  // m/s^2, how fast velocity decays to zero with no input
const LOOK_DAMPING = 0.0008; // lower = snappier, higher = smoother/laggier (drag-to-look catch-up)

const clock = new THREE.Clock();
const walkVel = new THREE.Vector3();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());

  if (glide) {
    glide.t += dt;
    const raw = Math.min(glide.t / glide.dur, 1);
    const p = glide.ease === 'inout' ? easeInOut(raw) : easeOutCubic(raw);
    camera.position.lerpVectors(glide.fromPos, glide.toPos, p);
    yawT = yaw = THREE.MathUtils.lerp(glide.fromYaw, glide.toYaw, p);
    pitchT = pitch = THREE.MathUtils.lerp(glide.fromPitch, glide.toPitch, p);
    if (raw >= 1) glide = null;
  } else {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const want = new THREE.Vector3();
    if (keys.KeyW || keys.ArrowUp) want.add(fwd);
    if (keys.KeyS || keys.ArrowDown) want.sub(fwd);
    if (keys.KeyD || keys.ArrowRight) want.add(right);
    if (keys.KeyA || keys.ArrowLeft) want.sub(right);
    const sprinting = keys.ShiftLeft || keys.ShiftRight;
    const targetSpeed = WALK_SPEED * (sprinting ? SPRINT_MULT : 1);

    if (want.lengthSq() > 0) {
      want.normalize().multiplyScalar(targetSpeed);
      const diff = want.sub(walkVel);
      const maxStep = WALK_ACCEL * dt;
      if (diff.length() > maxStep) diff.setLength(maxStep);
      walkVel.add(diff);
    } else {
      const speed = walkVel.length();
      if (speed > 0) walkVel.multiplyScalar(Math.max(0, speed - WALK_FRICTION * dt) / speed);
    }

    camera.position.addScaledVector(walkVel, dt);
    camera.position.x = Math.max(-BOUND_X, Math.min(BOUND_X, camera.position.x));
    camera.position.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, camera.position.z));
    camera.position.y = EYE;
  }

  // Damping is high on purpose. A low factor sounds smoother but makes the
  // view trail the cursor, which reads as lag rather than smoothness.
  const k = 1 - Math.pow(LOOK_DAMPING, dt);
  yaw += (yawT - yaw) * k;
  pitch += (pitchT - pitch) * k;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================
   BOOT
   ============================================================ */
const overlay = document.getElementById('overlay');
const enterBtn = document.getElementById('enterBtn');

(async function boot() {
  const want = new URLSearchParams(location.search).get('room');
  const startIdx = Math.max(0, ROOMS.findIndex(r => r.slug === want));
  await showRoom(startIdx);
  requestAnimationFrame(tick);
  if (loadBar) loadBar.style.width = '100%';
  enterBtn.classList.add('ready');
  document.getElementById('overlayRoom').textContent = ROOMS[startIdx].title;
  // "rooms ready" text is language-dependent; re-run the same string
  // application boot() would otherwise duplicate a hardcoded English copy of.
  if (uiStrings) applyUiStrings();
})();

enterBtn.addEventListener('click', () => {
  // Fullscreen must be requested from inside a direct user-gesture handler
  // (a click) or the browser silently ignores it — this is that gesture.
  // iOS Safari has no Fullscreen API for arbitrary elements at all (see the
  // fsBtn setup above), and some browsers/embeds reject the *call itself*
  // (a synchronous throw, not just a rejected promise) rather than just
  // failing quietly — try/catch around the call, not just .catch() on its
  // result, so a fullscreen failure can never take the rest of "Enter" down
  // with it.
  try {
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (_) {}
  overlay.classList.add('gone');
  setTimeout(() => { overlay.style.display = 'none'; }, 280);
  renderer.domElement.style.cursor = 'grab';
});

window.__gal = { scene, camera, renderer, ROOMS, showRoom, get room() { return currentRoom; } };
