// Geometry: built-in primitives, custom BufferGeometry, lines & points, shapes & curves.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Demo, bool, clamp, clampInt, disposeTree, oneOf, round } from './lab.js';
import { colorDistance, getCheckRenderer, rgb, shoot } from './gpu.js';

const BG = 0x0b1120;
const BG_RGB = [11, 17, 32];
const isBg = (p) => colorDistance(p, BG_RGB) < 8;

function baseScene(fov = 45, aspect = 1.6) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
  return { scene, camera };
}

function lights(scene) {
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 1.2));
}

// ---- Built-in geometries --------------------------------------------------------------------------

export const SHAPES = ['Box', 'Sphere', 'Cylinder', 'Cone', 'Torus', 'TorusKnot', 'Icosahedron', 'Capsule'];

export const primitiveParams = (i = {}) => ({ shape: oneOf(i.shape, SHAPES), detail: clampInt(i.detail, 1, 64, 12) });

export function makePrimitive(shape, s) {
  switch (shape) {
    case 'Box': return new THREE.BoxGeometry(1.4, 1.4, 1.4, s, s, s);
    case 'Sphere': return new THREE.SphereGeometry(0.9, Math.max(3, s), Math.max(2, s));
    case 'Cylinder': return new THREE.CylinderGeometry(0.7, 0.7, 1.6, Math.max(3, s), Math.max(1, Math.round(s / 4)));
    case 'Cone': return new THREE.ConeGeometry(0.8, 1.6, Math.max(3, s));
    case 'Torus': return new THREE.TorusGeometry(0.7, 0.28, Math.max(2, Math.round(s / 2)), Math.max(3, s));
    case 'TorusKnot': return new THREE.TorusKnotGeometry(0.6, 0.2, Math.max(3, s * 4), Math.max(3, Math.round(s / 2)));
    case 'Icosahedron': return new THREE.IcosahedronGeometry(0.95, Math.min(16, s - 1));
    default: return new THREE.CapsuleGeometry(0.5, 0.8, Math.max(1, Math.round(s / 3)), Math.max(3, s));
  }
}

export const triangleCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export function buildPrimitives(p) {
  const { scene, camera } = baseScene();
  lights(scene);
  camera.position.set(0, 2.2, 7.5);
  const ring = new THREE.Group();
  SHAPES.forEach((shape, i) => {
    const a = (i / SHAPES.length) * Math.PI * 2;
    const selected = shape === p.shape;
    const mesh = new THREE.Mesh(makePrimitive(shape, selected ? p.detail : 12), new THREE.MeshStandardMaterial({ color: selected ? 0x22d3ee : 0x64748b, roughness: 0.4, flatShading: selected && p.detail < 8 }));
    mesh.position.set(Math.sin(a) * 4, 0, Math.cos(a) * 4);
    if (selected) {
      mesh.scale.setScalar(1.6);
      mesh.position.set(0, 0.4, 0);
      mesh.add(new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x0b1120, transparent: true, opacity: 0.5 })));
      scene.add(mesh);
    } else ring.add(mesh);
  });
  scene.add(ring);
  return {
    scene,
    camera,
    tick: (dt) => {
      ring.rotation.y += dt * 0.15;
      ring.children.forEach((m) => { m.rotation.x += dt * 0.4; m.rotation.y += dt * 0.3; });
      scene.children.forEach((c) => c.isMesh && (c.rotation.y += dt * 0.35));
    },
  };
}

