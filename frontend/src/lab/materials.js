// Materials & textures: material types, PBR + environment maps, textures/UVs/color space,
// transparency & blending, and custom GLSL with ShaderMaterial / onBeforeCompile.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Demo, bool, clamp, clampInt, disposeTree, oneOf, round } from './lab.js';
import { colorDistance, getCheckRenderer, hexToRgb, luminance, rgb, shoot } from './gpu.js';

const BG = 0x0b1120;
const BG_RGB = [11, 17, 32];
const isBg = (p) => colorDistance(p, BG_RGB) < 8;
const hexColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

function sphereShot(material, withLights) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.z = 3;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material));
  if (withLights) {
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(1, 1, 3);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.3));
  }
  return { scene, camera };
}

/** Mean luminance over every pixel that is not background. */
function meanLum(px) {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < px.h; y += 1) {
    for (let x = 0; x < px.w; x += 1) {
      const c = px.px(x, y);
      if (!isBg(c)) { sum += luminance(c); n += 1; }
    }
  }
  return n ? sum / n : 0;
}

function lumStdDev(px) {
  const values = [];
  for (let y = 0; y < px.h; y += 1) for (let x = 0; x < px.w; x += 1) { const c = px.px(x, y); if (!isBg(c)) values.push(luminance(c)); }
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1));
}

// ---- Material types -----------------------------------------------------------------------------

export const MATERIALS = [
  ['MeshBasicMaterial', (c) => new THREE.MeshBasicMaterial({ color: c }), 'unlit'],
  ['MeshLambertMaterial', (c) => new THREE.MeshLambertMaterial({ color: c }), 'lit'],
  ['MeshPhongMaterial', (c) => new THREE.MeshPhongMaterial({ color: c, shininess: 80 }), 'lit'],
  ['MeshStandardMaterial', (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0 }), 'lit'],
  ['MeshPhysicalMaterial', (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 }), 'lit'],
  ['MeshToonMaterial', (c) => new THREE.MeshToonMaterial({ color: c }), 'lit'],
  ['MeshNormalMaterial', () => new THREE.MeshNormalMaterial(), 'unlit'],
];

export const materialParams = (i = {}) => ({ color: hexColor(i.color, '#f472b6') });

export function buildMaterials(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
  camera.position.set(0, 1.2, 9);
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(3, 4, 5);
  const fill = new THREE.PointLight(0x60a5fa, 15, 0, 2);
  fill.position.set(-4, -1, 3);
  scene.add(key, fill, new THREE.AmbientLight(0xffffff, 0.15));
  const geo = new THREE.TorusKnotGeometry(0.45, 0.16, 128, 24);
  const meshes = MATERIALS.map(([, make], i) => {
    const m = new THREE.Mesh(geo, make(p.color));
    const col = i % 4;
    const row = Math.floor(i / 4);
    m.position.set((col - 1.5 + (row ? 0.5 : 0)) * 2, row ? -1.1 : 1.1, 0);
    scene.add(m);
    return m;
  });
  return {
    scene,
    camera,
    tick: (dt, t) => {
      meshes.forEach((m) => { m.rotation.y += dt * 0.5; m.rotation.x += dt * 0.2; });
      key.position.x = Math.sin(t * 0.7) * 5;
    },
  };
}

