// Fundamentals: the scene / camera / renderer triangle, the scene graph, cameras, resizing and math.
// Each demo exports params() (clamps visitor input), build() (the scene, shared by the live view and
// the self-checks) and run() (executes the feature for real and returns a DemoResult).
import * as THREE from 'three';
import { Demo, bool, clamp, clampInt, disposeTree, oneOf, round, v3 } from './lab.js';
import { colorDistance, getCheckRenderer, rgb, shoot } from './gpu.js';

const BG = 0x0b1120;
const BG_RGB = [11, 17, 32];
const isBg = (p) => colorDistance(p, BG_RGB) < 6;
const hexColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

// ---- Scene, camera, renderer -------------------------------------------------------------------

export const basicsParams = (i = {}) => ({ color: hexColor(i.color, '#22d3ee'), speed: clamp(i.speed, 0, 5, 1) });

export function buildBasics(p, { width = 64, height = 64, mistake = null } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(0, 0, mistake === 'camera' ? 0 : 3);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.45 }));
  mesh.rotation.set(0.5, 0.7, 0);
  if (mistake !== 'noadd') scene.add(mesh);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(2, 3, 4);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.6));
  return {
    scene,
    camera,
    mesh,
    tick: (dt) => {
      mesh.rotation.x += dt * 0.5 * p.speed;
      mesh.rotation.y += dt * 0.8 * p.speed;
    },
  };
}

export async function runBasics(inputs, mode = 'run') {
  const p = basicsParams(inputs);
  const d = new Demo('scene-basics');
  const renderer = getCheckRenderer(64, 64);
  d.cmd(`renderer = new THREE.WebGLRenderer({ antialias: false })  // WebGL 2, three r${THREE.REVISION}, 64×64 off-screen canvas`);
  const snapshots = [];
  const data = { params: p, snapshots };

  if (mode === 'noadd' || mode === 'camera') {
    const label = mode === 'noadd' ? 'Forget scene.add(mesh)' : 'Leave the camera at (0, 0, 0), inside the cube';
    const wrong = buildBasics(p, { mistake: mode });
    const bad = shoot(d, renderer, wrong.scene, wrong.camera, `✗ ${label}: renderer.render(scene, camera)`);
    snapshots.push({ label: `✗ ${label}`, src: bad.toDataURL(), tone: 'bad' });
    d.check('The mistake renders an empty frame (only the background)', isBg(bad.at(0.5, 0.5)), `center pixel ${rgb(bad.at(0.5, 0.5))}, ${bad.calls} draw call(s)`);
    if (mode === 'camera') d.check('A draw call still happens: the faces are culled, not skipped', bad.calls === 1, 'back faces seen from inside are discarded (side = FrontSide)');
    disposeTree(wrong.scene);
  }

  const { scene, camera, mesh } = d.time('scene = new Scene(); camera = new PerspectiveCamera(50, 1, 0.1, 100); camera.position.z = 3', () => buildBasics(p));
  d.cmd(`mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '${p.color}' })); scene.add(mesh, light, ambient)`);
  const px = shoot(d, renderer, scene, camera);
  snapshots.push({ label: mode === 'run' ? 'What the GPU drew (64×64 readback)' : '✓ Fixed', src: px.toDataURL(), tone: 'ok' });
  const center = px.at(0.5, 0.5);
  const corner = px.at(0.02, 0.02);
  d.check('The cube covers the center pixel', !isBg(center), `center ${rgb(center)} vs background ${rgb(BG_RGB)}`);
  d.check('The corner shows scene.background', isBg(corner), `corner ${rgb(corner)}`);
  d.check('One mesh = one draw call of 12 triangles', px.calls === 1 && px.triangles === 12, `${px.calls} call, ${px.triangles} triangles`);
  data.children = scene.children.map((c) => c.type);
  data.center = center;
  data.calls = px.calls;
  data.triangles = px.triangles;
  data.vertices = mesh.geometry.attributes.position.count;
  disposeTree(scene);
  return d.result(data);
}

