// Performance & memory: draw calls (separate meshes vs merged vs InstancedMesh vs BatchedMesh),
// LOD + frustum culling, and freeing GPU memory with dispose().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Demo, clamp, clampInt, disposeTree, oneOf, round } from './lab.js';
import { colorDistance, getCheckRenderer, hasWebGL2, rgb, shoot } from './gpu.js';

const BG = 0x0b1120;
const BG_RGB = [11, 17, 32];
const isBg = (p) => colorDistance(p, BG_RGB) < 8;

// ---- Instancing, merging & BatchedMesh -----------------------------------------------------------

export const STRATEGIES = ['separate', 'merged', 'instanced', 'batched'];
export const drawParams = (i = {}) => ({ count: clampInt(i.count, 10, 3000, 1000), strategy: oneOf(i.strategy, ['instanced', 'separate', 'merged', 'batched']) });

function layout(count) {
  const side = Math.ceil(Math.cbrt(count));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const x = i % side;
    const y = Math.floor(i / side) % side;
    const z = Math.floor(i / (side * side));
    q.setFromEuler(new THREE.Euler(i * 0.3, i * 0.7, 0));
    m.compose(new THREE.Vector3((x - side / 2) * 1.2, (y - side / 2) * 1.2, (z - side / 2) * 1.2), q, new THREE.Vector3(1, 1, 1));
    out.push(m.clone());
  }
  return { matrices: out, side };
}

/** Builds `count` cubes with one of four strategies. Returns the object(s) to add to a scene. */
export function makeCubes(strategy, count) {
  const { matrices, side } = layout(count);
  const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const color = new THREE.Color();
  const colorAt = (i) => color.setHSL((i / count) * 0.8, 0.65, 0.55);
  if (strategy === 'separate') {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    matrices.forEach((m, i) => {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.material.color.copy(colorAt(i));
      mesh.applyMatrix4(m);
      group.add(mesh);
    });
    return { object: group, side };
  }
  if (strategy === 'merged') {
    const parts = matrices.map((m, i) => {
      const g = geo.clone().applyMatrix4(m);
      const c = colorAt(i);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < colors.length; k += 3) colors.set([c.r, c.g, c.b], k);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    geo.dispose();
    return { object: new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true })), side };
  }
  if (strategy === 'instanced') {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(), count);
    matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, colorAt(i)); });
    mesh.instanceMatrix.needsUpdate = true;
    return { object: mesh, side };
  }
  const batched = new THREE.BatchedMesh(count, geo.attributes.position.count, geo.index.count, new THREE.MeshStandardMaterial());
  const id = batched.addGeometry(geo);
  matrices.forEach((m, i) => {
    const instance = batched.addInstance(id);
    batched.setMatrixAt(instance, m);
    batched.setColorAt(instance, colorAt(i));
  });
  geo.dispose();
  return { object: batched, side };
}

function cubeScene(side, aspect = 1) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  camera.position.set(side * 1.1, side * 0.9, side * 1.6);
  camera.lookAt(0, 0, 0);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.5));
  return { scene, camera };
}

export function buildDraw(p) {
  const { object, side } = makeCubes(p.strategy, p.count);
  const { scene, camera } = cubeScene(side, 1.6);
  scene.add(object);
  return {
    scene,
    camera,
    hud: () => `${p.count.toLocaleString()} cubes as ${p.strategy}`,
    tick: (dt) => { object.rotation.y += dt * 0.15; },
  };
}

