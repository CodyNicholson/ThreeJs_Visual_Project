import React from 'react';
import { Bar, Stat } from '../components/common.jsx';
import { Lab, Snapshots, Swatch, paramsOf } from './kit.jsx';
import { materialParams, buildMaterials, pbrParams, buildPbr, textureParams, buildTextures, transparencyParams, buildTransparency, shaderParams, buildShader } from '../lab/materials.js';
import { lightParams, buildLights, shadowParams, buildShadows, fogParams, buildFog } from '../lab/lights.js';

// ---- Materials & textures -------------------------------------------------------------------------

export function MaterialsVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, materialParams);
  return (
    <Lab result={result} create={(env) => buildMaterials(p, env)} label="Seven material types" hint="Top row: Basic, Lambert, Phong, Standard. Bottom row: Physical, Toon, Normal. Press “Run it” to measure each with and without lights.">
      {(d) => (
        <div className="material-rows">
          <div className="legend"><span><span className="swatch" style={{ background: 'var(--series-1)' }} />with lights</span><span><span className="swatch" style={{ background: 'var(--series-2)' }} />no lights</span></div>
          {d.rows.map((r, i) => (
            <div key={r.name} className="material-row pop-in" style={{ animationDelay: `${i * 70}ms` }}>
              <img src={r.src} alt={`${r.name} readback`} className="thumb" />
              <div className="material-bars">
                <b>{r.name}</b> <span className={`chip ${r.kind === 'unlit' ? 'chip-hit' : 'chip-soft'}`}>{r.kind}</span>
                <div className="mini-bar"><span style={{ width: `${(r.lit / 255) * 100}%`, background: 'var(--series-1)' }} /><em>{r.lit}</em></div>
                <div className="mini-bar"><span style={{ width: `${(r.unlit / 255) * 100}%`, background: 'var(--series-2)' }} /><em>{r.unlit}</em></div>
              </div>
            </div>
          ))}
          <Snapshots items={d.snapshots} />
        </div>
      )}
    </Lab>
  );
}

