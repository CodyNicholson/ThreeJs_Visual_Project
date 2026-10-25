import React from 'react';
import { Bar, Stat, formatNumber } from '../components/common.jsx';
import { Lab, Snapshots, Swatch, paramsOf } from './kit.jsx';
import { basicsParams, buildBasics, graphParams, buildGraph, cameraParams, buildCameras, resizeParams, buildResize, mathParams, buildMath } from '../lab/fundamentals.js';
import { primitiveParams, buildPrimitives, bufferParams, buildBuffer, linesParams, buildLines, shapeParams, buildShapes } from '../lab/geometry.js';

// ---- Fundamentals ------------------------------------------------------------------------------

export function BasicsVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, basicsParams);
  const d = result?.data;
  return (
    <Lab result={result} create={(env) => buildBasics(p, env)} label="Spinning cube">
      <div className="stat-row">
        <Stat label="objects in scene.children" value={d?.children?.length} hint={d?.children?.join(', ')} />
        <Stat label="draw calls" value={d?.calls} tone="accent" />
        <Stat label="triangles" value={d?.triangles} />
        <Stat label="vertices (24: 4 per face)" value={d?.vertices} />
      </div>
      {d?.center && <p className="muted">Center pixel read from the GPU: <Swatch rgb={d.center} /></p>}
      <Snapshots items={d?.snapshots} />
    </Lab>
  );
}

export function GraphVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, graphParams);
  const d = result?.data;
  return (
    <Lab result={result} create={(env) => buildGraph(p, env)} label="Solar system scene graph">
      <div className="two-col">
        <div>
          <h4>The tree (scene.traverse)</h4>
          <ul className="tree">
            {d?.tree?.map((n, i) => (
              <li key={i} className="pop-in" style={{ paddingLeft: n.depth * 16, animationDelay: `${i * 60}ms` }}>
                <span className="tree-branch">{n.depth ? '└─ ' : ''}</span><b>{n.name}</b> <span className="muted">{n.type}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Local vs world</h4>
          <table>
            <tbody>
              <tr><td>moon.position (local)</td><td><code>({d?.localMoon?.join(', ')})</code></td></tr>
              <tr><td>earth world position</td><td><code>({d?.earth?.join(', ')})</code></td></tr>
              <tr><td>moon world position</td><td><code>({d?.moon?.join(', ')})</code></td></tr>
            </tbody>
          </table>
          {d?.wrong && (
            <div className="stat-row">
              <Stat label="orbit radius under scaled sun" value={d.wrong.distance} tone="bad" hint={`expected ${p.distance}`} />
              <Stat label="earth world scale" value={d.wrong.scale} tone="bad" hint="expected 1" />
            </div>
          )}
        </div>
      </div>
    </Lab>
  );
}

export function CamerasVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, cameraParams);
  const d = result?.data;
  const max = d ? Math.max(d.persp.red, d.persp.blue, d.ortho.red, d.ortho.blue, 1) : 1;
  return (
    <Lab result={result} create={(env) => buildCameras(p, env)} label="Perspective (left) and orthographic (right)" hint="Left half: PerspectiveCamera. Right half: OrthographicCamera, same position. Orbit to compare. Press “Run it” to count pixels.">
      <h4>Pixels covered by each cube (same size, 3 vs 9 units away)</h4>
      <Bar label="Perspective · near (red)" value={d?.persp.red} max={max} tone="bad" />
      <Bar label="Perspective · far (blue)" value={d?.persp.blue} max={max} tone="store" />
      <Bar label="Orthographic · near (red)" value={d?.ortho.red} max={max} tone="bad" />
      <Bar label="Orthographic · far (blue)" value={d?.ortho.blue} max={max} tone="store" />
      <p className="muted">project(): the near cube is {d?.ndcRatio}× taller on screen with perspective.</p>
      <Snapshots items={d?.snapshots} />
    </Lab>
  );
}

