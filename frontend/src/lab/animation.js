// Interaction & animation: raycasting, OrbitControls, the render loop + Timer, the animation system,
// morph targets and skinning. All of these run on the CPU, so their checks need no GPU.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Demo, bool, clamp, clampInt, oneOf, round, v3 } from './lab.js';

const BG = 0x0b1120;

// ---- Raycasting & picking ---------------------------------------------------------------------

export const rayParams = (i = {}) => ({ x: clamp(i.x, 0, 100, 50), y: clamp(i.y, 0, 100, 50), recursive: i.recursive === undefined ? true : bool(i.recursive) });

export function pickScene(aspect = 1) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(0, 0, 10);
  const group = new THREE.Group();
  group.name = 'cubes';
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let iy = -2; iy <= 2; iy += 1) {
    for (let ix = -2; ix <= 2; ix += 1) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x475569 }));
      m.position.set(ix * 1.5, iy * 1.5, 0);
      m.name = `cube(${ix},${iy})`;
      group.add(m);
    }
  }
  const behind = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x334155 }));
  behind.position.set(0, 0, -3);
  behind.scale.setScalar(2);
  behind.name = 'big cube behind';
  group.add(behind);
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 16, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }), 8);
  balls.name = 'instanced spheres';
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 8; i += 1) {
    balls.setMatrixAt(i, m4.makeTranslation(-5.25 + i * 1.5, -4.2, 0));
    balls.setColorAt(i, new THREE.Color().setHSL(i / 8, 0.7, 0.6));
  }
  scene.add(group, balls);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 4, 6);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.5));
  scene.updateMatrixWorld();
  // setFromCamera reads camera.matrixWorld; outside a render loop nothing updates it for us
  camera.updateMatrixWorld();
  return { scene, camera, group, balls };
}

export function buildRaycast() {
  const s = pickScene(1.6);
  s.camera.position.set(1.5, 1, 9);
  const raycaster = new THREE.Raycaster();
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 6), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  marker.visible = false;
  s.scene.add(marker);
  const hover = new THREE.Color(0x22d3ee);
  let last = null;
  let hitText = 'move the pointer over the cubes';
  const restore = () => {
    if (!last) return;
    if (last.object.isInstancedMesh) {
      last.object.setColorAt(last.instanceId, last.color);
      last.object.instanceColor.needsUpdate = true;
    } else last.object.material.color.copy(last.color);
    last = null;
  };
  return {
    scene: s.scene,
    camera: s.camera,
    hud: () => hitText,
    onPointer: (ndc) => {
      restore();
      if (!ndc) { marker.visible = false; hitText = 'pointer left the canvas'; return; }
      raycaster.setFromCamera(ndc, s.camera);
      const hits = raycaster.intersectObjects([s.group, s.balls], true);
      const hit = hits[0];
      marker.visible = Boolean(hit);
      if (!hit) { hitText = `ray (${round(ndc.x, 2)}, ${round(ndc.y, 2)}) hit nothing`; return; }
      marker.position.copy(hit.point);
      if (hit.object.isInstancedMesh) {
        const color = new THREE.Color();
        hit.object.getColorAt(hit.instanceId, color);
        last = { object: hit.object, instanceId: hit.instanceId, color };
        hit.object.setColorAt(hit.instanceId, hover);
        hit.object.instanceColor.needsUpdate = true;
      } else {
        last = { object: hit.object, color: hit.object.material.color.clone() };
        hit.object.material.color.copy(hover);
      }
      hitText = `${hits.length} hit${hits.length === 1 ? '' : 's'} · first: ${hit.object.name}${hit.instanceId !== undefined ? ` #${hit.instanceId}` : ''} at ${round(hit.distance, 2)}`;
    },
  };
}

