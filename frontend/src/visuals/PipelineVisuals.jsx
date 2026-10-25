import React, { useEffect, useRef, useState } from 'react';
import { Bar, Empty, Stat, formatNumber } from '../components/common.jsx';
import { Lab, LineChart, SERIES, Snapshots, paramsOf, stageKey } from './kit.jsx';
import { targetParams, buildTargets, postParams, buildPost, toneParams, buildTone, webgpuParams, loadWebGPU, tslStripes, HDR_LEVELS } from '../lab/rendering.js';
import { drawParams, buildDraw, lodParams, buildLod, LOD_LEVELS, disposeParams, buildDispose } from '../lab/performance.js';
import { hasWebGL2, luminance } from '../lab/gpu.js';

// ---- Rendering pipeline ---------------------------------------------------------------------------

export function TargetsVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, targetParams);
  return (
    <Lab result={result} create={(env) => buildTargets(p, env)} label="A scene rendered into a texture, shown on a monitor and a cube">
      {(d) => (
        <>
          <div className="stat-row"><Stat label="render target memory" value={`${d.kb} KB`} hint="+ depth buffer" /><Stat label="size" value={`${p.size}²`} /><Stat label="MSAA" value={p.samples ? `×${p.samples}` : 'off'} /></div>
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function PostVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, postParams);
  return (
    <Lab result={result} create={(env) => buildPost(p, env)} label="Bloom post-processing">
      {(d) => (
        <>
          <h4>Brightness of the dark pixels around the bright sphere</h4>
          <Bar label="RenderPass → OutputPass" value={d.halo.plain} max={Math.max(d.halo.bloom, d.halo.plain, 1)} tone="store" />
          <Bar label="… → UnrealBloomPass → OutputPass" value={d.halo.bloom} max={Math.max(d.halo.bloom, d.halo.plain, 1)} tone="accent" />
          <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function ToneVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, toneParams);
  return (
    <Lab result={result} create={(env) => buildTone(p, env)} label="Strongly lit scene with HDR panels">
      {(d) => {
        const names = Object.keys(d.curves);
        const strip = (name) => d.curves[name];
        return (
          <>
            <h4>Panel brightness vs scene light (each step doubles the light)</h4>
            <LineChart xs={HDR_LEVELS} xLabel="linear light" yLabel="displayed brightness (0–255)" yMax={255} formatY={(v) => Math.round(v)}
              series={names.map((n) => ({ name: n, color: n === p.mode ? SERIES[0] : n === 'None' ? SERIES[1] : 'var(--muted)', muted: n !== p.mode && n !== 'None', values: strip(n).map(luminance) }))} />
            <div className="tone-strips">
              {names.map((n) => (
                <div key={n} className={`tone-strip ${n === p.mode ? 'tone-strip-on' : ''}`}>
                  <span>{n}</span>
                  <div>{strip(n).map((c, i) => <i key={i} title={`${HDR_LEVELS[i]} → rgb(${c.join(', ')})`} style={{ background: `rgb(${c.join(',')})` }} />)}</div>
                </div>
              ))}
            </div>
          </>
        );
      }}
    </Lab>
  );
}

/** The live WebGPURenderer view: its own canvas and renderer (WebGPU, or the WebGL 2 fallback). */
function WebGPUStage({ p, buildKey }) {
  const host = useRef(null);
  const [status, setStatus] = useState(() => (hasWebGL2() || (typeof navigator !== 'undefined' && navigator.gpu) ? 'starting WebGPURenderer…' : null));
  useEffect(() => {
    if (!status && !hasWebGL2()) return undefined;
    let renderer;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    host.current.prepend(canvas);
    (async () => {
      const mods = await loadWebGPU();
      if (cancelled) return;
      const { gpu, tsl } = mods;
      renderer = new gpu.WebGPURenderer({ canvas, antialias: true, forceWebGL: p.forceWebGL });
      await renderer.init();
      if (cancelled) { renderer.dispose(); return; }
      const w = host.current.clientWidth;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, 340, false);
      canvas.style.width = '100%';
      canvas.style.height = '340px';
      const scene = new gpu.Scene();
      scene.background = new gpu.Color(0x0b1120);
      const camera = new gpu.PerspectiveCamera(45, w / 340, 0.1, 100);
      camera.position.set(0, 0.5, 5);
      const stripes = tslStripes(mods, p, { animated: true });
      const knot = new gpu.Mesh(new gpu.TorusKnotGeometry(0.9, 0.3, 200, 24), stripes.material);
      const glow = new gpu.MeshBasicNodeMaterial();
      glow.colorNode = tsl.mix(tsl.color(p.colorA), tsl.color(p.colorB), tsl.oscSine(tsl.time.mul(0.5)));
      const ring = new gpu.Mesh(new gpu.TorusGeometry(1.9, 0.03, 12, 160), glow);
      scene.add(knot, ring);
      setStatus(`${renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2 fallback'} backend · MeshBasicNodeMaterial with a TSL colorNode animated by the time node`);
      renderer.setAnimationLoop(() => {
        knot.rotation.y += 0.01;
        ring.rotation.x += 0.004;
        renderer.render(scene, camera);
      });
    })().catch((e) => !cancelled && setStatus(`WebGPURenderer failed: ${e.message}`));
    return () => {
      cancelled = true;
      if (renderer) {
        renderer.setAnimationLoop(null);
        if (renderer.backend?.isWebGLBackend) renderer.backend.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        renderer.dispose();
      }
      canvas.remove();
    };
    // Rebuilt on every run so the live view uses the parameters of that run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey]);
  if (!status) return <div className="stage"><div className="empty stage-problem">Neither WebGPU nor WebGL 2 is available here.</div></div>;
  return <div className="stage" ref={host} style={{ minHeight: 340 }}><div className="stage-hud">{status}</div></div>;
}

export function WebGPUVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, webgpuParams);
  return (
    <div className="lab-visual">
      <WebGPUStage p={p} buildKey={stageKey(result)} />
      <div className="lab-panel">
        {result ? (
          <>
            <div className="stat-row"><Stat label="backend chosen by init()" value={result.data.backend} tone="accent" hint={result.data.fallback ? 'WebGPU not available here: automatic WebGL 2 fallback' : p.forceWebGL ? 'forced with forceWebGL: true' : 'native WebGPU'} /></div>
            <Snapshots items={result.data.snapshots} title="readRenderTargetPixelsAsync (linear values)" />
          </>
        ) : <Empty>The live view runs WebGPURenderer with an animated TSL material. Press “Run it” to check its output pixel by pixel.</Empty>}
      </div>
    </div>
  );
}

// ---- Performance & memory -------------------------------------------------------------------------

export function DrawVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, drawParams);
  return (
    <Lab result={result} create={(env) => buildDraw(p, env)} label={`${p.count} cubes as ${p.strategy}`} hint="Watch the HUD’s draw-call count, then switch the strategy and press Run.">
      {(d) => {
        const maxCalls = Math.max(...d.rows.map((r) => r.calls));
        const maxMs = Math.max(...d.rows.map((r) => r.renderMs), 0.01);
        return (
          <>
            <h4>Draw calls for {formatNumber(p.count)} cubes ({formatNumber(12 * p.count)} triangles each way)</h4>
            {d.rows.map((r) => <Bar key={r.strategy} label={r.strategy} value={r.calls} max={maxCalls} text={formatNumber(r.calls)} tone={r.calls > 1 ? 'bad' : 'ok'} />)}
            <h4>CPU time for one render on this machine (best of 4)</h4>
            {d.rows.map((r) => <Bar key={r.strategy} label={r.strategy} value={r.renderMs} max={maxMs} text={`${r.renderMs} ms`} tone="store" />)}
            <p className="muted">Build times: {d.rows.map((r) => `${r.strategy} ${r.buildMs} ms`).join(' · ')}</p>
            <Snapshots items={d.snapshots} />
          </>
        );
      }}
    </Lab>
  );
}

