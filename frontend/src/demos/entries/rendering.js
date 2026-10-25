import { runTargets, runPost, runTone, runWebGPU, TONE_MAPPINGS } from '../../lab/rendering.js';

export const RENDERING = [
  {
    id: 'render-targets',
    category: 'Rendering pipeline',
    title: 'Render targets',
    tagline: 'Render a scene into a texture, then use that texture',
    gpu: true,
    description: [
      'A WebGLRenderTarget is an off-screen framebuffer. renderer.setRenderTarget(target) redirects rendering into its texture; setRenderTarget(null) goes back to the canvas. The texture can then be used like any other: security-camera monitors, portals, mirrors, minimaps, and every post-processing effect is built on this.',
      '"Run it" renders a green box on a red background into a target, reads the target’s own pixels with readRenderTargetPixels, then draws a plane textured with target.texture to the canvas and checks the same colors appear. The live view renders a spinning knot into a target every frame and shows it on a monitor and on a cube; change the size to see low-resolution targets turn blocky.',
      'You must never sample a texture while rendering into it. The "Do it wrong" button does exactly that and gets INVALID_OPERATION from WebGL (the console shows "Feedback loop formed between Framebuffer and active Texture"), then fixes it with a second target (ping-pong).',
    ],
    keyApis: ['new WebGLRenderTarget(w, h, { samples, type, depthTexture })', 'renderer.setRenderTarget(target | null)', 'target.texture', 'renderer.readRenderTargetPixels(...)', 'target.setSize(w, h)', 'target.dispose()'],
    useCases: ['Post-processing', 'Mirrors, portals, CCTV screens', 'Minimaps and thumbnails', 'GPU picking and simulations'],
    snippet: {
      lang: 'js',
      name: 'render-target.js',
      code: `const target = new THREE.WebGLRenderTarget(256, 256, { samples: 4 });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: target.texture }));
scene.add(screen);

renderer.setAnimationLoop(() => {
  renderer.setRenderTarget(target);
  renderer.render(innerScene, innerCamera);   // into the texture
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);             // to the canvas, showing it
});`,
    },
    inputs: [
      { name: 'size', label: 'Target size', type: 'select', default: 256, options: [16, 32, 64, 128, 256, 512, 1024] },
      { name: 'samples', label: 'MSAA samples', type: 'select', default: 4, options: [0, 4] },
    ],
    flow: [
      ['app', 'renderer', 'setRenderTarget(target)'],
      ['renderer', 'gpu', 'draw inner scene into the FBO texture'],
      ['app', 'renderer', 'setRenderTarget(null)'],
      ['renderer', 'gpu', 'draw outer scene sampling target.texture'],
      ['gpu', 'canvas', 'the texture appears on the plane'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runTargets(i) },
      { id: 'feedback', label: 'Do it wrong: feedback loop', tone: 'ghost', run: (i) => runTargets(i, 'feedback') },
    ],
    pitfalls: [
      {
        mistake: 'Rendering into a target while a material samples that same target',
        symptom: 'GL_INVALID_OPERATION: Feedback loop formed between Framebuffer and active Texture. (nothing is drawn)',
        why: 'The GPU cannot read and write the same texture in one pass.',
        fix: 'Hide the object that uses target.texture while rendering into it, or ping-pong between two targets.',
        avoid: 'For mirrors use the Reflector addon; for effects use EffectComposer, which ping-pongs for you.',
        reproduce: 'feedback',
      },
      {
        mistake: 'Forgetting setRenderTarget(null)',
        symptom: 'The canvas freezes or stays black while the target keeps updating.',
        why: 'All later render() calls keep drawing into the target.',
        fix: 'Always pair setRenderTarget(target) with setRenderTarget(null) (or restore the previous target).',
        avoid: 'Wrap off-screen renders in a helper that saves and restores renderer.getRenderTarget().',
      },
      {
        mistake: 'Not resizing or disposing targets',
        symptom: 'Blurry effects after a resize, or GPU memory climbing when targets are recreated.',
        why: 'Targets keep the size they were created with and hold GPU memory until disposed.',
        fix: 'Call target.setSize(w × pixelRatio, h × pixelRatio) on resize and target.dispose() when done.',
        avoid: 'Create targets once; resize them, do not recreate them.',
      },
    ],
    visual: 'render-targets',
    test: { action: 'run' },
  },
  {
    id: 'post-processing',
    category: 'Rendering pipeline',
    title: 'Post-processing',
    tagline: 'EffectComposer, bloom and why OutputPass goes last',
    gpu: true,
    description: [
      'Post-processing applies full-screen effects after the scene is rendered: bloom, depth of field, ambient occlusion, outlines, FXAA/SMAA anti-aliasing, color grading. With WebGLRenderer you chain passes in an EffectComposer (from addons): a RenderPass draws the scene into a render target, each following pass reads the previous result and writes a new one, and OutputPass at the end applies tone mapping and the sRGB conversion.',
      '"Run it" renders a small, very bright sphere on black twice: RenderPass → OutputPass, and with UnrealBloomPass in between. The checks read the pixels around the sphere: without bloom they stay black, with bloom the light bleeds into them. The live view runs the full chain on glowing objects; play with strength, radius and threshold.',
      'The "Do it wrong" button ends the chain with a ShaderPass (as you would with FXAA or a custom effect) and no OutputPass: #808080 grey comes out as 55 because the linear image goes straight to the screen.',
    ],
    keyApis: ["import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'", 'RenderPass(scene, camera)', 'UnrealBloomPass(resolution, strength, radius, threshold)', 'ShaderPass(shader)', 'OutputPass()', 'composer.render(delta) / setSize(w, h)'],
    useCases: ['Glow and neon (bloom)', 'Cinematic looks (DOF, grain, vignette)', 'Outlines for selection', 'Anti-aliasing with FXAA / SMAA'],
    snippet: {
      lang: 'js',
      name: 'post.js',
      code: `import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 1.2, 0.4, 0.1));
composer.addPass(new OutputPass());          // tone mapping + sRGB, always last

renderer.setAnimationLoop(() => composer.render());   // instead of renderer.render
// on resize: composer.setSize(w, h)`,
    },
    inputs: [
      { name: 'strength', label: 'Bloom strength', type: 'number', default: 1.2, min: 0, max: 3, step: 0.1 },
      { name: 'radius', label: 'Bloom radius', type: 'number', default: 0.4, min: 0, max: 1, step: 0.05 },
      { name: 'threshold', label: 'Bloom threshold', type: 'number', default: 0.1, min: 0, max: 1, step: 0.05 },
    ],
    flow: [
      ['app', 'renderer', 'composer.render()'],
      ['renderer', 'gpu', 'RenderPass → render target A (linear, half float)'],
      ['gpu', 'gpu', 'UnrealBloomPass: threshold, blur mips, add'],
      ['gpu', 'gpu', 'OutputPass: tone mapping + sRGB'],
      ['gpu', 'canvas', 'final image'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runPost(i) },
      { id: 'nooutput', label: 'Do it wrong: no OutputPass', tone: 'ghost', run: (i) => runPost(i, 'nooutput') },
    ],
    pitfalls: [
      {
        mistake: 'Leaving out OutputPass',
        symptom: 'With post-processing on, the image is much darker and more saturated than without it (#808080 shows as ~55); tone mapping seems to do nothing.',
        why: 'Passes work in linear color in render targets; the sRGB conversion and tone mapping only happen when something writes to the screen with them, which OutputPass does.',
        fix: 'Add composer.addPass(new OutputPass()) as the last pass.',
        avoid: 'Start every composer with RenderPass … OutputPass and insert effects in between.',
        reproduce: 'nooutput',
      },
      {
        mistake: 'Calling renderer.render() instead of composer.render()',
        symptom: 'No effect is visible at all.',
        why: 'The composer only runs its passes inside composer.render().',
        fix: 'Replace renderer.render(scene, camera) with composer.render(delta) in the loop.',
        avoid: 'Have exactly one place in the loop that draws the frame.',
      },
      {
        mistake: 'Not resizing the composer',
        symptom: 'Effects look blurry or offset after the window is resized.',
        why: 'The composer’s render targets keep their old size.',
        fix: 'Call composer.setSize(w, h) next to renderer.setSize(w, h) (and update pass resolutions such as FXAA’s).',
        avoid: 'Put composer and renderer resizing in the same function.',
      },
    ],
    visual: 'post-processing',
    test: { action: 'run' },
  },
  {
    id: 'tone-mapping',
    category: 'Rendering pipeline',
    title: 'Tone mapping & color management',
    tagline: 'From unlimited light to 0…255 without clipping',
    gpu: true,
    description: [
      'Lighting math happens in linear color with no upper limit: a sunlit surface can be 10× brighter than "white". A screen shows 0…255. Tone mapping compresses that range gracefully instead of clipping: renderer.toneMapping = AgXToneMapping, ACESFilmicToneMapping or NeutralToneMapping, with toneMappingExposure as the camera exposure. Color management (on by default since r152) means Color and textures are converted to linear on input and back to sRGB on output.',
      '"Run it" renders eight panels whose light doubles each step (0.125 … 16) with every tone mapping and samples them. NoToneMapping clips every panel above 1.0 to the same red; AgX and ACES keep the steps distinguishable. It also checks exposure brightens the image and that CSS #808080 is stored as 0.2159 internally. The curves are plotted; the live view applies your choice to a strongly lit scene.',
      'The "Do it wrong" button sets ACESFilmic and renders into a render target: tone mapping only applies when drawing to the screen, so the bytes are identical to no tone mapping. The fix (OutputPass) is checked too.',
    ],
    keyApis: ['renderer.toneMapping', 'renderer.toneMappingExposure', 'AgXToneMapping / ACESFilmicToneMapping / NeutralToneMapping', 'renderer.outputColorSpace', 'ColorManagement.enabled', 'material.toneMapped'],
    useCases: ['Realistic lighting with bright highlights', 'Product rendering (Neutral)', 'Consistent colors across devices', 'HDR environment maps'],
    snippet: {
      lang: 'js',
      name: 'tone-mapping.js',
      code: `renderer.toneMapping = THREE.AgXToneMapping;       // or ACESFilmic, Neutral
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;   // default

new THREE.Color('#808080').r;   // 0.2159: stored linear, shown as #808080
uiPanel.material.toneMapped = false;               // keep exact UI colors`,
    },
    inputs: [
      { name: 'mode', label: 'toneMapping', type: 'select', default: 'AgX', options: Object.keys(TONE_MAPPINGS) },
      { name: 'exposure', label: 'Exposure', type: 'number', default: 1, min: 0.1, max: 4, step: 0.1 },
    ],
    flow: [
      ['app', 'renderer', 'renderer.toneMapping = AgX; exposure'],
      ['renderer', 'gpu', 'lighting in linear HDR'],
      ['gpu', 'gpu', 'tone map curve (screen output only)'],
      ['gpu', 'canvas', 'linear → sRGB'],
      ['canvas', 'app', 'sample 8 HDR panels'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runTone(i) },
      { id: 'target', label: 'Do it wrong: tone map a render target', tone: 'ghost', run: (i) => runTone(i, 'target') },
    ],
    pitfalls: [
      {
        mistake: 'Expecting tone mapping on render targets',
        symptom: 'renderer.toneMapping has no effect inside post-processing or when reading back a render target.',
        why: 'Tone mapping and the sRGB conversion are applied only when rendering to the screen (or an XR target); render targets keep linear HDR values.',
        fix: 'Apply them at the end of the chain: OutputPass in EffectComposer, or a final render to the canvas.',
        avoid: 'Keep intermediate targets linear (HalfFloatType) and convert exactly once.',
        reproduce: 'target',
      },
      {
        mistake: 'Code from before r152 (outputEncoding, sRGBEncoding)',
        symptom: 'SyntaxError: The requested module \'three\' does not provide an export named \'sRGBEncoding\'  (Vite: "sRGBEncoding" is not exported by "node_modules/three/build/three.module.js"); renderer.outputEncoding = … silently does nothing.',
        why: 'Color management was redesigned in r152 (outputEncoding → outputColorSpace, texture.encoding → texture.colorSpace) and the old constants were later removed entirely.',
        fix: 'renderer.outputColorSpace = THREE.SRGBColorSpace (default) and texture.colorSpace = THREE.SRGBColorSpace.',
        avoid: 'Follow the Migration Guide and "Color management" manual page when upgrading.',
      },
      {
        mistake: 'Tone mapping washing out UI or exact brand colors',
        symptom: 'Labels and flat-colored UI elements look duller than the CSS color.',
        why: 'Every toneMapped material passes through the curve, which also changes mid-tones.',
        fix: 'Set material.toneMapped = false on UI and unlit brand elements, or use NeutralToneMapping for product colors.',
        avoid: 'Decide per material which colors must be exact.',
      },
    ],
    visual: 'tone-mapping',
    test: { action: 'run' },
  },
  {
    id: 'webgpu-tsl',
    category: 'Rendering pipeline',
    title: 'WebGPURenderer & TSL',
    tagline: 'The next renderer, with node materials written in JavaScript',
    gpu: true,
    description: [
      'WebGPURenderer (import from three/webgpu) is Three.js’s newer renderer. It uses WebGPU when the browser supports it and falls back to a WebGL 2 backend otherwise, so the same code runs everywhere. Its materials are node materials, and shaders are written in TSL (Three.js Shading Language): a JavaScript API that builds a node graph and compiles it to WGSL or GLSL for whichever backend is running.',
      'Its setup is asynchronous: await renderer.init() picks and initialises the backend. "Run it" loads the WebGPU build on demand, creates a WebGPURenderer, reports which backend it chose, renders a MeshBasicNodeMaterial whose colorNode is mix(colorA, colorB, step(0.5, fract(uv().x × n))), reads the pixels back with readRenderTargetPixelsAsync, and checks the stripes and a live uniform() update. The live view runs an animated TSL material using the time node.',
      'The "Do it wrong" button renders before init() finished, which throws in r186. Note that ShaderMaterial, onBeforeCompile and EffectComposer belong to WebGLRenderer; with WebGPURenderer you use TSL and its own post-processing.',
    ],
    keyApis: ["import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'", "import { uniform, uv, mix, step, fract, time } from 'three/tsl'", 'await renderer.init()', 'material.colorNode / positionNode', 'uniform(value).value', 'forceWebGL: true', 'readRenderTargetPixelsAsync'],
    useCases: ['Compute shaders and GPU particles', 'Future-proof new projects', 'Shaders without writing GLSL strings', 'Node-based material editors'],
    snippet: {
      lang: 'js',
      name: 'webgpu.js',
      code: `import * as THREE from 'three/webgpu';
import { uniform, uv, mix, step, fract, time } from 'three/tsl';

const renderer = new THREE.WebGPURenderer({ antialias: true });  // forceWebGL: true to test the fallback
await renderer.init();                                            // before the first render

const colorA = uniform(new THREE.Color('#22d3ee'));
const material = new THREE.MeshBasicNodeMaterial();
material.colorNode = mix(colorA, uniform(new THREE.Color('#f472b6')),
  step(0.5, fract(uv().x.mul(4).add(time.mul(0.25)))));

renderer.setAnimationLoop(() => renderer.render(scene, camera));
colorA.value.set('#ffffff');   // uniform update, no shader rebuild`,
    },
    inputs: [
      { name: 'forceWebGL', label: 'forceWebGL', type: 'checkbox', default: false },
      { name: 'frequency', label: 'Stripes', type: 'number', default: 4, min: 1, max: 16, step: 1 },
      { name: 'colorA', label: 'Color A', type: 'color', default: '#22d3ee' },
      { name: 'colorB', label: 'Color B', type: 'color', default: '#f472b6' },
    ],
    flow: [
      ['app', 'renderer', 'new WebGPURenderer(); await init()'],
      ['renderer', 'renderer', 'WebGPU available? else WebGL 2 backend'],
      ['app', 'scene', 'material.colorNode = TSL graph'],
      ['renderer', 'gpu', 'node graph → WGSL or GLSL'],
      ['gpu', 'canvas', 'stripes'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runWebGPU(i) },
      { id: 'noinit', label: 'Do it wrong: render before init()', tone: 'ghost', run: (i) => runWebGPU(i, 'noinit') },
    ],
    pitfalls: [
      {
        mistake: 'Rendering before the asynchronous init() has finished',
        symptom: 'Error: THREE.Renderer: .render() called before the backend is initialized. Use "await renderer.init();" before rendering.',
        why: 'Requesting a WebGPU adapter and device is asynchronous; the backend does not exist until init() resolves. (setAnimationLoop waits for init itself.)',
        fix: 'await renderer.init() once after creating the renderer, before any render(), compile() or readback.',
        avoid: 'Make your setup function async; renderAsync() and friends are deprecated since r181.',
        reproduce: 'noinit',
      },
      {
        mistake: 'Using ShaderMaterial, onBeforeCompile or EffectComposer with WebGPURenderer',
        symptom: 'Custom materials render black or not at all; post-processing passes do nothing.',
        why: 'Those APIs are part of WebGLRenderer. WebGPURenderer compiles node materials only and has its own RenderPipeline/PostProcessing.',
        fix: 'Port shaders to TSL (colorNode, positionNode, Fn()) and effects to the node-based post-processing in three/tsl.',
        avoid: 'Pick one renderer per project; WebGLRenderer remains fully supported.',
      },
      {
        mistake: 'Importing from both three and three/webgpu inconsistently',
        symptom: 'WARNING: Multiple instances of Three.js being imported.  /  instanceof checks failing',
        why: 'Old setups or bundler aliases can resolve two different copies of the core.',
        fix: "Import everything from 'three/webgpu' (it re-exports the core) and node functions from 'three/tsl'; dedupe three in the bundler.",
        avoid: 'Keep one three version in package-lock; libraries should list three as a peerDependency.',
      },
    ],
    visual: 'webgpu-tsl',
    test: { action: 'run' },
  },
];