export async function runRaycast(inputs, mode = 'run') {
  const p = rayParams(inputs);
  const d = new Demo('raycasting');
  const { scene, camera, group, balls } = pickScene(1);
  const raycaster = new THREE.Raycaster();
  const data = { params: p };
  d.cmd('raycaster = new Raycaster(); 25 cubes + 1 big cube behind + InstancedMesh(8 spheres); camera at z = 10');

  if (mode === 'pixels') {
    const clientX = 320;
    const clientY = 170;
    raycaster.setFromCamera(new THREE.Vector2(clientX, clientY), camera);
    const bad = raycaster.intersectObjects(group.children);
    d.cmd(`✗ raycaster.setFromCamera(new Vector2(event.clientX = ${clientX}, event.clientY = ${clientY}), camera) → ${bad.length} hits`);
    d.check('Pixel coordinates are not NDC: the ray points far off screen and misses', bad.length === 0, `${bad.length} hits; ray direction ${v3(raycaster.ray.direction)}`);
    const rect = { left: 0, top: 0, width: 640, height: 340 };
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const good = raycaster.intersectObjects(group.children);
    d.cmd(`✓ ndc = ((x − rect.left) / rect.width · 2 − 1, −(y − rect.top) / rect.height · 2 + 1) = (${round(ndc.x, 3)}, ${round(ndc.y, 3)}) → ${good.length} hits`);
    d.check('Normalized device coordinates (−1…+1, y up) hit what is under the pointer', good.length > 0, good[0] ? `first hit ${good[0].object.name}` : 'no hit');
    data.ndc = [round(ndc.x, 3), round(ndc.y, 3)];
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const center = d.time('raycaster.setFromCamera(new Vector2(0, 0), camera); raycaster.intersectObjects(group.children)', () => raycaster.intersectObjects(group.children), (h) => `${h.length} hits`);
  d.check('Hits come back sorted nearest first', center.length >= 2 && center.every((h, i) => i === 0 || h.distance >= center[i - 1].distance), center.map((h) => `${h.object.name} @ ${round(h.distance, 2)}`).join(', '));
  d.check('The first hit is the front face of the center cube', center[0]?.object.name === 'cube(0,0)' && Math.abs(center[0].distance - 9.5) < 1e-6, `${center[0]?.object.name} at ${round(center[0]?.distance ?? 0, 3)} (camera 10 − half size 0.5)`);

  const ndc = new THREE.Vector2((p.x / 100) * 2 - 1, -((p.y / 100) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const pointerHits = raycaster.intersectObjects([group, balls], p.recursive);
  d.cmd(`raycaster.setFromCamera((${round(ndc.x, 2)}, ${round(ndc.y, 2)}), camera); intersectObjects([group, balls], recursive = ${p.recursive}) → ${pointerHits.length} hits${pointerHits[0] ? `, first ${pointerHits[0].object.name}${pointerHits[0].instanceId !== undefined ? ` #${pointerHits[0].instanceId}` : ''}` : ''}`);
  data.pointer = { ndc: [round(ndc.x, 3), round(ndc.y, 3)], hits: pointerHits.slice(0, 6).map((h) => ({ name: h.object.name, instanceId: h.instanceId, distance: round(h.distance, 3), point: h.point.toArray().map((n) => round(n, 2)) })) };

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const flat = raycaster.intersectObject(group, false);
  const deep = raycaster.intersectObject(group, true);
  d.cmd(`intersectObject(group, recursive = false) → ${flat.length} hits; recursive = true → ${deep.length} hits`);
  d.check('A Group has no geometry: only recursive = true tests its children', flat.length === 0 && deep.length > 0, `${flat.length} vs ${deep.length}`);

  const target = new THREE.Vector3(-5.25 + 3 * 1.5, -4.2, 0).project(camera);
  raycaster.setFromCamera(new THREE.Vector2(target.x, target.y), camera);
  const inst = raycaster.intersectObject(balls);
  d.cmd(`aim at sphere #3: intersectObject(instancedMesh) → instanceId ${inst[0]?.instanceId}`);
  d.check('InstancedMesh hits report which instance: intersection.instanceId', inst[0]?.instanceId === 3, `instanceId ${inst[0]?.instanceId}`);

  group.children[12].layers.set(1);
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const layered = raycaster.intersectObjects(group.children);
  d.cmd(`cube(0,0).layers.set(1); raycaster.layers stays 0 → first hit ${layered[0]?.object.name}`);
  d.check('Layers filter what the ray can hit', layered[0]?.object.name === 'big cube behind', `first hit is now ${layered[0]?.object.name}`);
  data.centerHits = center.map((h) => ({ name: h.object.name, distance: round(h.distance, 3) }));
  return d.result(data);
}

// ---- OrbitControls ----------------------------------------------------------------------------------

export const controlsParams = (i = {}) => ({
  damping: i.damping === undefined ? true : bool(i.damping),
  dampingFactor: clamp(i.dampingFactor, 0.01, 0.5, 0.05),
  autoRotateSpeed: clamp(i.autoRotateSpeed, -10, 10, 2),
  maxDistance: clamp(i.maxDistance, 3, 50, 15),
});

export function buildControls(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 200);
  camera.position.set(6, 4, 8);
  scene.add(new THREE.GridHelper(20, 20, 0x334155, 0x1e293b), new THREE.AxesHelper(2));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 6, 4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x334155, 0.8));
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.6, 0.55) }));
    m.position.set(Math.cos(a) * 4, 0.7, Math.sin(a) * 4);
    scene.add(m);
  }
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  scene.add(target);
  return {
    scene,
    camera,
    hud: () => `damping ${p.damping ? `on (${p.dampingFactor})` : 'off'} · autoRotateSpeed ${p.autoRotateSpeed} · maxDistance ${p.maxDistance} · drag, scroll, right-drag`,
    // The live view's OrbitControls, configured exactly like the inputs say
    controls: {
      target: [0, 0.5, 0],
      configure: (c) => Object.assign(c, { enableDamping: p.damping, dampingFactor: p.dampingFactor, autoRotate: true, autoRotateSpeed: p.autoRotateSpeed, maxDistance: p.maxDistance }),
    },
  };
}

