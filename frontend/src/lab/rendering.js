// Rendering pipeline: render targets, post-processing with EffectComposer, tone mapping and color
// management, and the newer WebGPURenderer with TSL node materials.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { Demo, bool, clamp, clampInt, disposeTree, oneOf, round } from './lab.js';
import { NeedsWebGLError, Pixels, colorDistance, getCheckRenderer, hasWebGL2, luminance, readTarget, rgb, shoot } from './gpu.js';

const BG = 0x0b1120;
const hexColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

// ---- Render targets ------------------------------------------------------------------------------

export const targetParams = (i = {}) => ({ size: oneOf(Number(i.size), [256, 16, 32, 64, 128, 512, 1024]), samples: oneOf(Number(i.samples), [4, 0]) });

export function buildTargets(p) {
  const target = new THREE.WebGLRenderTarget(p.size, p.size, { samples: p.samples });
  // The inner world: rendered into the texture each frame
  const inner = new THREE.Scene();
  inner.background = new THREE.Color(0x1e1b4b);
  const innerCam = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  innerCam.position.z = 3;
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.25, 160, 20), new THREE.MeshNormalMaterial());
  inner.add(knot);
  // The outer world: a "monitor" and a floor showing that texture
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 1.4, 6);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 4, 5);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.5));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 3.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x334155 }));
  frame.position.set(-1.2, 1.2, -0.12);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: target.texture }));
  screen.position.set(-1.2, 1.2, 0);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ map: target.texture }));
  cube.position.set(2, 0.8, 0.5);
  scene.add(frame, screen, cube);
  return {
    scene,
    camera,
    tick: (dt) => {
      knot.rotation.x += dt * 0.7;
      knot.rotation.y += dt * 0.5;
      cube.rotation.y += dt * 0.4;
    },
    render: (renderer) => {
      renderer.setRenderTarget(target);
      renderer.render(inner, innerCam);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    hud: () => `render target ${p.size}×${p.size}${p.samples ? `, MSAA ×${p.samples}` : ''}`,
    dispose: () => { target.dispose(); disposeTree(inner); },
  };
}

function drainErrors(gl) {
  while (gl.getError() !== gl.NO_ERROR) { /* clear stale errors */ }
}

