// Lights, shadows & atmosphere: light types and physical falloff, shadow maps, fog and backgrounds.
import * as THREE from 'three';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Demo, bool, clamp, disposeTree, oneOf, round } from './lab.js';
import { colorDistance, getCheckRenderer, hexToRgb, luminance, rgb, shoot } from './gpu.js';

const BG = 0x0b1120;
const hexColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

// ---- Light types -------------------------------------------------------------------------------

export const LIGHT_TYPES = ['PointLight', 'SpotLight', 'DirectionalLight', 'HemisphereLight', 'AmbientLight', 'RectAreaLight'];

export const lightParams = (i = {}) => ({ type: oneOf(i.type, LIGHT_TYPES), intensity: clamp(i.intensity, 0, 200, 30), color: hexColor(i.color, '#fff3c4') });

function makeLight(type, intensity, color) {
  switch (type) {
    case 'PointLight': return new THREE.PointLight(color, intensity, 0, 2);
    case 'SpotLight': return new THREE.SpotLight(color, intensity, 0, Math.PI / 7, 0.3, 2);
    case 'DirectionalLight': return new THREE.DirectionalLight(color, intensity / 10);
    case 'HemisphereLight': return new THREE.HemisphereLight(0x60a5fa, 0x7c2d12, intensity / 10);
    case 'AmbientLight': return new THREE.AmbientLight(color, intensity / 10);
    default: return new THREE.RectAreaLight(color, intensity / 4, 2.5, 1.2);
  }
}

export function buildLights(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 5, 9);
  camera.lookAt(0, 0, 0);
  if (p.type === 'RectAreaLight') RectAreaLightUniformsLib.init();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shapes = [new THREE.SphereGeometry(0.7, 48, 24), new THREE.TorusKnotGeometry(0.45, 0.16, 128, 16), new THREE.BoxGeometry(1.1, 1.1, 1.1)];
  shapes.forEach((g, i) => {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: [0xf472b6, 0x22d3ee, 0xfbbf24][i], roughness: 0.35 }));
    m.position.set((i - 1) * 2.6, 0.8, 0);
    scene.add(m);
  });
  const light = makeLight(p.type, p.intensity, p.color);
  light.position.set(0, 3, 2);
  scene.add(light);
  let helper = null;
  if (light.isPointLight) helper = new THREE.PointLightHelper(light, 0.2);
  if (light.isSpotLight) { helper = new THREE.SpotLightHelper(light); scene.add(light.target); }
  if (light.isDirectionalLight) helper = new THREE.DirectionalLightHelper(light, 0.6);
  if (light.isHemisphereLight) helper = new THREE.HemisphereLightHelper(light, 0.6);
  if (light.isRectAreaLight) { light.lookAt(0, 0.8, 0); helper = new RectAreaLightHelper(light); light.add(helper); helper = null; }
  if (helper) scene.add(helper);
  return {
    scene,
    camera,
    tick: (dt, t) => {
      if (light.isAmbientLight || light.isHemisphereLight) return;
      light.position.set(Math.sin(t * 0.6) * 4, light.isDirectionalLight ? 5 : 2.6, Math.cos(t * 0.6) * 3);
      if (light.isRectAreaLight) light.lookAt(0, 0.8, 0);
      helper?.update?.();
    },
    dispose: () => helper?.dispose?.(),
  };
}

/** Floor seen from above: u, v sample points map to floor positions. */
function floorScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
  camera.position.set(0, 20, 0);
  camera.lookAt(0, 0, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  return { scene, camera };
}