function makeControls(p) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, 10);
  const element = document.createElement('div');
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = p.damping;
  controls.dampingFactor = p.dampingFactor;
  return { camera, controls };
}

export async function runControls(inputs, mode = 'run') {
  const p = controlsParams(inputs);
  const d = new Demo('controls');
  const data = { params: p };

  if (mode === 'lookat') {
    const { camera, controls } = makeControls(p);
    camera.lookAt(5, 5, 0);
    d.cmd('✗ camera.lookAt(5, 5, 0) while OrbitControls is active');
    controls.update();
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const toTarget = controls.target.clone().sub(camera.position).normalize();
    d.cmd(`controls.update() → camera direction ${v3(dir)} (toward controls.target ${v3(controls.target)})`);
    d.check('controls.update() overrides camera.lookAt(): it always aims at controls.target', dir.distanceTo(toTarget) < 1e-6, `direction ${v3(dir)}`);
    controls.target.set(5, 5, 0);
    controls.update();
    const dir2 = camera.getWorldDirection(new THREE.Vector3());
    const want = new THREE.Vector3(5, 5, 0).sub(camera.position).normalize();
    d.cmd(`✓ controls.target.set(5, 5, 0); controls.update() → direction ${v3(dir2)}`);
    d.check('Set controls.target instead, then call update()', dir2.distanceTo(want) < 1e-6, v3(dir2));
    controls.dispose();
  }

  const { camera, controls } = makeControls({ ...p, damping: false });
  d.cmd(`controls = new OrbitControls(camera, renderer.domElement); camera at ${v3(camera.position)}, target ${v3(controls.target)}`);
  controls.autoRotate = true;
  controls.autoRotateSpeed = p.autoRotateSpeed;
  const az0 = controls.getAzimuthalAngle();
  const r0 = controls.getDistance();
  for (let i = 0; i < 60; i += 1) controls.update(1 / 60);
  const az1 = controls.getAzimuthalAngle();
  const turned = THREE.MathUtils.euclideanModulo(az0 - az1 + Math.PI, Math.PI * 2) - Math.PI;
  const expected = ((Math.PI * 2) / 60) * p.autoRotateSpeed;
  d.cmd(`controls.autoRotate = true; autoRotateSpeed = ${p.autoRotateSpeed}; 60 × controls.update(1 / 60) → azimuth ${round(THREE.MathUtils.radToDeg(az0), 2)}° → ${round(THREE.MathUtils.radToDeg(az1), 2)}°`);
  d.check('autoRotateSpeed 1 = one orbit per 60 s: the turn matches speed × time', Math.abs(turned - expected) < 1e-6, `${round(THREE.MathUtils.radToDeg(turned), 3)}° vs ${round(THREE.MathUtils.radToDeg(expected), 3)}°`);
  d.check('Orbiting keeps the distance to the target', Math.abs(controls.getDistance() - r0) < 1e-9, `${round(r0, 6)} → ${round(controls.getDistance(), 6)}`);
  controls.autoRotate = false;
  controls.maxDistance = p.maxDistance;
  camera.position.set(0, 0, 60);
  controls.update();
  d.cmd(`controls.maxDistance = ${p.maxDistance}; camera.position.z = 60; controls.update() → distance ${round(controls.getDistance(), 3)}`);
  d.check('maxDistance clamps the camera on the next update()', Math.abs(controls.getDistance() - Math.min(60, p.maxDistance)) < 1e-6, `distance ${round(controls.getDistance(), 3)}`);
  controls.dispose();

  // Damping keeps moving after input stops, but only while update() runs each frame
  const trail = {};
  for (const damping of [false, true]) {
    const c = makeControls({ ...p, damping });
    c.controls.autoRotate = true;
    c.controls.autoRotateSpeed = 30;
    c.controls.update(1 / 60);
    c.controls.autoRotate = false;
    const steps = [];
    let prev = c.controls.getAzimuthalAngle();
    for (let i = 0; i < 30; i += 1) {
      c.controls.update(1 / 60);
      const now = c.controls.getAzimuthalAngle();
      steps.push(round(THREE.MathUtils.radToDeg(Math.abs(now - prev)), 4));
      prev = now;
    }
    trail[damping] = steps;
    c.controls.dispose();
  }
  d.cmd(`one frame of input, then 30 × update(): enableDamping false → moves [${trail.false.slice(0, 4).join(', ')}…]°, true → [${trail.true.slice(0, 4).join(', ')}…]°`);
  d.check('enableDamping: motion coasts and decays over the following frames', trail.true[0] > 0 && trail.true[10] < trail.true[0] && trail.false.every((s) => s === 0), `frame 1 ${trail.true[0]}°, frame 11 ${trail.true[10]}°; without damping ${trail.false[0]}°`);
  data.trail = trail;
  data.turned = round(THREE.MathUtils.radToDeg(turned), 3);
  return d.result(data);
}