export async function runMaterials(inputs, mode = 'run') {
  const p = materialParams(inputs);
  const d = new Demo('materials');
  const renderer = getCheckRenderer(48, 48);
  const data = { params: p, rows: [], snapshots: [] };

  if (mode === 'nolight') {
    const { scene, camera } = sphereShot(new THREE.MeshStandardMaterial({ color: p.color }), false);
    const dark = shoot(d, renderer, scene, camera, '✗ MeshStandardMaterial in a scene with no lights');
    data.snapshots.push({ label: '✗ no lights', src: dark.toDataURL(), tone: 'bad' });
    d.check('A lit material with no lights renders black', luminance(dark.at(0.5, 0.5)) < 3 && dark.calls === 1, `center ${rgb(dark.at(0.5, 0.5))}, drawn with ${dark.calls} call`);
    disposeTree(scene);
    const att = await d.attempt("new MeshStandardMaterial({ colour: 'red' })  // British spelling", () => new THREE.MeshStandardMaterial({ colour: 'red' }).dispose());
    d.check('Unknown material options are not errors, only a console warning', att.ok && att.logs.some((l) => l.message.includes("'colour' is not a property of THREE.MeshStandardMaterial")), att.logs[0]?.message);
  }

  const programIds = new Set();
  for (const [name, make, kind] of MATERIALS) {
    const lit = sphereShot(make(p.color), true);
    const a = shoot(d, renderer, lit.scene, lit.camera, `render sphere with new ${name}() + lights`);
    programIds.add(renderer.properties.get(lit.scene.children[0].material).currentProgram?.id);
    const dark = sphereShot(make(p.color), false);
    const b = shoot(d, renderer, dark.scene, dark.camera, `render sphere with new ${name}(), no lights`);
    data.rows.push({ name, kind, lit: luminance(a.at(0.42, 0.42)), unlit: luminance(b.at(0.42, 0.42)), litRgb: a.at(0.42, 0.42), src: a.toDataURL() });
    disposeTree(lit.scene);
    disposeTree(dark.scene);
  }
  const row = (n) => data.rows.find((r) => r.name === n);
  const unlitOk = ['MeshBasicMaterial', 'MeshNormalMaterial'].every((n) => Math.abs(row(n).lit - row(n).unlit) < 2);
  d.check('Basic and Normal materials ignore lights entirely', unlitOk, `Basic ${row('MeshBasicMaterial').lit} vs ${row('MeshBasicMaterial').unlit}`);
  const litNames = data.rows.filter((r) => r.kind === 'lit');
  d.check('Lambert, Phong, Standard, Physical and Toon go black without lights', litNames.every((r) => r.unlit < 3 && r.lit > 15), litNames.map((r) => `${r.name.replace('Mesh', '').replace('Material', '')} ${r.unlit}→${r.lit}`).join(', '));
  const basic = row('MeshBasicMaterial').litRgb;
  const want = hexToRgb(p.color);
  d.check('MeshBasicMaterial shows the exact color you set', colorDistance(basic, want) < 6, `${rgb(basic)} vs ${p.color}`);
  d.check('Each material type compiles its own shader program', programIds.size === MATERIALS.length && !programIds.has(undefined), `${programIds.size} distinct programs for ${MATERIALS.length} materials`);
  return d.result(data);
}

// ---- PBR & environment maps --------------------------------------------------------------------------

export const pbrParams = (i = {}) => ({ metalness: clamp(i.metalness, 0, 1, 1), roughness: clamp(i.roughness, 0, 1, 0.2), envIntensity: clamp(i.envIntensity, 0, 3, 1) });

export function environmentFor(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  disposeTree(room);
  return env;
}

export function buildPbr(p, { renderer }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.environment = environmentFor(renderer);
  scene.environmentIntensity = p.envIntensity;
  const camera = new THREE.PerspectiveCamera(35, 1.6, 0.1, 100);
  camera.position.set(0, 0, 14);
  const geo = new THREE.SphereGeometry(0.55, 48, 24);
  for (let m = 0; m < 5; m += 1) {
    for (let r = 0; r < 5; r += 1) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: m / 4, roughness: r / 4 }));
      mesh.position.set((r - 2) * 1.35 - 2, (2 - m) * 1.35, 0);
      scene.add(mesh);
    }
  }
  const hero = new THREE.Mesh(new THREE.SphereGeometry(1.6, 64, 32), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: p.metalness, roughness: p.roughness }));
  hero.position.set(4.6, 0, 0);
  scene.add(hero);
  return { scene, camera, controls: { target: [0.6, 0, 0] } };
}