// ---- Scene graph & transforms --------------------------------------------------------------------

export const graphParams = (i = {}) => ({
  angle: clamp(i.angle, -360, 360, 40),
  distance: clamp(i.distance, 2, 8, 4),
  sunScale: clamp(i.sunScale, 0.5, 3, 1.5),
});

export function buildGraph(p, { width = 64, height = 64, mistake = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
  camera.position.set(0, 9, 11);
  camera.lookAt(0, 0, 0);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  sun.name = 'sun';
  sun.scale.setScalar(p.sunScale);
  const earthOrbit = new THREE.Group();
  earthOrbit.name = 'earthOrbit';
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 12), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
  earth.name = 'earth';
  earth.position.x = p.distance;
  const moonOrbit = new THREE.Group();
  moonOrbit.name = 'moonOrbit';
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
  moon.name = 'moon';
  moon.position.x = 0.9;
  moonOrbit.add(moon);
  earth.add(moonOrbit);
  earthOrbit.add(earth);
  scene.add(sun);
  // The right way: the orbit pivot is a sibling of the sun, so the sun's scale never reaches the earth
  (mistake ? sun : scene).add(earthOrbit);
  const light = new THREE.PointLight(0xfff3c4, 60, 0, 2);
  scene.add(light, new THREE.AmbientLight(0xffffff, 0.25));
  const ring = new THREE.Mesh(new THREE.RingGeometry(p.distance - 0.02, p.distance + 0.02, 96), new THREE.MeshBasicMaterial({ color: 0x334155, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  const set = (deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    earthOrbit.rotation.y = a;
    moonOrbit.rotation.y = a * 3;
  };
  set(p.angle);
  let deg = p.angle;
  return {
    scene, camera, sun, earthOrbit, earth, moonOrbit, moon, set,
    tick: (dt) => {
      deg += dt * 20;
      set(deg);
      earth.rotation.y += dt;
    },
  };
}

export async function runGraph(inputs, mode = 'run') {
  const p = graphParams(inputs);
  const d = new Demo('scene-graph');
  const data = { params: p };

  if (mode === 'mistake') {
    const wrong = buildGraph(p, { mistake: true });
    d.cmd(`✗ sun.add(earthOrbit)  // orbit pivot parented to the sun, sun.scale = ${p.sunScale}`);
    wrong.scene.updateMatrixWorld();
    const ew = wrong.earth.getWorldPosition(new THREE.Vector3());
    const ws = wrong.earth.getWorldScale(new THREE.Vector3());
    d.cmd(`earth.getWorldPosition() → ${v3(ew)}, getWorldScale() → ${v3(ws)}`);
    d.check('The parent scale leaks into the child: orbit radius is multiplied', Math.abs(ew.length() - p.distance * p.sunScale) < 1e-4, `|earth| = ${round(ew.length())} = ${p.distance} × ${p.sunScale}`);
    d.check('…and the earth itself is scaled too', Math.abs(ws.x - p.sunScale) < 1e-6, `world scale ${round(ws.x)}`);
    data.wrong = { distance: round(ew.length()), scale: round(ws.x) };
    const att = await d.attempt('scene.add(earth.geometry)  // a geometry is not an Object3D', () => wrong.scene.add(wrong.earth.geometry));
    d.check('Adding a geometry instead of a mesh logs a real Three.js error', att.logs.some((l) => l.message.includes('Object3D.add: object not an instance of THREE.Object3D')), att.logs[0]?.message);
    disposeTree(wrong.scene);
  }

  const g = d.time('scene.add(sun, earthOrbit); earthOrbit.add(earth); earth.add(moonOrbit); moonOrbit.add(moon)', () => buildGraph(p));
  d.cmd(`earthOrbit.rotation.y = degToRad(${p.angle}); moonOrbit.rotation.y = degToRad(${p.angle * 3})`);
  d.time('scene.updateMatrixWorld()  // local matrices → world matrices, parent first', () => g.scene.updateMatrixWorld());
  const a = THREE.MathUtils.degToRad(p.angle);
  const earthW = g.earth.getWorldPosition(new THREE.Vector3());
  const moonW = g.moon.getWorldPosition(new THREE.Vector3());
  d.cmd(`earth.getWorldPosition() → ${v3(earthW)};  moon.getWorldPosition() → ${v3(moonW)}`);
  const expectEarth = new THREE.Vector3(p.distance * Math.cos(a), 0, -p.distance * Math.sin(a));
  d.check('Earth world position = its local x rotated by the orbit pivot', earthW.distanceTo(expectEarth) < 1e-4, `${v3(earthW)} ≈ ${v3(expectEarth)}`);
  const expectMoon = expectEarth.clone().add(new THREE.Vector3(0.9 * Math.cos(4 * a), 0, -0.9 * Math.sin(4 * a)));
  d.check('Moon world position composes both parents (angle + 3 × angle)', moonW.distanceTo(expectMoon) < 1e-4, `${v3(moonW)} ≈ ${v3(expectMoon)}`);
  d.check('The moon’s local position never changed', g.moon.position.equals(new THREE.Vector3(0.9, 0, 0)), `moon.position = ${v3(g.moon.position)}`);
  const sunScale = g.earth.getWorldScale(new THREE.Vector3()).x;
  d.check('The sun’s scale does not reach the earth (pivot is a sibling)', Math.abs(sunScale - 1) < 1e-6, `earth world scale ${round(sunScale)}`);
  const tree = [];
  g.scene.traverse((o) => {
    let depth = 0;
    for (let q = o.parent; q; q = q.parent) depth += 1;
    tree.push({ name: o.name || o.type, type: o.type, depth });
  });
  d.cmd(`scene.traverse(…) → ${tree.length} objects`);
  Object.assign(data, {
    tree,
    earth: earthW.toArray().map((n) => round(n, 2)),
    moon: moonW.toArray().map((n) => round(n, 2)),
    localMoon: g.moon.position.toArray(),
  });
  disposeTree(g.scene);
  return d.result(data);
}

// ---- Cameras -----------------------------------------------------------------------------------------

export const cameraParams = (i = {}) => ({
  fov: clamp(i.fov, 20, 110, 50),
  orthoSize: clamp(i.orthoSize, 1, 10, 3),
  far: clamp(i.far, 1, 100, 50),
});

function cameraScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const near = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  near.position.set(-0.9, 0, -3);
  const far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
  far.position.set(0.9, 0, -9);
  scene.add(near, far);
  const grid = new THREE.GridHelper(40, 40, 0x334155, 0x1e293b);
  grid.position.y = -0.5;
  return { scene, grid };
}

export function buildCameras(p, { width = 640, height = 340 } = {}) {
  const { scene, grid } = cameraScene();
  scene.add(grid);
  const half = width / 2 / height;
  const persp = new THREE.PerspectiveCamera(p.fov, half, 0.1, p.far);
  persp.position.set(0, 0.6, 1.5);
  const ortho = new THREE.OrthographicCamera(-p.orthoSize * half, p.orthoSize * half, p.orthoSize, -p.orthoSize, 0.1, p.far);
  const size = new THREE.Vector2();
  return {
    scene,
    camera: persp,
    controls: { target: [0, 0, -6] },
    resize: (w, h) => {
      const aspect = w / 2 / h;
      persp.aspect = aspect;
      persp.updateProjectionMatrix();
      Object.assign(ortho, { left: -p.orthoSize * aspect, right: p.orthoSize * aspect });
      ortho.updateProjectionMatrix();
    },
    // Two cameras, one canvas: setViewport + setScissor draw each half separately
    render: (renderer) => {
      renderer.getSize(size);
      ortho.position.copy(persp.position);
      ortho.quaternion.copy(persp.quaternion);
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, size.x / 2, size.y);
      renderer.setScissor(0, 0, size.x / 2, size.y);
      renderer.render(scene, persp);
      renderer.setViewport(size.x / 2, 0, size.x / 2, size.y);
      renderer.setScissor(size.x / 2, 0, size.x / 2, size.y);
      renderer.render(scene, ortho);
      renderer.setScissorTest(false);
    },
  };
}

const isRed = (p) => p[0] > 150 && p[2] < 80;
const isBlue = (p) => p[2] > 150 && p[0] < 80;

export async function runCameras(inputs, mode = 'run') {
  const p = cameraParams(inputs);
  const d = new Demo('cameras');
  const renderer = getCheckRenderer(96, 64);
  const { scene } = cameraScene();
  const snapshots = [];
  const data = { params: p, snapshots };
  d.cmd('scene: red cube at z = −3 and blue cube at z = −9, both 1×1×1');

  if (mode === 'far') {
    const tooShort = new THREE.PerspectiveCamera(p.fov, 1.5, 0.1, 5);
    d.cmd('✗ camera = new PerspectiveCamera(fov, aspect, 0.1, 5)  // far plane 5 units away');
    const bad = shoot(d, renderer, scene, tooShort);
    snapshots.push({ label: '✗ far = 5: the blue cube is clipped', src: bad.toDataURL(), tone: 'bad' });
    const blue = bad.count(isBlue);
    d.check('Anything beyond camera.far is clipped away silently', blue === 0 && bad.count(isRed) > 0, `blue pixels ${blue}, red pixels ${bad.count(isRed)}`);
  }

  const persp = new THREE.PerspectiveCamera(p.fov, 1.5, 0.1, Math.max(p.far, mode === 'far' ? 20 : p.far));
  d.cmd(`persp = new PerspectiveCamera(${p.fov}, 1.5, 0.1, ${persp.far})`);
  const a = shoot(d, renderer, scene, persp, 'renderer.render(scene, persp)');
  const ortho = new THREE.OrthographicCamera(-p.orthoSize * 1.5, p.orthoSize * 1.5, p.orthoSize, -p.orthoSize, 0.1, Math.max(p.far, 20));
  d.cmd(`ortho = new OrthographicCamera(${-p.orthoSize * 1.5}, ${p.orthoSize * 1.5}, ${p.orthoSize}, ${-p.orthoSize}, 0.1, ${ortho.far})`);
  const b = shoot(d, renderer, scene, ortho, 'renderer.render(scene, ortho)');
  snapshots.push({ label: 'PerspectiveCamera', src: a.toDataURL(), tone: 'ok' }, { label: 'OrthographicCamera', src: b.toDataURL(), tone: 'ok' });
  const pr = a.count(isRed);
  const pb = a.count(isBlue);
  const or = b.count(isRed);
  const ob = b.count(isBlue);
  data.persp = { red: pr, blue: pb };
  data.ortho = { red: or, blue: ob };
  const farVisible = persp.far > 9.5;
  d.check('Perspective: the nearer cube covers far more pixels', farVisible ? pr > pb * 3 : pr > 0, `red ${pr} px vs blue ${pb} px${farVisible ? '' : ' (far plane hides the blue cube)'}`);
  d.check('Orthographic: equal cubes cover the same area at any distance', ob > 0 && Math.abs(or - ob) <= Math.max(4, 0.25 * or), `red ${or} px vs blue ${ob} px`);

  // Camera.project(): world → normalized device coordinates
  const top = new THREE.Vector3(-0.9, 0.5, -3).project(persp);
  const bottom = new THREE.Vector3(-0.9, -0.5, -3).project(persp);
  const top2 = new THREE.Vector3(0.9, 0.5, -9).project(persp);
  const bottom2 = new THREE.Vector3(0.9, -0.5, -9).project(persp);
  const ratio = (top.y - bottom.y) / (top2.y - bottom2.y);
  d.cmd(`vector.project(persp): near cube spans ${round(top.y - bottom.y)} NDC, far cube ${round(top2.y - bottom2.y)} NDC`);
  d.check('project(): on-screen size scales with 1 / distance', Math.abs(ratio - 3) < 0.05, `ratio ${round(ratio, 2)} ≈ 9 / 3`);
  data.ndcRatio = round(ratio, 2);
  disposeTree(scene);
  return d.result(data);
}

// ---- Resizing & pixel ratio ------------------------------------------------------------------------

export const resizeParams = (i = {}) => ({
  width: clampInt(i.width, 64, 800, 480),
  height: clampInt(i.height, 64, 600, 240),
  dpr: oneOf(Number(i.dpr), [2, 1, 1.5, 3]),
  cap: i.cap === undefined ? true : bool(i.cap),
});

function sphereScene(aspect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 50);
  camera.position.z = 4;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0x22d3ee })));
  return { scene, camera };
}