// ---- Render loop & Timer ----------------------------------------------------------------------------

export const loopParams = (i = {}) => ({ fps: oneOf(Number(i.fps), [60, 30, 120, 144]), speed: clamp(i.speed, 0.5, 10, 2) });

export function buildLoop(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 5, 9);
  camera.lookAt(0, 0, 0);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 5, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.5));
  const track = (z, color) => {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 1), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    lane.position.set(0, -0.05, z);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color }));
    cube.position.set(-5.5, 0.35, z);
    scene.add(lane, cube);
    return cube;
  };
  const byFrame = track(-1, 0xef4444);
  const byDelta = track(1, 0x34d399);
  let acc = 0;
  const step = 1 / p.fps;
  const wrap = (x) => (x > 5.5 ? -5.5 : x);
  return {
    scene,
    camera,
    hud: () => `simulated refresh ${p.fps} Hz · red: += 0.03 per frame · green: += speed × delta`,
    tick: (dt) => {
      acc += dt;
      while (acc >= step) {
        acc -= step;
        byFrame.position.x = wrap(byFrame.position.x + 0.03);
        byDelta.position.x = wrap(byDelta.position.x + (p.speed * step));
      }
    },
  };
}

/** Simulates `seconds` of frames at `fps`, feeding Timer explicit timestamps like requestAnimationFrame does. */
function simulate(fps, seconds, speed) {
  const timer = new THREE.Timer();
  let byFrame = 0;
  let byDelta = 0;
  const frames = Math.round(fps * seconds);
  timer.update(0);
  for (let i = 1; i <= frames; i += 1) {
    timer.update((i * 1000) / fps);
    byFrame += 0.03;
    byDelta += speed * timer.getDelta();
  }
  return { fps, frames, byFrame: round(byFrame, 3), byDelta: round(byDelta, 3) };
}