export async function runPbr(inputs, mode = 'run') {
  const p = pbrParams(inputs);
  const d = new Demo('pbr-environment');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };
  const shot = (scene, label, metalness = p.metalness, roughness = p.roughness) => {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.z = 3;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness, roughness }));
    scene.add(mesh);
    const px = shoot(d, renderer, scene, camera, label);
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    return px;
  };

  const lightOnly = new THREE.Scene();
  lightOnly.background = new THREE.Color(BG);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(2, 2, 3);
  lightOnly.add(sun);
  const noEnv = shot(lightOnly, `${mode === 'noenv' ? '✗ ' : ''}metalness ${p.metalness}, roughness ${p.roughness}, one DirectionalLight, no environment`);
  data.snapshots.push({ label: `${mode === 'noenv' ? '✗ ' : ''}DirectionalLight only`, src: noEnv.toDataURL(), tone: mode === 'noenv' ? 'bad' : 'warn' });

  const env = d.time('pmrem = new PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture', () => environmentFor(renderer));
  d.check('PMREM pre-filters the environment into roughness mip levels', env.mapping === THREE.CubeUVReflectionMapping, `texture.mapping = CubeUVReflectionMapping (${env.image?.width ?? '?'}×${env.image?.height ?? '?'})`);
  const lit = new THREE.Scene();
  lit.background = new THREE.Color(BG);
  lit.environment = env;
  lit.environmentIntensity = p.envIntensity;
  const withEnv = shot(lit, `same sphere with scene.environment (intensity ${p.envIntensity})`);
  data.snapshots.push({ label: '✓ scene.environment', src: withEnv.toDataURL(), tone: 'ok' });
  const a = meanLum(noEnv);
  const b = meanLum(withEnv);
  data.mean = { noEnv: round(a, 1), env: round(b, 1) };
  if (p.metalness > 0.7 && p.envIntensity > 0.3) {
    d.check('Metals reflect their surroundings: without an environment they go dark', b > a * 1.5, `mean brightness ${round(a, 1)} → ${round(b, 1)}`);
  } else {
    d.check('The environment adds image-based light to the sphere', b >= a - 1, `mean brightness ${round(a, 1)} → ${round(b, 1)}`);
  }
  const smooth = shot(lit, 'metal sphere, roughness 0.05', 1, 0.05);
  const rough = shot(lit, 'metal sphere, roughness 1.0', 1, 1);
  const sdSmooth = lumStdDev(smooth);
  const sdRough = lumStdDev(rough);
  data.snapshots.push({ label: 'roughness 0.05', src: smooth.toDataURL(), tone: 'ok' }, { label: 'roughness 1.0', src: rough.toDataURL(), tone: 'ok' });
  d.check('Low roughness = sharp reflections (more contrast), high = blurred', sdSmooth > sdRough * 1.3, `brightness spread ${round(sdSmooth, 1)} vs ${round(sdRough, 1)}`);
  data.spread = { smooth: round(sdSmooth, 1), rough: round(sdRough, 1) };
  if (mode === 'noenv') {
    d.check('The fix: one line, scene.environment = pmrem texture', b > a, `${round(a, 1)} → ${round(b, 1)}`);
  }
  env.dispose();
  disposeTree(lightOnly);
  return d.result(data);
}

// ---- Textures, UVs & color space ----------------------------------------------------------------------

const WRAPS = { Repeat: THREE.RepeatWrapping, MirroredRepeat: THREE.MirroredRepeatWrapping, ClampToEdge: THREE.ClampToEdgeWrapping };
const FILTERS = { Nearest: THREE.NearestFilter, Linear: THREE.LinearFilter };

export const textureParams = (i = {}) => ({
  repeat: clampInt(i.repeat, 1, 8, 3),
  wrap: oneOf(i.wrap, Object.keys(WRAPS)),
  filter: oneOf(i.filter, ['Nearest', 'Linear']),
  colorSpace: oneOf(i.colorSpace, ['srgb', 'none']),
});