export async function runTargets(inputs, mode = 'run') {
  const p = targetParams(inputs);
  const d = new Demo('render-targets');
  const renderer = getCheckRenderer(64, 64);
  const gl = renderer.getContext();
  const data = { params: p, snapshots: [] };
  const size = Math.min(p.size, 256);
  const target = d.time(`target = new WebGLRenderTarget(${size}, ${size}, { samples: ${p.samples} })`, () => new THREE.WebGLRenderTarget(size, size, { samples: p.samples }));
  const inner = new THREE.Scene();
  inner.background = new THREE.Color(0xff0000);
  const innerCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  innerCam.position.z = 3;
  inner.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 })));
  renderer.setRenderTarget(target);
  renderer.render(inner, innerCam);
  renderer.setRenderTarget(null);
  d.cmd('renderer.setRenderTarget(target); renderer.render(innerScene, innerCamera); renderer.setRenderTarget(null)');
  const tp = readTarget(renderer, target);
  d.cmd(`renderer.readRenderTargetPixels(target, 0, 0, ${size}, ${size}, buffer) → center ${rgb(tp.at(0.5, 0.5))}, corner ${rgb(tp.at(0.02, 0.02))}`);
  data.snapshots.push({ label: `inside the render target (${size}²)`, src: tp.toDataURL(), tone: 'ok' });
  d.check('The off-screen scene was drawn into the texture, not the canvas', colorDistance(tp.at(0.5, 0.5), [0, 255, 0]) < 4 && colorDistance(tp.at(0.02, 0.02), [255, 0, 0]) < 4, `center ${rgb(tp.at(0.5, 0.5))} (green box), corner ${rgb(tp.at(0.02, 0.02))} (red background)`);

  const outer = new THREE.Scene();
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  ortho.position.z = 2;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: target.texture }));
  outer.add(screen);
  const px = shoot(d, renderer, outer, ortho, 'plane with map: target.texture, rendered to the canvas');
  data.snapshots.push({ label: 'that texture on a plane', src: px.toDataURL(), tone: 'ok' });
  d.check('target.texture works like any other texture', colorDistance(px.at(0.5, 0.5), [0, 255, 0]) < 4, `canvas center ${rgb(px.at(0.5, 0.5))}`);
  const bytes = size * size * 4 * (p.samples ? 1 + p.samples : 1);
  d.cmd(`GPU memory ≈ ${size}×${size}×4 bytes${p.samples ? ` + ${p.samples}× MSAA buffer` : ''} = ${(bytes / 1024).toFixed(0)} KB (+ depth buffer)`);
  data.kb = round(bytes / 1024, 0);

  if (mode === 'feedback') {
    // A plain (non-MSAA) target: MSAA targets draw into a separate renderbuffer, which hides the loop
    const loop = new THREE.WebGLRenderTarget(size, size);
    screen.material.map = loop.texture;
    renderer.setRenderTarget(loop);
    renderer.render(inner, innerCam);
    drainErrors(gl);
    renderer.render(outer, ortho);
    renderer.setRenderTarget(null);
    const err = gl.getError();
    screen.material.map = target.texture;
    loop.dispose();
    d.cmd(`✗ renderer.setRenderTarget(target); render a plane whose map is target.texture → gl.getError() = ${err}${err === gl.INVALID_OPERATION ? ' (INVALID_OPERATION: feedback loop)' : ''}`);
    d.check('Reading a texture while rendering into it is a WebGL error (feedback loop)', err === gl.INVALID_OPERATION, `gl.getError() = ${err}; the browser console shows "Feedback loop formed between Framebuffer and active Texture"`);
    const other = new THREE.WebGLRenderTarget(size, size);
    drainErrors(gl);
    renderer.setRenderTarget(other);
    renderer.render(outer, ortho);
    renderer.setRenderTarget(null);
    const err2 = gl.getError();
    d.cmd(`✓ render into a second target (ping-pong) → gl.getError() = ${err2}`);
    d.check('Ping-pong between two targets avoids it', err2 === gl.NO_ERROR, `gl.getError() = ${err2}`);
    other.dispose();
  }
  target.dispose();
  disposeTree(inner);
  disposeTree(outer);
  return d.result(data);
}

// ---- Post-processing ---------------------------------------------------------------------------------

export const postParams = (i = {}) => ({ strength: clamp(i.strength, 0, 3, 1.2), radius: clamp(i.radius, 0, 1, 0.4), threshold: clamp(i.threshold, 0, 1, 0.1) });

export function buildPost(p, { renderer, width = 640, height = 340 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 1.5, 9);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const group = new THREE.Group();
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 2), new THREE.MeshStandardMaterial({ color: 0x111827, emissive: new THREE.Color().setHSL(i / 9, 0.9, 0.55), emissiveIntensity: 2.5 }));
    m.position.set(Math.cos(a) * 3, Math.sin(a * 2) * 0.6, Math.sin(a) * 3);
    group.add(m);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 16, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) }));
  scene.add(group, ring);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), p.strength, p.radius, p.threshold));
  composer.addPass(new OutputPass());
  return {
    scene,
    camera,
    tick: (dt) => { group.rotation.y += dt * 0.3; ring.rotation.x += dt * 0.5; },
    resize: (w, h) => composer.setSize(w, h),
    render: (_, dt) => composer.render(dt),
    hud: () => `RenderPass → UnrealBloomPass(${p.strength}, ${p.radius}, ${p.threshold}) → OutputPass`,
    dispose: () => composer.dispose(),
  };
}