export async function runPrimitives(inputs, mode = 'run') {
  const p = primitiveParams(inputs);
  const d = new Demo('primitives');
  const s = p.detail;
  const shapes = SHAPES.map((shape) => {
    const t0 = performance.now();
    const g = makePrimitive(shape, s);
    const ms = performance.now() - t0;
    const row = { shape, vertices: g.attributes.position.count, triangles: triangleCount(g), indexed: Boolean(g.index), attributes: Object.keys(g.attributes), ms: round(ms, 2) };
    d.cmd(`new ${shape}Geometry(…, segments ${s}) → ${row.vertices} vertices, ${row.triangles} triangles, ${row.indexed ? 'indexed' : 'non-indexed'}  (${row.ms} ms)`);
    g.dispose();
    return row;
  });
  const get = (name) => shapes.find((r) => r.shape === name);
  d.check('BoxGeometry: 6 faces × (s+1)² vertices, 12 × s² triangles', get('Box').vertices === 6 * (s + 1) ** 2 && get('Box').triangles === 12 * s * s, `s = ${s}: ${get('Box').vertices} vertices, ${get('Box').triangles} triangles`);
  const ws = Math.max(3, s);
  const hs = Math.max(2, s);
  d.check('SphereGeometry: (w+1)(h+1) vertices, poles use single triangles', get('Sphere').vertices === (ws + 1) * (hs + 1) && get('Sphere').triangles === ws * (2 * hs - 2), `${get('Sphere').vertices} vertices, ${get('Sphere').triangles} triangles`);
  const det = Math.min(16, s - 1);
  d.check('IcosahedronGeometry(detail): 20 × (detail+1)² flat triangles', get('Icosahedron').triangles === 20 * (det + 1) ** 2 && !get('Icosahedron').indexed, `detail ${det} → ${get('Icosahedron').triangles} triangles`);
  d.check('Every primitive ships position, normal and uv attributes', shapes.every((r) => ['position', 'normal', 'uv'].every((a) => r.attributes.includes(a))), 'ready for lighting and textures');
  const data = { params: p, shapes };

  if (mode === 'heavy') {
    const renderer = getCheckRenderer(64, 64);
    const { scene, camera } = baseScene(40, 1);
    lights(scene);
    camera.position.z = 3;
    const mat = new THREE.MeshStandardMaterial({ color: 0x22d3ee });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 32), mat);
    scene.add(light);
    const a = shoot(d, renderer, scene, camera, 'render SphereGeometry(0.9, 64, 32)');
    const heavyGeo = d.time('✗ new SphereGeometry(0.9, 512, 256)', () => new THREE.SphereGeometry(0.9, 512, 256), (g) => `${triangleCount(g)} triangles`);
    light.geometry.dispose();
    light.geometry = heavyGeo;
    const b = shoot(d, renderer, scene, camera, '✗ render SphereGeometry(0.9, 512, 256)');
    let changed = 0;
    for (let i = 0; i < a.buf.length; i += 4) if (colorDistance([a.buf[i], a.buf[i + 1], a.buf[i + 2]], [b.buf[i], b.buf[i + 1], b.buf[i + 2]]) > 24) changed += 1;
    const diff = round((changed / (a.w * a.h)) * 100, 1);
    d.check('64× the triangles…', b.triangles >= a.triangles * 60, `${a.triangles} → ${b.triangles}`);
    d.check('…for a picture that is practically identical', diff < 3, `${changed} of ${a.w * a.h} pixels visibly differ (${diff}%), all on the silhouette edge`);
    data.heavy = { light: a.triangles, heavy: b.triangles, diff: `${diff}% of pixels`, snapshots: [a.toDataURL(), b.toDataURL()] };
    disposeTree(scene);
  }
  return d.result(data);
}

// ---- Custom BufferGeometry -------------------------------------------------------------------------

export const bufferParams = (i = {}) => ({ segments: clampInt(i.segments, 2, 128, 24), amplitude: clamp(i.amplitude, 0, 1, 0.35) });

/** A grid of (n+1)² vertices and 2n² triangles, built from typed arrays by hand. */
export function makeGrid(n, size = 4) {
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  const uvs = new Float32Array((n + 1) * (n + 1) * 2);
  for (let iy = 0; iy <= n; iy += 1) {
    for (let ix = 0; ix <= n; ix += 1) {
      const i = iy * (n + 1) + ix;
      positions.set([(ix / n - 0.5) * size, (iy / n - 0.5) * size, 0], i * 3);
      uvs.set([ix / n, iy / n], i * 2);
    }
  }
  const index = [];
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const a = iy * (n + 1) + ix;
      const b = a + 1;
      const c = a + n + 1;
      const e = c + 1;
      index.push(a, b, e, a, e, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function wave(g, t, amp) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, amp * Math.sin(x * 2 + t * 2) * Math.cos(y * 2 + t * 1.3));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

export function buildBuffer(p) {
  const { scene, camera } = baseScene();
  lights(scene);
  camera.position.set(0, -4.5, 3.6);
  camera.lookAt(0, 0, 0);
  const g = makeGrid(p.segments);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.1 }));
  const wire = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0b1120, wireframe: true, transparent: true, opacity: 0.35 }));
  const dots = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf472b6, size: 0.05 }));
  scene.add(mesh, wire, dots);
  let t = 0;
  return {
    scene,
    camera,
    tick: (dt) => {
      t += dt;
      wave(g, t, p.amplitude);
    },
  };
}

