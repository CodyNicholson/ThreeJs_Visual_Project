import { runBasics, runGraph, runCameras, runResize, runMath } from '../../lab/fundamentals.js';

const RENDER = [
  ['app', 'scene', 'scene.add(mesh)'],
  ['app', 'renderer', 'renderer.render(scene, camera)'],
  ['renderer', 'scene', 'updateMatrixWorld(), frustum cull, sort'],
  ['renderer', 'gpu', 'compile program, upload buffers, drawElements'],
  ['gpu', 'canvas', 'rasterize → pixels'],
  ['renderer', 'app', 'readPixels → checks'],
];

export const FUNDAMENTALS = [
  {
    id: 'scene-basics',
    category: 'Fundamentals',
    title: 'Scene, camera & renderer',
    tagline: 'The three objects every Three.js picture needs',
    gpu: true,
    description: [
      'Three.js draws a picture from three things: a Scene (the container of everything you want to show), a Camera (where you look from) and a Renderer (which turns the scene into pixels on a <canvas> using WebGL). What you put in the scene are Meshes: a Geometry (the shape: vertices and triangles) plus a Material (how its surface looks).',
      'Press "Run it" and the page builds exactly that, renders it once into a small off-screen canvas and reads the real pixels back from the GPU. The checks confirm the cube landed in the middle of the frame, that the corners show scene.background, and that the renderer issued one draw call of 12 triangles (6 faces × 2). The live view above runs the same scene in a render loop and you can orbit it.',
      'The two "Do it wrong" buttons reproduce the most common reason for a black screen: a mesh that was never added to the scene, and a camera left at the origin inside the object. Both fail silently: no error, just an empty frame.',
    ],
    keyApis: ['new THREE.Scene()', 'PerspectiveCamera(fov, aspect, near, far)', 'new WebGLRenderer({ antialias })', 'new Mesh(geometry, material)', 'renderer.render(scene, camera)', 'renderer.setAnimationLoop(fn)'],
    useCases: ['Product viewers', 'Data art', 'Games and playful UI', 'Scientific visualisation'],
    snippet: {
      lang: 'js',
      name: 'main.js',
      code: `import * as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1120);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: '#22d3ee' }),
);
scene.add(mesh);
const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(2, 3, 4);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.6));

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  mesh.rotation.y += timer.getDelta();
  renderer.render(scene, camera);
});`,
    },
    inputs: [
      { name: 'color', label: 'Cube color', type: 'color', default: '#22d3ee' },
      { name: 'speed', label: 'Spin speed (live view)', type: 'number', default: 1, min: 0, max: 5, step: 0.5 },
    ],
    flow: RENDER,
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runBasics(i) },
      { id: 'noadd', label: 'Do it wrong: forget scene.add()', tone: 'ghost', run: (i) => runBasics(i, 'noadd'), flow: () => [['app', 'renderer', 'renderer.render(scene, camera)'], ['renderer', 'scene', 'scene has no mesh'], ['gpu', 'canvas', 'only the background is cleared']] },
      { id: 'camera', label: 'Do it wrong: camera inside the cube', tone: 'ghost', run: (i) => runBasics(i, 'camera') },
    ],
    pitfalls: [
      {
        mistake: 'Creating a mesh but never adding it to the scene',
        symptom: 'A blank canvas showing only the background color. No error, no warning in the console.',
        why: 'renderer.render() only draws what is reachable from the scene you pass in. A Mesh that is not a child of the scene (or of something in it) simply does not exist for the renderer.',
        fix: 'Call scene.add(mesh) (or parent.add(mesh) for something already in the scene). Check scene.children or scene.getObjectByName() in the console.',
        avoid: 'Create and add in one place (a helper that returns the added object), and check renderer.info.render.calls: 0 draw calls means nothing reached the GPU.',
        lang: 'js',
        wrongCode: 'const mesh = new THREE.Mesh(geometry, material);\nrenderer.render(scene, camera); // empty frame',
        rightCode: 'const mesh = new THREE.Mesh(geometry, material);\nscene.add(mesh);\nrenderer.render(scene, camera);',
        reproduce: 'noadd',
      },
      {
        mistake: 'Leaving the camera at the origin, inside the object',
        symptom: 'The object is "invisible" although renderer.info.render.calls says it was drawn (1 draw call, no pixels).',
        why: 'Every new Object3D starts at (0, 0, 0), the camera included. From inside a closed mesh you only see back faces, and materials default to side: THREE.FrontSide, so they are culled.',
        fix: 'Move the camera back (camera.position.z = 5) and point it at the object (camera.lookAt(0, 0, 0)), or use OrbitControls.',
        avoid: 'Always set camera.position explicitly after creating it. Use side: THREE.DoubleSide only when you really need to see inside.',
        reproduce: 'camera',
      },
      {
        mistake: 'Calling render() once and expecting animation',
        symptom: 'The scene appears but nothing moves, or it only updates when the window is resized.',
        why: 'render() draws exactly one frame. Animation needs a loop that updates objects and renders again every display refresh.',
        fix: 'Use renderer.setAnimationLoop(callback) (it also works in WebXR) or requestAnimationFrame, and call renderer.render() inside it.',
        avoid: 'Structure apps as update(delta) + render() inside one loop. For static scenes, render on demand (after controls "change" events) to save battery.',
      },
    ],
    visual: 'scene-basics',
    test: { action: 'run' },
  },
  {
    id: 'scene-graph',
    category: 'Fundamentals',
    title: 'Scene graph & transforms',
    tagline: 'Children move, rotate and scale with their parents',
    gpu: false,
    description: [
      'Every object in Three.js is an Object3D with a position, rotation and scale relative to its parent. The scene is a tree: when a parent moves, everything under it moves too. This is how you build a solar system, a robot arm or a car with spinning wheels without doing trigonometry yourself.',
      'The demo builds sun → earth orbit pivot → earth → moon orbit pivot → moon. Rotating a pivot Group swings everything below it around. "Run it" sets the orbit angle, calls scene.updateMatrixWorld() and checks the earth and moon world positions against the math you would otherwise write by hand. The moon’s own position never changes; only its parents do.',
      'The trap is scale: a child inherits its parent’s scale. If the earth orbit hangs off a scaled-up sun, the whole orbit and the earth grow too. The "Do it wrong" button shows that, plus the real Three.js error when you add a geometry instead of a mesh.',
    ],
    keyApis: ['object.add(child)', 'new Group()', 'getWorldPosition(target)', 'updateMatrixWorld()', 'traverse(fn)', 'getObjectByName(name)', 'attach(child)'],
    useCases: ['Articulated models (arms, vehicles)', 'Orbits and pivots', 'Grouping for one-shot transforms', 'UI anchored to 3D objects'],
    snippet: {
      lang: 'js',
      name: 'solar-system.js',
      code: `const sun = new THREE.Mesh(sphere, sunMaterial);
sun.scale.setScalar(1.5);            // only the sun is big
scene.add(sun);

const earthOrbit = new THREE.Group(); // invisible pivot
scene.add(earthOrbit);                // sibling of the sun, not its child
const earth = new THREE.Mesh(sphere, earthMaterial);
earth.position.x = 4;                 // local offset from the pivot
earthOrbit.add(earth);

const moonOrbit = new THREE.Group();
earth.add(moonOrbit);
const moon = new THREE.Mesh(sphere, moonMaterial);
moon.position.x = 0.9;
moonOrbit.add(moon);

earthOrbit.rotation.y = THREE.MathUtils.degToRad(40);
moonOrbit.rotation.y = THREE.MathUtils.degToRad(120);
scene.updateMatrixWorld();
moon.getWorldPosition(new THREE.Vector3()); // composes all parents`,
    },
    inputs: [
      { name: 'angle', label: 'Orbit angle (°)', type: 'number', default: 40, min: -360, max: 360, step: 5 },
      { name: 'distance', label: 'Earth distance', type: 'number', default: 4, min: 2, max: 8, step: 0.5 },
      { name: 'sunScale', label: 'Sun scale', type: 'number', default: 1.5, min: 0.5, max: 3, step: 0.25 },
    ],
    flow: [
      ['app', 'scene', 'earthOrbit.add(earth); earth.add(moonOrbit)'],
      ['app', 'scene', 'earthOrbit.rotation.y = angle'],
      ['scene', 'scene', 'updateMatrixWorld(): parent.matrixWorld × child.matrix'],
      ['scene', 'app', 'moon.getWorldPosition()'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runGraph(i) },
      { id: 'mistake', label: 'Do it wrong: parent to the scaled sun', tone: 'ghost', run: (i) => runGraph(i, 'mistake') },
    ],
    pitfalls: [
      {
        mistake: 'Parenting objects to something that is scaled',
        symptom: 'Children become huge or tiny and their offsets stretch: an orbit radius of 4 becomes 6 under a sun scaled 1.5×.',
        why: 'A child’s world matrix is parent.matrixWorld × child.matrix, so the parent’s scale multiplies the child’s position and size.',
        fix: 'Introduce an unscaled pivot Group as a sibling and parent to that, or move the scale onto a child mesh that has no children of its own.',
        avoid: 'Keep "logic" nodes (pivots, anchors) unscaled and apply scale only to leaf meshes.',
        reproduce: 'mistake',
      },
      {
        mistake: 'Adding a geometry or material to the scene instead of a Mesh',
        symptom: 'THREE.Object3D.add: object not an instance of THREE.Object3D.',
        why: 'Only Object3D subclasses (Mesh, Group, Light, Camera, Points, Line …) can live in the scene graph. A BufferGeometry is data for a Mesh.',
        fix: 'Wrap it: scene.add(new THREE.Mesh(geometry, material)).',
        avoid: 'Name variables by kind (boxGeometry vs boxMesh) so the mistake stands out in review.',
        lang: 'js',
        wrongCode: 'scene.add(new THREE.BoxGeometry());',
        rightCode: 'scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));',
        reproduce: 'mistake',
      },
      {
        mistake: 'Reading world positions before the matrices are updated',
        symptom: 'getWorldPosition() returns last frame’s position, or (0, 0, 0) for an object created this frame.',
        why: 'World matrices are recomputed during renderer.render() (scene.matrixWorldAutoUpdate). Code that runs before the first render sees stale matrices.',
        fix: 'Call object.updateWorldMatrix(true, false) (or scene.updateMatrixWorld()) before reading world-space values.',
        avoid: 'Do world-space math after updating transforms, and use parent.attach(child) to re-parent without a visual jump.',
      },
    ],
    visual: 'scene-graph',
    test: { action: 'run' },
  },
  {
    id: 'cameras',
    category: 'Fundamentals',
    title: 'Perspective vs orthographic cameras',
    tagline: 'How far away things look, and what gets clipped',
    gpu: true,
    description: [
      'A PerspectiveCamera works like your eye: things get smaller with distance, controlled by the vertical field of view (fov) and the aspect ratio. An OrthographicCamera has no perspective: an object is the same size on screen at any distance, which is what CAD tools, isometric games and 2D overlays want.',
      'The live view renders the same scene with both cameras into the two halves of one canvas (setViewport + setScissor). "Run it" renders two identical cubes, one 3 and one 9 units away, with each camera and counts their pixels: with perspective the near cube covers about 9× the area (size falls with 1 / distance, area with 1 / distance²); with orthographic both are equal. Vector3.project() confirms the 3× size ratio in normalized device coordinates.',
      'Both cameras only draw what lies between near and far. The "Do it wrong" button sets far = 5 and the farther cube is silently clipped away.',
    ],
    keyApis: ['PerspectiveCamera(fov, aspect, near, far)', 'OrthographicCamera(left, right, top, bottom, near, far)', 'camera.updateProjectionMatrix()', 'vector.project(camera)', 'renderer.setViewport / setScissor'],
    useCases: ['First-person and orbit views', 'Isometric / strategy games', 'CAD and technical drawings', 'Split screen and minimaps'],
    snippet: {
      lang: 'js',
      name: 'cameras.js',
      code: `const persp = new THREE.PerspectiveCamera(50, aspect, 0.1, 50);
const ortho = new THREE.OrthographicCamera(-3 * aspect, 3 * aspect, 3, -3, 0.1, 50);

// Two cameras, one canvas
const w = renderer.domElement.width / 2, h = renderer.domElement.height;
renderer.setScissorTest(true);
renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
renderer.render(scene, persp);
renderer.setViewport(w, 0, w, h); renderer.setScissor(w, 0, w, h);
renderer.render(scene, ortho);
renderer.setScissorTest(false);

// World → screen
const ndc = new THREE.Vector3(0, 0.5, -3).project(persp); // x, y in −1…1`,
    },
    inputs: [
      { name: 'fov', label: 'Perspective fov (°)', type: 'number', default: 50, min: 20, max: 110, step: 5 },
      { name: 'orthoSize', label: 'Ortho half-height', type: 'number', default: 3, min: 1, max: 10, step: 0.5 },
      { name: 'far', label: 'Far plane', type: 'number', default: 50, min: 1, max: 100, step: 1 },
    ],
    flow: [
      ['app', 'scene', 'two cubes at z = −3 and −9'],
      ['app', 'renderer', 'render(scene, perspective) and render(scene, ortho)'],
      ['renderer', 'gpu', 'projectionMatrix × viewMatrix × modelMatrix'],
      ['gpu', 'canvas', 'clip to near…far, rasterize'],
      ['canvas', 'app', 'count red vs blue pixels'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runCameras(i) },
      { id: 'far', label: 'Do it wrong: far plane too close', tone: 'ghost', run: (i) => runCameras(i, 'far') },
    ],
    pitfalls: [
      {
        mistake: 'Objects beyond camera.far (or closer than near) disappear',
        symptom: 'Distant parts of the scene vanish or get cut off by an invisible wall; nothing is logged.',
        why: 'The camera frustum clips everything outside [near, far]. A small far value hides big worlds.',
        fix: 'Increase far (and call camera.updateProjectionMatrix()), or bring the content closer.',
        avoid: 'Size near/far to your scene. Keep near as large as you can (e.g. 0.1, not 0.0001) to keep depth precision.',
        reproduce: 'far',
      },
      {
        mistake: 'A tiny near plane causing z-fighting',
        symptom: 'Distant surfaces flicker and stripe through each other as the camera moves.',
        why: 'Depth buffer precision is spread non-linearly between near and far; near = 0.0001 with far = 100000 leaves almost no precision far away.',
        fix: 'Raise near, lower far, or enable logarithmicDepthBuffer: true on the WebGLRenderer (costs some performance).',
        avoid: 'Keep the far / near ratio as small as the scene allows; offset coplanar surfaces with polygonOffset.',
      },
      {
        mistake: 'Changing fov, aspect, zoom or ortho bounds without updateProjectionMatrix()',
        symptom: 'The change has no visible effect, or the picture stays stretched after a resize.',
        why: 'The projection matrix is cached. Setting camera.fov only updates a number until updateProjectionMatrix() rebuilds the matrix.',
        fix: 'Call camera.updateProjectionMatrix() after changing any projection parameter.',
        avoid: 'Wrap camera changes in one function that always ends with updateProjectionMatrix(). See the "Resizing & pixel ratio" demo.',
      },
    ],
    visual: 'cameras',
    test: { action: 'run' },
  },
  {
    id: 'renderer-resize',
    category: 'Fundamentals',
    title: 'Resizing & pixel ratio',
    tagline: 'Crisp on retina screens, round circles in any window',
    gpu: true,
    description: [
      'A canvas has two sizes: its CSS size (how big it looks on the page) and its drawing buffer (how many pixels the GPU actually shades). renderer.setPixelRatio(devicePixelRatio) makes the buffer match the screen’s physical pixels so edges are sharp on high-DPI displays, and renderer.setSize(w, h) sets both.',
      'Pressing "Run it" applies your CSS size and pixel ratio to a real WebGLRenderer and checks the drawing buffer is CSS size × ratio. The bars show why capping matters: a ratio of 3 shades 9× the pixels of a ratio of 1. It then renders a sphere at your aspect ratio and measures its bounding box to prove it stays round when camera.aspect is updated. The live view’s HUD reports its own real canvas sizes; resize the window to see them change.',
      'The "Do it wrong" button resizes the canvas but leaves camera.aspect alone, and the measured sphere comes out stretched by exactly width / height.',
    ],
    keyApis: ['renderer.setSize(w, h, updateStyle)', 'renderer.setPixelRatio(ratio)', 'renderer.getDrawingBufferSize(v)', 'camera.aspect', 'camera.updateProjectionMatrix()', 'ResizeObserver'],
    useCases: ['Full-window apps', 'Canvases inside responsive layouts', 'Mobile performance tuning', 'Screenshots at higher resolution'],
    snippet: {
      lang: 'js',
      name: 'resize.js',
      code: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap the cost

function resize() {
  const { clientWidth: w, clientHeight: h } = container;
  renderer.setSize(w, h, false);   // false: CSS controls the element size
  camera.aspect = w / h;
  camera.updateProjectionMatrix(); // without this: stretched
}
new ResizeObserver(resize).observe(container);`,
    },
    inputs: [
      { name: 'width', label: 'CSS width', type: 'number', default: 480, min: 64, max: 800, step: 16 },
      { name: 'height', label: 'CSS height', type: 'number', default: 240, min: 64, max: 600, step: 16 },
      { name: 'dpr', label: 'devicePixelRatio', type: 'select', default: 2, options: [1, 1.5, 2, 3] },
      { name: 'cap', label: 'Cap ratio at 2', type: 'checkbox', default: true },
    ],
    flow: [
      ['app', 'renderer', 'setPixelRatio(min(dpr, 2)); setSize(w, h)'],
      ['renderer', 'canvas', 'canvas.width = w × ratio; style.width = w px'],
      ['app', 'scene', 'camera.aspect = w / h; updateProjectionMatrix()'],
      ['renderer', 'gpu', 'viewport = drawing buffer'],
      ['canvas', 'app', 'measure the sphere’s bounding box'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runResize(i) },
      { id: 'stale', label: 'Do it wrong: keep the old aspect', tone: 'ghost', run: (i) => runResize(i, 'stale') },
    ],
    pitfalls: [
      {
        mistake: 'Resizing the canvas without updating camera.aspect',
        symptom: 'Everything looks squashed or stretched after the window or container changes size; circles become ellipses.',
        why: 'The projection matrix still maps the old aspect ratio onto the new canvas shape.',
        fix: 'On resize: camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h).',
        avoid: 'Drive resizing from one ResizeObserver on the container, not only window "resize" (containers change size without the window changing).',
        lang: 'js',
        wrongCode: "window.addEventListener('resize', () => {\n  renderer.setSize(innerWidth, innerHeight);\n});",
        rightCode: "window.addEventListener('resize', () => {\n  camera.aspect = innerWidth / innerHeight;\n  camera.updateProjectionMatrix();\n  renderer.setSize(innerWidth, innerHeight);\n});",
        reproduce: 'stale',
      },
      {
        mistake: 'Using the raw devicePixelRatio on phones',
        symptom: 'Low frame rate and a hot phone on 3× screens; fine on a desktop monitor.',
        why: 'Fragment cost scales with ratio²: 3× shades 9× the pixels of 1×.',
        fix: 'renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) or lower it dynamically when the frame time is too long.',
        avoid: 'Profile on a real phone. Treat the pixel ratio as a quality setting, not a constant.',
      },
      {
        mistake: 'A blurry canvas on retina screens',
        symptom: 'Edges and text look soft compared with the rest of the page.',
        why: 'Without setPixelRatio the drawing buffer has one pixel per CSS pixel and the browser upscales it.',
        fix: 'Call renderer.setPixelRatio(devicePixelRatio) before setSize().',
        avoid: 'Set the pixel ratio once at start-up and when the window moves to another monitor (matchMedia on resolution).',
      },
    ],
    visual: 'renderer-resize',
    test: { action: 'run' },
  },
  {
    id: 'math',
    category: 'Fundamentals',
    title: 'Vectors, matrices & quaternions',
    tagline: 'The math classes behind every transform',
    gpu: false,
    description: [
      'Three.js ships its own math library: Vector3 for points and directions, Euler for rotations as three angles, Quaternion for rotations without gimbal lock, and Matrix4 to combine translation, rotation and scale. Every object’s position, rotation, quaternion and matrix are these classes.',
      'The live view rotates a little plane from no rotation to your Euler angles with Quaternion.slerp (smooth, constant-speed interpolation); the pink ghost shows the same three angles applied in the reverse axis order, and it ends up pointing somewhere else. "Run it" checks that: Euler order changes the result, Matrix4.compose / decompose round-trips, slerp moves at constant angular speed, and lookAt() turns +Z toward a target.',
      'The "Do it wrong" button shows the two habits that cause the most bugs: math methods mutate the vector you call them on, and angles are radians, not degrees.',
    ],
    keyApis: ['Vector3.add / clone / addVectors', 'Euler(x, y, z, order)', 'Quaternion.setFromEuler / slerpQuaternions', 'Matrix4.compose / decompose', 'Object3D.lookAt', 'MathUtils.degToRad'],
    useCases: ['Aiming and look-at logic', 'Smooth camera transitions', 'Physics glue code', 'Procedural placement'],
    snippet: {
      lang: 'js',
      name: 'math.js',
      code: `const euler = new THREE.Euler(
  THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(20), 'XYZ');
const target = new THREE.Quaternion().setFromEuler(euler);

// Smooth rotation from the current orientation to the target
plane.quaternion.slerpQuaternions(start, target, t); // t: 0 → 1

// Build and take apart a transform
const m = new THREE.Matrix4().compose(position, target, scale);
m.decompose(p, q, s);

// Vector math mutates: clone first when you need the original
const c = a.clone().add(b);`,
    },
    inputs: [
      { name: 'x', label: 'Rotation X (°)', type: 'number', default: 30, min: -180, max: 180, step: 5 },
      { name: 'y', label: 'Rotation Y (°)', type: 'number', default: 60, min: -180, max: 180, step: 5 },
      { name: 'z', label: 'Rotation Z (°)', type: 'number', default: 20, min: -180, max: 180, step: 5 },
      { name: 'order', label: 'Euler order', type: 'select', default: 'XYZ', options: ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'XZY', 'YZX'] },
      { name: 't', label: 'slerp t', type: 'number', default: 0.5, min: 0, max: 1, step: 0.1 },
    ],
    flow: [
      ['app', 'app', 'new Euler(…, order) → Quaternion'],
      ['app', 'app', 'Matrix4.compose(p, q, s) → decompose'],
      ['app', 'scene', 'object.quaternion.slerpQuaternions(a, b, t)'],
      ['scene', 'scene', 'updateMatrix(): position + quaternion + scale → matrix'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runMath(i) },
      { id: 'mutate', label: 'Do it wrong: mutate + degrees', tone: 'ghost', run: (i) => runMath(i, 'mutate') },
    ],
    pitfalls: [
      {
        mistake: 'Assuming a.add(b) returns a new vector',
        symptom: 'Positions drift or jump: the "original" vector changed. c === a is true.',
        why: 'For speed, Three.js math methods modify the object they are called on and return it for chaining.',
        fix: 'Use a.clone().add(b), or new Vector3().addVectors(a, b).',
        avoid: 'Treat every method on Vector3 / Matrix4 / Quaternion as in-place. Reuse scratch vectors in hot loops instead of cloning every frame.',
        lang: 'js',
        wrongCode: 'const next = position.add(velocity); // position changed too',
        rightCode: 'const next = position.clone().add(velocity);',
        reproduce: 'mutate',
      },
      {
        mistake: 'Passing degrees where radians are expected',
        symptom: 'mesh.rotation.y = 90 spins the object to a seemingly random angle (90 radians ≈ 5157°).',
        why: 'All angles in Three.js (rotation, Euler, fov is the exception) are radians.',
        fix: 'Use THREE.MathUtils.degToRad(90) or Math.PI / 2.',
        avoid: 'Keep degrees only in UI code and convert at the boundary. Note: PerspectiveCamera.fov is the one value in degrees.',
        reproduce: 'mutate',
      },
      {
        mistake: 'Interpolating rotations by lerping Euler angles',
        symptom: 'Objects take the long way round, wobble, or flip near 180°; gimbal lock at ±90° pitch.',
        why: 'Euler angles are not a vector space; interpolating them component-wise does not give the shortest, constant-speed rotation.',
        fix: 'Convert to quaternions and use slerpQuaternions / rotateTowards.',
        avoid: 'Store and interpolate orientation as quaternions; use Euler only for human input.',
      },
    ],
    visual: 'math',
    test: { action: 'run' },
  },
];