function composeShot(d, renderer, scene, camera, passes, label) {
  const composer = new EffectComposer(renderer);
  passes.forEach((pass) => composer.addPass(pass));
  composer.render();
  const gl = renderer.getContext();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const px = new Pixels(new Uint8Array(size.x * size.y * 4), size.x, size.y);
  gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, px.buf);
  d.cmd(`${label} → composer.render()`);
  passes.forEach((pass) => pass.dispose?.());
  composer.dispose();
  return px;
}

export async function runPost(inputs, mode = 'run') {
  const p = postParams(inputs);
  const d = new Demo('post-processing');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };
  const v2 = new THREE.Vector2(64, 64);

  if (mode === 'nooutput') {
    const gray = new THREE.Scene();
    gray.background = new THREE.Color('#808080');
    const cam = new THREE.PerspectiveCamera();
    const bad = composeShot(d, renderer, gray, cam, [new RenderPass(gray, cam), new ShaderPass(CopyShader)], '✗ composer: RenderPass → ShaderPass(CopyShader)  // e.g. an FXAA or custom pass, no OutputPass');
    data.snapshots.push({ label: '✗ no OutputPass: linear values on screen', src: bad.toDataURL(), tone: 'bad' });
    d.check('Without OutputPass the image stays linear: #808080 shows far too dark', bad.at(0.5, 0.5)[0] < 80, `#808080 (128) displays as ${bad.at(0.5, 0.5)[0]}`);
    const good = composeShot(d, renderer, gray, cam, [new RenderPass(gray, cam), new ShaderPass(CopyShader), new OutputPass()], '✓ … → OutputPass');
    data.snapshots.push({ label: '✓ with OutputPass', src: good.toDataURL(), tone: 'ok' });
    d.check('OutputPass applies tone mapping + sRGB conversion at the end', Math.abs(good.at(0.5, 0.5)[0] - 128) <= 3, `displays as ${good.at(0.5, 0.5)[0]}`);
    disposeTree(gray);
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  camera.position.z = 4;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) })));
  const plain = composeShot(d, renderer, scene, camera, [new RenderPass(scene, camera), new OutputPass()], 'composer: RenderPass → OutputPass');
  const bloom = composeShot(d, renderer, scene, camera, [new RenderPass(scene, camera), new UnrealBloomPass(v2, p.strength, p.radius, p.threshold), new OutputPass()], `composer: RenderPass → UnrealBloomPass(${p.strength}, ${p.radius}, ${p.threshold}) → OutputPass`);
  data.snapshots.push({ label: 'without bloom', src: plain.toDataURL(), tone: 'ok' }, { label: 'with UnrealBloomPass', src: bloom.toDataURL(), tone: 'ok' });
  const ring = (px) => round((luminance(px.at(0.5, 0.2)) + luminance(px.at(0.5, 0.8)) + luminance(px.at(0.2, 0.5)) + luminance(px.at(0.8, 0.5))) / 4, 1);
  const halo = { plain: ring(plain), bloom: ring(bloom) };
  data.halo = halo;
  d.check('The bright sphere itself is drawn either way', luminance(plain.at(0.5, 0.5)) > 200 && luminance(bloom.at(0.5, 0.5)) > 200, `center ${luminance(plain.at(0.5, 0.5))} / ${luminance(bloom.at(0.5, 0.5))}`);
  if (p.strength > 0.2) {
    d.check('Bloom spreads light into the dark pixels around bright areas', halo.bloom > halo.plain + 5, `brightness around the sphere ${halo.plain} → ${halo.bloom}`);
  } else {
    d.check('With strength ≈ 0 the bloom pass adds (almost) nothing', halo.bloom < halo.plain + 6, `brightness around the sphere ${halo.plain} → ${halo.bloom}`);
  }
  d.check('Each pass is a full-screen draw on top of the scene render', renderer.info.render.calls >= 1, `${renderer.info.render.calls} draw calls in the last pass`);
  disposeTree(scene);
  return d.result(data);
}

