import React from 'react';
import { Bar, Stat, formatNumber, useStepper } from '../components/common.jsx';
import { Lab, LineChart, SERIES, paramsOf } from './kit.jsx';
import { rayParams, buildRaycast, controlsParams, buildControls, loopParams, buildLoop, mixerParams, buildMixer, morphParams, buildMorph } from '../lab/animation.js';
import { gltfParams, buildGltf, loadingParams, buildLoading } from '../lab/assets.js';

// ---- Interaction & animation ----------------------------------------------------------------------

export function RaycastVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, rayParams);
  return (
    <Lab result={result} create={(env) => buildRaycast(p, env)} label="Hover to pick objects" hint="Move the pointer over the live view: the raycaster highlights what is under it and marks the exact hit point. Press “Run it” for the checks.">
      {(d) => (
        <div className="two-col">
          <div>
            <h4>Your ray in NDC</h4>
            <svg viewBox="-1.1 -1.1 2.2 2.2" className="ndc-box" role="img" aria-label="Pointer position in normalized device coordinates">
              <rect x="-1" y="-1" width="2" height="2" className="ndc-frame" />
              <line x1="-1" x2="1" y1="0" y2="0" className="grid-line" vectorEffect="non-scaling-stroke" />
              <line y1="-1" y2="1" x1="0" x2="0" className="grid-line" vectorEffect="non-scaling-stroke" />
              <circle cx={d.pointer.ndc[0]} cy={-d.pointer.ndc[1]} r="0.06" className="ndc-dot pop-in" />
              <text x="0.95" y="-0.88" textAnchor="end" className="ndc-text">(1, 1)</text>
              <text x="-0.95" y="0.98" className="ndc-text">(−1, −1)</text>
            </svg>
            <p className="muted">({d.pointer.ndc.join(', ')}){d.ndc ? ` · converted from pixels: (${d.ndc.join(', ')})` : ''}</p>
          </div>
          <div>
            <h4>Hits, nearest first</h4>
            {d.pointer.hits.length === 0 && <p className="muted">The ray hit nothing.</p>}
            {d.pointer.hits.map((h, i) => (
              <Bar key={i} label={`${h.name}${h.instanceId !== undefined ? ` #${h.instanceId}` : ''}`} value={h.distance} max={Math.max(...d.pointer.hits.map((x) => x.distance))} text={`${h.distance}`} tone={i === 0 ? 'accent' : 'store'} />
            ))}
          </div>
        </div>
      )}
    </Lab>
  );
}

export function ControlsVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, controlsParams);
  return (
    <Lab result={result} create={(env) => buildControls(p, env)} label="OrbitControls with your settings" hint="Drag to orbit, scroll to zoom, right-drag to pan. The live controls use your damping, auto-rotate and maxDistance settings.">
      {(d) => (
        <>
          <div className="stat-row"><Stat label="autoRotate: turned in 60 frames" value={`${d.turned}°`} tone="accent" hint={`speed ${p.autoRotateSpeed} ⇒ ${(6 * p.autoRotateSpeed).toFixed(1)}° per second`} /></div>
          <h4>One frame of input, then 30 × update(): degrees moved each frame</h4>
          <LineChart xs={d.trail.true.map((_, i) => i + 1)} xLabel="frame" yLabel="degrees per frame" formatY={(v) => v.toFixed(3)}
            series={[{ name: 'enableDamping: true', color: SERIES[0], values: d.trail.true }, { name: 'enableDamping: false', color: SERIES[1], values: d.trail.false }]} />
        </>
      )}
    </Lab>
  );
}

export function LoopVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, loopParams);
  return (
    <Lab result={result} create={(env) => buildLoop(p, env)} label="Frame-based (red) vs delta-based (green) motion">
      {(d) => {
        const max = Math.max(...d.runs.map((r) => Math.max(r.byFrame, r.byDelta)));
        return (
          <>
            <h4>Distance covered in 2 seconds</h4>
            {d.runs.map((r) => (
              <div key={r.fps} className="pair-bars">
                <Bar label={`${r.fps} Hz · += 0.03 per frame`} value={r.byFrame} max={max} tone="bad" />
                <Bar label={`${r.fps} Hz · += speed × delta`} value={r.byDelta} max={max} tone="ok" />
              </div>
            ))}
          </>
        );
      }}
    </Lab>
  );
}