export function ResizeVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, resizeParams);
  const d = result?.data;
  const max = d ? Math.max(...d.costs.map((c) => c.pixels)) : 1;
  const scale = d ? 220 / Math.max(d.buffer[0], d.buffer[1]) : 1;
  return (
    <Lab result={result} create={(env) => buildResize(p, env)} label="Resize-aware scene" hint="The HUD shows this live canvas’s real CSS size, drawing buffer and pixel ratio. Resize the window and watch it change.">
      {() => (
        <>
      <div className="two-col">
        <div>
          <h4>CSS size vs drawing buffer</h4>
          <div className="buffer-box" style={{ width: d.buffer[0] * scale, height: d.buffer[1] * scale }}>
            <div className="css-box" style={{ width: d.css[0] * scale, height: d.css[1] * scale }}>CSS {d.css[0]}×{d.css[1]}</div>
            <span>buffer {d.buffer[0]}×{d.buffer[1]}</span>
          </div>
          <p className="muted">canvas.style = {d.canvasStyle.join(' × ')} · sphere roundness {d.roundness}{d.stale ? ` (stale aspect: ${d.stale})` : ''}</p>
        </div>
        <div>
          <h4>Pixels shaded per frame</h4>
          {d.costs.map((c) => <Bar key={c.ratio} label={`pixelRatio ${c.ratio}`} value={c.pixels} max={max} text={formatNumber(c.pixels)} tone={c.ratio > 2 ? 'warn' : 'accent'} />)}
        </div>
      </div>
      <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

export function MathVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, mathParams);
  const d = result?.data;
  return (
    <Lab result={result} create={(env) => buildMath(p, env)} label="Euler vs quaternion rotation" hint="Cyan: your angles in the chosen order, slerping from no rotation. Pink ghost: the same angles in the reverse order.">
      {() => (
        <>
      <div className="two-col">
        <div>
          <h4>Angles</h4>
          <Bar label={`${p.order} vs ${p.order.split('').reverse().join('')}`} value={d.angles.orderGap} max={180} text={`${d.angles.orderGap}° apart`} tone="warn" />
          <Bar label="slerp: covered" value={d.angles.atT} max={Math.max(1, d.angles.total)} text={`${d.angles.atT}° of ${d.angles.total}°`} />
          <p className="muted">quaternion (x, y, z, w) = ({d.q1.join(', ')})</p>
        </div>
        <div>
          <h4>Matrix4.compose(position, quaternion, scale)</h4>
          <div className="matrix">
            {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (
              <span key={`${r}-${c}`} className={`pop-in ${c === 3 && r < 3 ? 'matrix-t' : ''}`} style={{ animationDelay: `${(r * 4 + c) * 30}ms` }}>{d.matrix[c * 4 + r]}</span>
            )))}
          </div>
          <p className="muted">column-major: the last column is the translation (1, 2, 3)</p>
        </div>
      </div>
        </>
      )}
    </Lab>
  );
}

// ---- Geometry ----------------------------------------------------------------------------------

export function PrimitivesVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, primitiveParams);
  const d = result?.data;
  const max = d ? Math.max(...d.shapes.map((s) => s.triangles)) : 1;
  return (
    <Lab result={result} create={(env) => buildPrimitives(p, env)} label="Built-in geometries">
      {() => (
        <>
      <h4>Triangles at {p.detail} segments</h4>
      {[...d.shapes].sort((a, b) => b.triangles - a.triangles).map((s) => (
        <Bar key={s.shape} label={`${s.shape}Geometry`} value={s.triangles} max={max} text={`${formatNumber(s.triangles)} · ${formatNumber(s.vertices)} v`} tone={s.shape === p.shape ? 'accent' : 'store'} />
      ))}
      {d.heavy && (
        <Snapshots title={`64×32 (${formatNumber(d.heavy.light)} tris) vs 512×256 (${formatNumber(d.heavy.heavy)} tris): max pixel difference ${d.heavy.diff}`}
          items={[{ label: '64 × 32', src: d.heavy.snapshots[0], tone: 'ok' }, { label: '512 × 256', src: d.heavy.snapshots[1], tone: 'bad' }]} />
      )}
        </>
      )}
    </Lab>
  );
}

function HeightPlot({ heights, amp }) {
  const W = 520;
  const H = 110;
  const a = Math.max(amp, 0.05);
  const pts = heights.map((h, i) => `${(i / (heights.length - 1)) * W},${H / 2 - (h / a) * (H / 2 - 8)}`).join(' ');
  return (
    <svg className="height-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vertex heights along the middle row">
      <line className="grid-line" x1="0" x2={W} y1={H / 2} y2={H / 2} />
      <polyline className="draw-line" fill="none" stroke="var(--series-1)" strokeWidth="2" points={pts} />
      {heights.map((h, i) => <circle key={i} cx={(i / (heights.length - 1)) * W} cy={H / 2 - (h / a) * (H / 2 - 8)} r="3" fill="var(--series-2)"><title>vertex {i}: z = {h}</title></circle>)}
    </svg>
  );
}

