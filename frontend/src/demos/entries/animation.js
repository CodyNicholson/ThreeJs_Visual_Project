import { runRaycast, runControls, runLoop, runMixer, runMorph } from '../../lab/animation.js';

export const ANIMATION = [
  {
    id: 'raycasting',
    category: 'Interaction & animation',
    title: 'Raycasting & picking',
    tagline: 'Which object is under the mouse?',
    gpu: false,
    description: [
      'A Raycaster shoots an invisible ray from the camera through a point on the screen and returns every object it passes through, nearest first, with the exact hit point, distance, face and (for instanced meshes) the instance id. That is how you hover, click, drag and place things in 3D.',
      'The pointer must be given in normalized device coordinates: x and y from −1 to +1 with y pointing up, not pixels. Move your pointer over the live view: the hovered cube or sphere lights up and a marker sits on the exact hit point. "Run it" checks that hits are sorted, that the first hit at screen center is the front face of the middle cube 9.5 units away, that a Group needs recursive = true, that an InstancedMesh reports instanceId, and that layers filter what can be hit. Set the X/Y percentages to aim the ray yourself.',
      'The "Do it wrong" button passes clientX / clientY straight in, the most common picking bug: the ray points far off screen and hits nothing.',
    ],
    keyApis: ['new Raycaster()', 'raycaster.setFromCamera(ndc, camera)', 'intersectObjects(objects, recursive)', 'intersection.point / distance / face / instanceId', 'raycaster.layers', 'object.layers.set(n)'],
    useCases: ['Hover and click selection', 'Placing objects on surfaces', 'Tooltips for 3D data points', 'Line-of-sight checks in games'],
    snippet: {
      lang: 'js',
      name: 'picking.js',
      code: `const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;   // y up
  raycaster.setFromCamera(ndc, camera);
  const [hit] = raycaster.intersectObjects([cubes, spheres], true);
  if (hit) highlight(hit.object, hit.instanceId, hit.point);
});`,
    },
    inputs: [
      { name: 'x', label: 'Pointer X (% of width)', type: 'number', default: 50, min: 0, max: 100, step: 5 },
      { name: 'y', label: 'Pointer Y (% of height)', type: 'number', default: 50, min: 0, max: 100, step: 5 },
      { name: 'recursive', label: 'recursive', type: 'checkbox', default: true },
    ],
    flow: [
      ['app', 'app', 'pointer px → NDC (−1…1, y up)'],
      ['app', 'scene', 'raycaster.setFromCamera(ndc, camera)'],
      ['scene', 'scene', 'bounding sphere test, then triangles'],
      ['scene', 'app', 'hits sorted by distance'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runRaycast(i) },
      { id: 'pixels', label: 'Do it wrong: pixels instead of NDC', tone: 'ghost', run: (i) => runRaycast(i, 'pixels') },
    ],
    pitfalls: [
      {
        mistake: 'Passing pixel coordinates to setFromCamera',
        symptom: 'Clicks never hit anything, or only hit when the pointer is in one corner.',
        why: 'setFromCamera expects normalized device coordinates (−1…+1, y up), not clientX/clientY.',
        fix: 'Convert with the canvas rect: x = (clientX − left) / width × 2 − 1, y = −(clientY − top) / height × 2 + 1.',
        avoid: 'Always use canvas.getBoundingClientRect(), never window.innerWidth, so a canvas that is not full-screen still works.',
        lang: 'js',
        wrongCode: 'raycaster.setFromCamera(new THREE.Vector2(e.clientX, e.clientY), camera);',
        rightCode: 'const r = canvas.getBoundingClientRect();\nconst ndc = new THREE.Vector2(\n  ((e.clientX - r.left) / r.width) * 2 - 1,\n  -((e.clientY - r.top) / r.height) * 2 + 1);\nraycaster.setFromCamera(ndc, camera);',
        reproduce: 'pixels',
      },
      {
        mistake: 'Raycasting with a camera whose matrices were never updated',
        symptom: 'Picking works in the render loop but not in code that runs before the first render (or with a camera that is not rendered): the ray starts at the origin and hits the wrong object.',
        why: 'setFromCamera() reads camera.matrixWorld, which is only refreshed by renderer.render() or updateMatrixWorld(). This lab hit exactly this bug while writing the demo.',
        fix: 'Call camera.updateMatrixWorld() (and scene.updateMatrixWorld()) before raycasting outside the render loop.',
        avoid: 'Do picking inside the animation loop, after controls.update(), or update matrices explicitly in tools and tests.',
      },
      {
        mistake: 'Raycasting a Group or a loaded model without recursive',
        symptom: 'intersectObject(gltf.scene) returns an empty array although the model is clearly under the pointer.',
        why: 'Groups have no geometry; only their descendant meshes can be hit, which requires recursive = true.',
        fix: 'raycaster.intersectObject(gltf.scene, true).',
        avoid: 'Raycast against a curated array of pickable meshes; it is faster and avoids hitting helpers.',
      },
      {
        mistake: 'Raycasting against everything on every pointermove',
        symptom: 'Hover gets laggy with large scenes or high-poly models.',
        why: 'The raycaster tests the triangles of every candidate mesh on the CPU.',
        fix: 'Limit the candidates, raycast once per frame (not per event), use simple proxy meshes, or a BVH (three-mesh-bvh).',
        avoid: 'Keep a pickables list and update it when objects are added or removed.',
      },
    ],
    visual: 'raycasting',
    test: { action: 'run' },
  },
  {
    id: 'controls',
    category: 'Interaction & animation',
    title: 'OrbitControls',
    tagline: 'Drag to orbit, scroll to zoom, right-drag to pan',
    gpu: false,
    description: [
      'Controls are addons that move the camera from user input. OrbitControls is the most used: it keeps the camera on a sphere around controls.target. It is not part of the core build; you import it from three/addons/controls/OrbitControls.js. Other controls: MapControls, TrackballControls, FlyControls, PointerLockControls (first-person) and TransformControls (gizmos to move objects).',
      'The live view uses OrbitControls created from your settings, with damping and auto-rotation. "Run it" drives a real OrbitControls instance with update(delta): autoRotateSpeed 1 means one orbit per 60 seconds and the measured turn matches exactly, the distance to the target never changes while orbiting, maxDistance clamps the camera, and with damping enabled motion keeps coasting for the following frames, which only happens if you call controls.update() every frame.',
      'The "Do it wrong" button calls camera.lookAt() while OrbitControls is active: the next update() turns the camera straight back to controls.target.',
    ],
    keyApis: ["import { OrbitControls } from 'three/addons/controls/OrbitControls.js'", 'new OrbitControls(camera, renderer.domElement)', 'controls.target', 'controls.update(delta)', 'enableDamping / dampingFactor', 'autoRotate / autoRotateSpeed', 'min/maxDistance, min/maxPolarAngle'],
    useCases: ['Model viewers', 'Configurators', 'Debugging scenes', 'Maps (MapControls)'],
    snippet: {
      lang: 'js',
      name: 'controls.js',
      code: `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);         // what the camera orbits and looks at
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2; // don't go below the floor

renderer.setAnimationLoop((t) => {
  timer.update(t);
  controls.update(timer.getDelta()); // required for damping and autoRotate
  renderer.render(scene, camera);
});`,
    },
    inputs: [
      { name: 'damping', label: 'enableDamping', type: 'checkbox', default: true },
      { name: 'dampingFactor', label: 'dampingFactor', type: 'number', default: 0.05, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'autoRotateSpeed', label: 'autoRotateSpeed', type: 'number', default: 2, min: -10, max: 10, step: 1 },
      { name: 'maxDistance', label: 'maxDistance', type: 'number', default: 15, min: 3, max: 50, step: 1 },
    ],
    flow: [
      ['app', 'app', 'pointer / wheel events on the canvas'],
      ['app', 'scene', 'controls.update(delta): spherical θ, φ, radius'],
      ['scene', 'scene', 'camera.position = target + spherical; lookAt(target)'],
      ['scene', 'renderer', 'render from the new camera'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runControls(i) },
      { id: 'lookat', label: 'Do it wrong: camera.lookAt()', tone: 'ghost', run: (i) => runControls(i, 'lookat') },
    ],
    pitfalls: [
      {
        mistake: 'Calling camera.lookAt() or setting rotation while OrbitControls is active',
        symptom: 'The camera snaps back to looking at the old point on the next frame.',
        why: 'controls.update() recomputes the camera orientation to look at controls.target every time.',
        fix: 'Set controls.target.set(x, y, z) and call controls.update().',
        avoid: 'Treat controls.target as the single source of truth for where the camera looks.',
        reproduce: 'lookat',
      },
      {
        mistake: 'Importing OrbitControls from three/examples/js or as THREE.OrbitControls',
        symptom: 'TypeError: THREE.OrbitControls is not a constructor  /  Failed to resolve module specifier "three/examples/js/controls/OrbitControls.js"',
        why: 'The non-module examples/js folder was removed in r148; addons are ES modules and are not on the THREE namespace.',
        fix: "import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; (with a bundler or an import map for 'three' and 'three/addons/').",
        avoid: 'Use the same three version for core and addons, from the same source.',
      },
      {
        mistake: 'enableDamping without calling update() every frame',
        symptom: 'Controls feel sticky or stop dead; motion jumps when the next change event arrives.',
        why: 'Damping spreads movement over the following frames, which only happens inside controls.update().',
        fix: 'Call controls.update() in the animation loop, not only in a "change" listener.',
        avoid: 'For render-on-demand apps, keep looping while damping is settling (listen to "end" plus a short timeout).',
      },
    ],
    visual: 'controls',
    test: { action: 'run' },
  },
  {
    id: 'animation-loop',
    category: 'Interaction & animation',
    title: 'Render loop & Timer',
    tagline: 'Same speed on a 30 Hz phone and a 144 Hz monitor',
    gpu: false,
    description: [
      'Animation happens in a loop that runs once per display refresh: renderer.setAnimationLoop(fn) (or requestAnimationFrame). Screens refresh at 60, 90, 120 or 144 Hz, and frames get dropped under load, so moving things by a fixed amount per frame makes them run at different speeds on different devices. Moving by speed × delta (seconds since the last frame) does not.',
      'THREE.Timer (part of the core library) measures delta: call timer.update(timestamp) once per frame, then getDelta() and getElapsed() return the same values no matter how often you ask. "Run it" simulates 2 seconds at 30, 60, 120 and 144 Hz with real Timer objects fed explicit timestamps: the delta-based value is identical everywhere, the per-frame value is 4.8× larger at 144 Hz than at 30 Hz. The live view races both cubes at a simulated refresh rate you choose.',
      'THREE.Clock was deprecated in r183. The "Do it wrong" button constructs one and captures the warning, and shows why: each getDelta() call resets it, so a second caller in the same frame gets almost zero.',
    ],
    keyApis: ['renderer.setAnimationLoop(fn)', 'new THREE.Timer()', 'timer.update(timestamp)', 'timer.getDelta() / getElapsed()', 'timer.connect(document)', 'Clock (deprecated r183)'],
    useCases: ['Any animation or simulation', 'Games', 'Physics stepping', 'Pausing when the tab is hidden'],
    snippet: {
      lang: 'js',
      name: 'loop.js',
      code: `const timer = new THREE.Timer();
timer.connect(document);            // pause deltas while the tab is hidden

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const delta = timer.getDelta();   // seconds since the last frame
  cube.position.x += speed * delta; // ✓ frame-rate independent
  // cube.position.x += 0.03;       // ✗ faster on faster screens
  mixer.update(delta);
  renderer.render(scene, camera);
});`,
    },
    inputs: [
      { name: 'fps', label: 'Simulated refresh (live view)', type: 'select', default: 60, options: [30, 60, 120, 144] },
      { name: 'speed', label: 'Speed (units / s)', type: 'number', default: 2, min: 0.5, max: 10, step: 0.5 },
    ],
    flow: [
      ['canvas', 'app', 'display refresh → setAnimationLoop(timestamp)'],
      ['app', 'app', 'timer.update(timestamp); delta = getDelta()'],
      ['app', 'scene', 'x += speed × delta'],
      ['app', 'renderer', 'renderer.render(scene, camera)'],
      ['renderer', 'canvas', 'next frame'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runLoop(i) },
      { id: 'clock', label: 'Do it wrong: THREE.Clock', tone: 'ghost', run: (i) => runLoop(i, 'clock') },
    ],
    pitfalls: [
      {
        mistake: 'Moving objects by a fixed amount per frame',
        symptom: 'Animations run 2.4× faster on a 144 Hz monitor than on 60 Hz, and slow down when frames drop.',
        why: 'The loop runs once per display refresh, and refresh rates differ.',
        fix: 'Multiply every per-frame change by delta seconds from THREE.Timer.',
        avoid: 'Express all speeds in units per second; clamp delta (e.g. to 0.1 s) after the tab was in the background.',
        reproduce: 'clock',
      },
      {
        mistake: 'Using THREE.Clock in new code',
        symptom: 'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.',
        why: 'Clock was deprecated in r183. Its getDelta() also resets the clock, so two systems calling it in one frame get different deltas.',
        fix: 'Replace with THREE.Timer: timer.update(timestamp) once per frame, then getDelta()/getElapsed() anywhere.',
        avoid: 'Update one Timer at the top of the loop and pass delta to subsystems.',
        reproduce: 'clock',
      },
      {
        mistake: 'Starting a second animation loop on every re-render (React, Vue, HMR)',
        symptom: 'Animations speed up each time a component re-renders or the file hot-reloads; memory and GPU use climb.',
        why: 'Each setup call starts another requestAnimationFrame / setAnimationLoop and another renderer without stopping the old one.',
        fix: 'In cleanup: renderer.setAnimationLoop(null), dispose the renderer (and forceContextLoss()), remove listeners.',
        avoid: 'Create the renderer in an effect with a cleanup function, or use React Three Fiber, which manages this.',
      },
    ],
    visual: 'animation-loop',
    test: { action: 'run' },
  },
  {
    id: 'animation-mixer',
    category: 'Interaction & animation',
    title: 'AnimationMixer & keyframes',
    tagline: 'Clips, tracks, loop modes and cross-fades',
    gpu: false,
    description: [
      'The animation system plays keyframed clips. A KeyframeTrack animates one property (".position", ".quaternion", ".material.color") through times and values; an AnimationClip groups tracks; an AnimationMixer plays clips on an object through AnimationActions, which control looping, speed (timeScale), weight and fades. glTF models arrive with their clips in gltf.animations.',
      '"Run it" builds clips from tracks and steps a real mixer: at t = 0.25 a 0 → 2 → 0 track is exactly 1 (linear interpolation), LoopRepeat restarts each cycle, LoopPingPong plays the second cycle backwards, LoopOnce with clampWhenFinished holds the last frame and fires "finished", timeScale stretches time, and crossFadeTo blends two clips with weights that sum to 1. The timeline plots the sampled values. The live view plays all of it on three cubes.',
      'The "Do it wrong" button plays a clip but never calls mixer.update(), the reason most first attempts at playing a glTF animation do nothing.',
    ],
    keyApis: ['new AnimationMixer(root)', 'mixer.clipAction(clip).play()', 'mixer.update(delta)', 'VectorKeyframeTrack / QuaternionKeyframeTrack / ColorKeyframeTrack', 'action.setLoop(LoopOnce | LoopRepeat | LoopPingPong)', 'clampWhenFinished, timeScale', 'action.crossFadeTo(other, seconds)'],
    useCases: ['Character animation from glTF', 'UI and camera tweens', 'Blending idle → walk → run', 'Data-driven motion'],
    snippet: {
      lang: 'js',
      name: 'mixer.js',
      code: `const track = new THREE.VectorKeyframeTrack('.position', [0, 0.5, 1], [0,0,0,  0,2,0,  0,0,0]);
const clip = new THREE.AnimationClip('bounce', 1, [track]);

const mixer = new THREE.AnimationMixer(mesh);
const action = mixer.clipAction(clip);
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
mixer.addEventListener('finished', () => console.log('done'));

idle.crossFadeTo(walk.reset().play(), 0.5, false);

renderer.setAnimationLoop((t) => { timer.update(t); mixer.update(timer.getDelta()); renderer.render(scene, camera); });`,
    },
    inputs: [
      { name: 'loop', label: 'Loop mode', type: 'select', default: 'LoopRepeat', options: ['LoopRepeat', 'LoopOnce', 'LoopPingPong'] },
      { name: 'timeScale', label: 'timeScale', type: 'number', default: 1, min: -2, max: 3, step: 0.5 },
      { name: 'fade', label: 'Cross-fade (s)', type: 'number', default: 0.5, min: 0.1, max: 2, step: 0.1 },
    ],
    flow: [
      ['app', 'app', 'KeyframeTracks → AnimationClip'],
      ['app', 'scene', 'mixer.clipAction(clip).play()'],
      ['app', 'scene', 'mixer.update(delta) every frame'],
      ['scene', 'scene', 'interpolate keyframes → property bindings'],
      ['scene', 'renderer', 'render the animated pose'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runMixer(i) },
      { id: 'noupdate', label: 'Do it wrong: no mixer.update()', tone: 'ghost', run: (i) => runMixer(i, 'noupdate') },
    ],
    pitfalls: [
      {
        mistake: 'Calling play() but never mixer.update(delta)',
        symptom: 'The glTF model loads but its animation never moves; no error.',
        why: 'The mixer only advances time and applies values inside update(delta).',
        fix: 'Call mixer.update(timer.getDelta()) in the render loop.',
        avoid: 'Keep a list of mixers and update them all in one place each frame.',
        reproduce: 'noupdate',
      },
      {
        mistake: 'Track names that do not match the object hierarchy',
        symptom: 'THREE.PropertyBinding: No target node found for track: Armature.quaternion. (and the part does not move)',
        why: 'Track names are "nodeName.property". Renaming nodes, re-parenting, or using a clip from another model breaks the binding.',
        fix: 'Keep node names from the source file; retarget clips with SkeletonUtils.retargetClip when moving between rigs.',
        avoid: 'Do not rename objects in an imported glTF that has animations.',
      },
      {
        mistake: 'LoopOnce animations snapping back to the first frame',
        symptom: 'A door opens and immediately pops closed again when the clip ends.',
        why: 'When a LoopOnce action finishes it is disabled and its influence removed, so the property returns to its rest value.',
        fix: 'Set action.clampWhenFinished = true to hold the last frame.',
        avoid: 'Use clampWhenFinished for every one-shot transition clip.',
      },
    ],
    visual: 'animation-mixer',
    test: { action: 'run' },
  },
  {
    id: 'morph-skinning',
    category: 'Interaction & animation',
    title: 'Morph targets & skinning',
    tagline: 'Blend shapes and bones that bend meshes',
    gpu: false,
    description: [
      'Two ways to deform a mesh without rebuilding it. Morph targets store alternative positions for every vertex (a smile, a blink, a box that becomes a sphere); morphTargetInfluences[i] blends toward target i from 0 to 1. Skinning attaches vertices to bones with skinIndex / skinWeight attributes; rotating a bone drags its vertices along, which is how characters bend their arms.',
      'Both are computed on the GPU when rendering, but Three.js can apply them on the CPU too (mesh.getVertexPosition), which is what "Run it" uses to check the math: with influence k a vertex sits exactly k of the way to its target, each vertex’s skin weights add up to 1, rotating the middle bone swings the tip by the expected chord, and vertices bound to the root stay put. The live view pulses the morph and waves a three-bone tentacle with its SkeletonHelper.',
      'The "Do it wrong" button adds morph attributes to a geometry after its Mesh was created: morphTargetInfluences is undefined and setting it throws until you call updateMorphTargets().',
    ],
    keyApis: ['geometry.morphAttributes.position = [...]', 'mesh.morphTargetInfluences[i]', 'mesh.updateMorphTargets()', 'new SkinnedMesh(geometry, material)', 'skinIndex / skinWeight attributes', 'new Skeleton(bones); mesh.bind(skeleton)', 'SkeletonHelper'],
    useCases: ['Facial expressions (morphs)', 'Characters and creatures (skinning)', 'Shape transitions in data viz', 'Cloth-like props'],
    snippet: {
      lang: 'js',
      name: 'deform.js',
      code: `// Morph target: same vertex count, different positions
geometry.morphAttributes.position = [sphereShapedPositions];
const blob = new THREE.Mesh(geometry, material);   // creates morphTargetInfluences
blob.morphTargetInfluences[0] = 0.5;

// Skinning: vertices follow bones by weight
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
const bones = [root, mid, tip]; root.add(mid); mid.add(tip);
const skinned = new THREE.SkinnedMesh(geometry, material);
skinned.add(root);
skinned.bind(new THREE.Skeleton(bones));
mid.rotation.z = THREE.MathUtils.degToRad(45);`,
    },
    inputs: [
      { name: 'influence', label: 'Morph influence', type: 'number', default: 0.5, min: 0, max: 1, step: 0.1 },
      { name: 'bend', label: 'Bone bend (°)', type: 'number', default: 45, min: -90, max: 90, step: 5 },
    ],
    flow: [
      ['app', 'scene', 'morphTargetInfluences[0] = k; bone.rotation.z = θ'],
      ['scene', 'scene', 'skeleton.update(): boneMatrices'],
      ['renderer', 'gpu', 'morph + skinning in the vertex shader'],
      ['gpu', 'canvas', 'deformed mesh'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runMorph(i) },
      { id: 'influences', label: 'Do it wrong: morphs added later', tone: 'ghost', run: (i) => runMorph(i, 'influences') },
    ],
    pitfalls: [
      {
        mistake: 'Adding morph attributes after creating the Mesh',
        symptom: "TypeError: Cannot set properties of undefined (setting '0') when writing mesh.morphTargetInfluences[0].",
        why: 'The Mesh constructor builds morphTargetInfluences / morphTargetDictionary from the geometry it is given; later changes are not noticed.',
        fix: 'Call mesh.updateMorphTargets() after changing geometry.morphAttributes.',
        avoid: 'Finish building the geometry before wrapping it in a Mesh.',
        reproduce: 'influences',
      },
      {
        mistake: 'Skinned or morphed meshes disappearing at the screen edge',
        symptom: 'An animated character vanishes when part of it is still visible; clicks on the moved limbs miss.',
        why: 'Frustum culling and raycasting use the bind-pose bounding sphere, which does not include animated vertices.',
        fix: 'Call skinnedMesh.computeBoundingSphere() after posing, or set frustumCulled = false on that mesh.',
        avoid: 'Give animated meshes a generous bounding volume up front.',
      },
      {
        mistake: 'Skin weights that do not add up to 1',
        symptom: 'Parts of the mesh shrink toward the origin or explode when bones move.',
        why: 'The vertex shader blends bone matrices by weight; weights summing to less or more than 1 scale the vertex.',
        fix: 'Call skinnedMesh.normalizeSkinWeights(), or fix the weights in the modelling tool.',
        avoid: 'Export with normalized weights (Blender "Limit total" + "Normalize all").',
      },
    ],
    visual: 'morph-skinning',
    test: { action: 'run' },
  },
];