export async function runLoop(inputs, mode = 'run') {
  const p = loopParams(inputs);
  const d = new Demo('animation-loop');
  const data = { params: p };
  const runs = [30, 60, 120, 144].map((fps) => simulate(fps, 2, p.speed));
  runs.forEach((r) => d.cmd(`timer.update(timestamp) × ${r.frames} frames at ${r.fps} Hz → frame-based x = ${r.byFrame}, delta-based x = ${r.byDelta}`));
  const deltas = runs.map((r) => r.byDelta);
  d.check('Delta-time motion covers the same distance at any refresh rate', Math.max(...deltas) - Math.min(...deltas) < 1e-6 && Math.abs(deltas[0] - p.speed * 2) < 1e-6, `${deltas.join(' = ')} = speed ${p.speed} × 2 s`);
  const r30 = runs[0].byFrame;
  const r144 = runs[3].byFrame;
  d.check('Per-frame motion runs 4.8× faster on a 144 Hz screen than at 30 Hz', Math.abs(r144 / r30 - 4.8) < 0.01, `${r30} vs ${r144}`);
  const timer = new THREE.Timer();
  timer.update(1000);
  timer.update(1016.7);
  const a = timer.getDelta();
  const b = timer.getDelta();
  d.cmd(`timer.update(1016.7); timer.getDelta() → ${round(a, 4)} s, again → ${round(b, 4)} s`);
  d.check('Timer.getDelta() is stable within a frame (unlike Clock, which reset on every call)', a === b && Math.abs(a - 0.0167) < 1e-6, `${round(a, 4)} = ${round(b, 4)}`);
  data.runs = runs;

  if (mode === 'clock') {
    const att = await d.attempt('new THREE.Clock()', () => new THREE.Clock());
    d.check('Clock is deprecated since r183 and warns when constructed', att.logs.some((l) => l.message.includes('Clock: This module has been deprecated. Please use THREE.Timer instead.')), att.logs[0]?.message);
    const clock = att.value;
    if (clock) {
      clock.start();
      const first = clock.getDelta();
      const second = clock.getDelta();
      d.cmd(`clock.getDelta() → ${first.toExponential(2)} s, then ${second.toExponential(2)} s: the second call steals the frame's time`);
      d.check('Calling Clock.getDelta() twice in one frame gives the second caller ~0', second <= first + 0.002, `${first.toExponential(2)} then ${second.toExponential(2)}`);
    }
  }
  return d.result(data);
}

// ---- AnimationMixer & keyframes ---------------------------------------------------------------------

const LOOPS = { LoopRepeat: THREE.LoopRepeat, LoopOnce: THREE.LoopOnce, LoopPingPong: THREE.LoopPingPong };

export const mixerParams = (i = {}) => ({ loop: oneOf(i.loop, Object.keys(LOOPS)), timeScale: clamp(i.timeScale, -2, 3, 1), fade: clamp(i.fade, 0.1, 2, 0.5) });

export function makeClips() {
  const rise = new THREE.AnimationClip('rise', 1, [new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 2, 0])]);
  const bounce = new THREE.AnimationClip('bounce', 1, [
    new THREE.VectorKeyframeTrack('.position', [0, 0.5, 1], [0, 0, 0, 0, 2, 0, 0, 0, 0]),
    new THREE.VectorKeyframeTrack('.scale', [0, 0.45, 0.5, 0.55, 1], [1, 1, 1, 0.9, 1.1, 0.9, 1, 1, 1, 0.9, 1.1, 0.9, 1, 1, 1]),
  ]);
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 2 - 1e-4);
  const spin = new THREE.AnimationClip('spin', 2, [
    new THREE.QuaternionKeyframeTrack('.quaternion', [0, 1, 2], [...q0.toArray(), ...q1.toArray(), ...q2.toArray()]),
    new THREE.ColorKeyframeTrack('.material.color', [0, 1, 2], [0.13, 0.83, 0.93, 0.96, 0.45, 0.71, 0.13, 0.83, 0.93]),
  ]);
  return { rise, bounce, spin };
}

export function buildMixer(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 2.5, 8);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 5, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.5), new THREE.GridHelper(12, 12, 0x334155, 0x1e293b));
  const clips = makeClips();
  const mk = (x) => {
    // The clips animate the mesh's local position, so a holder group places it in the scene
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x22d3ee }));
    const holder = new THREE.Group();
    holder.position.set(x, 0.45, 0);
    holder.add(m);
    scene.add(holder);
    return m;
  };
  const a = mk(-2.5);
  const b = mk(0);
  const c = mk(2.5);
  const mixers = [a, b, c].map((m) => new THREE.AnimationMixer(m));
  const loopAction = mixers[0].clipAction(clips.bounce).setLoop(LOOPS[p.loop], Infinity);
  loopAction.clampWhenFinished = true;
  loopAction.timeScale = p.timeScale;
  loopAction.play();
  mixers[1].clipAction(clips.spin).play();
  // Cross-fade between two clips every 3 seconds
  const bounce = mixers[2].clipAction(clips.bounce);
  const spin = mixers[2].clipAction(clips.spin);
  bounce.play();
  let current = bounce;
  let t = 0;
  return {
    scene,
    camera,
    hud: () => `left: ${p.loop} × ${p.timeScale} · middle: spin + color tracks · right: crossFadeTo every 3 s (${p.fade}s)`,
    tick: (dt) => {
      t += dt;
      if (t > 3) {
        t = 0;
        const next = current === bounce ? spin : bounce;
        next.reset().play();
        current.crossFadeTo(next, p.fade, false);
        current = next;
      }
      mixers.forEach((m) => m.update(dt));
      if (loopAction.paused || !loopAction.isRunning()) {
        if (t === 0) loopAction.reset().play();
      }
    },
  };
}

