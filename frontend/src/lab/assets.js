// Assets & loading: a real glTF export → import round trip, and LoadingManager + TextureLoader
// fetching real PNG files from this site (frontend/public/textures).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Demo, bool, clampInt, disposeTree, round } from './lab.js';

const BG = 0x0b1120;

// ---- glTF export & load -----------------------------------------------------------------------

export const gltfParams = (i = {}) => ({
  parts: clampInt(i.parts, 1, 12, 6),
  animation: i.animation === undefined ? true : bool(i.animation),
  binary: i.binary === undefined ? true : bool(i.binary),
});

/** A small "robot" made of named parts with their own materials and a spin animation. */
export function makeRobot(parts) {
  const robot = new THREE.Group();
  robot.name = 'robot';
  for (let i = 0; i < parts; i += 1) {
    const a = (i / parts) * Math.PI * 2;
    const geo = i % 3 === 0 ? new THREE.BoxGeometry(0.6, 0.6, 0.6) : i % 3 === 1 ? new THREE.SphereGeometry(0.38, 24, 12) : new THREE.ConeGeometry(0.35, 0.8, 20);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / parts, 0.7, 0.55), roughness: 0.4, metalness: 0.1, name: `paint-${i}` }));
    mesh.name = `part-${i}`;
    mesh.position.set(Math.cos(a) * 1.3, Math.sin(i) * 0.3, Math.sin(a) * 1.3);
    robot.add(mesh);
  }
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.14, 96, 12), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.3, name: 'chrome' }));
  core.name = 'core';
  robot.add(core);
  const q = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg)).toArray();
  const clip = new THREE.AnimationClip('spin', 4, [new THREE.QuaternionKeyframeTrack('robot.quaternion', [0, 2, 4], [...q(0), ...q(180), ...q(359.9)])]);
  return { robot, clip };
}

export async function roundTrip(p, d) {
  const { robot, clip } = makeRobot(p.parts);
  const scene = new THREE.Scene();
  scene.add(robot);
  const exporter = new GLTFExporter();
  const t0 = performance.now();
  const output = await exporter.parseAsync(scene, { binary: p.binary, animations: p.animation ? [clip] : [] });
  const exportMs = performance.now() - t0;
  const bytes = p.binary ? output.byteLength : new TextEncoder().encode(JSON.stringify(output)).length;
  d?.cmd(`await new GLTFExporter().parseAsync(scene, { binary: ${p.binary}, animations: [${p.animation ? 'spin' : ''}] }) → ${p.binary ? 'GLB ArrayBuffer' : 'glTF JSON'} of ${(bytes / 1024).toFixed(1)} KB  (${exportMs.toFixed(1)} ms)`);
  const t1 = performance.now();
  const gltf = await new GLTFLoader().parseAsync(p.binary ? output : JSON.stringify(output), '');
  const loadMs = performance.now() - t1;
  d?.cmd(`await new GLTFLoader().parseAsync(data, '') → gltf.scene with ${gltf.scene.children.length} child, ${gltf.animations.length} animation(s)  (${loadMs.toFixed(1)} ms)`);
  return { robot, clip, scene, output, bytes, gltf, exportMs, loadMs };
}

export async function buildGltf(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 2.5, 8);
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x334155, 1));
  const rt = await roundTrip(p);
  rt.robot.position.x = -2.3;
  scene.add(rt.robot);
  const loaded = rt.gltf.scene;
  loaded.position.x = 2.3;
  scene.add(loaded);
  const mixers = [];
  if (p.animation) {
    const a = new THREE.AnimationMixer(rt.robot);
    a.clipAction(rt.clip).play();
    const b = new THREE.AnimationMixer(loaded);
    b.clipAction(rt.gltf.animations[0]).play();
    mixers.push(a, b);
  }
  return {
    scene,
    camera,
    hud: () => `left: built in code · right: exported to ${p.binary ? 'GLB' : 'glTF JSON'} (${(rt.bytes / 1024).toFixed(1)} KB) and loaded back`,
    tick: (dt) => mixers.forEach((m) => m.update(dt)),
  };
}