function flatScene() {
  const { scene, camera } = baseScene(30, 1);
  camera.position.set(0, 0, 8);
  const g = makeGrid(4, 2);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
  scene.add(mesh);
  return { scene, camera, g, mesh };
}

export async function runBuffer(inputs, mode = 'run') {
  const p = bufferParams(inputs);
  const d = new Demo('buffer-geometry');
  const n = p.segments;
  const data = { params: p, snapshots: [] };
  const g = d.time(`g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(Float32Array(${(n + 1) ** 2 * 3}), 3)); g.setIndex([…])`, () => makeGrid(n));
  const pos = g.attributes.position;
  d.check('(n+1)² shared vertices, 6 n² indices (2 triangles per cell)', pos.count === (n + 1) ** 2 && g.index.count === 6 * n * n, `${pos.count} vertices, ${g.index.count} indices`);
  const indexedBytes = pos.array.byteLength + g.index.array.byteLength;
  const flat = g.toNonIndexed();
  const flatBytes = flat.attributes.position.array.byteLength;
  d.cmd(`g.toNonIndexed() → ${flat.attributes.position.count} vertices (${(flatBytes / 1024).toFixed(1)} KB positions vs ${(indexedBytes / 1024).toFixed(1)} KB indexed)`);
  d.check('An index lets triangles share vertices instead of repeating them', flat.attributes.position.count === 6 * n * n, `${flat.attributes.position.count} vs ${pos.count} vertices`);
  flat.dispose();
  const v0 = pos.version;
  d.time(`position.setZ(i, ${p.amplitude} · sin(…)) for ${pos.count} vertices; position.needsUpdate = true; g.computeVertexNormals()`, () => wave(g, 0.7, p.amplitude));
  d.check('needsUpdate = true bumps the attribute version, so the next render re-uploads it', pos.version === v0 + 1, `version ${v0} → ${pos.version}`);
  const normals = g.attributes.normal;
  let worst = 0;
  for (let i = 0; i < normals.count; i += 1) worst = Math.max(worst, Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1));
  d.check('computeVertexNormals() gives unit-length normals', worst < 1e-4, `max error ${worst.toExponential(1)}`);
  g.computeBoundingSphere();
  d.cmd(`g.computeBoundingSphere() → radius ${round(g.boundingSphere.radius)}`);
  data.counts = { vertices: pos.count, indices: g.index.count, triangles: g.index.count / 3, indexedKB: round(indexedBytes / 1024, 1), flatKB: round(flatBytes / 1024, 1) };
  data.heights = Array.from({ length: n + 1 }, (_, ix) => round(pos.getZ(Math.floor(n / 2) * (n + 1) + ix), 3));
  g.dispose();

  if (mode === 'needsupdate') {
    const renderer = getCheckRenderer(64, 64);
    const { scene, camera, g: grid } = flatScene();
    const before = shoot(d, renderer, scene, camera, 'render the plane once (uploads the buffer)');
    for (let i = 0; i < grid.attributes.position.count; i += 1) grid.attributes.position.setY(i, grid.attributes.position.getY(i) + 50);
    d.cmd('✗ position.setY(i, y + 50) for every vertex, without needsUpdate');
    const stale = shoot(d, renderer, scene, camera, '✗ render again');
    data.snapshots.push({ label: '✗ edited, no needsUpdate: GPU still has the old copy', src: stale.toDataURL(), tone: 'bad' });
    d.check('Without needsUpdate the GPU keeps drawing the old vertices', !isBg(stale.at(0.5, 0.5)) && colorDistance(stale.at(0.5, 0.5), before.at(0.5, 0.5)) < 4, `center ${rgb(stale.at(0.5, 0.5))}`);
    grid.attributes.position.needsUpdate = true;
    const fresh = shoot(d, renderer, scene, camera, '✓ position.needsUpdate = true; render');
    data.snapshots.push({ label: '✓ needsUpdate: the plane moved out of view', src: fresh.toDataURL(), tone: 'ok' });
    d.check('With needsUpdate the new positions reach the GPU', isBg(fresh.at(0.5, 0.5)), `center ${rgb(fresh.at(0.5, 0.5))}`);
    disposeTree(scene);
  }

  if (mode === 'bounds') {
    const renderer = getCheckRenderer(64, 64);
    const { scene, camera, g: grid, mesh } = flatScene();
    camera.position.set(12, 0, 8);
    camera.lookAt(12, 0, 0);
    d.cmd('camera looks at x = 12; the plane starts at the origin (outside the view)');
    shoot(d, renderer, scene, camera, 'render once (computes the bounding sphere at the origin)');
    for (let i = 0; i < grid.attributes.position.count; i += 1) grid.attributes.position.setX(i, grid.attributes.position.getX(i) + 12);
    grid.attributes.position.needsUpdate = true;
    d.cmd('✗ move every vertex to x + 12; needsUpdate = true; boundingSphere not recomputed');
    const culled = shoot(d, renderer, scene, camera, '✗ render');
    data.snapshots.push({ label: '✗ stale boundingSphere: frustum-culled', src: culled.toDataURL(), tone: 'bad' });
    d.check('The stale bounding sphere makes the renderer cull a visible mesh', culled.calls === 0 && isBg(culled.at(0.5, 0.5)), `${culled.calls} draw calls, center ${rgb(culled.at(0.5, 0.5))}`);
    grid.computeBoundingSphere();
    const ok = shoot(d, renderer, scene, camera, '✓ geometry.computeBoundingSphere(); render');
    data.snapshots.push({ label: '✓ computeBoundingSphere(): drawn', src: ok.toDataURL(), tone: 'ok' });
    d.check('Recomputing the bounds brings it back', ok.calls === 1 && !isBg(ok.at(0.5, 0.5)), `${ok.calls} draw call`);
    mesh.geometry.attributes.position.setX(0, NaN);
    const att = await d.attempt('position.setX(0, NaN); geometry.computeBoundingSphere()', () => mesh.geometry.computeBoundingSphere());
    d.check('A NaN position produces Three.js’s "Computed radius is NaN" error', att.logs.some((l) => l.message.includes('Computed radius is NaN')), att.logs[0]?.message);
    disposeTree(scene);
  }
  return d.result(data);
}

