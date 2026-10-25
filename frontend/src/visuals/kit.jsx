import React, { useState } from 'react';
import ThreeStage from '../components/ThreeStage.jsx';
import { Empty } from '../components/common.jsx';

/** The live stage rebuilds after every run, using the parameters that run actually used. */
export const stageKey = (result) => result?.receivedAt ?? 'initial';
export const paramsOf = (result, inputs, fn) => fn(result?.data?.params ?? inputs ?? {});

/** A live Three.js view on top, the measurements of the last run underneath (children may be a function of result.data). */
export function Lab({ create, result, height = 340, label, children, hint }) {
  return (
    <div className="lab-visual">
      <ThreeStage create={create} buildKey={stageKey(result)} height={height} label={label} />
      <div className="lab-panel">
        {result ? (typeof children === 'function' ? children(result.data || {}) : children) : <Empty>{hint || 'The live view above runs the real scene. Press “Run it” to measure it: the checks read pixels back from the GPU.'}</Empty>}
      </div>
    </div>
  );
}

/** Real readbacks from the GPU (tiny canvases, shown pixelated on purpose). */
export function Snapshots({ items, title = 'What the GPU actually drew' }) {
  const list = (items || []).filter((s) => s?.src);
  if (!list.length) return null;
  return (
    <div className="snapshots-block">
      <h4>{title}</h4>
      <div className="snapshots">
        {list.map((s, i) => (
          <figure key={`${s.label}-${i}`} className={`snapshot snapshot-${s.tone || 'ok'} pop-in`} style={{ animationDelay: `${i * 90}ms` }}>
            <img src={s.src} alt={s.label} />
            <figcaption>{s.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function Swatch({ rgb, label }) {
  const color = Array.isArray(rgb) ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : rgb;
  return (
    <span className="swatch-chip" title={label || color}>
      <span className="swatch-box" style={{ background: color }} />
      <code>{label || color}</code>
    </span>
  );
}

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

/**
 * A small line chart: one shared y axis, thin 2px lines, a legend for 2+ series plus direct labels
 * at the line ends, and a hover readout per x position.
 */
export function LineChart({ xs, series, yMax, yLabel, xLabel, formatX = (x) => x, formatY = (y) => y, height = 180, marker }) {
  const [hover, setHover] = useState(null);
  const W = 560;
  const H = height;
  const pad = { l: 44, r: 92, t: 10, b: 28 };
  const max = yMax ?? Math.max(1e-9, ...series.flatMap((s) => s.values));
  const x = (i) => pad.l + (i / Math.max(1, xs.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((k) => k * max);
  // Direct labels at the line ends, nudged apart so close series stay readable
  const labels = series.filter((s) => !s.muted).map((s) => ({ name: s.name, y: y(s.values[s.values.length - 1]) + 4 })).sort((a, b) => a.y - b.y);
  labels.forEach((l, i) => { if (i && l.y - labels[i - 1].y < 13) l.y = labels[i - 1].y + 13; });
  const labelY = Object.fromEntries(labels.map((l) => [l.name, l.y]));
  return (
    <div className="linechart">
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.name}><span className="swatch" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} by ${xLabel}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{formatY(t)}</text>
          </g>
        ))}
        <text className="axis-text" x={pad.l} y={H - 8}>{formatX(xs[0])}</text>
        <text className="axis-text" x={W - pad.r} y={H - 8} textAnchor="end">{formatX(xs[xs.length - 1])}</text>
        <text className="axis-text" x={(pad.l + W - pad.r) / 2} y={H - 8} textAnchor="middle">{xLabel}</text>
        {series.map((s) => (
          <g key={s.name}>
            <polyline className="chart-line" fill="none" stroke={s.color} strokeWidth={s.width || 2} opacity={s.muted ? 0.35 : 1}
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {!s.muted && (
              <text className="direct-label" x={x(s.values.length - 1) + 6} y={labelY[s.name]}>{s.name}</text>
            )}
          </g>
        ))}
        {marker != null && <line className="chart-marker" x1={x(marker)} x2={x(marker)} y1={pad.t} y2={H - pad.b} />}
        {hover != null && (
          <g>
            <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} />
            {series.filter((s) => !s.muted).map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />)}
          </g>
        )}
        {xs.map((_, i) => (
          <rect key={i} x={x(i) - (W - pad.l - pad.r) / xs.length / 2} y={pad.t} width={(W - pad.l - pad.r) / xs.length} height={H - pad.t - pad.b}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {hover != null
          ? <>{xLabel} {formatX(xs[hover])}: {series.filter((s) => !s.muted).map((s) => <span key={s.name}><b>{s.name}</b> {formatY(s.values[hover])} </span>)}</>
          : <span className="muted">Hover the chart for exact values · {yLabel}</span>}
      </div>
    </div>
  );
}