export async function runMixer(inputs, mode = 'run') {
  const p = mixerParams(inputs);
  const d = new Demo('animation-mixer');
  const data = { params: p };
  const clips = makeClips();
  const target = () => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

  if (mode === 'noupdate') {
    const m = target();
    const mixer = new THREE.AnimationMixer(m);
    mixer.clipAction(clips.bounce).play();
    d.cmd('✗ mixer.clipAction(bounce).play() … render loop runs for 1 s but never calls mixer.update()');
    d.check('play() alone moves nothing: the mixer only advances in update(delta)', m.position.y === 0, `y = ${m.position.y}`);
    for (let i = 0; i < 15; i += 1) mixer.update(1 / 60);
    d.cmd(`✓ mixer.update(1 / 60) × 15 → y = ${round(m.position.y, 3)}`);
    d.check('Calling mixer.update(delta) every frame animates it', m.position.y > 0.9, `y = ${round(m.position.y, 3)} after 0.25 s`);
  }

  const m = target();
  const mixer = new THREE.AnimationMixer(m);
  const bounce = mixer.clipAction(clips.bounce);
  bounce.play();
  mixer.update(0.25);
  d.cmd(`clip = new AnimationClip('bounce', 1, [new VectorKeyframeTrack('.position', [0, 0.5, 1], [y 0, 2, 0])]); mixer.clipAction(clip).play(); mixer.update(0.25) → y = ${round(m.position.y, 4)}`);
  d.check('Keyframes interpolate linearly: halfway to the 2 at t = 0.5 → 1', Math.abs(m.position.y - 1) < 1e-6, `y(0.25) = ${round(m.position.y, 4)}`);

  // Loop modes, sampled over 3 seconds for the timeline
  const samples = {};
  for (const loop of Object.keys(LOOPS)) {
    const obj = target();
    const mx = new THREE.AnimationMixer(obj);
    const action = mx.clipAction(clips.rise).setLoop(LOOPS[loop], Infinity);
    action.clampWhenFinished = true;
    action.timeScale = loop === p.loop ? p.timeScale : 1;
    let finished = false;
    mx.addEventListener('finished', () => { finished = true; });
    action.play();
    const ys = [];
    for (let i = 0; i <= 60; i += 1) {
      ys.push(round(obj.position.y, 3));
      mx.update(0.05);
    }
    samples[loop] = { ys, finished };
  }
  d.cmd(`rise clip (y 0 → 2 in 1 s) sampled every 0.05 s for 3 s with LoopRepeat, LoopOnce, LoopPingPong (timeScale ${p.timeScale} on ${p.loop})`);
  const at = (loop, t) => samples[loop].ys[Math.round(t / 0.05)];
  if (p.timeScale === 1 || p.loop !== 'LoopRepeat') d.check('LoopRepeat jumps back to the start each cycle', at('LoopRepeat', 1.5) < 1.1 && at('LoopRepeat', 1.5) > 0.9, `y(1.5 s) = ${at('LoopRepeat', 1.5)}`);
  if (p.timeScale === 1 || p.loop !== 'LoopPingPong') d.check('LoopPingPong plays the second cycle backwards', Math.abs(at('LoopPingPong', 1.25) - 1.5) < 0.01, `y(1.25 s) = ${at('LoopPingPong', 1.25)} (going back down)`);
  if (p.timeScale === 1 || p.loop !== 'LoopOnce') d.check('LoopOnce + clampWhenFinished holds the last frame and fires "finished"', at('LoopOnce', 3) === 2 && samples.LoopOnce.finished, `y(3 s) = ${at('LoopOnce', 3)}, finished event ${samples.LoopOnce.finished}`);
  if (p.timeScale !== 1) {
    const y = samples[p.loop].ys[5];
    const k = p.timeScale;
    let want = null;
    if (k >= 0) want = 0.5 * k;
    else if (p.loop === 'LoopRepeat') { const f = (0.25 * -k) % 1; want = f === 0 ? 0 : 2 * (1 - f); } // runs backwards from the end
    else if (p.loop === 'LoopOnce') want = 0; // backwards from t = 0: finished at once
    if (want !== null) d.check(`timeScale ${k} scales clip time: after 0.25 s the clip is at ${round(0.25 * k, 3)} s`, Math.abs(y - want) < 0.02, `y(0.25 s) = ${y}, expected ${round(want, 3)}`);
  }

  const obj = target();
  const mx = new THREE.AnimationMixer(obj);
  const a = mx.clipAction(clips.bounce);
  const b = mx.clipAction(clips.spin);
  a.play();
  b.play();
  a.crossFadeTo(b, p.fade, false);
  mx.update(p.fade / 2);
  const wa = a.getEffectiveWeight();
  const wb = b.getEffectiveWeight();
  d.cmd(`bounce.crossFadeTo(spin, ${p.fade}); mixer.update(${p.fade / 2}) → weights bounce ${round(wa, 3)}, spin ${round(wb, 3)}`);
  d.check('crossFadeTo blends the two clips: weights swap linearly and sum to 1', Math.abs(wa - 0.5) < 0.02 && Math.abs(wa + wb - 1) < 0.02, `${round(wa, 3)} + ${round(wb, 3)}`);
  data.samples = samples;
  data.weights = { bounce: round(wa, 3), spin: round(wb, 3) };
  return d.result(data);
}

