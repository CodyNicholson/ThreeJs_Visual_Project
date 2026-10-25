// The browser-side equivalent of a lab backend: every demo runs real Three.js code in this page
// and returns a DemoResult { demo, commands, data, checks, elapsedMs }. `commands` are the actual
// Three.js calls made (with timings), `checks` prove the behaviour the page explains.
import { getConsoleFunction, setConsoleFunction } from 'three';

export const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const clampInt = (value, min, max, fallback = min) => Math.round(clamp(value, min, max, fallback));

/** Picks `value` if it is one of `options`, otherwise the first option. Inputs never reach code as-is. */
export const oneOf = (value, options) => (options.includes(value) ? value : options[0]);

export const bool = (value) => value === true || value === 'true' || value === 1 || value === '1';

export const fmtMs = (ms) => (ms < 1 ? `${ms.toFixed(2)} ms` : ms < 100 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`);

export const round = (n, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;

export const v3 = (v) => `(${round(v.x, 2)}, ${round(v.y, 2)}, ${round(v.z, 2)})`;

/**
 * Runs `fn` while capturing everything Three.js logs through its console hook (THREE.warn / THREE.error),
 * so a demo can show the genuine message a mistake produces. Works for sync and async functions.
 */
export async function captureThree(fn) {
  const previous = getConsoleFunction();
  const logs = [];
  setConsoleFunction((level, message, ...params) => {
    const extra = params.filter((p) => typeof p === 'string' || typeof p === 'number').join(' ');
    logs.push({ level, message: extra ? `${message} ${extra}` : message });
  });
  try {
    const value = await fn();
    return { value, logs };
  } finally {
    setConsoleFunction(previous);
  }
}

export class Demo {
  constructor(id) {
    this.id = id;
    this.commands = [];
    this.checks = [];
    this.started = performance.now();
  }

  cmd(text) {
    this.commands.push(text);
  }

  /** Runs fn, records `label → summary(result)` with its duration, returns the result. */
  time(label, fn, summary) {
    const t0 = performance.now();
    const value = fn();
    const extra = summary ? ` → ${summary(value)}` : '';
    this.cmd(`${label}${extra}  (${fmtMs(performance.now() - t0)})`);
    return value;
  }

  async timeAsync(label, fn, summary) {
    const t0 = performance.now();
    const value = await fn();
    const extra = summary ? ` → ${summary(value)}` : '';
    this.cmd(`${label}${extra}  (${fmtMs(performance.now() - t0)})`);
    return value;
  }

  check(name, passed, detail) {
    this.checks.push({ name, passed: Boolean(passed), detail: detail == null ? '' : String(detail) });
    return Boolean(passed);
  }

  /**
   * Runs a deliberate mistake and records what really happened: a thrown error and/or the messages
   * Three.js logged. Returns { ok, error, logs, value } so checks can assert the failure happened.
   */
  async attempt(label, fn) {
    let error = null;
    let value;
    const { logs } = await captureThree(async () => {
      try {
        value = await fn();
      } catch (e) {
        error = e;
      }
    });
    if (error) this.cmd(`✗ ${label} → threw ${error.name}: ${error.message}`);
    logs.forEach((l) => this.cmd(`✗ ${label} → console.${l.level}: ${l.message.split('\n')[0]}`));
    if (!error && !logs.length) this.cmd(`${label} → no error raised (the failure is silent)`);
    return { ok: !error, error, logs, value };
  }

  result(data = {}) {
    return {
      demo: this.id,
      commands: this.commands,
      data,
      checks: this.checks,
      elapsedMs: Math.round((performance.now() - this.started) * 10) / 10,
    };
  }
}

/** Frees every geometry, material and texture under `root`: what a real app must do when it removes objects. */
export function disposeTree(root) {
  root.traverse((obj) => {
    obj.geometry?.dispose?.();
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    materials.forEach((m) => {
      Object.values(m).forEach((v) => v?.isTexture && v.dispose());
      if (m.uniforms) Object.values(m.uniforms).forEach((u) => u?.value?.isTexture && u.value.dispose());
      m.dispose();
    });
    obj.dispose?.();
  });
  if (root.background?.isTexture) root.background.dispose();
  if (root.environment?.isTexture) root.environment.dispose();
}
