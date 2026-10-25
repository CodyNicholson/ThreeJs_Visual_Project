# Three.js Visual Lab

An interactive, explained tour of **every major Three.js feature**: 31 demos in 8 categories, from
the first scene to WebGPU and memory management. Three.js runs in the browser, so this lab has no
backend: every button runs **real Three.js r186 code in the visitor's page**, renders into a small
off-screen WebGL canvas, **reads the pixels back from the GPU** and checks its own result. The lab
also shows how *not* to use Three.js: 99 feature pitfalls, 8 anti-patterns and 8 general errors,
with 36 "Do it wrong" buttons that reproduce the genuine failure (the real error text, or the wrong
pixels) and then the fix.

## What each page shows

- **Overview & getting started** (`#overview`): what Three.js is, the mental model, version facts,
  a typed-out "create a project" walkthrough (Vite, first scene, import maps, loading a model), pros,
  cons, when to use it and when not to, how *not* to use it, alternatives, and a map of every demo.
- **One page per feature**, top to bottom:
  1. *How it works*: plain-language explanation, key APIs, real-world uses.
  2. *How the call flows through Three.js*: an animated diagram (your code → loaders → scene graph →
     renderer → GPU → canvas) with a numbered step list.
  3. *Controls*: inputs, **Run it**, and **Do it wrong** buttons.
  4. *Visual*: a **live, orbitable Three.js view** of the feature (rebuilt with the parameters of each
     run), plus the run's measurements: pixel readbacks from the GPU, bars, charts, stat tiles.
  5. *The code*: the few lines that matter, with a copy button.
  6. *Common mistakes and how to fix them*: mistake, exact symptom, why, fix, how to avoid it,
     Don't/Do code, and a "Reproduce it for real" button where one exists.
  7. *Result*: the Three.js calls made (typed out with timings) and the self-checks.
- **Mistakes, errors & fixes** (`#pitfalls`): everything above in one searchable page; paste an error
  message into the search box.
- **Run all demos** (`#suite`): runs every demo's self-test in your browser and marks each ✓/✗.

## Quick start

```bash
docker network create tunnel-net   # once; the compose file joins this external network
docker compose up -d --build
# open http://localhost:3000
```

A browser with WebGL 2 is needed for the GPU demos (every current desktop and mobile browser). The
WebGPU page falls back to WebGL 2 automatically when WebGPU is not available.

| Service | Port | What it is |
|---|---|---|
| frontend | 127.0.0.1:3000 → 80 | unprivileged nginx serving the Vite build; the whole lab runs in the page |

## Feature coverage

| Area | Demo | Features / APIs |
|---|---|---|
| Fundamentals | Scene, camera & renderer | `Scene`, `PerspectiveCamera`, `WebGLRenderer`, `Mesh`, `setAnimationLoop`, `renderer.info` |
| | Scene graph & transforms | `Object3D.add`, `Group` pivots, `getWorldPosition`, `updateMatrixWorld`, `traverse` |
| | Perspective vs orthographic | `PerspectiveCamera`, `OrthographicCamera`, `project()`, `setViewport` / `setScissor`, near/far |
| | Resizing & pixel ratio | `setSize`, `setPixelRatio`, drawing buffer vs CSS size, `aspect` + `updateProjectionMatrix` |
| | Vectors, matrices & quaternions | `Vector3`, `Euler` orders, `Quaternion.slerp`, `Matrix4.compose/decompose`, `lookAt`, radians |
| Geometry | Built-in geometries | Box, Sphere, Cylinder, Cone, Torus, TorusKnot, Icosahedron, Capsule, `WireframeGeometry` |
| | Custom BufferGeometry | typed arrays, `setAttribute`, `setIndex`, `needsUpdate`, `computeVertexNormals`, bounding spheres |
| | Lines, points & wide lines | `Points`, `sizeAttenuation`, `Line`, `EdgesGeometry`, `Line2` + `LineMaterial` |
| | Shapes, extrusion & curves | `Shape` + holes, `ExtrudeGeometry`, `LatheGeometry`, `CatmullRomCurve3`, `TubeGeometry`, `getPointAt` |
| Materials & textures | Material types | Basic, Lambert, Phong, Standard, Physical, Toon, Normal |
| | PBR & environment maps | metalness / roughness, `PMREMGenerator`, `RoomEnvironment`, `scene.environment` |
| | Textures, UVs & color space | wrap modes, `repeat`, Nearest/Linear filters, anisotropy, `SRGBColorSpace`, `DataTexture`, `CanvasTexture` |
| | Transparency, blending & sorting | `transparent`, `opacity`, blending modes, `alphaTest`, `depthWrite`, sorting |
| | ShaderMaterial & GLSL | `ShaderMaterial`, uniforms, `colorspace_fragment`, `onBeforeCompile` |
| Lights, shadows & atmosphere | Light types | Ambient, Hemisphere, Directional, Point, Spot, RectArea, helpers, physical units |
| | Shadows | `shadowMap`, `castShadow`/`receiveShadow`, shadow camera, `mapSize`, bias, radius, PCF/VSM |
| | Fog, background & environment | `Fog`, `FogExp2`, `material.fog`, `scene.background` |
| Interaction & animation | Raycasting & picking | `Raycaster.setFromCamera`, NDC, recursive, `instanceId`, layers |
| | OrbitControls | `target`, damping, auto-rotate, distance limits, `update(delta)` |
| | Render loop & Timer | `setAnimationLoop`, `THREE.Timer`, delta time, `Clock` deprecation |
| | AnimationMixer & keyframes | KeyframeTracks, `AnimationClip`, loop modes, `clampWhenFinished`, `timeScale`, `crossFadeTo` |
| | Morph targets & skinning | `morphAttributes`, `morphTargetInfluences`, `SkinnedMesh`, `Skeleton`, `Bone`, `getVertexPosition` |
| Assets & loading | glTF export & load | `GLTFExporter` → `GLTFLoader` round trip (GLB and JSON), animations, real 404 / SPA-fallback errors |
| | LoadingManager & textures | `LoadingManager` callbacks, `TextureLoader` with real PNGs from `/textures`, `onError`, `THREE.Cache` |
| Rendering pipeline | Render targets | `WebGLRenderTarget`, `setRenderTarget`, `readRenderTargetPixels`, MSAA, feedback loops |
| | Post-processing | `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass`, `OutputPass` |
| | Tone mapping & color management | None/Linear/Reinhard/Cineon/ACES/AgX/Neutral, exposure, `ColorManagement` |
| | WebGPURenderer & TSL | `three/webgpu`, `await init()`, WebGL 2 fallback, `MeshBasicNodeMaterial`, TSL nodes, `uniform()` |
| Performance & memory | Instancing, merging & BatchedMesh | separate meshes vs `mergeGeometries` vs `InstancedMesh` vs `BatchedMesh`, draw calls, timings |
| | LOD & frustum culling | `LOD`, `getCurrentLevel`, `Frustum`, `frustumCulled` |
| | Memory & dispose() | `dispose()`, `renderer.info.memory`, leaks, `forceContextLoss()` |

