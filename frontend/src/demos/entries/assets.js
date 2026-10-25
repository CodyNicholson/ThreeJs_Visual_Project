import { runGltf, runLoading } from '../../lab/assets.js';

export const ASSETS = [
  {
    id: 'gltf',
    category: 'Assets & loading',
    title: 'glTF export & load',
    tagline: 'The JPEG of 3D: meshes, materials and animations in one file',
    gpu: false,
    description: [
      'glTF 2.0 is the recommended format for Three.js: a JSON scene description plus binary buffers, or everything packed in one .glb. It carries meshes, PBR materials, textures, cameras, lights, skeletons and animation clips, and loads with GLTFLoader (add DRACOLoader, KTX2Loader or MeshoptDecoder for compressed files). GLTFExporter writes the same format from a Three.js scene.',
      '"Run it" builds a small robot in code with named parts, materials and a spin clip, exports it with GLTFExporter (GLB or JSON), parses the bytes back with GLTFLoader, and compares: every mesh name, every material color and the animation clip survive the trip, and a GLB starts with the "glTF" magic header. The live view shows the original on the left and the re-loaded copy on the right, both animating.',
      'The "Do it wrong" button fetches two model URLs from this very site: one without an extension (the single-page-app fallback answers with index.html, so GLTFLoader fails with a JSON parse error, not a 404) and one missing .glb that nginx answers with an honest 404.',
    ],
    keyApis: ["import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'", 'loader.loadAsync(url) / parseAsync(data, path)', 'gltf.scene / gltf.animations / gltf.cameras', 'loader.setDRACOLoader / setKTX2Loader / setMeshoptDecoder', 'GLTFExporter.parseAsync(scene, { binary, animations })'],
    useCases: ['Loading models from Blender, Maya, Sketchfab', 'Saving user-created scenes', 'AR (glTF → USDZ)', 'Asset pipelines with compression'],
    snippet: {
      lang: 'js',
      name: 'gltf.js',
      code: `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: [clip] });

const gltf = await new GLTFLoader().parseAsync(glb, '');   // or loader.loadAsync('/models/robot.glb')
scene.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations[0]).play();`,
    },
    inputs: [
      { name: 'parts', label: 'Parts', type: 'number', default: 6, min: 1, max: 12, step: 1 },
      { name: 'animation', label: 'Include animation', type: 'checkbox', default: true },
      { name: 'binary', label: 'Binary (.glb)', type: 'checkbox', default: true },
    ],
    flow: [
      ['app', 'scene', 'robot: meshes + materials + clip'],
      ['scene', 'loader', 'GLTFExporter.parseAsync → GLB bytes'],
      ['loader', 'loader', 'GLTFLoader.parseAsync: JSON chunk + BIN chunk'],
      ['loader', 'scene', 'gltf.scene + gltf.animations'],
      ['scene', 'app', 'compare names, colors, clips'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runGltf(i) },
      { id: 'spa', label: 'Do it wrong: bad model URLs', tone: 'ghost', network: true, run: (i) => runGltf(i, 'spa'), flow: () => [['app', 'loader', "loader.loadAsync('/models/robot')"], ['loader', 'loader', 'HTTP 200 text/html (SPA fallback)'], ['loader', 'app', 'SyntaxError: not valid JSON']] },
    ],
    pitfalls: [
      {
        mistake: 'A model URL that is answered with your index.html',
        symptom: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
        why: 'Single-page-app servers (Vite, nginx try_files, Netlify) return index.html with status 200 for unknown paths, so the loader receives HTML instead of glTF.',
        fix: 'Fix the path (files in Vite’s public/ are served from the root: /models/robot.glb), and make the server 404 for missing asset extensions.',
        avoid: 'Open the model URL in the browser first; configure the server so .glb/.gltf/.bin never fall back to index.html (this lab’s nginx does).',
        reproduce: 'spa',
      },
      {
        mistake: 'Loading a Draco-compressed file without a DRACOLoader',
        symptom: 'Error: THREE.GLTFLoader: No DRACOLoader instance provided.',
        why: 'KHR_draco_mesh_compression data needs the Draco decoder (WASM), which GLTFLoader does not include.',
        fix: "const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); loader.setDRACOLoader(draco);",
        avoid: 'Know what your exporter enables (Draco, Meshopt, KTX2) and wire up the matching decoders once in a shared loader.',
      },
      {
        mistake: 'Opening the page from file:// to test models',
        symptom: "Access to fetch at 'file:///…/model.glb' from origin 'null' has been blocked by CORS policy",
        why: 'Browsers block fetch() from file:// pages; loaders use fetch.',
        fix: 'Run a local server (npm create vite@latest, npx serve, python -m http.server).',
        avoid: 'Develop with a dev server from day one.',
      },
      {
        mistake: 'Huge, uncompressed models',
        symptom: 'Multi-second loads on mobile, tabs crashing with out-of-memory, stutter on first render.',
        why: 'Raw glTF exports keep full-precision geometry and PNG/JPEG textures that expand to width × height × 4 bytes on the GPU.',
        fix: 'Optimise with gltf-transform (meshopt/draco, KTX2 textures, resize, dedupe) and load with the matching decoders.',
        avoid: 'Set budgets (triangles, texture memory) and check them in CI.',
      },
    ],
    visual: 'gltf',
    test: { action: 'run' },
  },
  {
    id: 'loading-manager',
    category: 'Assets & loading',
    title: 'LoadingManager & textures',
    tagline: 'Progress bars, error handling and caching for real files',
    gpu: false,
    network: true, // fetches /textures/*.png from this site, so it only runs in a browser
    description: [
      'Loaders (TextureLoader, GLTFLoader, FileLoader, …) fetch files asynchronously. A LoadingManager shared by several loaders tracks them all and calls onStart, onProgress(url, loaded, total), onError(url) and finally onLoad once everything has settled: the hook for a loading screen. THREE.Cache, when enabled, keeps loaded files in memory so the same URL is not fetched twice.',
      '"Run it" loads real PNG files from this site’s /textures/ folder through one manager and logs every callback with a timestamp. The checks confirm onProgress counts 1 … n, onLoad fires exactly once at the end, each image decoded to 128 × 128, and a repeat load with THREE.Cache enabled is served from the cache. The live view swaps each wireframe placeholder for its texture the moment that file arrives.',
      'The "Do it wrong" button adds a missing file: onError fires with its URL, and onLoad still fires, because a failed item counts as settled. Your loading screen must check for errors itself.',
    ],
    keyApis: ['new LoadingManager(onLoad, onProgress, onError)', 'manager.onStart / onProgress / onLoad / onError', 'new TextureLoader(manager).load(url, onLoad, undefined, onError)', 'loader.loadAsync(url)', 'THREE.Cache.enabled', 'manager.setURLModifier'],
    useCases: ['Loading screens and progress bars', 'Graceful fallbacks for missing assets', 'Preloading before showing a scene', 'Rewriting URLs (CDN, cache busting)'],
    snippet: {
      lang: 'js',
      name: 'loading.js',
      code: `const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => progressBar.style.width = \`\${(loaded / total) * 100}%\`;
manager.onError = (url) => failed.push(url);
manager.onLoad = () => failed.length ? showError(failed) : hideLoadingScreen();

const textures = new THREE.TextureLoader(manager);
const gltf = new GLTFLoader(manager);
const bricks = textures.load('/textures/bricks.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; });

THREE.Cache.enabled = true;   // same URL twice → one request`,
    },
    inputs: [
      { name: 'count', label: 'Textures to load', type: 'number', default: 6, min: 1, max: 6, step: 1 },
      { name: 'broken', label: 'Include a missing file', type: 'checkbox', default: false },
    ],
    flow: [
      ['app', 'loader', 'textureLoader.load(url) × n'],
      ['loader', 'loader', 'manager.itemStart → onStart'],
      ['loader', 'app', 'image decoded → itemEnd → onProgress(k / n)'],
      ['loader', 'app', 'missing file → itemError → onError(url)'],
      ['loader', 'app', 'all settled → onLoad'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runLoading(i) },
      { id: 'broken', label: 'Do it wrong: a missing file', tone: 'ghost', run: (i) => runLoading(i, 'broken') },
    ],
    pitfalls: [
      {
        mistake: 'Treating manager.onLoad as "everything succeeded"',
        symptom: 'The loading screen disappears and the scene shows black / untextured objects; the console has a 404.',
        why: 'A failed item still counts as finished, so onLoad fires after errors too.',
        fix: 'Collect URLs in onError and check that list inside onLoad; show a fallback texture or message.',
        avoid: 'Always pass onError callbacks (or use loadAsync with try/catch).',
        reproduce: 'broken',
      },
      {
        mistake: 'Using a texture before it has loaded and expecting its size',
        symptom: 'texture.image is undefined (or width 0) right after loader.load(); aspect ratios computed from it are NaN.',
        why: 'load() returns the Texture immediately and fills texture.image later; the renderer shows nothing until then.',
        fix: 'Read image sizes in the onLoad callback, or await loader.loadAsync(url).',
        avoid: 'Use async/await loaders for anything that depends on the file’s contents.',
      },
      {
        mistake: 'Loading the same file once per object',
        symptom: 'Many identical requests in the network tab and as many GPU copies of the texture.',
        why: 'Each load() creates a new Texture (and upload) even for the same URL.',
        fix: 'Load once and share the Texture; enable THREE.Cache to avoid duplicate downloads.',
        avoid: 'Put loading behind a small asset registry keyed by URL.',
      },
    ],
    visual: 'loading-manager',
    test: { action: 'run' },
  },
];