// ---- Tone mapping & color management -------------------------------------------------------------

export const TONE_MAPPINGS = { None: THREE.NoToneMapping, Linear: THREE.LinearToneMapping, Reinhard: THREE.ReinhardToneMapping, Cineon: THREE.CineonToneMapping, ACESFilmic: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping };
export const HDR_LEVELS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];

export const toneParams = (i = {}) => ({ mode: oneOf(i.mode, ['AgX', 'Neutral', 'ACESFilmic', 'None', 'Linear', 'Reinhard', 'Cineon']), exposure: clamp(i.exposure, 0.1, 4, 1) });

export function buildTone(p, { renderer }) {
  renderer.toneMapping = TONE_MAPPINGS[p.mode];
  renderer.toneMappingExposure = p.exposure;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 1, 9);
  const sun = new THREE.DirectionalLight(0xfff1d6, 12);
  sun.position.set(3, 5, 4);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.3));
  ['#ef4444', '#22d3ee', '#fbbf24', '#e2e8f0'].forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.75, 48, 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
    m.position.set((i - 1.5) * 2, 1.2, 0);
    scene.add(m);
  });
  HDR_LEVELS.forEach((v, i) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v * 0.55, v * 0.25) }));
    panel.position.set((i - 3.5) * 0.95, -1, 0);
    scene.add(panel);
  });
  return { scene, camera, hud: () => `renderer.toneMapping = ${p.mode}ToneMapping · exposure ${p.exposure}` };
}

function rampScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, HDR_LEVELS.length, 1, 0, 0.1, 10);
  camera.position.z = 2;
  HDR_LEVELS.forEach((v, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v * 0.55, v * 0.25) }));
    m.position.set(i + 0.5, 0.5, 0);
    scene.add(m);
  });
  return { scene, camera };
}