export async function runGltf(inputs, mode = 'run') {
  const p = gltfParams(inputs);
  const d = new Demo('gltf');
  const data = { params: p };

  if (mode === 'spa') {
    const loader = new GLTFLoader();
    const html = await d.attempt("new GLTFLoader().loadAsync('/models/robot')  // no extension: the SPA fallback answers with index.html", () => loader.loadAsync('/models/robot'));
    d.check('A URL that returns the HTML page fails as a JSON parse error, not a 404', html.error && /JSON|Unexpected token/i.test(html.error.message), html.error ? `${html.error.name}: ${html.error.message}` : 'loaded?!');
    const missing = await d.attempt("new GLTFLoader().loadAsync('/models/robot.glb')  // the file does not exist", () => loader.loadAsync('/models/robot.glb'));
    d.check('A missing model with a real extension gets an honest 404', Boolean(missing.error), missing.error ? `${missing.error.name}: ${missing.error.message}` : 'loaded?!');
    data.errors = [html.error && `${html.error.name}: ${html.error.message}`, missing.error && `${missing.error.name}: ${missing.error.message}`];
  }

  const rt = await roundTrip(p, d);
  const names = (root) => {
    const out = [];
    root.traverse((o) => o.isMesh && out.push(o.name));
    return out.sort();
  };
  const before = names(rt.robot);
  const after = names(rt.gltf.scene);
  d.check('Every mesh survives the round trip with its name', before.length === after.length && before.every((n, i) => n === after[i]), `${after.length} meshes: ${after.slice(0, 4).join(', ')}${after.length > 4 ? '…' : ''}`);
  const colorOf = (root, name) => root.getObjectByName(name)?.material.color.getHexString();
  const sameColors = before.every((n) => colorOf(rt.robot, n) === colorOf(rt.gltf.scene, n));
  d.check('Materials keep their PBR color (stored linear in glTF, converted on load)', sameColors, `part-0 #${colorOf(rt.robot, 'part-0')} → #${colorOf(rt.gltf.scene, 'part-0')}`);
  d.check('Animations are exported and loaded as AnimationClips', rt.gltf.animations.length === (p.animation ? 1 : 0), `${rt.gltf.animations.length} clip(s)${rt.gltf.animations[0] ? `: '${rt.gltf.animations[0].name}', ${rt.gltf.animations[0].duration} s` : ''}`);
  if (p.binary) {
    const magic = new TextDecoder().decode(new Uint8Array(rt.output, 0, 4));
    d.check('GLB is one binary file: "glTF" magic, JSON chunk + BIN chunk', magic === 'glTF', `header "${magic}", ${rt.bytes} bytes`);
  } else {
    d.check('glTF JSON embeds its buffers as base64 data URIs', rt.output.buffers?.[0]?.uri?.startsWith('data:'), `${rt.output.buffers?.length} buffer(s), ${rt.bytes} bytes`);
  }
  const json = p.binary ? null : rt.output;
  data.summary = {
    bytes: rt.bytes,
    exportMs: round(rt.exportMs, 1),
    loadMs: round(rt.loadMs, 1),
    meshes: after.length,
    materials: new Set(after.map((n) => rt.gltf.scene.getObjectByName(n).material.name)).size,
    animations: rt.gltf.animations.length,
    asset: rt.gltf.asset,
  };
  data.nodes = after;
  if (json) data.jsonKeys = Object.keys(json);
  disposeTree(rt.scene);
  disposeTree(rt.gltf.scene);
  return d.result(data);
}

// ---- LoadingManager & textures -----------------------------------------------------------------

export const TEXTURES = ['checker', 'bricks', 'grid', 'stripes', 'dots', 'noise'];

export const loadingParams = (i = {}) => ({ count: clampInt(i.count, 1, TEXTURES.length, 6), broken: i.broken === undefined ? false : bool(i.broken) });

/** Loads textures through one LoadingManager and resolves with every event it fired, in order. */
export function loadAll(urls, { onEvent } = {}) {
  return new Promise((resolve) => {
    const events = [];
    const started = performance.now();
    const at = () => round(performance.now() - started, 1);
    const push = (e) => { events.push({ ...e, t: at() }); onEvent?.(events[events.length - 1]); };
    const manager = new THREE.LoadingManager();
    const textures = {};
    manager.onStart = (url, loaded, total) => push({ type: 'start', url, loaded, total });
    manager.onProgress = (url, loaded, total) => push({ type: 'progress', url, loaded, total });
    manager.onError = (url) => push({ type: 'error', url });
    manager.onLoad = () => { push({ type: 'load' }); resolve({ events, textures }); };
    const loader = new THREE.TextureLoader(manager);
    urls.forEach((url) => {
      textures[url] = loader.load(url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; });
    });
    setTimeout(() => resolve({ events, textures, timedOut: true }), 10000);
  });
}