export async function runDraw(inputs, mode = 'run') {
  const p = drawParams(inputs);
  const d = new Demo('draw-calls');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, rows: [], snapshots: [] };
  const code = {
    separate: `${p.count} × new Mesh(sharedBox, material)`,
    merged: `mergeGeometries(${p.count} transformed boxes) → 1 Mesh`,
    instanced: `new InstancedMesh(box, material, ${p.count}); setMatrixAt / setColorAt`,
    batched: `new BatchedMesh(${p.count}, …); addGeometry(box); ${p.count} × addInstance`,
  };
  for (const strategy of STRATEGIES) {
    const t0 = performance.now();
    const { object, side } = makeCubes(strategy, p.count);
    const buildMs = performance.now() - t0;
    const { scene, camera } = cubeScene(side);
    scene.add(object);
    renderer.render(scene, camera); // warm-up: compile shaders, upload buffers
    const times = [];
    for (let k = 0; k < 4; k += 1) {
      const t1 = performance.now();
      renderer.render(scene, camera);
      renderer.getContext().finish();
      times.push(performance.now() - t1);
    }
    const px = shoot(d, renderer, scene, camera, `${code[strategy]}  (built in ${buildMs.toFixed(1)} ms); render`);
    const row = { strategy, calls: px.calls, triangles: px.triangles, buildMs: round(buildMs, 1), renderMs: round(Math.min(...times), 2), src: px.toDataURL() };
    data.rows.push(row);
    disposeTree(scene);
  }
  const row = (s) => data.rows.find((r) => r.strategy === s);
  d.check(`Separate meshes: one draw call each (${p.count})`, row('separate').calls === p.count, `${row('separate').calls} draw calls`);
  d.check('Merged geometry, InstancedMesh and BatchedMesh: one draw call', ['merged', 'instanced', 'batched'].every((s) => row(s).calls === 1), ['merged', 'instanced', 'batched'].map((s) => `${s} ${row(s).calls}`).join(', '));
  d.check('Same triangles on screen either way: only the CPU overhead changes', data.rows.every((r) => r.triangles === 12 * p.count), `${12 * p.count} triangles each`);

  if (mode === 'needsupdate') {
    const { object, side } = makeCubes('instanced', 50);
    const { scene, camera } = cubeScene(side);
    scene.add(object);
    shoot(d, renderer, scene, camera, 'InstancedMesh with 50 instances: first render uploads instanceMatrix');
    const far = new THREE.Matrix4().makeTranslation(0, 1000, 0);
    for (let i = 0; i < 50; i += 1) object.setMatrixAt(i, far);
    const stale = shoot(d, renderer, scene, camera, '✗ setMatrixAt(i, far away) for every instance, no instanceMatrix.needsUpdate; render');
    data.snapshots.push({ label: '✗ forgot instanceMatrix.needsUpdate', src: stale.toDataURL(), tone: 'bad' });
    const visible = stale.count((c) => !isBg(c));
    d.check('Without needsUpdate the GPU keeps the old matrices', visible > 40, `${visible} cube pixels still drawn`);
    object.instanceMatrix.needsUpdate = true;
    object.computeBoundingSphere();
    const fresh = shoot(d, renderer, scene, camera, '✓ instanceMatrix.needsUpdate = true; computeBoundingSphere(); render');
    data.snapshots.push({ label: '✓ needsUpdate: moved away', src: fresh.toDataURL(), tone: 'ok' });
    d.check('With needsUpdate the instances move', fresh.count((c) => !isBg(c)) === 0, `${fresh.count((c) => !isBg(c))} cube pixels`);
    disposeTree(scene);
  }
  return d.result(data);
}

// ---- LOD & frustum culling ---------------------------------------------------------------------------

export const lodParams = (i = {}) => ({ distance: clamp(i.distance, 2, 60, 18), count: clampInt(i.count, 50, 2000, 400) });

export const LOD_LEVELS = [
  { detail: 12, distance: 0, color: 0x34d399 },
  { detail: 3, distance: 10, color: 0xfbbf24 },
  { detail: 0, distance: 25, color: 0xef4444 },
];

export function makeLod() {
  const lod = new THREE.LOD();
  LOD_LEVELS.forEach((l) => lod.addLevel(new THREE.Mesh(new THREE.IcosahedronGeometry(1, l.detail), new THREE.MeshStandardMaterial({ color: l.color, flatShading: true })), l.distance));
  return lod;
}

export function scatter(count, seed = 1) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const geo = new THREE.SphereGeometry(0.5, 12, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const m = new THREE.Mesh(geo, mat);
    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    m.position.copy(dir.multiplyScalar(6 + rand() * 40));
    group.add(m);
  }
  return group;
}

export function buildLod(p) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 300);
  camera.position.set(0, 2, p.distance);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.5));
  const lods = [];
  for (let i = -3; i <= 3; i += 1) {
    const lod = makeLod();
    lod.position.set(i * 3, 0, -Math.abs(i) * 8);
    scene.add(lod);
    lods.push(lod);
  }
  let level = '';
  return {
    scene,
    camera,
    hud: () => level,
    tick: () => {
      // LOD objects switch level automatically inside renderer.render (lod.autoUpdate)
      level = `center LOD level ${lods[3].getCurrentLevel()} at ${round(camera.position.distanceTo(lods[3].position), 1)} units · zoom to switch`;
    },
  };
}