export async function runTone(inputs, mode = 'run') {
  const p = toneParams(inputs);
  const d = new Demo('tone-mapping');
  const renderer = getCheckRenderer(64, 8);
  const data = { params: p, curves: {} };
  const c = new THREE.Color('#808080');
  d.cmd(`ColorManagement.enabled = ${THREE.ColorManagement.enabled}; working space ${THREE.ColorManagement.workingColorSpace}; new Color('#808080').r → ${round(c.r, 4)}`);
  d.check('Colors are stored linear: CSS #808080 becomes 0.2159 in the working space', Math.abs(c.r - 0.2159) < 0.001, `r = ${round(c.r, 4)}`);
  const { scene, camera } = rampScene();
  d.cmd(`8 panels with linear (HDR) colors: red channel ${HDR_LEVELS.join(', ')}`);
  const sampleRow = (px) => HDR_LEVELS.map((_, i) => px.at((i + 0.5) / HDR_LEVELS.length, 0.5));
  for (const name of Object.keys(TONE_MAPPINGS)) {
    renderer.toneMapping = TONE_MAPPINGS[name];
    renderer.toneMappingExposure = name === p.mode ? p.exposure : 1;
    const px = shoot(d, renderer, scene, camera, `renderer.toneMapping = ${name}ToneMapping${name === p.mode ? `; toneMappingExposure = ${p.exposure}` : ''}; render`);
    data.curves[name] = sampleRow(px);
  }
  const none = data.curves.None;
  const clipped = none.filter((q) => q[0] === 255).length;
  d.check('NoToneMapping clips: every panel ≥ 1.0 becomes the same 255 red', clipped >= 4 && new Set(none.slice(3).map((q) => q[0])).size === 1, `${clipped} of 8 panels at red = 255`);
  const agx = data.curves.AgX.map(luminance);
  const rising = agx.every((v, i) => i === 0 || v >= agx[i - 1]) && new Set(agx).size >= 7;
  if (p.mode !== 'AgX' || p.exposure <= 1.5) d.check('AgX keeps the HDR steps distinguishable (brightness keeps rising)', rising, agx.join(' ≤ '));
  const aces = data.curves.ACESFilmic.map(luminance);
  if (p.mode !== 'ACESFilmic' || p.exposure <= 1.5) d.check('ACESFilmic also compresses highlights instead of clipping them', aces[5] > aces[4] && aces[6] >= aces[5], aces.join(', '));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.5;
  const low = shoot(d, renderer, scene, camera, 'AgX, toneMappingExposure = 0.5');
  renderer.toneMappingExposure = 2;
  const high = shoot(d, renderer, scene, camera, 'AgX, toneMappingExposure = 2');
  d.check('toneMappingExposure scales scene light before the curve', luminance(high.at(0.31, 0.5)) > luminance(low.at(0.31, 0.5)) + 20, `mid panel ${luminance(low.at(0.31, 0.5))} → ${luminance(high.at(0.31, 0.5))}`);

  if (mode === 'target') {
    const target = new THREE.WebGLRenderTarget(64, 8);
    const read = (tm) => {
      renderer.toneMapping = tm;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      return readTarget(renderer, target);
    };
    const a = read(THREE.NoToneMapping);
    const b = read(THREE.ACESFilmicToneMapping);
    const same = a.buf.every((v, i) => v === b.buf[i]);
    d.cmd(`✗ renderer.toneMapping = ACESFilmicToneMapping; renderer.setRenderTarget(target); render → ${same ? 'identical bytes to NoToneMapping' : 'different'}`);
    d.check('Tone mapping is skipped when rendering into a render target', same, same ? 'every byte equals the NoToneMapping render' : 'bytes differ');
    target.dispose();
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    const fixed = composeShot(d, renderer, scene, camera, [new RenderPass(scene, camera), new OutputPass()], '✓ render into the composer\'s targets, finish with OutputPass (ACESFilmic)');
    const want = data.curves.ACESFilmic[6];
    const got = fixed.at((6 + 0.5) / HDR_LEVELS.length, 0.5);
    d.check('OutputPass applies the tone mapping at the end, exactly like a screen render', colorDistance(got, want) < 6, `panel 8.0: ${rgb(got)} vs screen ${rgb(want)}`);
  }
  data.curves = Object.fromEntries(Object.entries(data.curves).map(([k, v]) => [k, v.map((q) => q.slice(0, 3))]));
  disposeTree(scene);
  return d.result(data);
}

// ---- WebGPURenderer & TSL -----------------------------------------------------------------------------

export const webgpuParams = (i = {}) => ({
  forceWebGL: i.forceWebGL === undefined ? false : bool(i.forceWebGL),
  frequency: clampInt(i.frequency, 1, 16, 4),
  colorA: hexColor(i.colorA, '#22d3ee'),
  colorB: hexColor(i.colorB, '#f472b6'),
});

/** Loaded on demand: the WebGPU build (three/webgpu + three/tsl) only downloads when this page needs it. */
export const loadWebGPU = () => Promise.all([import('three/webgpu'), import('three/tsl')]).then(([gpu, tsl]) => ({ gpu, tsl }));

export function tslStripes({ gpu, tsl }, p, { animated = false } = {}) {
  const { mix, step, fract, uv, uniform, time } = tsl;
  const uA = uniform(new gpu.Color(p.colorA));
  const uB = uniform(new gpu.Color(p.colorB));
  const uFreq = uniform(p.frequency);
  const material = new gpu.MeshBasicNodeMaterial();
  const x = animated ? uv().x.mul(uFreq).add(time.mul(0.25)) : uv().x.mul(uFreq);
  material.colorNode = mix(uA, uB, step(0.5, fract(x)));
  return { material, uA, uB, uFreq };
}

