// Every lab demo in one place: what it teaches, how a call flows through Three.js (drives the
// animated diagram), which buttons it has, and which run the "Run all" suite uses.
// Flow steps are [from, to, label]; from === to means work done inside that node.
// Three.js runs in the browser, so actions have `run(inputs)` instead of an HTTP path: each one
// executes real Three.js code in this page and returns a DemoResult (see src/lab/lab.js).
import { FUNDAMENTALS } from './entries/fundamentals.js';
import { GEOMETRY } from './entries/geometry.js';
import { MATERIALS } from './entries/materials.js';
import { LIGHTS } from './entries/lights.js';
import { ANIMATION } from './entries/animation.js';
import { ASSETS } from './entries/assets.js';
import { RENDERING } from './entries/rendering.js';
import { PERFORMANCE } from './entries/performance.js';

/** The participants a flow can show, named after Three.js's real architecture. Colors live in App.css. */
export const NODE_META = {
  app: { label: 'Your code', sub: 'JS in the page', color: 'var(--app)' },
  loader: { label: 'Loaders', sub: 'files → objects', color: 'var(--loader)' },
  scene: { label: 'Scene graph', sub: 'Object3D tree', color: 'var(--scene)' },
  renderer: { label: 'Renderer', sub: 'WebGLRenderer', color: 'var(--accent)' },
  gpu: { label: 'GPU', sub: 'shaders, buffers', color: 'var(--gpu)' },
  canvas: { label: 'Canvas', sub: 'pixels', color: 'var(--canvas)' },
};

/** Left-to-right order of the participants in every diagram. */
export const NODE_ORDER = ['app', 'loader', 'scene', 'renderer', 'gpu', 'canvas'];

export function nodesFor(flow) {
  const used = new Set(flow.flatMap(([from, to]) => [from, to]));
  return NODE_ORDER.filter((id) => used.has(id));
}

export const CATEGORIES = [
  'Fundamentals',
  'Geometry',
  'Materials & textures',
  'Lights, shadows & atmosphere',
  'Interaction & animation',
  'Assets & loading',
  'Rendering pipeline',
  'Performance & memory',
];

export const DEMOS = [...FUNDAMENTALS, ...GEOMETRY, ...MATERIALS, ...LIGHTS, ...ANIMATION, ...ASSETS, ...RENDERING, ...PERFORMANCE];