export function buildResize(p, { renderer, width = 640, height = 340 } = {}) {
  const { scene, camera } = sphereScene(width / height);
  scene.children[0].material = new THREE.MeshNormalMaterial();
  const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -1.5;
  scene.add(grid);
  return {
    scene,
    camera,
    hud: () => {
      const c = renderer.domElement;
      return `canvas ${c.clientWidth}×${c.clientHeight} CSS px → ${c.width}×${c.height} drawing buffer (pixelRatio ${renderer.getPixelRatio()})`;
    },
    tick: (dt) => { scene.children[0].rotation.y += dt * 0.6; },
  };
}

const isCyan = (p) => p[1] > 150 && p[2] > 150 && p[0] < 100;

export async function runResize(inputs, mode = 'run') {
  const p = resizeParams(inputs);
  const d = new Demo('renderer-resize');
  const snapshots = [];
  const data = { params: p, snapshots };
  const renderer = getCheckRenderer(64, 64);
  const ratio = p.cap ? Math.min(p.dpr, 2) : p.dpr;
  d.cmd(`renderer.setPixelRatio(${p.cap ? `Math.min(devicePixelRatio = ${p.dpr}, 2)` : `devicePixelRatio = ${p.dpr}`}) → ${ratio}`);
  renderer.setPixelRatio(ratio);
  d.time(`renderer.setSize(${p.width}, ${p.height})  // CSS pixels; also sets canvas.style`, () => renderer.setSize(p.width, p.height));
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const canvas = renderer.domElement;
  d.cmd(`canvas.width × canvas.height = ${canvas.width} × ${canvas.height}; style = ${canvas.style.width} × ${canvas.style.height}`);
  d.check('Drawing buffer = CSS size × pixel ratio', canvas.width === Math.floor(p.width * ratio) && canvas.height === Math.floor(p.height * ratio), `${p.width}×${p.height} × ${ratio} = ${buffer.x}×${buffer.y}`);
  d.check('The cap keeps the ratio at 2 or less', !p.cap || ratio <= 2, `ratio ${ratio}`);
  data.buffer = [buffer.x, buffer.y];
  data.costs = [1, 1.5, 2, 3].map((r) => ({ ratio: r, pixels: Math.round(p.width * r) * Math.round(p.height * r) }));
  data.css = [p.width, p.height];
  data.canvasStyle = [canvas.style.width, canvas.style.height];

  // Render a sphere at the visitor's aspect ratio (scaled down to keep the readback small)
  const s = Math.min(1, 128 / Math.max(p.width, p.height));
  const w = Math.max(16, Math.round(p.width * s));
  const h = Math.max(16, Math.round(p.height * s));
  getCheckRenderer(w, h);

  if (mode === 'stale') {
    const { scene, camera } = sphereScene(1);
    d.cmd(`✗ renderer.setSize(${w}, ${h}) but camera.aspect stays 1 (no updateProjectionMatrix)`);
    const bad = shoot(d, renderer, scene, camera);
    const box = bad.bbox(isCyan);
    snapshots.push({ label: '✗ aspect not updated: stretched', src: bad.toDataURL(), tone: 'bad' });
    const stretch = box ? box.w / box.h : 0;
    const expected = w / h;
    d.check('With a stale aspect the circle is stretched by width / height', Math.abs(expected - 1) < 0.1 || Math.abs(stretch - expected) / expected < 0.2, `bbox ${box?.w}×${box?.h} px → ${round(stretch, 2)} (canvas ${round(expected, 2)})`);
    data.stale = round(stretch, 2);
    disposeTree(scene);
  }

  const { scene, camera } = sphereScene(1);
  camera.aspect = w / h;
  d.time(`camera.aspect = ${w} / ${h}; camera.updateProjectionMatrix()`, () => camera.updateProjectionMatrix());
  const px = shoot(d, renderer, scene, camera);
  const box = px.bbox(isCyan);
  snapshots.push({ label: `✓ ${w}×${h}, aspect updated: round`, src: px.toDataURL(), tone: 'ok' });
  const roundness = box ? box.w / box.h : 0;
  d.check('After updateProjectionMatrix() the sphere stays round', Math.abs(roundness - 1) < 0.12, `bbox ${box?.w}×${box?.h} px → ${round(roundness, 2)}`);
  data.roundness = round(roundness, 2);
  disposeTree(scene);
  return d.result(data);
}