export function buildLoading(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 1.5, 8);
  const urls = TEXTURES.slice(0, p.count).map((n) => `/textures/${n}.png`);
  if (p.broken) urls.push('/textures/missing.png');
  const cubes = urls.map((url, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x334155, wireframe: true }));
    m.position.set((i - (urls.length - 1) / 2) * 1.5, 0, 0);
    scene.add(m);
    return m;
  });
  let status = 'loading…';
  // Each cube switches from a wireframe placeholder to its texture as that file arrives
  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);
  manager.onProgress = (url, loaded, total) => { status = `${loaded}/${total} · ${url}`; };
  manager.onLoad = () => { status = `onLoad: all ${urls.length} items settled`; };
  urls.forEach((url, i) => {
    loader.load(`${url}?live`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      cubes[i].material.dispose();
      cubes[i].material = new THREE.MeshBasicMaterial({ map: tex });
    }, undefined, () => {
      cubes[i].material.color.set(0xef4444);
    });
  });
  return {
    scene,
    camera,
    hud: () => status,
    tick: (dt) => cubes.forEach((c, i) => { c.rotation.y += dt * (0.4 + i * 0.05); c.rotation.x += dt * 0.2; }),
  };
}

export async function runLoading(inputs, mode = 'run') {
  const p = loadingParams(inputs);
  const d = new Demo('loading-manager');
  const broken = p.broken || mode === 'broken';
  const urls = TEXTURES.slice(0, p.count).map((n) => `/textures/${n}.png?t=${Date.now()}`);
  if (broken) urls.push('/textures/missing.png');
  d.cmd(`manager = new LoadingManager(); manager.onStart / onProgress / onError / onLoad = …; loader = new TextureLoader(manager)`);
  d.cmd(`${urls.length} × loader.load(url)  // ${urls.map((u) => u.split('?')[0].replace('/textures/', '')).join(', ')}`);
  const { events, textures, timedOut } = await loadAll(urls);
  events.forEach((e) => d.cmd(`${String(e.t).padStart(6)} ms  manager.on${e.type[0].toUpperCase()}${e.type.slice(1)}(${e.url ? `'${e.url.split('?')[0]}'` : ''}${e.total ? `, ${e.loaded}, ${e.total}` : ''})`));
  const progress = events.filter((e) => e.type === 'progress');
  const errors = events.filter((e) => e.type === 'error');
  d.check('onLoad fires once, after every item has settled', !timedOut && events.filter((e) => e.type === 'load').length === 1 && events[events.length - 1].type === 'load', timedOut ? 'timed out after 10 s' : `${events.length} events, onLoad last`);
  d.check('onProgress counts itemsLoaded up to itemsTotal', progress.length === urls.length && progress.every((e, i) => e.loaded === i + 1) && progress[progress.length - 1].total === urls.length, progress.map((e) => `${e.loaded}/${e.total}`).join(' '));
  const ok = Object.entries(textures).filter(([u]) => !u.includes('missing'));
  d.check('Each texture decoded to a 128 × 128 image', ok.every(([, t]) => t.image?.width === 128 && t.image?.height === 128), ok.map(([, t]) => `${t.image?.width}×${t.image?.height}`).slice(0, 3).join(', '));
  if (broken) {
    d.check('A missing file calls onError with its URL, and loading still completes', errors.length === 1 && errors[0].url.includes('missing.png'), errors[0] ? `onError('${errors[0].url}')` : 'no onError');
  } else {
    d.check('No errors when every URL exists', errors.length === 0, `${errors.length} errors`);
  }
  const wasEnabled = THREE.Cache.enabled;
  THREE.Cache.enabled = true;
  const url = `/textures/checker.png?cache=${Date.now()}`;
  const loader = new THREE.TextureLoader();
  const t0 = performance.now();
  await loader.loadAsync(url);
  const first = performance.now() - t0;
  const t1 = performance.now();
  await loader.loadAsync(url);
  const second = performance.now() - t1;
  d.cmd(`THREE.Cache.enabled = true; loadAsync('${url.split('?')[0]}') ${first.toFixed(1)} ms, again ${second.toFixed(1)} ms (from THREE.Cache)`);
  d.check('THREE.Cache keeps the decoded image, so a repeat load skips the network', THREE.Cache.get(`image:${url}`) !== undefined, `cache hit for image:${url.split('?')[0]}`);
  THREE.Cache.remove(`image:${url}`);
  THREE.Cache.enabled = wasEnabled;
  Object.values(textures).forEach((t) => t.dispose());
  return d.result({ params: p, events: events.map((e) => ({ ...e, url: e.url?.split('?')[0] })), total: urls.length, cache: { first: round(first, 1), second: round(second, 1) } });
}