// ---- Morph targets & skinning -----------------------------------------------------------------------

export const morphParams = (i = {}) => ({ influence: clamp(i.influence, 0, 1, 0.5), bend: clamp(i.bend, -90, 90, 45) });

export function morphBox() {
  const g = new THREE.BoxGeometry(1.4, 1.4, 1.4, 8, 8, 8);
  const pos = g.attributes.position;
  const sphere = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).normalize().multiplyScalar(1);
    sphere.set([v.x, v.y, v.z], i * 3);
  }
  g.morphAttributes.position = [new THREE.BufferAttribute(sphere, 3)];
  return g;
}

/** A 3-bone tentacle: a cylinder whose vertices follow the bones by skinIndex / skinWeight. */
export function tentacle(height = 3, color = 0xf472b6) {
  const segs = 24;
  const geometry = new THREE.CylinderGeometry(0.22, 0.3, height, 16, segs);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  const skinIndex = [];
  const skinWeight = [];
  const segment = height / 2;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const bone = Math.min(1, Math.floor(y / segment));
    const w = (y - bone * segment) / segment;
    skinIndex.push(bone, bone + 1, 0, 0);
    skinWeight.push(1 - w, w, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
  bones[1].position.y = segment;
  bones[2].position.y = segment;
  bones[0].add(bones[1]);
  bones[1].add(bones[2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  return { mesh, bones };
}

export function buildMorph(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 2, 8);
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(2, 5, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.4));
  const box = new THREE.Mesh(morphBox(), new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.3, flatShading: true }));
  box.position.set(-2, 1.2, 0);
  const { mesh, bones } = tentacle();
  mesh.position.set(2, -0.4, 0);
  const helper = new THREE.SkeletonHelper(mesh);
  scene.add(box, mesh, helper);
  const bend = THREE.MathUtils.degToRad(p.bend);
  return {
    scene,
    camera,
    controls: { target: [0, 1, 0] },
    tick: (dt, t) => {
      box.morphTargetInfluences[0] = p.influence * (0.5 + 0.5 * Math.sin(t * 1.5));
      box.rotation.y += dt * 0.4;
      bones[1].rotation.z = Math.sin(t * 1.2) * bend;
      bones[2].rotation.z = Math.sin(t * 1.2 + 0.6) * bend;
    },
  };
}

