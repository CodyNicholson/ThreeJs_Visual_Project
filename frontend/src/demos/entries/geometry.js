import { runPrimitives, runBuffer, runLines, runShapes, SHAPES } from '../../lab/geometry.js';

export const GEOMETRY = [
  {
    id: 'primitives',
    category: 'Geometry',
    title: 'Built-in geometries',
    tagline: 'Boxes, spheres, tori and friends, and what “segments” cost',
    gpu: false,
    description: [
      'Three.js includes ready-made shapes: BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, TorusKnotGeometry, IcosahedronGeometry, CapsuleGeometry and more. Each is a BufferGeometry with position, normal and uv attributes, ready for lighting and textures.',
      'The segment arguments decide how many vertices and triangles a shape gets. "Run it" builds every shape at your segment count and checks Three.js produced exactly the counts the formulas predict (a box has 6 × (s+1)² vertices, a sphere (w+1)(h+1)). The live view shows the selected shape with its wireframe so you can watch the triangle count change.',
      'More segments only help up to the point where the eye stops noticing. The "Do it wrong" button renders a 64×32 sphere and a 512×256 one: 64× the triangles for a picture that is practically identical.',
    ],
    keyApis: ['BoxGeometry(w, h, d, ws, hs, ds)', 'SphereGeometry(r, widthSegments, heightSegments)', 'TorusKnotGeometry', 'IcosahedronGeometry(r, detail)', 'CapsuleGeometry', 'WireframeGeometry'],
    useCases: ['Prototyping and blocking out', 'Simple props and UI shapes', 'Physics proxies', 'Particles and instancing sources'],
    snippet: {
      lang: 'js',
      name: 'primitives.js',
      code: `const box = new THREE.BoxGeometry(1.4, 1.4, 1.4, 12, 12, 12);
const sphere = new THREE.SphereGeometry(0.9, 32, 16);
const knot = new THREE.TorusKnotGeometry(0.6, 0.2, 128, 16);

box.attributes.position.count;      // vertices
box.index.count / 3;                // triangles

const mesh = new THREE.Mesh(sphere, material);
mesh.add(new THREE.LineSegments(new THREE.WireframeGeometry(sphere), lineMaterial));`,
    },
    inputs: [
      { name: 'shape', label: 'Shape (live view)', type: 'select', default: 'TorusKnot', options: SHAPES },
      { name: 'detail', label: 'Segments', type: 'number', default: 12, min: 1, max: 64, step: 1 },
    ],
    flow: [
      ['app', 'app', 'new XxxGeometry(…, segments)'],
      ['app', 'app', 'generate position / normal / uv / index arrays'],
      ['app', 'scene', 'new Mesh(geometry, material)'],
      ['scene', 'renderer', 'render: upload buffers once'],
      ['renderer', 'gpu', 'drawElements(triangles)'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runPrimitives(i) },
      { id: 'heavy', label: 'Do it wrong: 512×256 segments', tone: 'ghost', gpu: true, run: (i) => runPrimitives(i, 'heavy') },
    ],
    pitfalls: [
      {
        mistake: 'Cranking segment counts up "for quality"',
        symptom: 'Frame rate drops and memory grows, yet the shape looks the same. SphereGeometry(1, 512, 256) is 261,632 triangles.',
        why: 'Beyond a few pixels per triangle, extra triangles add vertex work and memory without visible change. Shading smoothness comes from normals, not from more triangles.',
        fix: 'Lower the segments until you see faceting, then go one step up. Use LOD for objects that can come close to the camera.',
        avoid: 'Watch renderer.info.render.triangles while tuning.',
        reproduce: 'heavy',
      },
      {
        mistake: 'Using THREE.Geometry or addAttribute from old tutorials',
        symptom: 'TypeError: THREE.Geometry is not a constructor  /  geometry.addAttribute is not a function',
        why: 'The legacy Geometry class was removed in r125; addAttribute was renamed setAttribute. Many blog posts predate that.',
        fix: 'Use BufferGeometry and geometry.setAttribute(name, new BufferAttribute(array, itemSize)).',
        avoid: 'Check the revision a tutorial targets and the Migration Guide on the three.js wiki before copying code.',
      },
      {
        mistake: 'Creating a new geometry per mesh for identical shapes',
        symptom: 'renderer.info.memory.geometries grows with every object; slow start-up and high memory.',
        why: 'Each geometry is uploaded to the GPU separately.',
        fix: 'Create the geometry once and share it between meshes (or use InstancedMesh).',
        avoid: 'Cache geometries by parameters; see the "Instancing, merging & BatchedMesh" demo.',
      },
    ],
    visual: 'primitives',
    test: { action: 'run' },
  },
  {
    id: 'buffer-geometry',
    category: 'Geometry',
    title: 'Custom BufferGeometry',
    tagline: 'Your own vertices, indices and live updates',
    gpu: true,
    description: [
      'When no built-in shape fits, you fill typed arrays yourself: a Float32Array of positions (x, y, z per vertex), optional uv, normal or color arrays, and an index that lists which three vertices form each triangle. Indexed geometry lets neighbouring triangles share vertices.',
      '"Run it" builds an (n+1)² vertex grid by hand, checks the vertex and index counts, compares the size with a non-indexed copy, then animates every vertex with a wave: it sets position.needsUpdate = true (which bumps the attribute version so the next render re-uploads it) and recomputes normals. The live view animates the same grid every frame.',
      'Two silent failures live here and both buttons reproduce them on the GPU: editing positions without needsUpdate (the GPU keeps drawing the old copy), and moving vertices without recomputing the bounding sphere (the renderer frustum-culls a mesh that is actually in view). A NaN in the positions produces Three.js’s own "Computed radius is NaN" error.',
    ],
    keyApis: ['new BufferGeometry()', 'setAttribute(name, BufferAttribute)', 'setIndex(array)', 'attribute.needsUpdate = true', 'computeVertexNormals()', 'computeBoundingSphere()', 'setUsage(DynamicDrawUsage)'],
    useCases: ['Terrain and height maps', 'Procedural meshes', 'Data-driven surfaces', 'Morphing, cloth and water'],
    snippet: {
      lang: 'js',
      name: 'grid.js',
      code: `const positions = new Float32Array((n + 1) * (n + 1) * 3);
// … fill x, y, z for every vertex …
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setIndex(indices);              // 6 indices per grid cell
geometry.computeVertexNormals();

// Every frame
const pos = geometry.attributes.position;
for (let i = 0; i < pos.count; i++) {
  pos.setZ(i, amp * Math.sin(pos.getX(i) * 2 + t) * Math.cos(pos.getY(i) * 2 + t));
}
pos.needsUpdate = true;                  // re-upload to the GPU
geometry.computeVertexNormals();
geometry.computeBoundingSphere();        // if vertices left the old bounds`,
    },
    inputs: [
      { name: 'segments', label: 'Grid segments', type: 'number', default: 24, min: 2, max: 128, step: 2 },
      { name: 'amplitude', label: 'Wave amplitude', type: 'number', default: 0.35, min: 0, max: 1, step: 0.05 },
    ],
    flow: [
      ['app', 'app', 'fill Float32Array + index'],
      ['app', 'scene', 'geometry.setAttribute(); new Mesh()'],
      ['app', 'scene', 'pos.setZ(…); pos.needsUpdate = true'],
      ['renderer', 'gpu', 'bufferSubData (version changed)'],
      ['gpu', 'canvas', 'draw the new shape'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runBuffer(i) },
      { id: 'needsupdate', label: 'Do it wrong: forget needsUpdate', tone: 'ghost', run: (i) => runBuffer(i, 'needsupdate') },
      { id: 'bounds', label: 'Do it wrong: stale bounding sphere', tone: 'ghost', run: (i) => runBuffer(i, 'bounds') },
    ],
    pitfalls: [
      {
        mistake: 'Changing attribute values without needsUpdate',
        symptom: 'The mesh does not change on screen although the array in JavaScript has the new values.',
        why: 'Buffers are uploaded to the GPU once. Three.js only re-uploads when attribute.version changes, which needsUpdate = true does.',
        fix: 'Set geometry.attributes.position.needsUpdate = true after editing (same for normal, color, uv, instanceMatrix).',
        avoid: 'Mark frequently edited attributes with setUsage(THREE.DynamicDrawUsage) and use addUpdateRange() for partial updates.',
        reproduce: 'needsupdate',
      },
      {
        mistake: 'Moving vertices outside the original bounds without recomputing them',
        symptom: 'The mesh flickers or disappears when its old position leaves the view, even though the new one is on screen; raycasts miss it.',
        why: 'Frustum culling and raycasting use geometry.boundingSphere, computed once and cached.',
        fix: 'Call geometry.computeBoundingSphere() (and computeBoundingBox()) after large vertex changes, or set mesh.frustumCulled = false as a last resort.',
        avoid: 'Recompute bounds whenever an edit can leave the previous volume.',
        reproduce: 'bounds',
      },
      {
        mistake: 'NaN or undefined in the position array',
        symptom: 'THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',
        why: 'A division by zero or reading past the end of your data writes NaN into the buffer.',
        fix: 'Find the bad index (positions.findIndex(Number.isNaN)) and fix the generating code.',
        avoid: 'Validate generated data in development; never fill typed arrays from unchecked input.',
        reproduce: 'bounds',
      },
      {
        mistake: 'Allocating a new BufferAttribute every frame',
        symptom: 'Memory climbs and the frame rate stutters from garbage collection and re-uploads.',
        why: 'A new attribute means a new GPU buffer; the old one leaks until disposed.',
        fix: 'Allocate once at the maximum size, update in place, and use geometry.setDrawRange() to draw a subset.',
        avoid: 'Treat buffers as fixed-size pools.',
      },
    ],
    visual: 'buffer-geometry',
    test: { action: 'run' },
  },
  {
    id: 'lines-points',
    category: 'Geometry',
    title: 'Lines, points & wide lines',
    tagline: 'Particles in one draw call, and lines that are actually thick',
    gpu: true,
    description: [
      'Not everything is triangles. Points draws one sprite per vertex (a 20,000-star galaxy is a single draw call), Line connects vertices in order, LineSegments draws pairs, and EdgesGeometry extracts only the hard edges of a mesh for technical-drawing outlines.',
      '"Run it" renders a galaxy of your size and checks that renderer.info counts one draw call and every point, extracts the 12 edges of a box, and measures sizeAttenuation by rendering two points at different depths: with attenuation the far one is smaller, without it both are the same number of pixels.',
      'The classic surprise: LineBasicMaterial.linewidth is ignored and lines are always 1 pixel wide, because WebGL implementations only support width 1. The "Do it wrong" button measures that in the rendered pixels, then draws a Line2 + LineMaterial (from addons) that builds thick lines from triangles at the width you asked for.',
    ],
    keyApis: ['new Points(geometry, PointsMaterial)', 'sizeAttenuation', 'Line / LineSegments / LineLoop', 'EdgesGeometry', 'Line2 + LineMaterial (addons/lines)', 'LineMaterial.resolution'],
    useCases: ['Particle systems and star fields', 'Point clouds (LiDAR)', 'Graphs and paths', 'Outlines and CAD edges'],
    snippet: {
      lang: 'js',
      name: 'lines-points.js',
      code: `const points = new THREE.Points(geometry, new THREE.PointsMaterial({
  size: 0.06, vertexColors: true, sizeAttenuation: true,
  depthWrite: false, blending: THREE.AdditiveBlending,
}));

import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const g = new LineGeometry().setPositions(flatXYZArray);
const material = new LineMaterial({ color: 0x22d3ee, linewidth: 5 }); // pixels
material.resolution.set(width, height);  // update on resize
scene.add(new Line2(g, material));`,
    },
    inputs: [
      { name: 'count', label: 'Points', type: 'number', default: 4000, min: 100, max: 20000, step: 500 },
      { name: 'size', label: 'Point size (world)', type: 'number', default: 0.06, min: 0.01, max: 0.3, step: 0.01 },
      { name: 'attenuation', label: 'sizeAttenuation', type: 'checkbox', default: true },
      { name: 'linewidth', label: 'Line width (px)', type: 'number', default: 5, min: 1, max: 12, step: 1 },
    ],
    flow: [
      ['app', 'scene', 'new Points(geometry, PointsMaterial)'],
      ['renderer', 'gpu', 'drawArrays(POINTS, count): one call'],
      ['app', 'scene', 'new Line2(LineGeometry, LineMaterial)'],
      ['renderer', 'gpu', 'instanced quads per segment'],
      ['gpu', 'canvas', 'measure thickness in pixels'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runLines(i) },
      { id: 'linewidth', label: 'Do it wrong: LineBasicMaterial linewidth', tone: 'ghost', run: (i) => runLines(i, 'linewidth') },
    ],
    pitfalls: [
      {
        mistake: 'Setting linewidth on LineBasicMaterial and expecting thick lines',
        symptom: 'Lines stay 1 pixel wide whatever linewidth is set to; no warning.',
        why: 'WebGL (core profile) supports only lineWidth 1 on almost every platform, so GL lines cannot be thick.',
        fix: 'Use Line2 / LineSegments2 with LineMaterial from three/addons/lines, or build thin quads/tubes (TubeGeometry) yourself.',
        avoid: 'Decide early whether you need wide lines; LineMaterial also needs material.resolution kept in sync with the canvas size.',
        lang: 'js',
        wrongCode: 'new THREE.Line(geometry, new THREE.LineBasicMaterial({ linewidth: 5 }));',
        rightCode: "const m = new LineMaterial({ linewidth: 5 });\nm.resolution.set(width, height);\nnew Line2(new LineGeometry().setPositions(xyz), m);",
        reproduce: 'linewidth',
      },
      {
        mistake: 'Forgetting LineMaterial.resolution',
        symptom: 'Line2 renders nothing, absurdly thick lines, or the wrong width after a resize.',
        why: 'LineMaterial measures linewidth in pixels and needs the viewport size to convert it; it does not read it from the renderer.',
        fix: 'material.resolution.set(canvasWidth, canvasHeight) at start and in your resize handler.',
        avoid: 'Keep a list of LineMaterials and update them all in the same resize function as the camera.',
      },
      {
        mistake: 'Square, dark-edged particles',
        symptom: 'Points show as hard squares with black corners when a round sprite texture is used.',
        why: 'Points are screen-aligned squares; transparent texture corners still write depth and occlude particles behind.',
        fix: 'Use a round alpha texture with alphaTest: 0.5, or transparent: true with depthWrite: false (and AdditiveBlending for glows).',
        avoid: 'Choose between alphaTest (sorted-order free) and blending (needs depthWrite: false) deliberately.',
      },
    ],
    visual: 'lines-points',
    test: { action: 'run' },
  },
  {
    id: 'shapes-curves',
    category: 'Geometry',
    title: 'Shapes, extrusion & curves',
    tagline: '2D outlines into 3D solids, and paths to follow',
    gpu: false,
    description: [
      'A Shape is a 2D outline built with moveTo / lineTo / bezierCurveTo (holes are Paths in shape.holes). ExtrudeGeometry pushes it into a solid with optional bevels, LatheGeometry spins a profile around an axis (vases, bottles), and TubeGeometry sweeps a circle along a 3D curve such as CatmullRomCurve3.',
      '"Run it" builds a star with a round hole, extrudes it and checks the thickness equals depth plus both bevels, spins a vase profile and checks the vertex count, and verifies the closed knot curve ends where it starts. In the live view a white bead rides the curve using getPointAt(t), which moves at constant speed along the arc.',
      'The "Do it wrong" button samples an unevenly spaced curve with getPoints() (by parameter t: steps vary wildly) and with getSpacedPoints() (by arc length: even steps), which is the difference between a camera that lurches and one that glides.',
    ],
    keyApis: ['new Shape().moveTo / lineTo / absarc', 'shape.holes.push(path)', 'ExtrudeGeometry(shape, { depth, bevelEnabled })', 'LatheGeometry(points, segments)', 'CatmullRomCurve3(points, closed)', 'curve.getPointAt(u) / getSpacedPoints(n)', 'TubeGeometry(curve, …)'],
    useCases: ['Logos and extruded text', 'Turned objects (vases, columns)', 'Camera paths and rails', 'Pipes, cables and roads'],
    snippet: {
      lang: 'js',
      name: 'shapes.js',
      code: `const shape = new THREE.Shape();
shape.moveTo(0, 1);
for (const [x, y] of starPoints) shape.lineTo(x, y);
shape.holes.push(new THREE.Path().absarc(0, 0, 0.18, 0, Math.PI * 2, true));
const star = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08 });

const vase = new THREE.LatheGeometry(profilePoints, 48);

const curve = new THREE.CatmullRomCurve3(controlPoints, true);
const tube = new THREE.TubeGeometry(curve, 64, 0.07, 8, true);
bead.position.copy(curve.getPointAt(t));  // constant speed along the curve`,
    },
    inputs: [
      { name: 'points', label: 'Star points', type: 'number', default: 5, min: 3, max: 12, step: 1 },
      { name: 'depth', label: 'Extrude depth', type: 'number', default: 0.5, min: 0.1, max: 2, step: 0.1 },
      { name: 'bevel', label: 'Bevel', type: 'checkbox', default: true },
      { name: 'segments', label: 'Tube segments', type: 'number', default: 64, min: 8, max: 200, step: 8 },
    ],
    flow: [
      ['app', 'app', 'Shape: moveTo / lineTo, holes'],
      ['app', 'app', 'ExtrudeGeometry triangulates caps + sides'],
      ['app', 'app', 'CatmullRomCurve3 → TubeGeometry'],
      ['app', 'scene', 'meshes; bead.position = curve.getPointAt(t)'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runShapes(i) },
      { id: 'spacing', label: 'Do it wrong: getPoints() spacing', tone: 'ghost', run: (i) => runShapes(i, 'spacing') },
    ],
    pitfalls: [
      {
        mistake: 'Moving along a curve with getPoint(t) and expecting constant speed',
        symptom: 'An object or camera following the path speeds up and slows down; samples bunch up where control points are close.',
        why: 'getPoint(t) / getPoints() step the curve parameter evenly, not the distance travelled.',
        fix: 'Use getPointAt(u) / getSpacedPoints(n), which are re-parameterised by arc length.',
        avoid: 'Use the "At" variants for motion; keep getPoint for geometry generation where spacing does not matter.',
        reproduce: 'spacing',
      },
      {
        mistake: 'Adding a hole as a second shape',
        symptom: 'The "hole" is filled in or drawn as a separate solid instead of being cut out.',
        why: 'Holes must be Path objects in shape.holes; separate Shapes are separate solids.',
        fix: 'shape.holes.push(holePath), with the hole inside the outline.',
        avoid: 'Draw outlines counter-clockwise and holes clockwise (ShapeUtils.isClockWise helps when importing SVG).',
      },
      {
        mistake: 'Extrusions with weird shading or broken caps',
        symptom: 'Dark streaks across the cap or missing triangles on complex outlines.',
        why: 'Self-intersecting outlines cannot be triangulated cleanly, and curveSegments too low makes arcs faceted.',
        fix: 'Remove self-intersections, raise curveSegments, and keep bevelSize smaller than the thinnest part.',
        avoid: 'Clean SVG paths before extruding (SVGLoader.createShapes handles most cases).',
      },
    ],
    visual: 'shapes-curves',
    test: { action: 'run' },
  },
];