export async function runWebGPU(inputs, mode = 'run') {
  const p = webgpuParams(inputs);
  const d = new Demo('webgpu-tsl');
  if (!hasWebGL2() && !(typeof navigator !== 'undefined' && navigator.gpu)) throw new NeedsWebGLError();
  const data = { params: p, snapshots: [] };
  const mods = await d.timeAsync("await import('three/webgpu'); await import('three/tsl')  // loaded on demand", loadWebGPU);
  const { gpu } = mods;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const renderer = new gpu.WebGPURenderer({ canvas, antialias: false, forceWebGL: p.forceWebGL });
  renderer.setSize(64, 64, false);
  d.cmd(`renderer = new WebGPURenderer({ antialias: false, forceWebGL: ${p.forceWebGL} })`);
  const scene = new gpu.Scene();
  const camera = new gpu.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const stripes = tslStripes(mods, p);
  scene.add(new gpu.Mesh(new gpu.PlaneGeometry(2, 2), stripes.material));
  d.cmd(`material = new MeshBasicNodeMaterial(); material.colorNode = mix(uniform(colorA), uniform(colorB), step(0.5, fract(uv().x.mul(${p.frequency}))))`);

  if (mode === 'noinit') {
    const att = await d.attempt('renderer.render(scene, camera)  // before await renderer.init()', () => renderer.render(scene, camera));
    d.check('Rendering before init() throws: the backend is created asynchronously', att.error && att.error.message.includes('before the backend is initialized'), att.error ? att.error.message : 'no error');
  }

  const init = await d.attempt('await renderer.init()', () => renderer.init());
  const fallbackWarned = init.logs.some((l) => l.message.includes('WebGPU is not available'));
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  d.cmd(`renderer.backend → ${backend}${fallbackWarned ? ' (automatic fallback: WebGPU not available here)' : ''}`);
  data.backend = backend;
  data.fallback = fallbackWarned;
  d.check('init() resolved and picked a backend', init.ok && (renderer.backend.isWebGPUBackend || renderer.backend.isWebGLBackend), `${backend}${p.forceWebGL ? ' (forced)' : ''}`);
  if (p.forceWebGL) d.check('forceWebGL: true always uses the WebGL 2 backend', renderer.backend.isWebGLBackend === true, backend);

  const target = new gpu.RenderTarget(64, 64);
  const read = async (label) => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const buf = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64);
    d.cmd(`${label}; await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64)`);
    return new Pixels(new Uint8Array(buf.buffer, buf.byteOffset, 64 * 64 * 4), 64, 64);
  };
  const px = await read('renderer.setRenderTarget(target); renderer.render(scene, camera)');
  data.snapshots.push({ label: `TSL stripes via ${backend}`, src: px.toDataURL(), tone: 'ok' });
  const linear = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b].map((v) => Math.round(v * 255)); };
  const a = px.at(0.25 / p.frequency, 0.5);
  const b = px.at(0.75 / p.frequency, 0.5);
  d.check('The TSL node graph compiled to a shader and drew the stripes (colorA)', colorDistance(a, linear(p.colorA)) < 6, `${rgb(a)} vs linear ${rgb(linear(p.colorA))}`);
  d.check('…and colorB in the other half of each period', colorDistance(b, linear(p.colorB)) < 6, `${rgb(b)} vs linear ${rgb(linear(p.colorB))}`);
  stripes.uA.value.set('#ffffff');
  const px2 = await read("uA.value.set('#ffffff')  // uniform node update, no new shader");
  d.check('Updating a uniform() node changes the output without rebuilding the material', colorDistance(px2.at(0.25 / p.frequency, 0.5), [255, 255, 255]) < 4, rgb(px2.at(0.25 / p.frequency, 0.5)));
  target.dispose();
  stripes.material.dispose();
  scene.traverse((o) => o.geometry?.dispose());
  if (renderer.backend.isWebGLBackend) renderer.backend.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  renderer.dispose();
  return d.result(data);
}