/** A 2×2 black/white checker as raw RGBA bytes: no image loading needed. */
function checker() {
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]), 2, 2);
  tex.needsUpdate = true;
  return tex;
}

function uvGridTexture(p) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext?.('2d');
  if (!g) return checker();
  const cells = 4;
  const hues = ['#22d3ee', '#f472b6', '#fbbf24', '#34d399'];
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      g.fillStyle = (x + y) % 2 ? '#0f172a' : hues[(x + y * 2) % 4];
      g.fillRect(x * 64, y * 64, 64, 64);
      g.fillStyle = (x + y) % 2 ? '#e2e8f0' : '#0f172a';
      g.font = 'bold 22px sans-serif';
      g.fillText(`${x},${cells - 1 - y}`, x * 64 + 14, y * 64 + 40);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  if (p.colorSpace === 'srgb') tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTextures(p, { renderer }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 1.2, 4.8);
  const tex = uvGridTexture(p);
  tex.wrapS = tex.wrapT = WRAPS[p.wrap];
  tex.repeat.set(p.repeat, p.repeat);
  tex.magFilter = FILTERS[p.filter];
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  cube.position.y = 0.2;
  scene.add(floor, cube);
  return { scene, camera, tick: (dt) => { cube.rotation.y += dt * 0.5; cube.rotation.x += dt * 0.2; } };
}

function planeShot(material) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera };
}

const transitions = (row) => row.slice(1).filter((p, i) => Math.abs(luminance(p) - luminance(row[i])) > 100).length;