export async function runLights(inputs, mode = 'run') {
  const p = lightParams(inputs);
  const d = new Demo('lights');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, rows: [], snapshots: [] };
  d.cmd('camera looks straight down at a 10 × 10 white floor; samples: under the light (center) and the corner');
  const measure = (light, label, setup) => {
    const { scene, camera } = floorScene();
    setup?.(light, scene);
    scene.add(light);
    const px = shoot(d, renderer, scene, camera, label);
    const row = { name: light.type, center: luminance(px.at(0.5, 0.5)), corner: luminance(px.at(0.05, 0.05)), centerRgb: px.at(0.5, 0.5), src: px.toDataURL() };
    disposeTree(scene);
    return row;
  };

  if (mode === 'weak') {
    const bad = measure(new THREE.PointLight(0xffffff, 1), '✗ new PointLight(0xffffff, 1) at 8 units above the floor', (l) => l.position.set(0, 8, 0));
    data.snapshots.push({ label: '✗ intensity 1 (old habit)', src: bad.src, tone: 'bad' });
    d.check('Intensity 1 is 1 candela: at 8 units it barely lights anything', bad.center < 25, `floor brightness ${bad.center} / 255`);
    const good = measure(new THREE.PointLight(0xffffff, 100), '✓ new PointLight(0xffffff, 100)  // physical units: candela, decay 2', (l) => l.position.set(0, 8, 0));
    data.snapshots.push({ label: '✓ intensity 100', src: good.src, tone: 'ok' });
    d.check('Physical units: light falls with distance², so intensity must grow with it', good.center > bad.center * 3 && good.center > 120, `floor brightness ${bad.center} → ${good.center}`);
  }

  const point = measure(new THREE.PointLight(0xffffff, p.intensity, 0, 2), `new PointLight(white, ${p.intensity}, distance 0, decay 2) at y = 2`, (l) => l.position.set(0, 2, 0));
  const spot = measure(new THREE.SpotLight(0xffffff, p.intensity, 0, Math.PI / 10, 0.1, 2), `new SpotLight(white, ${p.intensity}, 0, angle π/10, penumbra 0.1) at y = 4`, (l, scene) => { l.position.set(0, 4, 0); l.target.position.set(0, 0, 0); scene.add(l.target); });
  const dir = measure(new THREE.DirectionalLight(0xffffff, p.intensity / 30), `new DirectionalLight(white, ${round(p.intensity / 30, 2)}) from above`, (l) => l.position.set(0, 10, 0));
  const hemi = measure(new THREE.HemisphereLight(0x3b82f6, 0xf97316, 2), 'new HemisphereLight(sky blue, ground orange, 2)');
  data.rows = [point, spot, dir, hemi];
  if (p.intensity >= 5) {
    d.check('PointLight falls off with distance (inverse square, decay 2)', point.center > point.corner * 1.5, `under the light ${point.center}, corner ${point.corner}`);
    d.check('SpotLight lights only inside its cone', spot.center > 20 && spot.corner < 3, `inside ${spot.center}, outside ${spot.corner}`);
    d.check('DirectionalLight has no position falloff: the floor is evenly lit', Math.abs(dir.center - dir.corner) < 2 && dir.center > 10, `center ${dir.center}, corner ${dir.corner}`);
  } else {
    d.check('At (almost) zero intensity the lights add (almost) nothing', point.center < 40, `under the point light ${point.center}`);
  }
  const hc = hemi.centerRgb;
  d.check('HemisphereLight: upward-facing surfaces get the sky color', hc[2] > hc[0], `floor ${rgb(hc)} (blue > red)`);
  return d.result(data);
}

// ---- Shadows ------------------------------------------------------------------------------------------

const SHADOW_TYPES = { PCF: THREE.PCFShadowMap, Basic: THREE.BasicShadowMap, VSM: THREE.VSMShadowMap };

export const shadowParams = (i = {}) => ({
  mapSize: oneOf(Number(i.mapSize), [1024, 256, 512, 2048]),
  type: oneOf(i.type, Object.keys(SHADOW_TYPES)),
  bias: clamp(i.bias, -0.01, 0.01, -0.0005),
  radius: clamp(i.radius, 0, 10, 3),
});

function shadowScene(p, { enabled = true, cast = true, receive = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 7, 7);
  camera.lookAt(0, 0, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = receive;
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x22d3ee }));
  box.position.set(0, 1.5, 0);
  box.castShadow = cast;
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(6, 8, 0);
  light.castShadow = enabled;
  light.shadow.mapSize.set(p.mapSize, p.mapSize);
  light.shadow.bias = p.bias;
  light.shadow.radius = p.radius;
  Object.assign(light.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  light.shadow.camera.updateProjectionMatrix();
  scene.add(floor, box, light, new THREE.AmbientLight(0xffffff, 0.4));
  return { scene, camera, light, box, floor };
}

export function buildShadows(p, { renderer }) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = SHADOW_TYPES[p.type];
  const s = shadowScene(p);
  s.camera.position.set(0, 6, 9);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.17, 128, 16), new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.3 }));
  knot.position.set(-2.4, 1.4, 1);
  knot.castShadow = knot.receiveShadow = true;
  s.scene.add(knot, new THREE.CameraHelper(s.light.shadow.camera));
  return {
    scene: s.scene,
    camera: s.camera,
    tick: (dt, t) => {
      s.light.position.set(Math.cos(t * 0.4) * 6, 8, Math.sin(t * 0.4) * 6);
      s.box.rotation.y += dt * 0.5;
      knot.rotation.x += dt * 0.6;
    },
  };
}

