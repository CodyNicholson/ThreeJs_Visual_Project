// The overview page: what Three.js is, how to start a project with it (typed out in an animated
// terminal), and an honest pros / cons / when-to-use comparison. antiPatterns and troubleshooting
// also feed the #pitfalls page, next to every demo's own pitfalls.
import { REVISION } from 'three';

export const OVERVIEW = {
  title: 'Three.js in one page',
  intro: 'Three.js is a JavaScript library that draws interactive 3D graphics in the browser. You describe a scene (objects with shapes and materials, lights, a camera) and its renderer turns it into pixels on a <canvas> using WebGL 2 or WebGPU, at 60+ frames per second. It hides the low-level GPU work (shaders, buffers, state) behind a scene graph, while still letting you drop down to custom shaders when you need to.',
  facts: [
    ['Version in this lab', `r${REVISION} (npm three@0.${REVISION}.1)`],
    ['License', 'MIT'],
    ['Written in', 'JavaScript (ES modules)'],
    ['Renderers', 'WebGLRenderer · WebGPURenderer'],
    ['Created', '2010 by Ricardo Cabello (mrdoob)'],
  ],
  mentalModel: [
    'Scene graph: everything is an Object3D in a tree; children inherit their parent’s transform.',
    'Mesh = Geometry (vertices, triangles, UVs) + Material (how the surface reacts to light).',
    'Camera + renderer.render(scene, camera) inside a loop = animation.',
    'Everything uploaded to the GPU (geometries, textures, programs) must be disposed by you.',
  ],
  steps: [
    {
      title: 'Create a project and install three',
      text: 'Use a bundler such as Vite: it resolves the bare "three" import and the "three/addons/…" paths. Pin the version; the API changes between revisions.',
      commands: ['npm create vite@latest my-3d-app -- --template vanilla', 'cd my-3d-app', 'npm install three@0.186.1', 'npm run dev'],
    },
    {
      title: 'Draw your first frame',
      text: 'A scene, a camera, a renderer, one mesh and a light, rendered in a loop. Replace main.js with this.',
      file: {
        name: 'main.js',
        lang: 'js',
        code: `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 2, 4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#22d3ee' }));
scene.add(cube, new THREE.HemisphereLight(0xffffff, 0x334155, 2));

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  cube.rotation.y += timer.getDelta();
  controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});`,
      },
    },
    {
      title: 'No bundler? Use an import map',
      text: 'Plain HTML works too, but the browser must be told where "three" and "three/addons/" live, and the page must be served over http (not opened from file://).',
      file: {
        name: 'index.html',
        lang: 'html',
        code: `<script type="importmap">
{ "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"
} }
</script>
<script type="module" src="./main.js"></script>`,
      },
    },
    {
      title: 'Load a real model',
      text: 'Export glTF/GLB from Blender (or download one), put it in public/, and load it. Give PBR models an environment map or they look dark.',
      commands: ['mkdir -p public/models && cp ~/Downloads/robot.glb public/models/', 'npx @gltf-transform/cli optimize public/models/robot.glb public/models/robot.min.glb --compress meshopt --texture-compress webp'],
    },
  ],
  pros: [
    'Huge, active ecosystem: hundreds of official examples, addons (loaders, controls, post-processing) and a helpful forum.',
    'Runs everywhere a browser does, with no install; WebGL 2 fallback keeps WebGPURenderer working on older devices.',
    'Low-level enough for custom GLSL / TSL shaders, high-level enough to show a model in 30 lines.',
    'First-class glTF support with Draco, Meshopt and KTX2 compression.',
    'Small and unopinionated: it is a rendering library, so it fits into any app framework (React Three Fiber, Vue, Svelte, vanilla).',
  ],
  cons: [
    'Not a game engine: no physics, audio mixing, networking, editor or asset pipeline built in.',
    'The API changes from revision to revision (no semver); old tutorials and Stack Overflow answers are often outdated.',
    'You manage GPU memory yourself (dispose()); leaks are easy in single-page apps.',
    'Performance work (draw calls, instancing, LOD, texture budgets) is manual.',
    'Bundle size: the core is a few hundred KB minified before addons.',
  ],
  whenToUse: [
    'Interactive 3D on the web: product configurators, data visualisation, portfolios, maps, digital twins.',
    'You want full control of rendering and shaders but not to write raw WebGL.',
    'Embedding 3D into an existing web app (React, Vue, plain JS).',
    'Loading and showing glTF models, point clouds or procedural geometry.',
  ],
  whenNotToUse: [
    'A full game with physics, editor and asset pipeline: consider Babylon.js, PlayCanvas, Godot (web export) or Unity.',
    'Plain 2D charts, diagrams or UI: SVG, Canvas 2D, D3 or a charting library are simpler and more accessible.',
    'Maps and geospatial globes at scale: CesiumJS, deck.gl or MapLibre handle tiling and projections for you.',
    'Static images: render them offline (Blender) and ship a picture.',
  ],
  alternatives: [
    ['Babylon.js', 'Full engine (physics, GUI, inspector, editor) with a stable API; heavier, more batteries included.'],
    ['PlayCanvas', 'Engine plus a collaborative online editor; strong for games and ads.'],
    ['React Three Fiber', 'A React renderer for Three.js (same library underneath) with drei helpers; declarative scenes.'],
    ['A-Frame', 'HTML-like entity-component layer on Three.js, aimed at WebXR scenes with little code.'],
    ['deck.gl / CesiumJS', 'Large-scale geospatial and data layers with map projections built in.'],
    ['Raw WebGL / WebGPU', 'Total control and smallest size, but you write every shader, buffer and state change yourself.'],
  ],
  // How NOT to use Three.js: misuses of the tool as a whole (wrong job, wrong architecture).
  antiPatterns: [
    {
      dont: 'Create a new WebGLRenderer (and canvas) for every view, card or thumbnail',
      why: 'Browsers allow about 16 WebGL contexts per page; beyond that the oldest is lost ("Too many active WebGL contexts. Oldest context will be lost."). Each context also duplicates every texture and buffer.',
      instead: 'Share one renderer: draw several views with setViewport / setScissor, or render thumbnails into render targets. Dispose and forceContextLoss() renderers you remove.',
    },
    {
      dont: 'Build thousands of individual meshes',
      why: 'Each mesh is a draw call; the CPU becomes the bottleneck long before the GPU is busy.',
      instead: 'InstancedMesh for repeats, BatchedMesh for varied props, merged geometry for static scenery (see the draw-calls demo).',
    },
    {
      dont: 'Create geometries, materials or textures inside the render loop',
      why: 'Every new resource is a GPU upload and, usually, a leak; materials can trigger shader recompiles that freeze the frame.',
      instead: 'Create resources once, reuse and mutate them (uniform values, attribute updates), dispose when finished.',
    },
    {
      dont: 'Remove objects from the scene and assume memory is freed',
      why: 'GPU resources are not garbage collected; renderer.info.memory keeps growing until the tab crashes.',
      instead: 'Dispose geometries, materials and textures (see the dispose demo) and watch renderer.info.memory.',
    },
    {
      dont: 'Ship raw, uncompressed exports from Blender',
      why: 'Tens of MB per model, multi-second loads on mobile, and textures that expand to width × height × 4 bytes of GPU memory.',
      instead: 'Optimise with gltf-transform (meshopt/draco, KTX2 or WebP textures, resized maps) and load with the matching decoders.',
    },
    {
      dont: 'Use Three.js as a game engine and expect physics, audio and networking',
      why: 'Three.js is a renderer. Teams end up re-inventing an engine around it.',
      instead: 'Pair it with libraries (Rapier / cannon-es for physics, Howler for audio) or pick a full engine when you need the whole stack.',
    },
    {
      dont: 'Draw 2D charts, text-heavy UI or diagrams in WebGL',
      why: 'You lose accessibility, text selection, crisp text and layout for no gain.',
      instead: 'Use HTML/SVG/Canvas 2D; overlay HTML on 3D with CSS2DRenderer when labels must follow 3D points.',
    },
    {
      dont: 'Animate by a fixed step per frame and render continuously for static scenes',
      why: 'Speed depends on the screen’s refresh rate, and an idle viewer burns battery at 60–144 fps.',
      instead: 'Use THREE.Timer delta for motion; for static scenes render on demand (on controls "change", resize, or data updates).',
    },
  ],
  // Errors people hit outside any single feature: install, imports, servers, versions, the GPU.
  troubleshooting: [
    {
      mistake: 'Importing "three" in the browser without a bundler or import map',
      symptom: 'Uncaught TypeError: Failed to resolve module specifier "three". Relative references must start with either "/", "./", or "../".',
      why: 'Bare specifiers like "three" are a bundler/Node convention; browsers need an import map to resolve them. Addons import "three" too.',
      fix: 'Add a <script type="importmap"> mapping "three" and "three/addons/" (same version), or use Vite.',
      avoid: 'Start projects with a bundler; if you use a CDN, import core and addons from the same version and host.',
    },
    {
      mistake: 'Following a tutorial that uses examples/js or global THREE addons',
      symptom: 'TypeError: THREE.OrbitControls is not a constructor  /  THREE.GLTFLoader is not a constructor',
      why: 'The non-module examples/js scripts were removed in r148; addons are ES modules you import by name.',
      fix: "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",
      avoid: 'Check which revision a tutorial targets; prefer the official examples for your version.',
    },
    {
      mistake: 'Two copies of three.js in one page',
      symptom: 'WARNING: Multiple instances of Three.js being imported.  (followed by instanceof checks failing, materials not updating)',
      why: 'A library bundled its own three, two versions are installed, or core and addons come from different CDNs.',
      fix: 'npm ls three; dedupe (npm dedupe, overrides/resolutions, Vite resolve.dedupe: ["three"]); load everything from one source.',
      avoid: 'Libraries should list three as a peerDependency; pin one version in your app.',
    },
    {
      mistake: 'Opening index.html straight from disk',
      symptom: "Access to fetch at 'file:///…/model.glb' from origin 'null' has been blocked by CORS policy",
      why: 'Browsers block fetch and WebGL texture uploads from file:// pages.',
      fix: 'Serve the folder: npx vite, npx serve, or python3 -m http.server.',
      avoid: 'Always develop with a local server.',
    },
    {
      mistake: 'An old device or a browser with WebGL disabled',
      symptom: 'Error: THREE.WebGLRenderer: WebGL 1 is not supported since r163.  /  Error: THREE.WebGLRenderer: Error creating WebGL context.',
      why: 'Since r163 Three.js requires WebGL 2. Blocklisted GPUs, disabled hardware acceleration or remote desktops may offer none.',
      fix: 'Enable hardware acceleration / update drivers; catch the error and show a fallback image or message.',
      avoid: 'Feature-detect (canvas.getContext("webgl2")) before creating the renderer, and wrap it in try/catch.',
    },
    {
      mistake: 'Losing the GPU context on mobile or after heavy use',
      symptom: 'THREE.WebGLRenderer: Context Lost.  (the canvas goes black)',
      why: 'The browser reclaimed the GPU (memory pressure, too many contexts, driver reset, tab in background on iOS).',
      fix: 'Listen for webglcontextlost / webglcontextrestored, pause rendering, and reload textures if needed; reduce memory use.',
      avoid: 'Stay within texture budgets, dispose unused resources, and use one renderer per page.',
    },
    {
      mistake: 'Upgrading revisions without reading the migration notes',
      symptom: 'Scenes suddenly darker (r155 lighting units), washed-out textures (r152 color management), missing APIs (Geometry r125, examples/js r148, WebGL 1 r163, PCFSoftShadowMap r186, Clock deprecated r183).',
      why: 'Three.js does not follow semver; every monthly revision can change or remove APIs.',
      fix: 'Read the Migration Guide entry for every revision you skip and fix the console warnings it lists.',
      avoid: 'Pin an exact version (three@0.186.1), upgrade deliberately, and keep the console free of THREE.* warnings.',
    },
    {
      mistake: 'Running a React/Vue component that sets up Three.js on every render',
      symptom: 'Animations speed up after hot reloads, memory and GPU use climb, eventually "Too many active WebGL contexts".',
      why: 'Each effect run creates another renderer and animation loop; strict mode and HMR run setup twice.',
      fix: 'Create the renderer in an effect and clean up: setAnimationLoop(null), dispose(), forceContextLoss(), remove listeners and the canvas.',
      avoid: 'Use React Three Fiber, or isolate Three.js in one long-lived module with explicit mount/unmount.',
    },
  ],
};