function grayTexture(colorSpace) {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

export async function runTextures(inputs, mode = 'run') {
  const p = textureParams(inputs);
  const d = new Demo('textures');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };

  const wrapRuns = {};
  for (const wrap of Object.keys(WRAPS)) {
    const tex = checker();
    tex.wrapS = tex.wrapT = WRAPS[wrap];
    tex.repeat.set(p.repeat, p.repeat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    const { scene, camera } = planeShot(new THREE.MeshBasicMaterial({ map: tex }));
    const px = shoot(d, renderer, scene, camera, `texture.wrapS = ${wrap}Wrapping; texture.repeat.set(${p.repeat}, ${p.repeat}); render`);
    wrapRuns[wrap] = { transitions: transitions(px.row(0.5)), src: px.toDataURL() };
    disposeTree(scene);
  }
  const r = p.repeat;
  d.check(`RepeatWrapping tiles the 2-cell checker ${r}× → ${2 * r - 1} edges per row`, wrapRuns.Repeat.transitions === 2 * r - 1, `${wrapRuns.Repeat.transitions} black/white edges`);
  d.check(`MirroredRepeat flips every other tile → ${r} edges`, wrapRuns.MirroredRepeat.transitions === r, `${wrapRuns.MirroredRepeat.transitions} edges`);
  d.check('ClampToEdge stretches the last texel instead of repeating', wrapRuns.ClampToEdge.transitions === 1, `${wrapRuns.ClampToEdge.transitions} edge`);
  data.wraps = wrapRuns;

  const filterRuns = {};
  for (const filter of ['Nearest', 'Linear']) {
    const tex = checker();
    tex.magFilter = FILTERS[filter];
    const { scene, camera } = planeShot(new THREE.MeshBasicMaterial({ map: tex }));
    const px = shoot(d, renderer, scene, camera, `2×2 texture magnified to 64×64, magFilter = ${filter}Filter`);
    filterRuns[filter] = { grays: px.count((c) => luminance(c) > 20 && luminance(c) < 235), src: px.toDataURL() };
    disposeTree(scene);
  }
  d.check('NearestFilter keeps hard texel edges, LinearFilter blends them', filterRuns.Nearest.grays === 0 && filterRuns.Linear.grays > 500, `in-between pixels: Nearest ${filterRuns.Nearest.grays}, Linear ${filterRuns.Linear.grays}`);
  data.filters = filterRuns;

  const shade = (cs, label) => {
    const { scene, camera } = planeShot(new THREE.MeshBasicMaterial({ map: grayTexture(cs) }));
    const px = shoot(d, renderer, scene, camera, label);
    disposeTree(scene);
    return px;
  };
  if (mode === 'colorspace') {
    const bad = shade(THREE.NoColorSpace, '✗ texel (128,128,128) with texture.colorSpace left at NoColorSpace');
    data.snapshots.push({ label: '✗ NoColorSpace: washed out', src: bad.toDataURL(), tone: 'bad' });
    d.check('A color texture without colorSpace = SRGBColorSpace looks washed out', bad.at(0.5, 0.5)[0] > 170, `128 is displayed as ${bad.at(0.5, 0.5)[0]}`);
    data.washed = bad.at(0.5, 0.5)[0];
  }
  const good = shade(THREE.SRGBColorSpace, `${mode === 'colorspace' ? '✓ ' : ''}texel (128,128,128) with texture.colorSpace = SRGBColorSpace`);
  data.snapshots.push({ label: '✓ SRGBColorSpace: exact', src: good.toDataURL(), tone: 'ok' });
  d.check('With SRGBColorSpace a texel comes out exactly as authored', Math.abs(good.at(0.5, 0.5)[0] - 128) <= 2, `128 is displayed as ${good.at(0.5, 0.5)[0]}`);
  data.exact = good.at(0.5, 0.5)[0];
  return d.result(data);
}

// ---- Transparency, blending & sorting ---------------------------------------------------------------

const BLENDS = { Normal: THREE.NormalBlending, Additive: THREE.AdditiveBlending, Subtractive: THREE.SubtractiveBlending };

export const transparencyParams = (i = {}) => ({
  opacity: clamp(i.opacity, 0, 1, 0.5),
  blending: oneOf(i.blending, Object.keys(BLENDS)),
  depthWrite: i.depthWrite === undefined ? false : bool(i.depthWrite),
  alphaTest: clamp(i.alphaTest, 0, 1, 0.5),
});

export function buildTransparency(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 1, 6);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.4));
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.2, 128, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
  scene.add(core);
  const colors = [0xef4444, 0x22d3ee, 0xa78bfa];
  const panes = colors.map((color, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: p.opacity, depthWrite: p.depthWrite, blending: BLENDS[p.blending], side: THREE.DoubleSide }));
    m.userData.phase = (i / 3) * Math.PI * 2;
    scene.add(m);
    return m;
  });
  let t = 0;
  return {
    scene,
    camera,
    tick: (dt) => {
      t += dt * 0.5;
      panes.forEach((m) => {
        const a = t + m.userData.phase;
        m.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
        m.lookAt(0, 0, 0);
      });
      core.rotation.y += dt * 0.4;
    },
  };
}

function layered(front, { back = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  if (back) {
    const red = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    red.position.z = -1;
    scene.add(red);
  }
  const blue = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), front);
  scene.add(blue);
  return { scene, camera };
}

