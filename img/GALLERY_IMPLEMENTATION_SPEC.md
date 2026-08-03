# Valore Library — Gallery Room Implementation Spec

**Goal:** Port the look and feel of the approved reference build (`valore_gallery_room.html`) into the real museum in `js/museum-room.js`, without breaking the existing per-country room system.

**Read the reference file first.** It is a complete, working, single-file Three.js scene. Every technique below is already implemented there — copy the patterns, don't reinvent them. Where this spec and the reference file disagree, the reference file wins.

---

## Hard requirements

1. **Do not stretch or crop any artwork.** Frames are sized *from* each image's aspect ratio, never the reverse. See §3.
2. **Do not change existing room/country data structures** unless a change is required to store image aspect ratios. If it is, say so before doing it.
3. **Keep the frame budget.** Target 60fps. If a technique below costs more than ~3ms/frame, flag it instead of shipping it.
4. **No `THREE.Sprite` for anything mounted to a wall.** Sprites billboard to the camera; that's the sign-rotation bug. Wall-mounted = `PlaneGeometry` mesh with a fixed `rotation.y`. Sprites are only acceptable for light glows, which *should* face the camera.

---

## 1. Renderer setup

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.outputEncoding = THREE.sRGBEncoding;

scene.fog = new THREE.FogExp2(0x121010, 0.011);
```

`physicallyCorrectLights = true` changes what light intensity numbers mean — they become real-world falloff units. Every existing light intensity in the project will need re-tuning after this flips on. Expect values in the 10–100 range for point/spot lights, not 0.5–2. Do this rescale in one pass, not piecemeal.

Also required: every color texture (`map`, placards, artwork) must be `tex.encoding = THREE.sRGBEncoding`. Data textures (`roughnessMap`, `normalMap`) must **not** be. Getting this backwards is the single most common cause of a scene looking washed out or muddy.

---

## 2. Lighting rig

Three layers. All three are needed; the look breaks if any one is missing.

| Layer | Purpose | Reference values |
|---|---|---|
| Per-artwork spotlights | The pools of light that carry the whole look | `SpotLight(0xfff0d8, 105, 12, Math.PI/6.2, 0.85, 1.5)`, one per painting, aimed at its center |
| Centre downlights | Lifts the room so it isn't a dark void | 5× `PointLight(0xffe4bd, 26, 11, 2)` down the room's centreline at `CEIL_H - 0.6` |
| Wall wash + ambient | Keeps walls glowing between paintings | `PointLight(0xffdfb4, 9, 6.5, 2)` low on each wall, plus `HemisphereLight(0x6b5c48, 0x2c2218, 0.75)` and `AmbientLight(0xfff2dd, 0.28)` |

Shadow settings per spotlight:
```js
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.radius = 4;
spot.shadow.bias = -0.0008;
spot.shadow.camera.near = 0.5;
spot.shadow.camera.far = 13;
```

**Performance guard:** 1024px shadow maps on every spotlight in every room will not hold 60fps across 15+ countries. Only the current room's spotlights should have `castShadow = true`. Disable shadow casting on rooms the visitor isn't in.

---

## 3. Artwork sizing — the no-stretch rule

This is the part to get exactly right.

```js
const MAX_H = 1.40, MAX_W = 1.75;
let h = MAX_H, w = h * item.aspect;      // aspect = imageWidth / imageHeight
if (w > MAX_W) { w = MAX_W; h = w / item.aspect; }
```

The plane geometry is then built at `(w, h)` — the image fills it exactly, so there is no distortion and nothing gets cut off. Matting and frame grow *outward* from those numbers by fixed padding, which keeps the border even on all four sides:

```js
const mattPad = 0.12, framePad = 0.06;
const fw = w + (mattPad + framePad) * 2;
const fh = h + (mattPad + framePad) * 2;
```

**You need each image's real aspect ratio before you can place it.** Two options:

- **Preferred:** precompute aspect ratios into the room data at build time, so layout is deterministic and nothing shifts after load.
- **Fallback:** read `texture.image.width / texture.image.height` in the `TextureLoader` callback and size the frame there. This works but means frames pop into their final size after load — acceptable only if there's a placeholder.

Do not guess aspect ratios or assume all images are 4:3.

### Frame construction (four layers, back to front)

| Layer | Geometry | Notes |
|---|---|---|
| Frame | `BoxGeometry(fw, fh, 0.07)` | A **box**, not a plane — it needs depth to cast a real shadow |
| Matting | `PlaneGeometry(w + mattPad*2, h + mattPad*2)` | Off-white, `roughness: 0.95` |
| Painting | `PlaneGeometry(w, h)` | `roughness: 0.72`, sRGB encoding, max anisotropy |
| Glass | `PlaneGeometry(fw - 0.05, fh - 0.05)` | `opacity: 0.06`, `roughness: 0.05`, uses the env map |

Offset each layer ~0.02 along the wall normal so they don't z-fight.

---

## 4. Materials

**Floor** — glossy warm hardwood. The critical detail is the **roughness map**: a flat `roughness` value makes it look like plastic. Real varnish wears unevenly.
```js
new THREE.MeshStandardMaterial({
  map: woodTex, roughnessMap: floorRoughnessTex,
  roughness: 0.34, metalness: 0.0,
  envMap: cubeRT.texture, envMapIntensity: 1.3
});
```

**Walls** — cream, `roughness: 0.94`, with a generated texture carrying (a) faint paint mottling and (b) a **baked ambient-occlusion gradient** darkening the top and bottom edges. Flat-colored walls are an instant CG tell.

**Ceiling** — near-black (`0x0e0e10`), `roughness: 0.95`. It should recede into shadow, not read as a surface.

**Environment map** — bake **once** at startup with a `CubeCamera`, then reuse. This is what makes the floor actually reflect the room.
```js
floor.visible = false;              // don't reflect the floor into its own map
cubeCam.position.set(0, 1.6, 0);
cubeCam.update(renderer, scene);
floor.visible = true;
```
Do **not** update this per frame. The scene is static; one bake is correct and costs nothing at runtime.

---

## 5. Architectural detail

Missing trim is one of the loudest "this is CG" signals. All three are cheap:

- **Baseboards:** `BoxGeometry(0.06, 0.16, ROOM_D)` in off-white along both walls at floor level.
- **Ceiling reveal:** a dark strip where the cream wall meets the black ceiling.
- **Contact shadows:** a thin gradient-textured plane laid flat in the wall/floor corner, `transparent: true, depthWrite: false`. Fakes corner ambient occlusion for essentially free.

---

## 6. Atmosphere

- **Volumetric cones:** an open `ConeGeometry` from each fixture to its painting, `opacity: 0.028`, `AdditiveBlending`, `depthWrite: false`, `DoubleSide`.
- **Dust motes:** ~240 `Points`, additive, drifting slowly upward and recycling at the ceiling.

Both are subtle by design. If they're obvious, they're too strong.

---

## 7. Post-processing — do this in CSS, not WebGL

Vignette and film grain are **CSS overlay divs**, not an `EffectComposer` pass. They cost zero render passes, which matters given the existing performance problem.

```css
#vignette {
  position: fixed; inset: 0; pointer-events: none; z-index: 5;
  background: radial-gradient(ellipse at center,
    rgba(0,0,0,0) 50%, rgba(0,0,0,0.20) 82%, rgba(0,0,0,0.44) 100%);
  mix-blend-mode: multiply;
}
```

Grain is an inline SVG `feTurbulence` background at `opacity: 0.04`, animated with a 3-step transform shift. **Must respect `prefers-reduced-motion`.**

---

## 8. Camera

Subtle head-bob while walking, faint breathing sway at rest:
```js
if (moving) bobPhase += 0.16;
const bobY = moving ? Math.sin(bobPhase) * 0.022 : Math.sin(t * 1.1) * 0.005;
const bobX = moving ? Math.cos(bobPhase * 0.5) * 0.012 : 0;
```

Keep the amplitude this small. A perfectly rigid camera reads as CG; an obvious bob reads as a video game. Both are wrong.

---

## 9. Performance work this depends on

The realism above will make the existing slowness worse unless these land alongside it. Prioritise in this order:

1. **Room streaming.** `enterGallery()` currently builds all 15+ rooms synchronously. Load only the current room and its immediate neighbours; unload or pause the rest. This is the largest single win.
2. **Shadow scoping.** `castShadow = true` only on the active room's lights (see §2).
3. **Texture compression.** KTX2/Basis, capped at 1K–2K for wall surfaces. At walking distance the difference is invisible; the load-time and GPU-memory difference is not.
4. **Static geometry merging.** Merge walls, trim, and floor pieces per room with `BufferGeometryUtils.mergeGeometries()` to cut draw calls.

---

## Order of work

Do these as separate, individually verifiable steps. Do not batch them.

1. Renderer settings + color encoding audit (§1) — verify the scene still looks correct before continuing
2. Rescale all existing light intensities for `physicallyCorrectLights` (§2)
3. Replace wall-mounted sprites with fixed-rotation plane meshes (§3, hard requirement 4)
4. Artwork aspect-ratio sizing (§3)
5. Materials and env map bake (§4)
6. Trim and contact shadows (§5)
7. Room streaming and shadow scoping (§9.1, §9.2)
8. Atmosphere and post-processing (§6, §7)
9. Camera bob (§8)

## Verification

After each step, load a room and confirm:

- No painting is stretched, squashed, or cropped — check the landscape-format piece specifically, since that's where a preset-box bug would show
- Signs and placards hold their orientation when you walk past and look back from a grazing angle
- Frame rate is at or above where it started

If a step makes the frame rate worse and can't be fixed within its own scope, stop and report it rather than continuing to the next step.