// ---- Math: vectors, matrices, quaternions -----------------------------------------------------------

const ORDERS = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'XZY', 'YZX'];
export const mathParams = (i = {}) => ({
  x: clamp(i.x, -180, 180, 30),
  y: clamp(i.y, -180, 180, 60),
  z: clamp(i.z, -180, 180, 20),
  order: oneOf(i.order, ORDERS),
  t: clamp(i.t, 0, 1, 0.5),
});

const reversed = (order) => order.split('').reverse().join('');
const eulerOf = (p, order) => new THREE.Euler(...[p.x, p.y, p.z].map(THREE.MathUtils.degToRad), order);

function plane(color, wire = false) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, wireframe: wire, transparent: wire, opacity: wire ? 0.45 : 1 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 16), mat);
  body.rotation.x = Math.PI / 2; // nose points along +Z
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.4), mat);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.3), mat);
  fin.position.set(0, 0.2, -0.6);
  g.add(body, wing, fin);
  return g;
}

export function buildMath(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(3.5, 2.5, 4.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AxesHelper(2.2), new THREE.HemisphereLight(0xffffff, 0x334155, 2.5));
  const solid = plane(0x22d3ee);
  const ghost = plane(0xf472b6, true);
  solid.add(new THREE.AxesHelper(1.2));
  scene.add(solid, ghost);
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromEuler(eulerOf(p, p.order));
  ghost.quaternion.setFromEuler(eulerOf(p, reversed(p.order)));
  let t = 0;
  return {
    scene,
    camera,
    tick: (dt) => {
      t += dt;
      const k = (Math.sin(t * 1.2) + 1) / 2;
      solid.quaternion.slerpQuaternions(q0, q1, k);
    },
  };
}