export async function runTransparency(inputs, mode = 'run') {
  const p = transparencyParams(inputs);
  const d = new Demo('transparency');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };
  const a = p.opacity;

  if (mode === 'opaque') {
    const { scene, camera } = layered(new THREE.MeshBasicMaterial({ color: 0x0000ff, opacity: 0.3 }));
    const px = shoot(d, renderer, scene, camera, '✗ new MeshBasicMaterial({ color: blue, opacity: 0.3 })  // transparent not set');
    data.snapshots.push({ label: '✗ opacity without transparent', src: px.toDataURL(), tone: 'bad' });
    const c = px.at(0.5, 0.5);
    d.check('opacity is ignored unless transparent: true', c[2] > 250 && c[0] < 5, `center ${rgb(c)} (solid blue)`);
    disposeTree(scene);
    const fixed = layered(new THREE.MeshBasicMaterial({ color: 0x0000ff, opacity: 0.3, transparent: true }));
    const px2 = shoot(d, renderer, fixed.scene, fixed.camera, '✓ add transparent: true');
    data.snapshots.push({ label: '✓ transparent: true', src: px2.toDataURL(), tone: 'ok' });
    d.check('With transparent: true the red shows through', px2.at(0.5, 0.5)[0] > 100, `center ${rgb(px2.at(0.5, 0.5))}`);
    disposeTree(fixed.scene);
  }

  if (mode === 'sorting') {
    const sortScene = (sort) => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 5;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.5 }));
      front.position.set(0.3, 0, 0);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 }));
      back.position.set(-0.3, 0, -1);
      scene.add(front, back); // front first: drawing in this order writes its depth before the back pane
      renderer.sortObjects = sort;
      const px = shoot(d, renderer, scene, camera, `${sort ? '✓' : '✗'} renderer.sortObjects = ${sort}; two transparent panes with depthWrite: true`);
      renderer.sortObjects = true;
      disposeTree(scene);
      return px;
    };
    const bad = sortScene(false);
    const good = sortScene(true);
    data.snapshots.push({ label: '✗ unsorted: back pane hidden in the overlap', src: bad.toDataURL(), tone: 'bad' }, { label: '✓ sorted back-to-front', src: good.toDataURL(), tone: 'ok' });
    d.check('Drawn front-first with depthWrite, the back pane fails the depth test', bad.at(0.5, 0.5)[0] < 5, `overlap ${rgb(bad.at(0.5, 0.5))} (no red)`);
    d.check('Sorted back-to-front, the overlap blends both panes', good.at(0.5, 0.5)[0] > 40 && good.at(0.5, 0.5)[2] > 100, `overlap ${rgb(good.at(0.5, 0.5))}`);
  }

  const mat = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: a, blending: BLENDS[p.blending], depthWrite: p.depthWrite });
  const { scene, camera } = layered(mat);
  const px = shoot(d, renderer, scene, camera, `blue pane over red: new MeshBasicMaterial({ transparent: true, opacity: ${a}, blending: ${p.blending}Blending })`);
  data.snapshots.push({ label: `${p.blending} blending, opacity ${a}`, src: px.toDataURL(), tone: 'ok' });
  const c = px.at(0.5, 0.5);
  // Drawing straight to the canvas, the GPU blends the sRGB values the shader already wrote
  let want;
  if (p.blending === 'Normal') want = [255 * (1 - a), 0, 255 * a];
  else if (p.blending === 'Additive') want = [255, 0, 255 * a];
  else want = [255, 0, 0];
  want = want.map(Math.round);
  const label = p.blending === 'Normal' ? 'src × α + dst × (1 − α)' : p.blending === 'Additive' ? 'src × α + dst' : 'dst × (1 − src)';
  d.check(`${p.blending} blending: ${label}`, colorDistance(c, want) <= 6, `measured ${rgb(c)}, expected ${rgb(want)}`);
  data.blend = { measured: c, expected: want };
  disposeTree(scene);

  // alphaTest: discard fragments whose alpha is below the threshold (no sorting needed)
  const ramp = new Uint8Array(64 * 4);
  for (let x = 0; x < 64; x += 1) ramp.set([0, 0, 255, Math.round((x / 63) * 255)], x * 4);
  const rampTex = new THREE.DataTexture(ramp, 64, 1);
  rampTex.needsUpdate = true;
  const cut = layered(new THREE.MeshBasicMaterial({ map: rampTex, alphaTest: p.alphaTest, transparent: false }));
  cut.scene.children[1].scale.set(2, 2, 1);
  const px2 = shoot(d, renderer, cut.scene, cut.camera, `alpha ramp 0 → 1 left to right, alphaTest: ${p.alphaTest}`);
  data.snapshots.push({ label: `alphaTest ${p.alphaTest}`, src: px2.toDataURL(), tone: 'ok' });
  const row = px2.row(0.5);
  const firstBlue = row.findIndex((q) => q[2] > 200);
  const edge = firstBlue < 0 ? 64 : firstBlue;
  d.check('alphaTest cuts fragments below the threshold: a hard edge, no blending', Math.abs(edge / 64 - p.alphaTest) < 0.06, `edge at ${round(edge / 64, 2)} of the width, alphaTest ${p.alphaTest}`);
  data.edge = round(edge / 64, 2);
  disposeTree(cut.scene);
  return d.result(data);
}