export function PbrVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, pbrParams);
  return (
    <Lab result={result} create={(env) => buildPbr(p, env)} label="Metalness × roughness grid" hint="Rows: metalness 0 → 1 (top to bottom). Columns: roughness 0 → 1. The big sphere uses your values. Lit only by scene.environment (RoomEnvironment via PMREM).">
      {(d) => (
        <>
          <h4>Mean brightness of the sphere</h4>
          <Bar label="DirectionalLight only" value={d.mean.noEnv} max={255} tone="bad" />
          <Bar label="+ scene.environment" value={d.mean.env} max={255} tone="ok" />
          <h4>Reflection contrast (brightness spread)</h4>
          <Bar label="roughness 0.05" value={d.spread.smooth} max={Math.max(d.spread.smooth, d.spread.rough, 1)} />
          <Bar label="roughness 1.0" value={d.spread.rough} max={Math.max(d.spread.smooth, d.spread.rough, 1)} tone="store" />
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function TexturesVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, textureParams);
  return (
    <Lab result={result} create={(env) => buildTextures(p, env)} label="UV grid texture with your settings">
      {(d) => (
        <>
          <Snapshots title={`Wrap modes with repeat ${p.repeat} (black/white edges counted along the middle row)`}
            items={Object.entries(d.wraps).map(([k, v]) => ({ label: `${k}: ${v.transitions} edges`, src: v.src, tone: 'ok' }))} />
          <Snapshots title="magFilter on a 2×2 texture stretched to 64×64"
            items={Object.entries(d.filters).map(([k, v]) => ({ label: `${k}: ${v.grays} grey pixels`, src: v.src, tone: 'ok' }))} />
          <h4>A texel of (128, 128, 128) on screen</h4>
          <p>
            <Swatch rgb={[128, 128, 128]} label="authored 128" />{' '}
            <Swatch rgb={[d.exact, d.exact, d.exact]} label={`SRGBColorSpace → ${d.exact}`} />{' '}
            {d.washed != null && <Swatch rgb={[d.washed, d.washed, d.washed]} label={`NoColorSpace → ${d.washed}`} />}
          </p>
          <Snapshots items={d.snapshots} title="Color space readbacks" />
        </>
      )}
    </Lab>
  );
}

export function TransparencyVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, transparencyParams);
  return (
    <Lab result={result} create={(env) => buildTransparency(p, env)} label="Transparent panes around an opaque knot">
      {(d) => (
        <>
          <h4>{p.blending} blending at opacity {p.opacity}</h4>
          <p><Swatch rgb={d.blend.measured} label={`measured ${d.blend.measured.slice(0, 3).join(', ')}`} />{' '}<Swatch rgb={d.blend.expected} label={`formula ${d.blend.expected.join(', ')}`} /></p>
          <Bar label="alphaTest edge position" value={d.edge} max={1} text={`${d.edge} of the width (alphaTest ${p.alphaTest})`} />
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function ShaderVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, shaderParams);
  return (
    <Lab result={result} create={(env) => buildShader(p, env)} label="ShaderMaterial stripes and a twisted MeshStandardMaterial">
      {(d) => (
        <>
          {d.shaderError && (
            <>
              <h4 className="bad">The real compiler report</h4>
              <pre className="pitfall-symptom">{d.shaderError}</pre>
            </>
          )}
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

// ---- Lights, shadows & atmosphere ------------------------------------------------------------------

export function LightsVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, lightParams);
  return (
    <Lab result={result} create={(env) => buildLights(p, env)} label={`${p.type} moving around three objects`}>
      {(d) => (
        <>
          <h4>Floor brightness seen from above (0–255)</h4>
          <div className="legend"><span><span className="swatch" style={{ background: 'var(--series-1)' }} />under the light</span><span><span className="swatch" style={{ background: 'var(--series-2)' }} />corner</span></div>
          {d.rows.map((r, i) => (
            <div key={r.name} className="material-row pop-in" style={{ animationDelay: `${i * 80}ms` }}>
              <img src={r.src} alt={`${r.name} floor readback`} className="thumb" />
              <div className="material-bars">
                <b>{r.name}</b>
                <div className="mini-bar"><span style={{ width: `${(r.center / 255) * 100}%`, background: 'var(--series-1)' }} /><em>{r.center}</em></div>
                <div className="mini-bar"><span style={{ width: `${(r.corner / 255) * 100}%`, background: 'var(--series-2)' }} /><em>{r.corner}</em></div>
              </div>
            </div>
          ))}
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function ShadowsVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, shadowParams);
  return (
    <Lab result={result} create={(env) => buildShadows(p, env)} label="Orbiting sun casting shadows" hint="The orange frustum is the light’s shadow camera: only what is inside it can cast or receive shadows.">
      {(d) => (
        <>
          <Bar label="shadow spot brightness" value={d.lum.shadow} max={255} tone="store" />
          <Bar label="lit floor brightness" value={d.lum.lit} max={255} tone="warn" />
          <div className="stat-row"><Stat label={`shadow map ${p.mapSize}²`} value={`${d.mapMB} MB`} /><Stat label="type" value={p.type} /><Stat label="bias" value={p.bias} /></div>
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function FogVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, fogParams);
  return (
    <Lab result={result} create={(env) => buildFog(p, env)} label="Avenue of pillars fading into fog">
      {(d) => (
        <>
          <h4>The same white plane, near and far</h4>
          <p><Swatch rgb={d.near} label={`3 units: ${d.near.slice(0, 3).join(', ')}`} />{' '}<Swatch rgb={d.far} label={`60 units: ${d.far.slice(0, 3).join(', ')}`} />{' '}<Swatch rgb={p.color} label={`fog ${p.color}`} /></p>
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

