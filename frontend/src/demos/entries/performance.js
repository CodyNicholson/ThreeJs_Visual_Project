import { runDraw, runLod, runDispose } from '../../lab/performance.js';

export const PERFORMANCE = [
  {
    id: 'draw-calls',
    category: 'Performance & memory',
    title: 'Instancing, merging & BatchedMesh',
    tagline: 'Thousands of objects in one draw call',
    gpu: true,
    description: [
      'Each Mesh costs a draw call: the CPU sets up state and asks the GPU to draw. A few hundred are fine; thousands make the CPU the bottleneck long before the GPU is busy. Three ways out: merge geometries into one mesh (fastest, but the parts can no longer move separately), InstancedMesh (one geometry drawn many times with a matrix and color per instance), and BatchedMesh (many different geometries in one multi-draw call, each instance movable).',
      '"Run it" builds the same N cubes four ways, renders each and reads renderer.info: N draw calls for separate meshes, 1 for each of the other three, with the same number of triangles on screen. The bars also show the measured build and render times on your machine. The live view renders your chosen strategy; compare its HUD draw-call count.',
      'Instances are uploaded once, like any buffer. The "Do it wrong" button moves every instance with setMatrixAt but forgets instanceMatrix.needsUpdate, and the GPU keeps drawing them where they were.',
    ],
    keyApis: ['new InstancedMesh(geometry, material, count)', 'setMatrixAt(i, matrix) / setColorAt(i, color)', 'instanceMatrix.needsUpdate = true', 'mergeGeometries(geometries) (BufferGeometryUtils)', 'new BatchedMesh(maxInstances, maxVertices, maxIndices, material)', 'addGeometry / addInstance', 'renderer.info.render.calls'],
    useCases: ['Forests, crowds, particles of meshes', 'City blocks and voxel worlds', 'Static level geometry (merge)', 'Many different props (BatchedMesh)'],
    snippet: {
      lang: 'js',
      name: 'instancing.js',
      code: `const cubes = new THREE.InstancedMesh(box, material, 1000);
for (let i = 0; i < 1000; i++) {
  cubes.setMatrixAt(i, matrices[i]);
  cubes.setColorAt(i, colors[i]);
}
cubes.instanceMatrix.needsUpdate = true;   // after every change
scene.add(cubes);                           // 1 draw call

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const merged = new THREE.Mesh(mergeGeometries(transformedGeometries), material);

const batched = new THREE.BatchedMesh(1000, 24, 36, material);
const boxId = batched.addGeometry(box);
const id = batched.addInstance(boxId); batched.setMatrixAt(id, matrix);`,
    },
    inputs: [
      { name: 'count', label: 'Cubes', type: 'number', default: 1000, min: 10, max: 3000, step: 100 },
      { name: 'strategy', label: 'Strategy (live view)', type: 'select', default: 'instanced', options: ['instanced', 'separate', 'merged', 'batched'] },
    ],
    flow: [
      ['app', 'scene', 'N meshes | merged | InstancedMesh | BatchedMesh'],
      ['renderer', 'scene', 'one render item per mesh'],
      ['renderer', 'gpu', 'separate: N × drawElements'],
      ['renderer', 'gpu', 'instanced: drawElementsInstanced(N)'],
      ['gpu', 'canvas', 'same pixels'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runDraw(i) },
      { id: 'needsupdate', label: 'Do it wrong: forget instanceMatrix.needsUpdate', tone: 'ghost', run: (i) => runDraw({ ...i, count: Math.min(Number(i.count) || 100, 300) }, 'needsupdate') },
    ],
    pitfalls: [
      {
        mistake: 'Thousands of individual meshes',
        symptom: 'Low frame rate with a nearly idle GPU; renderer.info.render.calls in the thousands.',
        why: 'Per-draw CPU overhead (state, uniforms, the WebGL call itself) dominates.',
        fix: 'Use InstancedMesh for repeated geometry, BatchedMesh for varied static-ish props, or merge static geometry.',
        avoid: 'Watch renderer.info.render.calls; aim for a few hundred draw calls per frame on mobile.',
      },
      {
        mistake: 'Changing instances without instanceMatrix.needsUpdate',
        symptom: 'setMatrixAt() has no visible effect; instances stay where they were.',
        why: 'instanceMatrix is a BufferAttribute uploaded once; it is re-uploaded only when its version changes.',
        fix: 'mesh.instanceMatrix.needsUpdate = true (and instanceColor.needsUpdate after setColorAt); then computeBoundingSphere() if instances moved far.',
        avoid: 'Batch all instance edits in a frame and flag the update once.',
        reproduce: 'needsupdate',
      },
      {
        mistake: 'Instances disappearing or not clickable after moving',
        symptom: 'Some instances vanish at certain camera angles; raycasts miss them.',
        why: 'The InstancedMesh bounding sphere is computed once from the initial matrices and used for culling and raycasting.',
        fix: 'Call instancedMesh.computeBoundingSphere() after large moves, or set frustumCulled = false.',
        avoid: 'Recompute bounds when the spread of instances changes.',
      },
    ],
    visual: 'draw-calls',
    test: { action: 'run', inputs: { count: 400 } },
  },
  {
    id: 'lod-culling',
    category: 'Performance & memory',
    title: 'LOD & frustum culling',
    tagline: 'Draw less: fewer triangles far away, nothing off screen',
    gpu: false,
    description: [
      'Two built-in ways to skip work. Frustum culling: before drawing, the renderer tests each object’s bounding sphere against the camera’s view volume and skips everything outside (on by default, mesh.frustumCulled). Level of detail: a LOD object holds several versions of a model and shows the simplest one that still looks right at the current distance.',
      '"Run it" moves a camera to several distances from a three-level LOD (3,380 / 320 / 20 triangles) and checks lod.getCurrentLevel() switches at 10 and 25 units, then renders it at your distance and confirms renderer.info counts only the chosen level’s triangles. It scatters spheres all around a camera, computes with a Frustum how many are in view, and confirms the renderer issued exactly that many draw calls; with frustumCulled = false it draws all of them. In the live view, zoom in and out and watch the colors change from red (far) to green (near).',
      'The "Do it wrong" button turns culling off everywhere, a common "fix" for disappearing skinned meshes that costs a draw call for every object behind the camera.',
    ],
    keyApis: ['new LOD(); lod.addLevel(mesh, distance)', 'lod.getCurrentLevel()', 'lod.autoUpdate', 'object.frustumCulled', 'new Frustum().setFromProjectionMatrix(m)', 'frustum.intersectsObject(object)'],
    useCases: ['Open worlds and terrain', 'Big CAD / BIM models', 'Crowds and vegetation', 'Map tiles'],
    snippet: {
      lang: 'js',
      name: 'lod.js',
      code: `const lod = new THREE.LOD();
lod.addLevel(highMesh, 0);    // closer than 10 units
lod.addLevel(midMesh, 10);
lod.addLevel(lowMesh, 25);    // 25 units and beyond
scene.add(lod);               // switches automatically while rendering

// What the renderer does for every object before drawing it
const frustum = new THREE.Frustum().setFromProjectionMatrix(
  new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
frustum.intersectsObject(mesh);   // false → skipped`,
    },
    inputs: [
      { name: 'distance', label: 'Camera distance', type: 'number', default: 18, min: 2, max: 60, step: 1 },
      { name: 'count', label: 'Scattered spheres', type: 'number', default: 400, min: 50, max: 2000, step: 50 },
    ],
    flow: [
      ['app', 'scene', 'camera moves'],
      ['renderer', 'scene', 'lod.update(camera): pick level by distance'],
      ['renderer', 'scene', 'frustum.intersectsObject(each mesh)'],
      ['renderer', 'gpu', 'draw only visible meshes, chosen level'],
      ['renderer', 'app', 'renderer.info: calls, triangles'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runLod(i) },
      { id: 'nocull', label: 'Do it wrong: frustumCulled = false', tone: 'ghost', run: (i) => runLod(i, 'nocull') },
    ],
    pitfalls: [
      {
        mistake: 'Setting frustumCulled = false everywhere',
        symptom: 'Draw calls equal the total object count no matter where the camera looks; frame rate drops in big scenes.',
        why: 'Culling is usually turned off to hide a stale bounding volume (skinned, morphed or shader-displaced meshes), but it disables the optimisation for good.',
        fix: 'Keep culling on and fix the bounds: computeBoundingSphere() after deforming, or enlarge geometry.boundingSphere manually.',
        avoid: 'Turn culling off only for the specific mesh that needs it.',
        reproduce: 'nocull',
      },
      {
        mistake: 'LOD levels that pop visibly',
        symptom: 'Objects jump in shape as the camera crosses a distance threshold.',
        why: 'Adjacent levels differ too much, or the switch distance is too close.',
        fix: 'Add intermediate levels, move thresholds farther, or use lod.addLevel(mesh, distance, hysteresis) to stop flicker at the boundary.',
        avoid: 'Generate levels with a simplifier (SimplifyModifier, gltf-transform simplify) and check them at their switch distance.',
      },
      {
        mistake: 'Expecting culling to help with one huge mesh',
        symptom: 'A merged city or terrain is as slow when you look at a corner as when you see it all.',
        why: 'Culling is per object; a single mesh is either drawn entirely or not at all.',
        fix: 'Split large worlds into chunks (tiles) that can be culled and LODed independently.',
        avoid: 'Balance merging (fewer draw calls) against chunking (better culling).',
      },
    ],
    visual: 'lod-culling',
    test: { action: 'run' },
  },
  {
    id: 'dispose',
    category: 'Performance & memory',
    title: 'Memory & dispose()',
    tagline: 'Removing an object does not free its GPU memory',
    gpu: true,
    description: [
      'Geometries, materials, textures and render targets live in GPU memory, and JavaScript’s garbage collector cannot free that. scene.remove(mesh) only takes the object out of the tree; the buffers, shader program and texture stay allocated until you call geometry.dispose(), material.dispose() and texture.dispose(). Single-page apps that swap scenes or models leak quickly without it. renderer.info.memory counts what is allocated.',
      '"Run it" adds, renders and removes a mesh (with its own geometry and texture) over and over, disposing each one, and checks renderer.info.memory never moves from the baseline. It also creates a throwaway WebGLRenderer and shows that dispose() leaves its WebGL context alive, while forceContextLoss() fires the browser’s webglcontextlost event and really releases it. The live view spawns and disposes a falling cube every 150 ms; its HUD shows the memory counters staying flat.',
      'The "Do it wrong" button skips dispose(): the counters climb by one geometry and one texture per cycle. It then disposes the leaked objects so the lab is clean for the next visitor.',
    ],
    keyApis: ['geometry.dispose()', 'material.dispose()', 'texture.dispose()', 'renderTarget.dispose()', 'renderer.info.memory', 'renderer.dispose() + forceContextLoss()', 'webglcontextlost event'],
    useCases: ['Single-page apps and route changes', 'Model viewers that swap files', 'Editors with undo', 'Long-running kiosks'],
    snippet: {
      lang: 'js',
      name: 'dispose.js',
      code: `function removeAndDispose(object) {
  object.removeFromParent();
  object.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat().filter(Boolean)) {
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
      m.dispose();
    }
  });
}

// When a component unmounts
renderer.setAnimationLoop(null);
renderer.dispose();
renderer.forceContextLoss();   // dispose() keeps the WebGL context alive`,
    },
    inputs: [{ name: 'cycles', label: 'Add/remove cycles', type: 'number', default: 20, min: 1, max: 50, step: 1 }],
    flow: [
      ['app', 'scene', 'scene.add(mesh); render'],
      ['renderer', 'gpu', 'allocate buffers + texture'],
      ['app', 'scene', 'scene.remove(mesh)'],
      ['app', 'renderer', 'geometry / material / texture .dispose()'],
      ['renderer', 'gpu', 'deleteBuffer, deleteTexture'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runDispose(i) },
      { id: 'leak', label: 'Do it wrong: remove without dispose', tone: 'ghost', run: (i) => runDispose(i, 'leak') },
    ],
    pitfalls: [
      {
        mistake: 'Removing objects without disposing them',
        symptom: 'renderer.info.memory.geometries / textures keep climbing; after a while: "THREE.WebGLRenderer: Context Lost." or the tab crashes on mobile.',
        why: 'GPU resources are not garbage collected. Only dispose() releases them.',
        fix: 'Traverse removed objects and dispose geometries, materials and every texture they use (shared resources only once nothing uses them).',
        avoid: 'Write one disposal helper, reference-count shared assets, and watch renderer.info.memory during development.',
        reproduce: 'leak',
      },
      {
        mistake: 'Creating a new renderer on every mount without releasing the old one',
        symptom: 'WARNING: Too many active WebGL contexts. Oldest context will be lost.  (browsers allow about 16)',
        why: 'renderer.dispose() frees resources but keeps the WebGL context; each new WebGLRenderer opens another.',
        fix: 'Call renderer.dispose() and renderer.forceContextLoss() on unmount, or keep one renderer for the whole app.',
        avoid: 'Share one renderer (and canvas) between views; use scissor/viewport for multiple views instead of multiple canvases.',
      },
      {
        mistake: 'Disposing a texture or geometry that is still in use',
        symptom: 'Objects turn black or vanish, then reappear (re-uploaded) the next frame with a stutter.',
        why: 'dispose() frees the GPU copy; if something still renders it, Three.js uploads it again.',
        fix: 'Dispose shared resources only when the last user is gone.',
        avoid: 'Track ownership: who created a resource disposes it.',
      },
    ],
    visual: 'dispose',
    test: { action: 'run' },
  },
];