export async function runShadows(inputs, mode = 'run') {
  const p = shadowParams(inputs);
  const d = new Demo('shadows');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };
  // Where the box's shadow lands: from the light (6, 8, 0) through the box center (0, 1.5, 0) to y = 0
  const shadowAt = new THREE.Vector3(-6 * (1.5 / 8), 0, 0);
  const litAt = new THREE.Vector3(2.5, 0, 2.5);
  const sample = (px, cam, v) => {
    const q = v.clone().project(cam);
    return luminance(px.at((q.x + 1) / 2, (1 - q.y) / 2));
  };
  const run = (label, opts, setup) => {
    const s = shadowScene(p, opts);
    renderer.shadowMap.enabled = opts.rendererEnabled !== false;
    renderer.shadowMap.type = SHADOW_TYPES[p.type];
    setup?.(renderer);
    const px = shoot(d, renderer, s.scene, s.camera, label);
    const r = { shadow: sample(px, s.camera, shadowAt), lit: sample(px, s.camera, litAt), src: px.toDataURL() };
    disposeTree(s.scene);
    return r;
  };

  if (mode === 'off') {
    const a = run('✗ renderer.shadowMap.enabled left false', { rendererEnabled: false });
    data.snapshots.push({ label: '✗ shadowMap.enabled = false', src: a.src, tone: 'bad' });
    d.check('Without renderer.shadowMap.enabled there are no shadows at all', a.shadow > a.lit * 0.85, `"shadow" spot ${a.shadow} vs lit floor ${a.lit}`);
    const b = run('✗ shadowMap on, light.castShadow on, but box.castShadow = false', { cast: false });
    data.snapshots.push({ label: '✗ mesh.castShadow = false', src: b.src, tone: 'bad' });
    d.check('Each mesh must opt in with castShadow (and the floor with receiveShadow)', b.shadow > b.lit * 0.85, `spot ${b.shadow} vs floor ${b.lit}`);
  }
  if (mode === 'pcfsoft') {
    const att = await d.attempt('renderer.shadowMap.type = THREE.PCFSoftShadowMap; render', () => run('✗ render with PCFSoftShadowMap', {}, (r) => { r.shadowMap.type = THREE.PCFSoftShadowMap; }));
    d.check('r186 warns that PCFSoftShadowMap has been removed and falls back to PCF', att.logs.some((l) => l.message.includes('PCFSoftShadowMap has been removed')), att.logs[0]?.message);
    if (att.value) data.snapshots.push({ label: 'PCFSoftShadowMap → PCF fallback', src: att.value.src, tone: 'warn' });
  }

  const ok = run(`renderer.shadowMap.enabled = true (${p.type}); light.castShadow = box.castShadow = floor.receiveShadow = true; mapSize ${p.mapSize}`, {});
  data.snapshots.push({ label: `✓ ${p.type} shadows, ${p.mapSize}² map`, src: ok.src, tone: 'ok' });
  d.check('The box casts a shadow on the floor', ok.shadow < ok.lit * 0.7, `shadow ${ok.shadow} vs lit floor ${ok.lit}`);
  const mb = (p.mapSize * p.mapSize * 4) / (1024 * 1024);
  d.cmd(`light.shadow.map: ${p.mapSize}×${p.mapSize} depth texture ≈ ${mb.toFixed(1)} MB of GPU memory`);
  d.check('One extra render pass per shadow-casting light', renderer.info.render.calls >= 2, `${renderer.info.render.calls} draw calls for 2 meshes (shadow pass + main pass)`);
  data.lum = { shadow: ok.shadow, lit: ok.lit };
  data.mapMB = round(mb, 2);
  renderer.shadowMap.enabled = false;
  return d.result(data);
}

// ---- Fog, background & environment --------------------------------------------------------------------

export const fogParams = (i = {}) => ({
  type: oneOf(i.type, ['Fog', 'FogExp2', 'None']),
  near: clamp(i.near, 0, 30, 4),
  far: clamp(i.far, 5, 80, 22),
  density: clamp(i.density, 0.01, 0.3, 0.08),
  color: hexColor(i.color, '#1e293b'),
});

function makeFog(p) {
  if (p.type === 'Fog') return new THREE.Fog(p.color, p.near, Math.max(p.far, p.near + 1));
  if (p.type === 'FogExp2') return new THREE.FogExp2(p.color, p.density);
  return null;
}