export async function runMorph(inputs, mode = 'run') {
  const p = morphParams(inputs);
  const d = new Demo('morph-skinning');
  const data = { params: p };

  if (mode === 'influences') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.geometry.morphAttributes.position = [mesh.geometry.attributes.position.clone()];
    d.cmd(`✗ mesh created first, morphAttributes added afterwards → mesh.morphTargetInfluences = ${mesh.morphTargetInfluences}`);
    const att = await d.attempt('mesh.morphTargetInfluences[0] = 1', () => { mesh.morphTargetInfluences[0] = 1; });
    d.check('Setting an influence throws: the array was never created', att.error instanceof TypeError, att.error ? `${att.error.name}: ${att.error.message}` : 'no error');
    mesh.updateMorphTargets();
    mesh.morphTargetInfluences[0] = 1;
    d.cmd(`✓ mesh.updateMorphTargets() → morphTargetInfluences = [${mesh.morphTargetInfluences}]`);
    d.check('updateMorphTargets() builds the influences array from the geometry', mesh.morphTargetInfluences?.length === 1, `length ${mesh.morphTargetInfluences?.length}`);
    mesh.geometry.dispose();
  }

  const box = new THREE.Mesh(morphBox(), new THREE.MeshBasicMaterial());
  d.cmd(`geometry.morphAttributes.position = [sphere-shaped copy of ${box.geometry.attributes.position.count} vertices]; mesh = new Mesh(geometry)`);
  d.check('The Mesh constructor creates one influence per morph target', box.morphTargetInfluences.length === 1, `morphTargetInfluences = [${box.morphTargetInfluences}]`);
  box.morphTargetInfluences[0] = p.influence;
  const i = 0;
  const base = new THREE.Vector3().fromBufferAttribute(box.geometry.attributes.position, i);
  const tgt = new THREE.Vector3().fromBufferAttribute(box.geometry.morphAttributes.position[0], i);
  const got = box.getVertexPosition(i, new THREE.Vector3());
  const want = base.clone().lerp(tgt, p.influence);
  d.cmd(`mesh.morphTargetInfluences[0] = ${p.influence}; mesh.getVertexPosition(0) → ${v3(got)} (box ${v3(base)}, sphere ${v3(tgt)})`);
  d.check('A vertex moves influence × of the way to its morph target', got.distanceTo(want) < 1e-6, `${v3(got)} ≈ lerp(${p.influence})`);
  box.geometry.dispose();

  const { mesh, bones } = tentacle();
  d.cmd('skinned = new SkinnedMesh(cylinder with skinIndex + skinWeight); skinned.bind(new Skeleton([root, mid, tip]))');
  const w = mesh.geometry.attributes.skinWeight;
  let worst = 0;
  for (let k = 0; k < w.count; k += 1) worst = Math.max(worst, Math.abs(w.getX(k) + w.getY(k) + w.getZ(k) + w.getW(k) - 1));
  d.check('Every vertex’s skin weights add up to 1', worst < 1e-6, `max deviation ${worst.toExponential(1)}`);
  const pos = mesh.geometry.attributes.position;
  let top = 0;
  let bottom = 0;
  for (let k = 0; k < pos.count; k += 1) {
    if (pos.getY(k) > pos.getY(top)) top = k;
    if (pos.getY(k) < pos.getY(bottom)) bottom = k;
  }
  mesh.updateMatrixWorld(true);
  const top0 = mesh.getVertexPosition(top, new THREE.Vector3());
  const bottom0 = mesh.getVertexPosition(bottom, new THREE.Vector3());
  bones[1].rotation.z = THREE.MathUtils.degToRad(p.bend);
  mesh.updateMatrixWorld(true);
  const top1 = mesh.getVertexPosition(top, new THREE.Vector3());
  const bottom1 = mesh.getVertexPosition(bottom, new THREE.Vector3());
  d.cmd(`bones[1].rotation.z = degToRad(${p.bend}); skinned.getVertexPosition(tip vertex) ${v3(top0)} → ${v3(top1)}`);
  const moved = top0.distanceTo(top1);
  const expectMove = 2 * 1.5 * Math.sin(Math.abs(THREE.MathUtils.degToRad(p.bend)) / 2);
  d.check('Rotating the middle bone swings the tip vertices around it', Math.abs(moved - expectMove) < 0.05, `tip moved ${round(moved, 3)} (expected ≈ ${round(expectMove, 3)})`);
  d.check('Vertices bound only to the root bone stay put', bottom0.distanceTo(bottom1) < 1e-6, `base moved ${bottom0.distanceTo(bottom1).toExponential(1)}`);
  data.tip = { before: top0.toArray().map((n) => round(n, 3)), after: top1.toArray().map((n) => round(n, 3)) };
  mesh.geometry.dispose();
  mesh.skeleton.dispose();
  return d.result(data);
}
