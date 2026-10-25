import { runMaterials, runPbr, runTextures, runTransparency, runShader } from '../../lab/materials.js';

export const MATERIALS = [
  {
    id: 'materials',
    category: 'Materials & textures',
    title: 'Material types',
    tagline: 'From unlit flat color to physically based clearcoat',
    gpu: true,
    description: [
      'A material decides how a surface reacts to light. MeshBasicMaterial ignores lights entirely (flat color, cheapest). Lambert and Phong are classic lighting models. MeshStandardMaterial and MeshPhysicalMaterial are physically based (roughness, metalness, clearcoat, transmission) and the default choice today. MeshToonMaterial gives cel shading and MeshNormalMaterial colors by surface direction, handy for debugging.',
      '"Run it" renders a sphere with each material twice, with and without lights, and reads the pixels: Basic and Normal look the same either way, every lit material goes black without lights, and MeshBasicMaterial shows exactly the hex color you picked. It also confirms each material type compiles its own shader program. The live view shows all seven side by side under a moving light.',
      'The "Do it wrong" button renders a Standard material in a scene with no lights (black), and passes a misspelled option, which Three.js reports only as a console warning.',
    ],
    keyApis: ['MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial({ roughness, metalness })', 'MeshPhysicalMaterial({ clearcoat, transmission })', 'MeshToonMaterial', 'MeshNormalMaterial', 'material.side'],
    useCases: ['Realistic products (Standard / Physical)', 'Stylised games (Toon / Lambert)', 'UI and unlit overlays (Basic)', 'Debugging normals (Normal)'],
    snippet: {
      lang: 'js',
      name: 'materials.js',
      code: `new THREE.MeshBasicMaterial({ color });                      // unlit
new THREE.MeshLambertMaterial({ color });                    // diffuse only
new THREE.MeshPhongMaterial({ color, shininess: 80 });       // + specular
new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0 });
new THREE.MeshPhysicalMaterial({ color, clearcoat: 1, clearcoatRoughness: 0.05 });
new THREE.MeshToonMaterial({ color });
new THREE.MeshNormalMaterial();

// Lit materials need lights (or scene.environment)
scene.add(new THREE.DirectionalLight(0xffffff, 2.5), new THREE.AmbientLight(0xffffff, 0.3));`,
    },
    inputs: [{ name: 'color', label: 'Base color', type: 'color', default: '#f472b6' }],
    flow: [
      ['app', 'scene', 'mesh.material = new MeshXxxMaterial()'],
      ['renderer', 'renderer', 'pick shader chunks for this material + lights'],
      ['renderer', 'gpu', 'compile & link one program per variant'],
      ['gpu', 'canvas', 'shade pixels'],
      ['canvas', 'app', 'compare lit vs unlit brightness'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runMaterials(i) },
      { id: 'nolight', label: 'Do it wrong: no lights + typo', tone: 'ghost', run: (i) => runMaterials(i, 'nolight') },
    ],
    pitfalls: [
      {
        mistake: 'Using a lit material in a scene without lights',
        symptom: 'The model renders completely black (but its silhouette is there).',
        why: 'Lambert, Phong, Standard, Physical and Toon only reflect light that reaches them. With no light and no environment map there is nothing to reflect.',
        fix: 'Add lights (an AmbientLight / HemisphereLight plus a DirectionalLight) or set scene.environment to an environment map.',
        avoid: 'Start new scenes with a HemisphereLight + DirectionalLight, or use MeshBasicMaterial while prototyping.',
        reproduce: 'nolight',
      },
      {
        mistake: 'Misspelling a material option',
        symptom: "THREE.Material: 'colour' is not a property of THREE.MeshStandardMaterial.",
        why: 'Material constructors accept an options object and only warn about unknown keys; the material silently uses the default.',
        fix: 'Correct the property name (color, emissive, roughness …).',
        avoid: 'Watch the console for THREE.* warnings; TypeScript with @types/three catches these at build time.',
        reproduce: 'nolight',
      },
      {
        mistake: 'Seeing only one side of planes or imported models',
        symptom: 'A plane disappears when viewed from behind; parts of a model look hollow or inside-out.',
        why: 'Materials default to side: THREE.FrontSide and back faces are culled. Models with flipped normals show their inside.',
        fix: 'Use side: THREE.DoubleSide for thin surfaces, or fix the normals / winding in the modelling tool.',
        avoid: 'Prefer closed, correctly oriented meshes; DoubleSide also costs fill rate and breaks some shadows.',
      },
    ],
    visual: 'materials',
    test: { action: 'run' },
  },
  {
    id: 'pbr-environment',
    category: 'Materials & textures',
    title: 'PBR & environment maps',
    tagline: 'Metalness, roughness and image-based lighting',
    gpu: true,
    description: [
      'Physically based rendering (PBR) describes a surface with two main numbers: metalness (0 = plastic, wood, skin; 1 = metal) and roughness (0 = mirror, 1 = matte). Metals have no diffuse color of their own: they only reflect their surroundings, so they need something to reflect. That is what scene.environment provides: an environment map used as light from every direction.',
      'PMREMGenerator pre-filters an environment (here the built-in RoomEnvironment) into blurrier versions for each roughness level. "Run it" renders your sphere lit by a single DirectionalLight and then with scene.environment, compares the mean brightness, and checks that a smooth metal shows sharp, high-contrast reflections while a rough one is blurred. The live view is the classic 5 × 5 grid: metalness down, roughness across, plus your sphere.',
      'The "Do it wrong" button reproduces the most-asked PBR question: a metallic model that renders almost black because nothing was there to reflect.',
    ],
    keyApis: ['MeshStandardMaterial({ metalness, roughness })', 'new PMREMGenerator(renderer)', 'pmrem.fromScene(new RoomEnvironment())', 'scene.environment', 'scene.environmentIntensity', 'RGBELoader / HDRLoader + PMREM'],
    useCases: ['Product configurators', 'Realistic metals and glossy plastics', 'Matching a real photo backdrop', 'Consistent lighting without many lights'],
    snippet: {
      lang: 'js',
      name: 'environment.js',
      code: `import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

scene.environmentIntensity = 1;
const metal = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 1, roughness: 0.2 });`,
    },
    inputs: [
      { name: 'metalness', label: 'Metalness', type: 'number', default: 1, min: 0, max: 1, step: 0.1 },
      { name: 'roughness', label: 'Roughness', type: 'number', default: 0.2, min: 0, max: 1, step: 0.05 },
      { name: 'envIntensity', label: 'environmentIntensity', type: 'number', default: 1, min: 0, max: 3, step: 0.25 },
    ],
    flow: [
      ['app', 'renderer', 'pmrem.fromScene(new RoomEnvironment())'],
      ['renderer', 'gpu', 'render cube faces, blur into roughness mips'],
      ['app', 'scene', 'scene.environment = texture'],
      ['renderer', 'gpu', 'sample env map by normal + roughness'],
      ['gpu', 'canvas', 'reflections'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runPbr(i) },
      { id: 'noenv', label: 'Do it wrong: metal without environment', tone: 'ghost', run: (i) => runPbr({ ...i, metalness: 1 }, 'noenv') },
    ],
    pitfalls: [
      {
        mistake: 'Metallic materials without an environment map',
        symptom: 'Metals (and imported glTF models with metalness 1) look black or dull grey, with only a tiny highlight.',
        why: 'A metal has no diffuse reflection; it only mirrors its surroundings. Punctual lights give one small highlight each.',
        fix: 'Set scene.environment = pmrem.fromScene(new RoomEnvironment()).texture, or load an HDR and run it through PMREMGenerator.',
        avoid: 'Always give PBR scenes an environment, even when you also use lights.',
        reproduce: 'noenv',
      },
      {
        mistake: 'Using an equirectangular image directly as an environment',
        symptom: 'Reflections look wrong: rough materials are not blurred, or there is a visible seam.',
        why: 'Rough reflections need a pre-filtered (PMREM) map. scene.environment does this for you; material.envMap with a raw texture may not.',
        fix: 'Set texture.mapping = THREE.EquirectangularReflectionMapping and assign it to scene.environment, or run it through PMREMGenerator explicitly.',
        avoid: 'Let scene.environment handle per-material environment maps instead of setting envMap on each material.',
      },
      {
        mistake: 'Forgetting to dispose PMREM and environment textures',
        symptom: 'GPU memory grows each time the environment is swapped.',
        why: 'PMREMGenerator keeps render targets, and each generated texture is a render target texture.',
        fix: 'Call pmrem.dispose() after generating, and oldEnvironment.dispose() when replacing it.',
        avoid: 'Generate once and reuse; see the "Memory & dispose()" demo.',
      },
    ],
    visual: 'pbr-environment',
    test: { action: 'run' },
  },
  {
    id: 'textures',
    category: 'Materials & textures',
    title: 'Textures, UVs & color space',
    tagline: 'Wrapping, filtering and why textures look washed out',
    gpu: true,
    description: [
      'A texture is an image mapped onto a surface through UV coordinates (0…1 across the image). texture.repeat tiles it, wrapS / wrapT decide what happens outside 0…1 (repeat, mirror, or clamp to the edge), magFilter / minFilter decide how texels are blended when magnified or shrunk, and anisotropy keeps textures sharp at grazing angles.',
      '"Run it" maps a 2×2 checker onto a plane and counts the black/white edges along a row of the rendered pixels: Repeat gives 2·r − 1 edges, MirroredRepeat r, ClampToEdge just 1. It then magnifies the checker with Nearest and Linear filtering and counts the in-between grey pixels. The live view uses a labelled UV grid so you can see each setting.',
      'Color textures (photos, albedo, UI art) are stored in sRGB and must be marked texture.colorSpace = THREE.SRGBColorSpace. The "Do it wrong" button renders a mid-grey texel (128) without it, and the GPU shows 188: the washed-out look from countless forum posts.',
    ],
    keyApis: ['new TextureLoader().load(url)', 'texture.colorSpace = SRGBColorSpace', 'wrapS / wrapT (RepeatWrapping …)', 'texture.repeat / offset / rotation', 'magFilter / minFilter', 'renderer.capabilities.getMaxAnisotropy()', 'DataTexture / CanvasTexture'],
    useCases: ['Albedo, normal and roughness maps', 'Tiled floors and terrain', 'Labels and dynamic canvases', 'Pixel-art (NearestFilter)'],
    snippet: {
      lang: 'js',
      name: 'textures.js',
      code: `const map = new THREE.TextureLoader().load('/textures/bricks.png');
map.colorSpace = THREE.SRGBColorSpace;        // color data: yes
map.wrapS = map.wrapT = THREE.RepeatWrapping;
map.repeat.set(3, 3);
map.anisotropy = renderer.capabilities.getMaxAnisotropy();

const normalMap = loader.load('/textures/bricks_normal.png'); // data: stays NoColorSpace
const pixelArt = loader.load('/sprites.png');
pixelArt.magFilter = THREE.NearestFilter;`,
    },
    inputs: [
      { name: 'repeat', label: 'Repeat', type: 'number', default: 3, min: 1, max: 8, step: 1 },
      { name: 'wrap', label: 'Wrap (live view)', type: 'select', default: 'Repeat', options: ['Repeat', 'MirroredRepeat', 'ClampToEdge'] },
      { name: 'filter', label: 'magFilter (live view)', type: 'select', default: 'Nearest', options: ['Nearest', 'Linear'] },
      { name: 'colorSpace', label: 'colorSpace (live view)', type: 'select', default: 'srgb', options: ['srgb', 'none'] },
    ],
    flow: [
      ['app', 'scene', 'material.map = texture; repeat, wrap, filter'],
      ['renderer', 'gpu', 'texImage2D (SRGB8_ALPHA8 if sRGB)'],
      ['gpu', 'gpu', 'sample with UV × repeat, wrap, filter'],
      ['gpu', 'canvas', 'linear → sRGB output'],
      ['canvas', 'app', 'count edges and grey pixels'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runTextures(i) },
      { id: 'colorspace', label: 'Do it wrong: no colorSpace', tone: 'ghost', run: (i) => runTextures(i, 'colorspace') },
    ],
    pitfalls: [
      {
        mistake: 'Color textures without colorSpace = SRGBColorSpace',
        symptom: 'Textures look washed out, low-contrast and too bright compared with the original image (128 grey shows as ~188).',
        why: 'Since r152 Three.js works in linear color. An sRGB image treated as linear data is gamma-encoded twice on output.',
        fix: 'texture.colorSpace = THREE.SRGBColorSpace for color maps (map, emissiveMap, sprites, video). GLTFLoader already does this for you.',
        avoid: 'Rule of thumb: color = sRGB; data (normal, roughness, metalness, AO, displacement) = NoColorSpace.',
        lang: 'js',
        wrongCode: "const map = loader.load('photo.jpg');",
        rightCode: "const map = loader.load('photo.jpg');\nmap.colorSpace = THREE.SRGBColorSpace;",
        reproduce: 'colorspace',
      },
      {
        mistake: 'Setting repeat without RepeatWrapping',
        symptom: 'texture.repeat.set(4, 4) shows one copy of the image in a corner and stretched edge pixels everywhere else.',
        why: 'The default wrap mode is ClampToEdgeWrapping, which repeats the border texel outside 0…1.',
        fix: 'texture.wrapS = texture.wrapT = THREE.RepeatWrapping (then texture.needsUpdate = true if it was already uploaded).',
        avoid: 'Set wrap modes right after loading, before first use.',
      },
      {
        mistake: 'Loading textures from file:// or another domain',
        symptom: "Access to image at 'file:///…/texture.png' from origin 'null' has been blocked by CORS policy  /  THREE.WebGLRenderer: Texture marked for update but no image data found.",
        why: 'WebGL can only upload images that pass the browser’s CORS check; file:// pages and servers without Access-Control-Allow-Origin fail.',
        fix: 'Serve the project over http (npx vite, python -m http.server) and send CORS headers from asset hosts.',
        avoid: 'Never open index.html by double-clicking; use a dev server from the start.',
      },
      {
        mistake: 'Blurry textures on floors and roads',
        symptom: 'Textures smear into mush a few metres from the camera.',
        why: 'Mipmapping picks smaller versions at grazing angles; anisotropic filtering is off by default (anisotropy = 1).',
        fix: 'texture.anisotropy = renderer.capabilities.getMaxAnisotropy() (usually 16).',
        avoid: 'Set anisotropy on large tiled or ground textures as part of your loader wrapper.',
      },
    ],
    visual: 'textures',
    test: { action: 'run' },
  },
  {
    id: 'transparency',
    category: 'Materials & textures',
    title: 'Transparency, blending & sorting',
    tagline: 'See-through surfaces and the order they must be drawn in',
    gpu: true,
    description: [
      'Transparent surfaces are blended with what is already drawn behind them, so order matters. Three.js draws opaque objects first, then transparent ones sorted back to front by distance. A material only takes part in that when transparent: true; opacity alone does nothing. Blending modes change the math: Normal mixes by alpha, Additive adds light (glows, fire), Subtractive darkens.',
      '"Run it" draws a blue pane over a red one and compares the measured pixel with the blend formula for your opacity and mode. It then renders an alpha ramp with alphaTest, which throws away fragments below the threshold: a hard edge that needs no sorting at all, ideal for foliage and fences. The live view orbits colored panes around an opaque knot.',
      'Two buttons reproduce the classics: opacity without transparent (solid blue), and two transparent panes drawn front-first with depth writing on, where the back pane vanishes in the overlap until objects are sorted.',
    ],
    keyApis: ['transparent: true', 'opacity', 'alphaTest', 'depthWrite: false', 'blending: AdditiveBlending', 'mesh.renderOrder', 'renderer.sortObjects', 'alphaHash'],
    useCases: ['Glass and water', 'Particles and glows', 'Foliage, fences, decals (alphaTest)', 'UI panels in 3D'],
    snippet: {
      lang: 'js',
      name: 'transparency.js',
      code: `const glass = new THREE.MeshStandardMaterial({
  color: 0x22d3ee, transparent: true, opacity: 0.5,
  depthWrite: false,          // don't hide what is behind other glass
});
const glow = new THREE.MeshBasicMaterial({ color: 0xffaa00, blending: THREE.AdditiveBlending, transparent: true });
const leaves = new THREE.MeshStandardMaterial({ map: leafTexture, alphaTest: 0.5 }); // cut-out, no sorting

hud.renderOrder = 10;         // force draw order when distance sorting is not enough`,
    },
    inputs: [
      { name: 'opacity', label: 'Opacity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
      { name: 'blending', label: 'Blending', type: 'select', default: 'Normal', options: ['Normal', 'Additive', 'Subtractive'] },
      { name: 'depthWrite', label: 'depthWrite (live)', type: 'checkbox', default: false },
      { name: 'alphaTest', label: 'alphaTest', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
    flow: [
      ['renderer', 'scene', 'split opaque / transparent lists'],
      ['renderer', 'scene', 'sort transparent back → front'],
      ['renderer', 'gpu', 'opaque pass, then blended pass'],
      ['gpu', 'canvas', 'src × α + dst × (1 − α)'],
      ['canvas', 'app', 'compare with the blend formula'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runTransparency(i) },
      { id: 'opaque', label: 'Do it wrong: opacity only', tone: 'ghost', run: (i) => runTransparency(i, 'opaque') },
      { id: 'sorting', label: 'Do it wrong: unsorted + depthWrite', tone: 'ghost', run: (i) => runTransparency(i, 'sorting') },
    ],
    pitfalls: [
      {
        mistake: 'Setting opacity without transparent: true',
        symptom: 'The object stays fully opaque whatever opacity is set to.',
        why: 'Blending is only enabled for materials flagged transparent; they are also moved to the sorted transparent pass.',
        fix: 'new MeshStandardMaterial({ transparent: true, opacity: 0.5 }).',
        avoid: 'Treat "transparent" as the switch and opacity as the amount.',
        lang: 'js',
        wrongCode: 'new THREE.MeshBasicMaterial({ color, opacity: 0.3 })',
        rightCode: 'new THREE.MeshBasicMaterial({ color, opacity: 0.3, transparent: true })',
        reproduce: 'opaque',
      },
      {
        mistake: 'Overlapping transparent objects that hide each other',
        symptom: 'Parts of a transparent object behind another transparent object vanish or pop as the camera moves.',
        why: 'Sorting is per object (by center distance), not per pixel. When an object nearer in sort order is drawn first and writes depth, things behind it fail the depth test.',
        fix: 'Set depthWrite: false on transparent materials, split large objects, or set mesh.renderOrder explicitly.',
        avoid: 'Prefer alphaTest or alphaHash for cut-outs; keep truly blended surfaces few and simple.',
        reproduce: 'sorting',
      },
      {
        mistake: 'Using transparency for cut-out textures (leaves, fences)',
        symptom: 'Halos and sorting glitches around the edges of foliage.',
        why: 'Blended pixels depend on draw order; thousands of intersecting quads cannot be sorted correctly.',
        fix: 'Use alphaTest: 0.5 (and transparent: false) so pixels are either kept or discarded.',
        avoid: 'Reach for alphaTest / alphaHash first; use blending only where you need partial see-through.',
      },
    ],
    visual: 'transparency',
    test: { action: 'run' },
  },
  {
    id: 'custom-shaders',
    category: 'Materials & textures',
    title: 'ShaderMaterial & GLSL',
    tagline: 'Write your own shaders, or patch the built-in ones',
    gpu: true,
    description: [
      'When built-in materials are not enough you can write GLSL yourself. ShaderMaterial gives you Three.js’s uniforms and attributes (projectionMatrix, modelViewMatrix, position, uv …) and runs your vertex and fragment shaders. Values you change at runtime go in uniforms: updating uniform.value costs nothing, while changing the shader source forces a recompile. onBeforeCompile lets you patch a built-in material’s shader instead, keeping its lighting.',
      '"Run it" renders a striped ShaderMaterial and checks each stripe in the pixels matches the colors you picked, changes a uniform and confirms the image updates while the program count stays the same, and patches MeshStandardMaterial with onBeforeCompile to twist its vertices. The live view animates both through uTime and uTwist uniforms.',
      'Two buttons reproduce real failures: a GLSL type error (you get Three.js’s full "Shader Error" report with the compiler log) and a shader that skips #include <colorspace_fragment>, so colors come out far too dark.',
    ],
    keyApis: ['new ShaderMaterial({ uniforms, vertexShader, fragmentShader })', 'uniforms.uTime.value', '#include <colorspace_fragment>', 'material.onBeforeCompile(shader)', 'RawShaderMaterial', 'renderer.debug.onShaderError'],
    useCases: ['Stylised effects (dissolve, holograms)', 'Procedural patterns', 'Vertex animation (wind, waves)', 'GPU data visualisation'],
    snippet: {
      lang: 'glsl',
      name: 'stripes.js',
      code: `const material = new THREE.ShaderMaterial({
  uniforms: {
    uColorA: { value: new THREE.Color('#22d3ee') },
    uColorB: { value: new THREE.Color('#f472b6') },
    uFreq: { value: 4 }, uTime: { value: 0 },
  },
  vertexShader: \`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,
  fragmentShader: \`
    uniform vec3 uColorA; uniform vec3 uColorB; uniform float uFreq; uniform float uTime;
    varying vec2 vUv;
    void main() {
      float stripe = step(0.5, fract(vUv.x * uFreq + uTime * 0.2));
      gl_FragColor = vec4(mix(uColorA, uColorB, stripe), 1.0);
      #include <colorspace_fragment>
    }\`,
});
// every frame: material.uniforms.uTime.value = elapsed;`,
    },
    inputs: [
      { name: 'colorA', label: 'Color A', type: 'color', default: '#22d3ee' },
      { name: 'colorB', label: 'Color B', type: 'color', default: '#f472b6' },
      { name: 'frequency', label: 'Stripes', type: 'number', default: 4, min: 1, max: 20, step: 1 },
    ],
    flow: [
      ['app', 'scene', 'new ShaderMaterial({ uniforms, shaders })'],
      ['renderer', 'gpu', 'prefix + compile + link GLSL'],
      ['app', 'scene', 'uniforms.uColorA.value.set(…)'],
      ['renderer', 'gpu', 'uniform3f only (no recompile)'],
      ['gpu', 'canvas', 'your fragment shader runs per pixel'],
    ],
    actions: [
      { id: 'run', label: 'Run it', tone: 'accent', run: (i) => runShader(i) },
      { id: 'typo', label: 'Do it wrong: GLSL type error', tone: 'ghost', run: (i) => runShader(i, 'typo') },
      { id: 'nocolorspace', label: 'Do it wrong: no colorspace_fragment', tone: 'ghost', run: (i) => runShader(i, 'nocolorspace') },
    ],
    pitfalls: [
      {
        mistake: 'A GLSL compile error',
        symptom: "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false … Program Info Log: Fragment shader is not compiled. FRAGMENT ERROR: 0:58: '=' : dimension mismatch  ERROR: 0:58: '=' : cannot convert from 'const 4-component vector of float' to 'highp 3-component vector of float'",
        why: 'GLSL is strictly typed and compiled by the GPU driver at first render; the mesh is skipped when linking fails.',
        fix: 'Read the line number in the log (Three.js prints the shader with line numbers), fix the type (vec3 c = vec4(1.0).rgb), reload.',
        avoid: 'Keep shaders small and typed explicitly; compile early with renderer.compile(scene, camera) to surface errors at load time.',
        reproduce: 'typo',
      },
      {
        mistake: 'Leaving out #include <colorspace_fragment> in a ShaderMaterial',
        symptom: 'Colors from uniforms or textures look much darker / more saturated than in the color picker (#808080 shows as ~55).',
        why: 'Color objects hold linear values. The include converts the result to the output color space (sRGB); without it the linear values go straight to the screen.',
        fix: 'End the fragment shader with #include <colorspace_fragment> (and <tonemapping_fragment> if you use tone mapping).',
        avoid: 'Start custom shaders from a template that already has both includes.',
        reproduce: 'nocolorspace',
      },
      {
        mistake: 'Replacing a uniform object instead of its value',
        symptom: 'Changes to material.uniforms.uTime = 1 have no effect (or break the material).',
        why: 'The renderer keeps a reference to each { value } object; replacing the object disconnects it.',
        fix: 'Update the value in place: material.uniforms.uTime.value = 1 (or .value.set(…) for colors and vectors).',
        avoid: 'Create uniform objects once and only ever mutate .value.',
        lang: 'js',
        wrongCode: 'material.uniforms.uTime = elapsed;',
        rightCode: 'material.uniforms.uTime.value = elapsed;',
      },
    ],
    visual: 'custom-shaders',
    test: { action: 'run' },
  },
];