export function MixerVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, mixerParams);
  return (
    <Lab result={result} create={(env) => buildMixer(p, env)} label="Clips playing on three cubes">
      {(d) => (
        <>
          <h4>Clip “rise” (y 0 → 2 in 1 s) sampled every 0.05 s</h4>
          <LineChart xs={d.samples.LoopRepeat.ys.map((_, i) => (i * 0.05).toFixed(2))} xLabel="time (s)" yLabel="position.y" yMax={2}
            formatY={(v) => Number(v).toFixed(2)}
            series={['LoopRepeat', 'LoopOnce', 'LoopPingPong'].map((k, i) => ({ name: k, color: SERIES[i], values: d.samples[k].ys }))} />
          <h4>crossFadeTo halfway</h4>
          <Bar label="bounce weight" value={d.weights.bounce} max={1} />
          <Bar label="spin weight" value={d.weights.spin} max={1} tone="store" />
        </>
      )}
    </Lab>
  );
}

export function MorphVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, morphParams);
  return (
    <Lab result={result} create={(env) => buildMorph(p, env)} label="Morphing box and a skinned tentacle">
      {(d) => (
        <div className="stat-row">
          <Stat label="tip vertex before" value={`(${d.tip.before.join(', ')})`} />
          <Stat label={`tip after bending ${p.bend}°`} value={`(${d.tip.after.join(', ')})`} tone="accent" />
          <Stat label="morph influence" value={p.influence} />
        </div>
      )}
    </Lab>
  );
}

// ---- Assets & loading -----------------------------------------------------------------------------

export function GltfVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, gltfParams);
  return (
    <Lab result={result} create={(env) => buildGltf(p, env)} label="Original (left) and glTF round trip (right)">
      {(d) => (
        <>
          <div className="stat-row">
            <Stat label={p.binary ? 'GLB size' : 'glTF JSON size'} value={`${(d.summary.bytes / 1024).toFixed(1)} KB`} tone="accent" />
            <Stat label="export" value={`${d.summary.exportMs} ms`} />
            <Stat label="load" value={`${d.summary.loadMs} ms`} />
            <Stat label="meshes · materials · clips" value={`${d.summary.meshes} · ${d.summary.materials} · ${d.summary.animations}`} />
          </div>
          <div className="history-chips">{d.nodes.map((n, i) => <span key={n} className="chip chip-soft pop-in" style={{ animationDelay: `${i * 50}ms` }}>{n}</span>)}</div>
          {d.errors && (
            <>
              <h4 className="bad">What the loader really said</h4>
              {d.errors.map((e) => <pre key={e} className="pitfall-symptom">{e}</pre>)}
            </>
          )}
        </>
      )}
    </Lab>
  );
}

function EventTimeline({ events, total }) {
  const step = useStepper(events.length, events, 160);
  const shown = events.slice(0, step);
  const progress = shown.filter((e) => e.type === 'progress').length;
  return (
    <>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress / total) * 100}%` }} /></div>
      <ol className="event-log">
        {shown.map((e, i) => (
          <li key={i} className={`slide-in event-${e.type}`}>
            <code>{String(e.t).padStart(6)} ms</code> <b>on{e.type[0].toUpperCase() + e.type.slice(1)}</b>
            {e.url && <span className="muted"> {e.url}</span>}{e.total ? <span className="muted"> ({e.loaded}/{e.total})</span> : null}
          </li>
        ))}
      </ol>
    </>
  );
}

export function LoadingVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, loadingParams);
  return (
    <Lab result={result} create={(env) => buildLoading(p, env)} label="Placeholders swapping to loaded textures">
      {(d) => (
        <>
          <h4>LoadingManager callbacks, replayed in order</h4>
          <EventTimeline events={d.events} total={d.total} />
          <div className="stat-row">
            <Stat label="first load (network)" value={`${d.cache.first} ms`} />
            <Stat label="repeat (THREE.Cache)" value={`${d.cache.second} ms`} tone="ok" />
            <Stat label="files" value={formatNumber(d.total)} />
          </div>
        </>
      )}
    </Lab>
  );
}