export async function runLod(inputs, mode = 'run') {
  const p = lodParams(inputs);
  const d = new Demo('lod-culling');
  const data = { params: p, levels: [] };
  const lod = makeLod();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  d.cmd(`lod = new LOD(); lod.addLevel(detail-12 mesh, 0); lod.addLevel(detail-3 mesh, 10); lod.addLevel(detail-0 mesh, 25)`);
  const expected = (dist) => (dist >= 25 ? 2 : dist >= 10 ? 1 : 0);
  const probes = [3, 12, 40, p.distance];
  for (const dist of probes) {
    camera.position.set(0, 0, dist);
    camera.updateMatrixWorld();
    lod.update(camera);
    data.levels.push({ distance: dist, level: lod.getCurrentLevel(), triangles: 20 * (LOD_LEVELS[lod.getCurrentLevel()].detail + 1) ** 2 });
  }
  d.cmd(`camera at ${probes.join(', ')} → lod.update(camera); lod.getCurrentLevel() → ${data.levels.map((l) => l.level).join(', ')}`);
  d.check('LOD picks the level whose distance threshold the camera has passed', data.levels.every((l) => l.level === expected(l.distance)), data.levels.map((l) => `${l.distance} → ${l.level}`).join(', '));

  if (hasWebGL2()) {
    const renderer = getCheckRenderer(64, 64);
    const scene = new THREE.Scene();
    scene.add(lod, new THREE.AmbientLight(0xffffff, 1));
    camera.position.set(0, 0, p.distance);
    const px = shoot(d, renderer, scene, camera, `camera.position.z = ${p.distance}; render (LOD auto-updates)`);
    const want = 20 * (LOD_LEVELS[expected(p.distance)].detail + 1) ** 2;
    d.check('Only the selected level is drawn: fewer triangles far away', px.triangles === want, `${px.triangles} triangles (level ${expected(p.distance)})`);
    scene.remove(lod);

    const group = scatter(p.count);
    const world = new THREE.Scene();
    world.add(group);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    cam.position.set(0, 0, 0);
    cam.updateMatrixWorld();
    world.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const inView = group.children.filter((m) => frustum.intersectsObject(m)).length;
    d.cmd(`frustum = new Frustum().setFromProjectionMatrix(projection × view); ${inView} of ${p.count} spheres intersect it`);
    const culled = shoot(d, renderer, world, cam, `render ${p.count} spheres scattered around the camera (frustumCulled = true, the default)`);
    d.check('Frustum culling skips everything outside the view', culled.calls === inView && inView < p.count, `${culled.calls} draw calls = ${inView} visible of ${p.count}`);
    group.children.forEach((m) => { m.frustumCulled = false; });
    const all = shoot(d, renderer, world, cam, `${mode === 'nocull' ? '✗ ' : ''}mesh.frustumCulled = false on every sphere; render`);
    d.check(mode === 'nocull' ? 'Turning culling off draws all of them, even behind the camera' : 'With frustumCulled = false every mesh costs a draw call', all.calls === p.count, `${all.calls} draw calls`);
    data.culling = { total: p.count, inView, culledCalls: culled.calls, allCalls: all.calls };
    group.children[0].geometry.dispose();
    group.children[0].material.dispose();
  }
  disposeTree(lod);
  return d.result(data);
}

// ---- Memory & dispose() -------------------------------------------------------------------------------

export const disposeParams = (i = {}) => ({ cycles: clampInt(i.cycles, 1, 50, 20) });

function churnObject(i) {
  const tex = new THREE.DataTexture(new Uint8Array([i * 5, 120, 255 - i * 5, 255]), 1, 1);
  tex.needsUpdate = true;
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: tex }));
}