// ---- Lines, points & wide lines ----------------------------------------------------------------------

export const linesParams = (i = {}) => ({
  count: clampInt(i.count, 100, 20000, 4000),
  size: clamp(i.size, 0.01, 0.3, 0.06),
  attenuation: i.attenuation === undefined ? true : bool(i.attenuation),
  linewidth: clampInt(i.linewidth, 1, 12, 5),
});

function galaxy(count, size, attenuation) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const inner = new THREE.Color(0xfbbf24);
  const outer = new THREE.Color(0x6366f1);
  const c = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const r = Math.random() ** 1.5 * 3.2;
    const arm = (i % 3) * ((Math.PI * 2) / 3);
    const a = arm + r * 1.4 + (Math.random() - 0.5) * 0.5;
    positions.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.25 * (3.2 - r), Math.sin(a) * r], i * 3);
    c.lerpColors(inner, outer, r / 3.2);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: attenuation, depthWrite: false, blending: THREE.AdditiveBlending }));
}

export function buildLines(p, { width = 640, height = 340 } = {}) {
  const { scene, camera } = baseScene();
  camera.position.set(0, 4, 7);
  camera.lookAt(0, 0, 0);
  const points = galaxy(p.count, p.attenuation ? p.size : p.size * 40, p.attenuation);
  scene.add(points);
  const helix = [];
  for (let i = 0; i <= 200; i += 1) {
    const t = i / 200;
    helix.push(Math.cos(t * Math.PI * 8) * 3.8, (t - 0.5) * 3, Math.sin(t * Math.PI * 8) * 3.8);
  }
  const lineGeo = new LineGeometry();
  lineGeo.setPositions(helix);
  const fatMat = new LineMaterial({ color: 0x22d3ee, linewidth: p.linewidth });
  // LineMaterial measures linewidth in pixels, so it must know the viewport size (and again on resize)
  fatMat.resolution.set(width, height);
  const fat = new Line2(lineGeo, fatMat);
  fat.computeLineDistances();
  const thin = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 201 }, (_, i) => new THREE.Vector3(helix[i * 3] * 1.08, helix[i * 3 + 1], helix[i * 3 + 2] * 1.08))), new THREE.LineBasicMaterial({ color: 0xf472b6, linewidth: p.linewidth }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 1.2)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  edges.position.y = 2.3;
  scene.add(fat, thin, edges);
  return {
    scene,
    camera,
    resize: (w, h) => fatMat.resolution.set(w, h),
    tick: (dt) => {
      points.rotation.y += dt * 0.12;
      edges.rotation.x += dt * 0.5;
      edges.rotation.y += dt * 0.4;
    },
  };
}