export async function runMath(inputs, mode = 'run') {
  const p = mathParams(inputs);
  const d = new Demo('math');
  const data = { params: p };

  if (mode === 'mutate') {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(0, 1, 0);
    d.cmd('a = new Vector3(1, 0, 0); b = new Vector3(0, 1, 0)');
    const c = a.add(b);
    d.cmd(`✗ c = a.add(b) → c = ${v3(c)}, but a is now ${v3(a)} and c === a is ${c === a}`);
    d.check('Vector3 methods mutate the vector they are called on', c === a && a.y === 1, 'a.add(b) changed a and returned a');
    const a2 = new THREE.Vector3(1, 0, 0);
    const c2 = a2.clone().add(b);
    d.cmd(`✓ c = a.clone().add(b) → ${v3(c2)}, a stays ${v3(a2)}`);
    d.check('clone() first (or addVectors) keeps the input intact', a2.y === 0 && c2.y === 1, `a ${v3(a2)}`);
    const o = new THREE.Object3D();
    o.rotation.y = 90;
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
    d.cmd(`✗ obj.rotation.y = 90  // radians! → forward ${v3(dir)}`);
    o.rotation.y = THREE.MathUtils.degToRad(90);
    const dir2 = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
    d.cmd(`✓ obj.rotation.y = MathUtils.degToRad(90) → forward ${v3(dir2)}`);
    d.check('Angles are radians: 90 is not a quarter turn, degToRad(90) is', Math.abs(dir.x - 1) > 0.05 && Math.abs(dir2.x - 1) < 1e-6, `90 rad → ${v3(dir)}; π/2 → ${v3(dir2)}`);
  }

  const e1 = eulerOf(p, p.order);
  const e2 = eulerOf(p, reversed(p.order));
  const q1 = new THREE.Quaternion().setFromEuler(e1);
  const q2 = new THREE.Quaternion().setFromEuler(e2);
  const between = THREE.MathUtils.radToDeg(q1.angleTo(q2));
  d.cmd(`q1 = new Quaternion().setFromEuler(new Euler(${p.x}°, ${p.y}°, ${p.z}°, '${p.order}'))`);
  d.cmd(`q2 = … same angles, order '${reversed(p.order)}' → q1.angleTo(q2) = ${round(between, 2)}°`);
  const nonZero = [p.x, p.y, p.z].filter((v) => Math.abs(v) > 0.5).length;
  d.check('Euler order matters when two or more axes rotate', nonZero >= 2 ? between > 0.5 : between < 0.01, `${nonZero} non-zero angles → ${round(between, 2)}° apart`);

  const pos = new THREE.Vector3(1, 2, 3);
  const scale = new THREE.Vector3(2, 2, 2);
  const m = d.time('m = new Matrix4().compose(position, q1, scale)', () => new THREE.Matrix4().compose(pos, q1, scale));
  const [pp, qq, ss] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
  m.decompose(pp, qq, ss);
  d.cmd(`m.decompose() → position ${v3(pp)}, scale ${v3(ss)}`);
  d.check('compose → decompose round-trips position, rotation and scale', pp.distanceTo(pos) < 1e-6 && ss.distanceTo(scale) < 1e-6 && qq.angleTo(q1) < 1e-5, `angle error ${qq.angleTo(q1).toExponential(1)} rad`);

  const total = new THREE.Quaternion().angleTo(q1);
  const mid = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), q1, p.t);
  const part = new THREE.Quaternion().angleTo(mid);
  d.cmd(`mid = new Quaternion().slerpQuaternions(identity, q1, ${p.t}) → ${round(THREE.MathUtils.radToDeg(part), 2)}° of ${round(THREE.MathUtils.radToDeg(total), 2)}°`);
  d.check('slerp rotates at constant speed: t of the way = t of the angle', Math.abs(part - total * p.t) < 1e-4, `${round(part / (total || 1), 3)} ≈ ${p.t}`);

  const obj = new THREE.Object3D();
  obj.position.set(1, 1, 1);
  const target = new THREE.Vector3(-2, 3, 4);
  obj.lookAt(target);
  const fwd = obj.getWorldDirection(new THREE.Vector3());
  const want = target.clone().sub(obj.position).normalize();
  d.cmd(`obj.lookAt(${v3(target)}); obj.getWorldDirection() → ${v3(fwd)}`);
  d.check('lookAt() turns the object’s +Z axis toward the target', fwd.distanceTo(want) < 1e-6, `direction ${v3(fwd)}`);
  data.angles = { orderGap: round(between, 2), total: round(THREE.MathUtils.radToDeg(total), 2), atT: round(THREE.MathUtils.radToDeg(part), 2) };
  data.q1 = q1.toArray().map((n) => round(n, 4));
  data.matrix = m.elements.map((n) => round(n, 3));
  return d.result(data);
}
