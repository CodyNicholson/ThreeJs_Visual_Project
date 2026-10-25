import { BasicsVisual, GraphVisual, CamerasVisual, ResizeVisual, MathVisual, PrimitivesVisual, BufferVisual, LinesVisual, ShapesVisual } from './BasicsVisuals.jsx';
import { MaterialsVisual, PbrVisual, TexturesVisual, TransparencyVisual, ShaderVisual, LightsVisual, ShadowsVisual, FogVisual } from './SurfaceVisuals.jsx';
import { RaycastVisual, ControlsVisual, LoopVisual, MixerVisual, MorphVisual, GltfVisual, LoadingVisual } from './MotionVisuals.jsx';
import { TargetsVisual, PostVisual, ToneVisual, WebGPUVisual, DrawVisual, LodVisual, DisposeVisual } from './PipelineVisuals.jsx';

// Maps each demo's `visual` name (see demos/catalog.js) to the component that draws it: a live
// Three.js view running the demo's scene, plus the measurements from the last run.
export const VISUALS = {
  'scene-basics': BasicsVisual,
  'scene-graph': GraphVisual,
  cameras: CamerasVisual,
  'renderer-resize': ResizeVisual,
  math: MathVisual,
  primitives: PrimitivesVisual,
  'buffer-geometry': BufferVisual,
  'lines-points': LinesVisual,
  'shapes-curves': ShapesVisual,
  materials: MaterialsVisual,
  'pbr-environment': PbrVisual,
  textures: TexturesVisual,
  transparency: TransparencyVisual,
  'custom-shaders': ShaderVisual,
  lights: LightsVisual,
  shadows: ShadowsVisual,
  'fog-background': FogVisual,
  raycasting: RaycastVisual,
  controls: ControlsVisual,
  'animation-loop': LoopVisual,
  'animation-mixer': MixerVisual,
  'morph-skinning': MorphVisual,
  gltf: GltfVisual,
  'loading-manager': LoadingVisual,
  'render-targets': TargetsVisual,
  'post-processing': PostVisual,
  'tone-mapping': ToneVisual,
  'webgpu-tsl': WebGPUVisual,
  'draw-calls': DrawVisual,
  'lod-culling': LodVisual,
  dispose: DisposeVisual,
};