/** Thickness in pixels of a horizontal line through the middle of a 64×64 frame. */
function lineThickness(px) {
  return px.column(0.5).filter((p) => !isBg(p)).length;
}

function horizontalLine(material, isFat) {
  const { scene, camera } = baseScene(40, 1);
  camera.position.z = 5;
  let line;
  if (isFat) {
    const g = new LineGeometry();
    g.setPositions([-3, 0, 0, 3, 0, 0]);
    line = new Line2(g, material);
  } else {
    line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3, 0, 0), new THREE.Vector3(3, 0, 0)]), material);
  }
  scene.add(line);
  return { scene, camera };
}

export async function runLines(inputs, mode = 'run') {
  const p = linesParams(inputs);
  const d = new Demo('lines-points');
  const renderer = getCheckRenderer(64, 64);
  const data = { params: p, snapshots: [] };

  if (mode === 'run') {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    camera.position.set(0, 4, 7);
    camera.lookAt(0, 0, 0);
    const pts = d.time(`new Points(geometry with ${p.count} positions + colors, new PointsMaterial({ size: ${p.size}, vertexColors: true }))`, () => galaxy(p.count, p.size, true));
    scene.add(pts);
    const px = shoot(d, renderer, scene, camera);
    d.check(`${p.count.toLocaleString()} points = one draw call`, px.calls === 1 && px.points === p.count, `${px.calls} call, ${px.points} points`);
    data.snapshots.push({ label: 'Points readback', src: px.toDataURL(), tone: 'ok' });
    disposeTree(scene);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    d.cmd(`new EdgesGeometry(new BoxGeometry(1, 1, 1)) → ${edges.attributes.position.count / 2} line segments`);
    d.check('EdgesGeometry keeps only the 12 hard edges of a box', edges.attributes.position.count === 24, `${edges.attributes.position.count / 2} edges (no face diagonals)`);
    edges.dispose();

    // sizeAttenuation: world-sized points shrink with distance, pixel-sized ones do not
    const sizes = {};
    for (const attenuation of [true, false]) {
      const s2 = new THREE.Scene();
      s2.background = new THREE.Color(BG);
      const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
      const make = (color, x, z) => {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x, 0, z], 3));
        return new THREE.Points(g, new THREE.PointsMaterial({ color, size: attenuation ? 0.8 : 8, sizeAttenuation: attenuation }));
      };
      s2.add(make(0xff0000, -0.8, -2), make(0x0000ff, 2.2, -6));
      const shot = shoot(d, renderer, s2, cam, `render 2 points at z = −2 and −6, sizeAttenuation: ${attenuation}`);
      sizes[attenuation] = { near: shot.count((c) => c[0] > 150 && c[2] < 80), far: shot.count((c) => c[2] > 150 && c[0] < 80) };
      disposeTree(s2);
    }
    d.check('sizeAttenuation: true → farther points are drawn smaller', sizes.true.near > sizes.true.far * 2, `near ${sizes.true.near} px, far ${sizes.true.far} px`);
    d.check('sizeAttenuation: false → size is in pixels, same at any depth', sizes.false.near === sizes.false.far, `near ${sizes.false.near} px, far ${sizes.false.far} px`);
    data.sizes = sizes;
  }

  if (mode === 'linewidth') {
    const basic = horizontalLine(new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: p.linewidth }), false);
    const a = shoot(d, renderer, basic.scene, basic.camera, `✗ new Line(…, new LineBasicMaterial({ linewidth: ${p.linewidth} }))`);
    data.snapshots.push({ label: `✗ LineBasicMaterial linewidth ${p.linewidth}`, src: a.toDataURL(), tone: 'bad' });
    data.thin = lineThickness(a);
    d.check('linewidth is ignored: WebGL draws GL lines 1 pixel wide', data.thin <= 1 || p.linewidth === 1, `${data.thin} px thick`);
    disposeTree(basic.scene);
  }

  const fatMat = new LineMaterial({ color: 0x22d3ee, linewidth: p.linewidth });
  fatMat.resolution.set(64, 64);
  const fat = horizontalLine(fatMat, true);
  const b = shoot(d, renderer, fat.scene, fat.camera, `new Line2(new LineGeometry(), new LineMaterial({ linewidth: ${p.linewidth} })); material.resolution.set(64, 64)`);
  data.snapshots.push({ label: `✓ Line2 + LineMaterial, ${p.linewidth} px`, src: b.toDataURL(), tone: 'ok' });
  data.fat = lineThickness(b);
  d.check('Line2 draws real wide lines (triangles) at linewidth pixels', Math.abs(data.fat - p.linewidth) <= 1, `${data.fat} px thick for linewidth ${p.linewidth}`);
  disposeTree(fat.scene);
  return d.result(data);
}