## Architecture

```
 Browser (visitor)                                         Docker host
┌──────────────────────────────────────────────────┐     ┌──────────────────────────┐
│ React UI (Vite build)                            │◀────│ frontend (nginx:80)      │
│  ├─ demos/catalog.js  explanations, flows, pits  │     │  static files, /textures │
│  ├─ lab/*.js          the demos: real Three.js   │     │  assets 404 when missing │
│  │    run(inputs) → { commands, data, checks }   │     └──────────────────────────┘
│  │    shared off-screen WebGLRenderer (64×64)    │
│  │    → renderer.render → gl.readPixels → checks │
│  ├─ components/ThreeStage.jsx  live view per page│
│  └─ visuals/*.jsx     readbacks, bars, charts    │
└──────────────────────────────────────────────────┘
```

Each demo module exports `params()` (clamps visitor input), `build()` (the scene, shared by the live
view and the checks, so what you see is what is tested) and `run()` (returns a DemoResult:
`commands`, `data`, `checks`, `elapsedMs`). Real Three.js warnings and errors are captured through
`THREE.setConsoleFunction`, so the "Do it wrong" buttons show the library's own messages.

## How not to use it and common errors

**Anti-patterns** (details on `#overview` and `#pitfalls`): one renderer per view or thumbnail;
thousands of separate meshes; creating resources inside the render loop; removing objects without
`dispose()`; shipping raw, uncompressed exports; treating Three.js as a full game engine; drawing 2D
charts/UI in WebGL; per-frame (not delta-time) animation and always-on rendering for static scenes.

| Error / symptom | Cause | Fix | Avoid |
|---|---|---|---|
| `Failed to resolve module specifier "three"` | bare import without bundler or import map | Vite, or an import map for `three` and `three/addons/` | same version + host for core and addons |
| `THREE.OrbitControls is not a constructor` | `examples/js` removed in r148 | `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'` | follow examples for your revision |
| `WARNING: Multiple instances of Three.js being imported.` | two copies of three in the bundle | `npm ls three`, dedupe, peerDependencies | pin one version |
| Textures look washed out (128 → 188) | color texture not marked sRGB (r152+) | `texture.colorSpace = THREE.SRGBColorSpace` | color = sRGB, data maps = NoColorSpace |
| Metal models render black | no environment to reflect | `scene.environment = pmrem.fromScene(new RoomEnvironment()).texture` | always give PBR scenes an environment |
| Point lights far too dim after upgrading | r155 physical units (candela, decay 2) | raise intensity ≈ distance² | tune in the current version |
| `THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.` | removed in r186 | `PCFShadowMap` + `shadow.radius` | read the Migration Guide |
| `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` | deprecated in r183 | `THREE.Timer` + `update(timestamp)` | — |
| `THREE.WebGLProgram: Shader Error … ERROR: 0:58: '=' : dimension mismatch` | GLSL type error | fix the line in the log | `renderer.compile()` at load time |
| `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON` | model URL answered with index.html (SPA fallback) | fix the path; 404 for asset extensions | open the URL in the browser first |
| `THREE.Renderer: .render() called before the backend is initialized.` | WebGPURenderer used before `await init()` | `await renderer.init()` | async setup |
| `Too many active WebGL contexts. Oldest context will be lost.` | new renderer per mount | `dispose()` + `forceContextLoss()`, one shared renderer | — |