export function buildDispose(p, { renderer }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0, 2, 9);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const live = [];
  let t = 0;
  let spawned = 0;
  return {
    scene,
    camera,
    hud: () => `renderer.info.memory: ${renderer.info.memory.geometries} geometries, ${renderer.info.memory.textures} textures · ${spawned} spawned, all disposed on removal`,
    tick: (dt) => {
      t += dt;
      if (t > 0.15) {
        t = 0;
        const m = churnObject(spawned % 50);
        m.position.set((Math.random() - 0.5) * 8, 4, (Math.random() - 0.5) * 3);
        scene.add(m);
        live.push(m);
        spawned += 1;
      }
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const m = live[i];
        m.position.y -= dt * 2.5;
        m.rotation.x += dt;
        if (m.position.y < -3) {
          scene.remove(m);
          m.geometry.dispose();
          m.material.map.dispose();
          m.material.dispose();
          live.splice(i, 1);
        }
      }
    },
  };
}

export async function runDispose(inputs, mode = 'run') {
  const p = disposeParams(inputs);
  const d = new Demo('dispose');
  const renderer = getCheckRenderer(32, 32);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.z = 3;
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  renderer.render(scene, camera);
  const base = { ...renderer.info.memory };
  d.cmd(`baseline renderer.info.memory → ${base.geometries} geometries, ${base.textures} textures`);
  const series = { leak: [], clean: [] };
  const leaked = [];

  if (mode === 'leak') {
    for (let i = 0; i < p.cycles; i += 1) {
      const m = churnObject(i);
      scene.add(m);
      renderer.render(scene, camera);
      scene.remove(m);
      leaked.push(m);
      series.leak.push({ ...renderer.info.memory });
    }
    const after = renderer.info.memory;
    d.cmd(`✗ ${p.cycles} × { scene.add(mesh); render; scene.remove(mesh) } → ${after.geometries} geometries, ${after.textures} textures`);
    d.check('scene.remove() does not free GPU memory: every cycle leaks a geometry and a texture', after.geometries - base.geometries === p.cycles && after.textures - base.textures === p.cycles, `+${after.geometries - base.geometries} geometries, +${after.textures - base.textures} textures`);
    leaked.forEach((m) => { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); });
    d.cmd(`clean-up: geometry.dispose(), map.dispose(), material.dispose() on the ${leaked.length} leaked meshes → ${renderer.info.memory.geometries} geometries, ${renderer.info.memory.textures} textures`);
    d.check('dispose() on the leaked objects returns memory to the baseline', renderer.info.memory.geometries === base.geometries && renderer.info.memory.textures === base.textures, `${renderer.info.memory.geometries}/${renderer.info.memory.textures}`);
  }

  for (let i = 0; i < p.cycles; i += 1) {
    const m = churnObject(i);
    scene.add(m);
    renderer.render(scene, camera);
    scene.remove(m);
    m.geometry.dispose();
    m.material.map.dispose();
    m.material.dispose();
    series.clean.push({ ...renderer.info.memory });
  }
  const end = renderer.info.memory;
  d.cmd(`${p.cycles} × { add; render; remove; geometry.dispose(); material.map.dispose(); material.dispose() } → ${end.geometries} geometries, ${end.textures} textures`);
  d.check('With dispose() memory stays flat no matter how many cycles', series.clean.every((m) => m.geometries === base.geometries && m.textures === base.textures), `${end.geometries} geometries, ${end.textures} textures after ${p.cycles} cycles`);

  // A renderer you are done with: dispose() frees its resources, forceContextLoss() frees the context
  const canvas = document.createElement('canvas');
  const temp = new THREE.WebGLRenderer({ canvas });
  const gl = temp.getContext();
  const lost = new Promise((resolve) => {
    canvas.addEventListener('webglcontextlost', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), 2000);
  });
  temp.dispose();
  const kept = !gl.isContextLost();
  temp.forceContextLoss();
  const fired = await lost;
  d.cmd(`temp = new WebGLRenderer(); temp.dispose() → context still alive: ${kept}; temp.forceContextLoss() → webglcontextlost ${fired ? 'fired' : 'did not fire'}, gl.isContextLost() = ${gl.isContextLost()}`);
  d.check('dispose() alone keeps the WebGL context; forceContextLoss() hands it back to the browser', kept && fired && gl.isContextLost(), `after dispose: alive ${kept}; after forceContextLoss: lost ${gl.isContextLost()}`);
  return d.result({ params: p, base, series });
}