export function buildFog(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(p.color);
  scene.fog = makeFog(p);
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 200);
  camera.position.set(0, 1.6, 6);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 6, 4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x334155, 1));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 200), new THREE.MeshStandardMaterial({ color: 0x334155 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -80;
  scene.add(floor);
  const geo = new THREE.BoxGeometry(1, 2.4, 1);
  const pillars = [];
  for (let i = 0; i < 24; i += 1) {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: side < 0 ? 0xf472b6 : 0x22d3ee }));
      m.position.set(side * 3, 1.2, -i * 4);
      scene.add(m);
      pillars.push(m);
    }
  }
  return {
    scene,
    camera,
    controls: { target: [0, 1.2, -6] },
    tick: (dt) => pillars.forEach((m, i) => { m.rotation.y += dt * (i % 2 ? 0.3 : -0.3); }),
  };
}

function fogShot(p, { matchBackground = true, fogOff = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(matchBackground ? p.color : 0x000000);
  scene.fog = makeFog(p);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const make = (x, z, opts = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, ...opts }));
    const s = -z * 0.25;
    m.scale.set(s, s, 1);
    m.position.set(x * -z * 0.18, 0, z);
    scene.add(m);
  };
  make(-1, -3);
  make(1, -60, { fog: !fogOff });
  return { scene, camera };
}

export async function runFog(inputs, mode = 'run') {
  const p = fogParams(inputs);
  const d = new Demo('fog-background');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };
  const fogRgb = hexToRgb(p.color);
  const sampleNear = (px) => px.at(0.22, 0.5);
  const sampleFar = (px) => px.at(0.78, 0.5);
  d.cmd('two white planes, one 3 units away, one 60 units away (scaled to look the same size)');

  if (mode === 'mismatch') {
    const fogP = { ...p, type: p.type === 'None' ? 'Fog' : p.type };
    const s = fogShot(fogP, { matchBackground: false });
    const px = shoot(d, renderer, s.scene, s.camera, `✗ scene.fog = new ${fogP.type}('${p.color}', …) but scene.background stays black`);
    data.snapshots.push({ label: '✗ fog ≠ background: far objects become silhouettes', src: px.toDataURL(), tone: 'bad' });
    const farPx = sampleFar(px);
    const bg = px.at(0.5, 0.05);
    d.check('Fully fogged objects stand out as flat shapes against a different background', colorDistance(farPx, bg) > 25, `far plane ${rgb(farPx)} vs background ${rgb(bg)}`);
    disposeTree(s.scene);
    const s2 = fogShot(fogP);
    const px2 = shoot(d, renderer, s2.scene, s2.camera, '✓ scene.background = new Color(fog color)');
    data.snapshots.push({ label: '✓ background = fog color', src: px2.toDataURL(), tone: 'ok' });
    d.check('Matching the background makes distant objects fade away', colorDistance(sampleFar(px2), px2.at(0.5, 0.05)) < 12, `far ${rgb(sampleFar(px2))} vs background ${rgb(px2.at(0.5, 0.05))}`);
    disposeTree(s2.scene);
  }

  const s = fogShot(p);
  const label = p.type === 'Fog' ? `scene.fog = new Fog('${p.color}', ${p.near}, ${Math.max(p.far, p.near + 1)})` : p.type === 'FogExp2' ? `scene.fog = new FogExp2('${p.color}', ${p.density})` : 'scene.fog = null';
  const px = shoot(d, renderer, s.scene, s.camera, label);
  data.snapshots.push({ label: p.type === 'None' ? 'no fog' : `${p.type}`, src: px.toDataURL(), tone: 'ok' });
  const near = sampleNear(px);
  const far = sampleFar(px);
  data.near = near;
  data.far = far;
  if (p.type === 'None') {
    d.check('Without fog, distance does not change an unlit color', colorDistance(near, far) < 4, `near ${rgb(near)}, far ${rgb(far)}`);
  } else {
    d.check('The far plane is closer to the fog color than the near one', colorDistance(far, fogRgb) < colorDistance(near, fogRgb), `near ${rgb(near)}, far ${rgb(far)}, fog ${p.color}`);
    if (p.type === 'Fog' && Math.max(p.far, p.near + 1) < 55) {
      d.check('Linear Fog: beyond `far` an object is exactly the fog color', colorDistance(far, fogRgb) < 4, `far plane ${rgb(far)} at depth 60 > far ${p.far}`);
    }
    const s2 = fogShot(p, { fogOff: true });
    const px2 = shoot(d, renderer, s2.scene, s2.camera, 'farMaterial.fog = false  // opt one material out');
    d.check('material.fog = false opts a material out of fog', colorDistance(sampleFar(px2), [255, 255, 255]) < 4, `far plane ${rgb(sampleFar(px2))}`);
    disposeTree(s2.scene);
  }
  disposeTree(s.scene);
  return d.result(data);
}