Sources: [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) ·
manual: [color management](https://threejs.org/manual/#en/color-management),
[cleanup / dispose](https://threejs.org/manual/#en/cleanup),
[how to update things](https://threejs.org/manual/#en/how-to-update-things),
[responsive](https://threejs.org/manual/#en/responsive),
[transparency](https://threejs.org/manual/#en/transparency),
[shadows](https://threejs.org/manual/#en/shadows) ·
forum: [dispose correctly](https://discourse.threejs.org/t/dispose-things-correctly-in-three-js/6534),
[multiple instances](https://discourse.threejs.org/t/warning-multiple-instances-of-three-js-being-imported/24191),
[import maps](https://discourse.threejs.org/t/i-am-trying-for-hours-but-can-not-import-and-use-three-js/40090),
[too many contexts](https://discourse.threejs.org/t/i-have-a-problem-in-warning-too-many-active-webgl-contexts-oldest-context-will-be-lost/41300) ·
[issue #21707](https://github.com/mrdoob/three.js/issues/21707). Exact messages were checked against
the three@0.186.1 source, and the reproducible ones were captured live in Chromium.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `TUNNEL_TOKEN` | the server's deploy script | optional; only when it is not set on the server |

`.env` is git-ignored (`chmod 600`); `.env.example` lists the variables with empty values. The lab
itself needs no secrets and calls no paid APIs.

## Security

- Host ports are bound to `127.0.0.1` only. Docker publishes ports through its own iptables rules,
  which bypass host firewalls such as `ufw`, so a bare `3000:80` would be reachable from outside.
- nginx runs unprivileged (uid 101) with all capabilities dropped, `no-new-privileges`, and memory,
  CPU and process limits.
- Every response carries `Content-Security-Policy` (same-origin only, no framing),
  `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`
  (`frontend/security-headers.conf`); the nginx version is hidden.

## Tests

| Layer | Command | What it proves |
|---|---|---|
| Unit + Node demos (Vitest) | `docker build --target test frontend` | catalog completeness (every demo has a visual, pitfalls, flows, a mistake button); every page and visual renders; the 11 demos that need neither GPU nor network **and their mistake buttons** run real Three.js in Node and pass every check; hostile inputs are clamped (194 tests) |
| Browser end-to-end (Playwright, headless Chromium with SwiftShader WebGL 2) | `docker build -t threejs-lab-e2e e2e && docker run --rm --network host threejs-lab-e2e http://localhost:3900` | clicks **Run all demos** (31 demos, 115 checks), then opens every page and presses all 67 buttons, including each "Do it wrong" reproduction; fails on any failed check, error banner or uncaught page error |
| In-UI self-test | `#suite` → Run all demos | the same suite, in your own browser and GPU |
| Isolated stack | `docker compose -p threejs-visual-project-test -f docker-compose.yml -f docker-compose.test.yml up -d --build` (then `… down`) | builds and serves the stack on 127.0.0.1:3900 without touching the live app |

Results of the last run (2026-10-24): Vitest 194/194 passed; e2e 31/31 suite demos (115 checks) and
67/67 buttons passed, 0 page errors; no horizontal scrolling at 390 px width.

## Local development

```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000 (Vite, listens on localhost only)
npm test           # Vitest
```

Or without Node on the host:
`docker run --rm -it -p 127.0.0.1:3000:3000 -v "$PWD/frontend":/app -w /app node:22-alpine sh -c "npm ci && npm run dev -- --host 0.0.0.0"`
(`0.0.0.0` inside the container only; the host side stays on `127.0.0.1`).

## Notes and limits

- **WebXR** sessions need a headset or a phone with AR support; not demonstrated.
- **Compressed assets** (Draco, KTX2, Meshopt) need extra decoder files; covered in the pitfalls text,
  not run. The glTF demo uses a real export → import round trip instead of a downloaded model.
- **WebGPU**: headless test browsers and many devices have no WebGPU adapter, so the automated test
  exercises WebGPURenderer's WebGL 2 backend; on a WebGPU-capable browser the same page uses WebGPU.
- Timing numbers (draw-call demo, load times) are measured on the visitor's machine and vary; the
  checks only assert counts and pixels, never speed.
- Pixel checks run on a 64 × 64 canvas without antialiasing so results are deterministic across GPUs.