// ---- Shapes, extrusion & curves ----------------------------------------------------------------------

export const shapeParams = (i = {}) => ({
  points: clampInt(i.points, 3, 12, 5),
  depth: clamp(i.depth, 0.1, 2, 0.5),
  bevel: i.bevel === undefined ? true : bool(i.bevel),
  segments: clampInt(i.segments, 8, 200, 64),
});

export function starShape(n, outer = 1, inner = 0.45) {
  const shape = new THREE.Shape();
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner * 0.4, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

const BEVEL = 0.08;
export const extrudeOptions = (p) => ({ depth: p.depth, bevelEnabled: p.bevel, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 24 });

const VASE = [[0.0, -1], [0.55, -1], [0.7, -0.6], [0.45, 0], [0.35, 0.5], [0.6, 1]].map(([x, y]) => new THREE.Vector2(x, y));

export function knotCurve() {
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * (2.6 + (i % 2) * 0.8), Math.sin(a * 2) * 0.8, Math.sin(a) * (2.6 + (i % 2) * 0.8)));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

/** Control points bunched up at one end: parameter t and arc length disagree badly here. */
export function unevenCurve() {
  return new THREE.CatmullRomCurve3([[-3, 0, 0], [-2.8, 0.3, 0], [-2.6, 0, 0], [3, 0.4, 0]].map((a) => new THREE.Vector3(...a)));
}

export function buildShapes(p) {
  const { scene, camera } = baseScene();
  lights(scene);
  camera.position.set(0, 3.5, 7);
  camera.lookAt(0, 0, 0);
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(p.points), extrudeOptions(p)), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.2 }));
  star.position.set(-1.6, 0.3, 0);
  const vase = new THREE.Mesh(new THREE.LatheGeometry(VASE, 48), new THREE.MeshStandardMaterial({ color: 0xf472b6, side: THREE.DoubleSide, roughness: 0.5 }));
  vase.position.set(1.6, 0.2, 0);
  const curve = knotCurve();
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, p.segments, 0.07, 8, true), new THREE.MeshStandardMaterial({ color: 0x22d3ee }));
  const rider = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(star, vase, tube, rider);
  let t = 0;
  return {
    scene,
    camera,
    tick: (dt) => {
      t = (t + dt * 0.08) % 1;
      rider.position.copy(curve.getPointAt(t));
      star.rotation.y += dt * 0.6;
      vase.rotation.y += dt * 0.3;
    },
  };
}

