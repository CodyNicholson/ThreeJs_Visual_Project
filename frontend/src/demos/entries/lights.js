import { runLights, runShadows, runFog, LIGHT_TYPES } from '../../lab/lights.js';

export const LIGHTS = [
  {
    id: 'lights',
    category: 'Lights, shadows & atmosphere',
    title: 'Light types',
    tagline: 'Point, spot, directional, hemisphere, ambient and area lights',
    gpu: true,
    description: [
      'Lights only affect lit materials (Standard, Physical, Lambert, Phong, Toon). AmbientLight lifts everything evenly with no direction, HemisphereLight blends a sky color from above and a ground color from below, DirectionalLight is the sun (parallel rays, no falloff), PointLight shines in all directions from a point, SpotLight is a cone with angle and penumbra, and RectAreaLight is a soft rectangular panel.',
      'Since r155 lights use physical units: a PointLight’s intensity is in candela and falls off with the square of distance (decay 2). "Run it" looks straight down at a white floor and measures the pixels: the point light is brightest underneath and dims toward the corners, the spot light leaves everything outside its cone black, the directional light lights the floor evenly, and the hemisphere light tints an upward-facing floor with its sky color. The live view moves your chosen light around three objects with its helper.',
      'The "Do it wrong" button uses the old habit of intensity 1 for a point light 8 units away: in physical units that is almost nothing.',
    ],
    keyApis: ['AmbientLight', 'HemisphereLight(sky, ground)', 'DirectionalLight + target', 'PointLight(color, intensity, distance, decay)', 'SpotLight(…, angle, penumbra)', 'RectAreaLight + RectAreaLightUniformsLib.init()', 'XxxLightHelper'],
    useCases: ['Sunlight (Directional)', 'Lamps and bulbs (Point)', 'Stage and flash lights (Spot)', 'Soft studio panels (RectArea)'],
    snippet: {
      lang: 'js',
      name: 'lights.js',
      code: `scene.add(new THREE.HemisphereLight(0x60a5fa, 0x7c2d12, 1));   // sky / ground fill

const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 3);                       // direction = position → target
scene.add(sun, sun.target);

const bulb = new THREE.PointLight(0xfff3c4, 30, 0, 2);   // candela, no cutoff, physical decay
bulb.position.set(0, 2, 0);

const spot = new THREE.SpotLight(0xffffff, 30, 0, Math.PI / 10, 0.1, 2);
spot.position.set(0, 4, 0);
spot.target.position.set(0, 0, 0);
scene.add(bulb, spot, spot.target, new THREE.SpotLightHelper(spot));`,
    },
    inputs: [
      { name: 'type', label: 'Light (live view)', type: 'select', default: 'PointLight', options: LIGHT_TYPES },
      { name: 'intensity', label: 'Intensity', type: 'number', default: 30, min: 0, max: 200, step: 5 },
      { name: 'color', label: 'Color', type: 'color', default: '#fff3c4' },
    ],
    flow: [
      ['app', 'scene', 'scene.add(light)'],
      ['renderer', 'scene', 'collect lights → light uniforms'],
      ['renderer', 'gpu', 'program variant for this light count'],
      ['gpu', 'canvas', 'N·L × intensity / distance²'],
      ['canvas', 'app', 'floor brightness: center vs corner'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runLights(i) },
      { id: 'weak', label: 'Do it wrong: intensity 1', tone: 'ghost', run: (i) => runLights(i, 'weak') },
    ],
    pitfalls: [
      {
        mistake: 'Point and spot lights far too dim after upgrading',
        symptom: 'After moving to r155+ (or copying an old example) point and spot lights barely light anything; scenes look dark.',
        why: 'r155 made physically correct lighting the only mode (useLegacyLights was removed in r165). Intensity is candela and decay is 2 (inverse square), so old values like intensity 1, decay 1 are far too weak.',
        fix: 'Raise intensities (roughly × distance² for point/spot lights), keep decay = 2, distance = 0.',
        avoid: 'Tune lights in the current version; read the r155 entry of the Migration Guide when updating old code.',
        reproduce: 'weak',
      },
      {
        mistake: 'Moving a DirectionalLight or SpotLight’s target without adding it to the scene',
        symptom: 'The light keeps pointing at the origin although light.target.position was changed.',
        why: 'The target is an Object3D whose world matrix is only updated if it is in the scene (or you update it manually).',
        fix: 'scene.add(light.target) (or set light.target = someObjectInTheScene).',
        avoid: 'Add the target together with the light every time.',
      },
      {
        mistake: 'Using many dynamic lights',
        symptom: 'Frame rate drops sharply as lights are added; shader compile pauses when a light is added or removed.',
        why: 'Every lit pixel loops over every light, and the light count is baked into the shader, so changing it recompiles programs.',
        fix: 'Use a few lights plus an environment map; bake static lighting into lightmaps; toggle intensity instead of adding/removing lights.',
        avoid: 'Budget lights per scene (typically 1–4 dynamic) and fake the rest (emissive materials, light textures).',
      },
      {
        mistake: 'RectAreaLight renders nothing or errors',
        symptom: 'Materials lit by a RectAreaLight stay dark, or the shader fails to compile.',
        why: 'RectAreaLight needs lookup tables initialised by RectAreaLightUniformsLib.init(), and it only works with MeshStandardMaterial / MeshPhysicalMaterial. It casts no shadows.',
        fix: "import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'; RectAreaLightUniformsLib.init();",
        avoid: 'Call init() once at startup before creating the first RectAreaLight.',
      },
    ],
    visual: 'lights',
    test: { action: 'run' },
  },
  {
    id: 'shadows',
    category: 'Lights, shadows & atmosphere',
    title: 'Shadows',
    tagline: 'Shadow maps: three switches, one camera, one bias',
    gpu: true,
    description: [
      'Shadows in Three.js are shadow maps: the scene is first rendered from the light’s point of view into a depth texture, then every pixel checks whether something was closer to the light. That needs three switches: renderer.shadowMap.enabled, light.castShadow, and castShadow / receiveShadow on each mesh. The light’s shadow camera decides which area is covered, mapSize its resolution, and bias / normalBias fight self-shadowing artefacts (acne).',
      '"Run it" renders a floating box over a floor, works out where its shadow must land from the light direction, and compares that spot’s brightness with lit floor. It also confirms the extra shadow pass in renderer.info. The live view orbits the light so you can watch the shadow move, with the shadow camera’s frustum drawn by a CameraHelper.',
      'The buttons reproduce "my shadows don’t show up" (one switch missing at a time) and a version change: r186 removed PCFSoftShadowMap and warns, falling back to PCFShadowMap (use shadow.radius for softness).',
    ],
    keyApis: ['renderer.shadowMap.enabled', 'renderer.shadowMap.type (PCFShadowMap, VSMShadowMap)', 'light.castShadow', 'mesh.castShadow / receiveShadow', 'light.shadow.mapSize', 'light.shadow.camera (left/right/top/bottom)', 'light.shadow.bias / normalBias / radius', 'CameraHelper(light.shadow.camera)'],
    useCases: ['Grounding objects (contact)', 'Sun shadows in outdoor scenes', 'Product shots', 'Games'],
    snippet: {
      lang: 'js',
      name: 'shadows.js',
      code: `renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;     // PCFSoftShadowMap was removed in r186

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(6, 8, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0005;
sun.shadow.radius = 3;                            // softer PCF edges
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
sun.shadow.camera.updateProjectionMatrix();

box.castShadow = true;
floor.receiveShadow = true;`,
    },
    inputs: [
      { name: 'mapSize', label: 'mapSize', type: 'select', default: 1024, options: [256, 512, 1024, 2048] },
      { name: 'type', label: 'shadowMap.type', type: 'select', default: 'PCF', options: ['PCF', 'Basic', 'VSM'] },
      { name: 'bias', label: 'shadow.bias', type: 'number', default: -0.0005, min: -0.01, max: 0.01, step: 0.0005 },
      { name: 'radius', label: 'shadow.radius', type: 'number', default: 3, min: 0, max: 10, step: 1 },
    ],
    flow: [
      ['app', 'renderer', 'shadowMap.enabled; light/mesh castShadow'],
      ['renderer', 'gpu', 'pass 1: depth from the light → shadow map'],
      ['renderer', 'gpu', 'pass 2: camera view samples the shadow map'],
      ['gpu', 'canvas', 'pixels farther than the stored depth = shadow'],
      ['canvas', 'app', 'shadow spot vs lit floor'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runShadows(i) },
      { id: 'off', label: 'Do it wrong: missing switches', tone: 'ghost', run: (i) => runShadows(i, 'off') },
      { id: 'pcfsoft', label: 'Do it wrong: PCFSoftShadowMap', tone: 'ghost', run: (i) => runShadows(i, 'pcfsoft') },
    ],
    pitfalls: [
      {
        mistake: 'Shadows don’t appear at all',
        symptom: 'Objects are lit correctly but cast no shadow; no error.',
        why: 'Shadows need all of: renderer.shadowMap.enabled = true, light.castShadow = true, mesh.castShadow = true on casters and receiveShadow = true on receivers. Ambient and hemisphere lights never cast shadows.',
        fix: 'Turn on every switch; for glTF models traverse and set castShadow / receiveShadow on each mesh.',
        avoid: 'Write one enableShadows(object) helper and use it on everything you load.',
        reproduce: 'off',
      },
      {
        mistake: 'Using PCFSoftShadowMap in r186',
        symptom: 'THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.',
        why: 'r186 removed the PCFSoftShadowMap type (WebGPURenderer prints the same notice).',
        fix: 'renderer.shadowMap.type = THREE.PCFShadowMap and use light.shadow.radius / blurSamples for softness, or VSMShadowMap.',
        avoid: 'Check the Migration Guide when upgrading revisions.',
        reproduce: 'pcfsoft',
      },
      {
        mistake: 'Shadow acne or peter-panning',
        symptom: 'Moiré stripes across lit surfaces (acne), or shadows that float detached from the object (peter-panning).',
        why: 'The shadow map stores depth at limited precision; surfaces compare against themselves. Too little bias gives acne, too much detaches shadows.',
        fix: 'Tune light.shadow.bias in small steps (−0.0001…−0.001) and normalBias (0.01–0.05) for curved surfaces; tighten the shadow camera.',
        avoid: 'Keep the shadow camera frustum as small as the area that needs shadows; it improves precision and sharpness.',
      },
      {
        mistake: 'Blurry, blocky or cut-off directional shadows',
        symptom: 'Shadows look pixelated or stop abruptly at the edge of a square region.',
        why: 'The default directional shadow camera is a 10 × 10 box; mapSize texels are spread over it.',
        fix: 'Fit shadow.camera left/right/top/bottom/near/far to the visible area, raise mapSize (powers of two), visualise with CameraHelper.',
        avoid: 'Make the shadow camera follow the player for big worlds (or use CSM from addons).',
      },
    ],
    visual: 'shadows',
    test: { action: 'run' },
  },
  {
    id: 'fog-background',
    category: 'Lights, shadows & atmosphere',
    title: 'Fog, background & environment',
    tagline: 'Depth cues and hiding the edge of the world',
    gpu: true,
    description: [
      'scene.fog fades objects toward a color with distance from the camera. Fog(color, near, far) is linear: nothing before near, solid color beyond far. FogExp2(color, density) thickens exponentially, like real haze. scene.background can be a Color, a Texture or a cube map, and scene.environment lights PBR materials (see the PBR demo).',
      '"Run it" places two white planes, one 3 units and one 60 units away (scaled to look the same size), and checks that the far one is pulled toward the fog color, that linear fog beyond `far` gives exactly the fog color, and that material.fog = false opts a material out. The live view is an avenue of pillars disappearing into the distance; change the type and distances and press Run.',
      'Fog only blends objects; the background is not fogged. The "Do it wrong" button leaves the background a different color from the fog, and fully fogged objects become flat silhouettes instead of fading away.',
    ],
    keyApis: ['scene.fog = new Fog(color, near, far)', 'new FogExp2(color, density)', 'material.fog = false', 'scene.background', 'scene.backgroundBlurriness', 'scene.environment'],
    useCases: ['Large outdoor worlds (hide the far plane)', 'Mood and atmosphere', 'Depth cues in data scenes', 'Underwater / night looks'],
    snippet: {
      lang: 'js',
      name: 'fog.js',
      code: `const fogColor = new THREE.Color('#1e293b');
scene.fog = new THREE.Fog(fogColor, 4, 22);      // or new THREE.FogExp2(fogColor, 0.08)
scene.background = fogColor;                     // match, so the horizon disappears
camera.far = 30;                                 // nothing past the fog needs drawing

sky.material.fog = false;                        // opt a material out`,
    },
    inputs: [
      { name: 'type', label: 'Fog type', type: 'select', default: 'Fog', options: ['Fog', 'FogExp2', 'None'] },
      { name: 'near', label: 'near (Fog)', type: 'number', default: 4, min: 0, max: 30, step: 1 },
      { name: 'far', label: 'far (Fog)', type: 'number', default: 22, min: 5, max: 80, step: 1 },
      { name: 'density', label: 'density (FogExp2)', type: 'number', default: 0.08, min: 0.01, max: 0.3, step: 0.01 },
      { name: 'color', label: 'Fog color', type: 'color', default: '#1e293b' },
    ],
    flow: [
      ['app', 'scene', 'scene.fog = new Fog(color, near, far)'],
      ['renderer', 'gpu', 'fog uniforms + fog chunk in each material'],
      ['gpu', 'gpu', 'mix(color, fogColor, smoothstep(near, far, depth))'],
      ['gpu', 'canvas', 'far objects fade into the fog color'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runFog(i) },
      { id: 'mismatch', label: 'Do it wrong: background ≠ fog', tone: 'ghost', run: (i) => runFog(i, 'mismatch') },
    ],
    pitfalls: [
      {
        mistake: 'Fog color that does not match the background',
        symptom: 'Distant objects turn into flat, solid-colored silhouettes instead of fading away.',
        why: 'Fog blends objects toward the fog color; the background is drawn separately and is not fogged.',
        fix: 'scene.background = scene.fog.color (or a gradient / sky that ends in the fog color at the horizon).',
        avoid: 'Define one fog color constant and use it for both.',
        reproduce: 'mismatch',
      },
      {
        mistake: 'Custom ShaderMaterials ignoring fog',
        symptom: 'Everything fades into the fog except your custom-shaded objects.',
        why: 'Fog is implemented by shader chunks; a ShaderMaterial has none unless you add them and set fog: true.',
        fix: 'Set fog: true, merge THREE.UniformsLib.fog into uniforms, and include fog_pars / fog_vertex / fog_fragment chunks.',
        avoid: 'Use onBeforeCompile on a built-in material when you only need small changes; it keeps fog support.',
      },
      {
        mistake: 'Fog that is too thin to hide the far plane',
        symptom: 'Objects pop in and out at the camera’s far distance despite fog.',
        why: 'With FogExp2 or a large Fog.far, objects at camera.far are not yet fully fogged.',
        fix: 'Make Fog.far ≤ camera.far (or raise density) so geometry is completely fogged before it is clipped.',
        avoid: 'Set camera.far, fog distance and LOD distances together.',
      },
    ],
    visual: 'fog-background',
    test: { action: 'run' },
  },
];