export function BufferVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, bufferParams);
  const d = result?.data;
  return (
    <Lab result={result} create={(env) => buildBuffer(p, env)} label="Animated custom grid">
      <div className="stat-row">
        <Stat label="vertices" value={formatNumber(d?.counts.vertices)} />
        <Stat label="indices" value={formatNumber(d?.counts.indices)} />
        <Stat label="triangles" value={formatNumber(d?.counts.triangles)} tone="accent" />
      </div>
      <h4>Memory: indexed vs non-indexed</h4>
      <Bar label="indexed (positions + index)" value={d?.counts.indexedKB} max={Math.max(d?.counts.flatKB || 1, d?.counts.indexedKB || 1)} text={`${d?.counts.indexedKB} KB`} />
      <Bar label="non-indexed (toNonIndexed)" value={d?.counts.flatKB} max={Math.max(d?.counts.flatKB || 1, d?.counts.indexedKB || 1)} text={`${d?.counts.flatKB} KB`} tone="warn" />
      <h4>Middle row after the wave (position.getZ)</h4>
      {d?.heights && <HeightPlot heights={d.heights} amp={p.amplitude} />}
      <Snapshots items={d?.snapshots} />
    </Lab>
  );
}

export function LinesVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, linesParams);
  const d = result?.data;
  return (
    <Lab result={result} create={(env) => buildLines(p, env)} label="Galaxy of points with lines">
      {() => (
        <>
      <h4>Measured line thickness (pixels in the rendered column)</h4>
      <Bar label="asked for (linewidth)" value={p.linewidth} max={12} text={`${p.linewidth} px`} tone="store" />
      {d.thin != null && <Bar label="LineBasicMaterial" value={d.thin} max={12} text={`${d.thin} px`} tone="bad" />}
      <Bar label="Line2 + LineMaterial" value={d.fat} max={12} text={`${d.fat} px`} tone="ok" />
      {d.sizes && (
        <>
          <h4>sizeAttenuation: pixels per point</h4>
          <Bar label="true · near" value={d.sizes.true.near} max={Math.max(d.sizes.true.near, 1)} />
          <Bar label="true · far" value={d.sizes.true.far} max={Math.max(d.sizes.true.near, 1)} />
          <Bar label="false · near" value={d.sizes.false.near} max={Math.max(d.sizes.true.near, 1)} tone="store" />
          <Bar label="false · far" value={d.sizes.false.far} max={Math.max(d.sizes.true.near, 1)} tone="store" />
        </>
      )}
      <Snapshots items={d.snapshots} />
        </>
      )}
    </Lab>
  );
}

function OutlinePlot({ outline }) {
  const W = 260;
  const s = 100;
  const path = outline.map(([x, y], i) => `${i ? 'L' : 'M'} ${W / 2 + x * s} ${W / 2 - y * s}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="outline-plot" role="img" aria-label="Shape outline">
      <path d={`${path} Z`} className="draw-line" fill="rgba(var(--accent-rgb), 0.12)" stroke="var(--series-3)" strokeWidth="2" />
      {outline.map(([x, y], i) => <circle key={i} cx={W / 2 + x * s} cy={W / 2 - y * s} r="3" fill="var(--text)"><title>point {i}</title></circle>)}
    </svg>
  );
}

function SpacingPlot({ spacing }) {
  const W = 520;
  const row = (pts, y, color) => pts.map(([x], i) => <circle key={i} className="pop-in" style={{ animationDelay: `${i * 40}ms` }} cx={((x + 3) / 6) * (W - 20) + 10} cy={y} r="5" fill={color}><title>sample {i}: x = {x}</title></circle>);
  return (
    <svg viewBox={`0 0 ${W} 90`} className="spacing-plot" role="img" aria-label="Sample spacing along the curve">
      <text className="axis-text" x="10" y="16">getPoints(20): by parameter t (variation {Math.round(spacing.cvT * 100)}%)</text>
      {row(spacing.byT, 30, 'var(--series-2)')}
      <text className="axis-text" x="10" y="62">getSpacedPoints(20): by arc length (variation {Math.round(spacing.cvLen * 100)}%)</text>
      {row(spacing.byLen, 76, 'var(--series-1)')}
    </svg>
  );
}

export function ShapesVisual({ result, inputs }) {
  const p = paramsOf(result, inputs, shapeParams);
  const d = result?.data;
  return (
    <Lab result={result} create={(env) => buildShapes(p, env)} label="Extruded star, lathe vase and a tube">
      <div className="two-col">
        <div>
          <h4>shape.getPoints() ({d?.outline?.length} points)</h4>
          {d?.outline && <OutlinePlot outline={d.outline} />}
        </div>
        <div className="stat-row stat-col">
          <Stat label="extrude triangles" value={formatNumber(d?.extrude.triangles)} />
          <Stat label="extrude size (x, y, z)" value={d?.extrude.size.join(' × ')} />
          <Stat label="tube triangles" value={formatNumber(d?.tube.triangles)} />
          <Stat label="curve length" value={d?.tube.length} tone="accent" />
        </div>
      </div>
      {d?.spacing && <SpacingPlot spacing={d.spacing} />}
    </Lab>
  );
}