export function LodVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, lodParams);
  return (
    <Lab result={result} create={(env) => buildLod(p, env)} label="LOD objects at different distances" hint="Scroll to zoom: green = detailed level, amber = medium, red = 20 triangles.">
      {(d) => (
        <>
          <h4>lod.getCurrentLevel() by camera distance</h4>
          {d.levels.map((l, i) => (
            <Bar key={i} label={`distance ${l.distance} → level ${l.level}`} value={l.triangles} max={20 * (LOD_LEVELS[0].detail + 1) ** 2} text={`${formatNumber(l.triangles)} tris`} tone={['ok', 'warn', 'bad'][l.level]} />
          ))}
          {d.culling && (
            <>
              <h4>Frustum culling, {d.culling.total} spheres around the camera</h4>
              <Bar label="inside the frustum (math)" value={d.culling.inView} max={d.culling.total} />
              <Bar label="draw calls with culling" value={d.culling.culledCalls} max={d.culling.total} tone="ok" />
              <Bar label="draw calls, frustumCulled = false" value={d.culling.allCalls} max={d.culling.total} tone="bad" />
            </>
          )}
        </>
      )}
    </Lab>
  );
}

export function DisposeVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, disposeParams);
  return (
    <Lab result={result} create={(env) => buildDispose(p, env)} label="Cubes spawned and disposed continuously">
      {(d) => {
        const series = [];
        if (d.series.leak.length) series.push({ name: 'remove() only', color: SERIES[1], values: d.series.leak.map((m) => m.geometries) });
        series.push({ name: 'remove() + dispose()', color: SERIES[0], values: d.series.clean.map((m) => m.geometries) });
        return (
          <>
            <h4>renderer.info.memory.geometries after each add → render → remove cycle</h4>
            <LineChart xs={d.series.clean.map((_, i) => i + 1)} xLabel="cycle" yLabel="geometries in GPU memory" yMax={Math.max(...series.flatMap((s) => s.values), d.base.geometries + 1)} formatY={(v) => Math.round(v)} series={series} />
          </>
        );
      }}
    </Lab>
  );
}