const spacingStats = (pts) => {
  const lens = pts.slice(1).map((q, i) => q.distanceTo(pts[i]));
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  return { mean, cv: sd / mean, min: Math.min(...lens), max: Math.max(...lens) };
};

export async function runShapes(inputs, mode = 'run') {
  const p = shapeParams(inputs);
  const d = new Demo('shapes-curves');
  const data = { params: p };
  const shape = starShape(p.points);
  d.cmd(`shape = new Shape(); shape.moveTo(…); ${p.points * 2 - 1} × shape.lineTo(…); shape.holes.push(new Path().absarc(…))`);
  const outline = shape.getPoints();
  data.outline = outline.map((v) => [round(v.x, 3), round(v.y, 3)]);
  const geo = d.time(`new ExtrudeGeometry(shape, { depth: ${p.depth}, bevelEnabled: ${p.bevel}, bevelThickness: ${BEVEL} })`, () => new THREE.ExtrudeGeometry(shape, extrudeOptions(p)), (g) => `${triangleCount(g)} triangles`);
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const expectZ = p.depth + (p.bevel ? 2 * BEVEL : 0);
  d.check('Extrusion depth (+ bevel on both caps) sets the thickness', Math.abs(size.z - expectZ) < 1e-4, `size.z ${round(size.z)} = ${p.depth}${p.bevel ? ` + 2 × ${BEVEL}` : ''}`);
  d.check('The hole is cut out of the cap', shape.holes.length === 1 && geo.groups.length === 2, `${shape.holes.length} hole; groups: caps + sides`);
  data.extrude = { triangles: triangleCount(geo), size: size.toArray().map((n) => round(n, 3)) };
  geo.dispose();
  const lathe = d.time(`new LatheGeometry(${VASE.length} profile points, 48 segments)`, () => new THREE.LatheGeometry(VASE, 48), (g) => `${g.attributes.position.count} vertices`);
  d.check('LatheGeometry spins the profile: (segments+1) × points vertices', lathe.attributes.position.count === 49 * VASE.length, `${lathe.attributes.position.count} = 49 × ${VASE.length}`);
  lathe.dispose();
  const curve = knotCurve();
  const length = curve.getLength();
  const gap = curve.getPointAt(0).distanceTo(curve.getPointAt(1));
  d.cmd(`curve = new CatmullRomCurve3(8 points, closed = true); curve.getLength() → ${round(length, 2)}`);
  d.check('A closed curve ends where it starts', gap < 1e-6, `|P(0) − P(1)| = ${gap.toExponential(1)}`);
  const tube = d.time(`new TubeGeometry(curve, ${p.segments}, 0.07, 8, true)`, () => new THREE.TubeGeometry(curve, p.segments, 0.07, 8, true), (g) => `${triangleCount(g)} triangles`);
  data.tube = { triangles: triangleCount(tube), length: round(length, 2) };
  tube.dispose();

  if (mode === 'spacing') {
    const u = unevenCurve();
    u.arcLengthDivisions = 2000; // finer arc-length table than the default 200: more even spacing
    const byT = u.getPoints(20);
    const byLen = u.getSpacedPoints(20);
    const a = spacingStats(byT);
    const b = spacingStats(byLen);
    d.cmd(`✗ curve.getPoints(20) → steps from ${round(a.min, 3)} to ${round(a.max, 3)} (variation ${round(a.cv * 100, 1)}%)`);
    d.cmd(`✓ curve.getSpacedPoints(20) → steps ${round(b.min, 3)}–${round(b.max, 3)} (variation ${round(b.cv * 100, 1)}%)`);
    d.check('getPoints() samples by parameter t: uneven steps', a.cv > 0.3, `step variation ${round(a.cv * 100, 1)}%`);
    d.check('getSpacedPoints() / getPointAt() sample by arc length: even steps', b.cv < 0.05, `step variation ${round(b.cv * 100, 1)}%`);
    data.spacing = { byT: byT.map((v) => [round(v.x, 3), round(v.y, 3)]), byLen: byLen.map((v) => [round(v.x, 3), round(v.y, 3)]), cvT: round(a.cv, 3), cvLen: round(b.cv, 3) };
  }
  return d.result(data);
}