// ---- ShaderMaterial & GLSL ----------------------------------------------------------------------------

export const shaderParams = (i = {}) => ({ colorA: hexColor(i.colorA, '#22d3ee'), colorB: hexColor(i.colorB, '#f472b6'), frequency: clampInt(i.frequency, 1, 20, 4) });

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = (convert = true) => /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uFreq;
uniform float uTime;
varying vec2 vUv;
void main() {
  float stripe = step(0.5, fract(vUv.x * uFreq + uTime * 0.2));
  gl_FragColor = vec4(mix(uColorA, uColorB, stripe), 1.0);
  ${convert ? '#include <colorspace_fragment>' : '// (no colorspace_fragment: output stays linear)'}
}`;

export function stripeMaterial(p, convert = true) {
  return new THREE.ShaderMaterial({
    uniforms: { uColorA: { value: new THREE.Color(p.colorA) }, uColorB: { value: new THREE.Color(p.colorB) }, uFreq: { value: p.frequency }, uTime: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: fragment(convert),
  });
}

/** onBeforeCompile: patch a built-in material's shader instead of writing one from scratch. */
export function twistedStandard(color, uniforms) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTwist = uniforms.uTwist;
    shader.vertexShader = `uniform float uTwist;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float twist = position.y * uTwist;
      transformed.xz = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * transformed.xz;`,
    );
    material.userData.shader = shader;
  };
  return material;
}

export function buildShader(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 0.5, 5);
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(2, 3, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.3));
  const stripes = stripeMaterial(p);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), stripes);
  ball.position.x = -1.4;
  const twist = { uTwist: { value: 0 } };
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9, 8, 48, 8), twistedStandard(0xfbbf24, twist));
  bar.position.x = 1.4;
  scene.add(ball, bar);
  return {
    scene,
    camera,
    tick: (dt, t) => {
      stripes.uniforms.uTime.value = t;
      twist.uTwist.value = Math.sin(t) * 1.2;
      ball.rotation.y += dt * 0.3;
    },
  };
}

export async function runShader(inputs, mode = 'run') {
  const p = shaderParams(inputs);
  const d = new Demo('custom-shaders');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };
  const flat = (material) => planeShot(material);

  if (mode === 'typo') {
    const broken = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: 'void main() {\n  vec3 color = vec4(1.0);  // vec4 assigned to vec3\n  gl_FragColor = vec4(color, 1.0);\n}' });
    broken.name = 'BrokenStripes';
    const { scene, camera } = flat(broken);
    const att = await d.attempt('render a ShaderMaterial whose fragment shader assigns a vec4 to a vec3', () => shoot(d, renderer, scene, camera, '✗ renderer.render(scene, camera)'));
    const msg = att.logs.find((l) => l.message.includes('Shader Error'))?.message || '';
    data.shaderError = msg.split('\n').filter(Boolean).slice(0, 12).join('\n');
    d.check('The GLSL compiler rejects it: THREE.WebGLProgram: Shader Error', msg.includes('THREE.WebGLProgram: Shader Error') && /ERROR/i.test(msg), msg.split('\n').find((l) => /ERROR/.test(l)) || 'no compiler log');
    d.check('Nothing is drawn: a program that fails to link is skipped', att.value ? isBg(att.value.at(0.5, 0.5)) || luminance(att.value.at(0.5, 0.5)) < 3 : true, att.value ? `center ${rgb(att.value.at(0.5, 0.5))}` : '');
    disposeTree(scene);
  }

  if (mode === 'nocolorspace') {
    const { scene, camera } = flat(stripeMaterial({ ...p, colorA: '#808080', colorB: '#808080' }, false));
    const px = shoot(d, renderer, scene, camera, "✗ uColorA = new Color('#808080'), shader writes it without #include <colorspace_fragment>");
    data.snapshots.push({ label: '✗ no colorspace_fragment: too dark', src: px.toDataURL(), tone: 'bad' });
    d.check('Color uniforms are linear: written raw, #808080 displays far too dark', px.at(0.5, 0.5)[0] < 80, `#808080 (128) displays as ${px.at(0.5, 0.5)[0]}`);
    disposeTree(scene);
    const fixed = flat(stripeMaterial({ ...p, colorA: '#808080', colorB: '#808080' }, true));
    const px2 = shoot(d, renderer, fixed.scene, fixed.camera, '✓ end the fragment shader with #include <colorspace_fragment>');
    data.snapshots.push({ label: '✓ with colorspace_fragment', src: px2.toDataURL(), tone: 'ok' });
    d.check('With the include, the color matches what you picked', Math.abs(px2.at(0.5, 0.5)[0] - 128) <= 2, `displays as ${px2.at(0.5, 0.5)[0]}`);
    disposeTree(fixed.scene);
  }

  const material = stripeMaterial(p);
  const { scene, camera } = flat(material);
  d.cmd(`new ShaderMaterial({ uniforms: { uColorA, uColorB, uFreq: { value: ${p.frequency} } }, vertexShader, fragmentShader })`);
  const px = shoot(d, renderer, scene, camera);
  data.snapshots.push({ label: 'ShaderMaterial stripes', src: px.toDataURL(), tone: 'ok' });
  const sampleA = px.at(0.25 / p.frequency, 0.5);
  const sampleB = px.at(0.75 / p.frequency, 0.5);
  d.check('Stripe pattern from GLSL: first half of each period is colorA', colorDistance(sampleA, hexToRgb(p.colorA)) < 8, `${rgb(sampleA)} vs ${p.colorA}`);
  d.check('…and the second half is colorB', colorDistance(sampleB, hexToRgb(p.colorB)) < 8, `${rgb(sampleB)} vs ${p.colorB}`);
  const programs = renderer.info.programs.length;
  material.uniforms.uColorA.value.set('#ffffff');
  d.cmd("material.uniforms.uColorA.value.set('#ffffff')  // a uniform change, no recompile");
  const px2 = shoot(d, renderer, scene, camera);
  d.check('Changing a uniform updates the picture without recompiling', colorDistance(px2.at(0.25 / p.frequency, 0.5), [255, 255, 255]) < 4 && renderer.info.programs.length === programs, `${rgb(px2.at(0.25 / p.frequency, 0.5))}, programs ${programs} → ${renderer.info.programs.length}`);
  disposeTree(scene);

  const twist = { uTwist: { value: 1 } };
  const patched = twistedStandard(0xfbbf24, twist);
  const s2 = new THREE.Scene();
  s2.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1, 4, 16, 4), patched), new THREE.AmbientLight(0xffffff, 1));
  const cam2 = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  cam2.position.z = 5;
  shoot(d, renderer, s2, cam2, 'MeshStandardMaterial with onBeforeCompile replacing #include <begin_vertex>');
  const vs = patched.userData.shader?.vertexShader || '';
  d.check('onBeforeCompile patched the built-in shader before compiling', vs.includes('uTwist') && vs.includes('float twist'), `vertex shader ${vs.length} chars, contains the twist code`);
  disposeTree(s2);
  data.fragment = fragment();
  return d.result(data);
}

