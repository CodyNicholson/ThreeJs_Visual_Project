// One small off-screen WebGLRenderer shared by every demo's self-checks. Demos render into its
// canvas and read the real pixels back, so checks prove what the GPU actually drew. One shared
// context (instead of one per run) also keeps the page far below the browser's WebGL context limit.
import * as THREE from 'three';
import { round } from './lab.js';

let checkRenderer = null;

export function hasWebGL2() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export class NeedsWebGLError extends Error {
  constructor() {
    super('This demo renders real pixels and needs WebGL 2, which this browser does not provide.');
    this.name = 'NeedsWebGLError';
  }
}

/** The shared check renderer, reset to Three.js defaults and sized w×h (pixel ratio 1, no antialiasing). */
export function getCheckRenderer(w = 64, h = 64) {
  if (!checkRenderer) {
    if (!hasWebGL2()) throw new NeedsWebGLError();
    const canvas = document.createElement('canvas');
    checkRenderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  }
  const r = checkRenderer;
  r.setRenderTarget(null);
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setViewport(0, 0, w, h);
  r.setScissorTest(false);
  r.toneMapping = THREE.NoToneMapping;
  r.toneMappingExposure = 1;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = false;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.shadowMap.needsUpdate = true;
  r.localClippingEnabled = false;
  r.sortObjects = true;
  r.autoClear = true;
  r.setClearColor(0x000000, 1);
  r.debug.onShaderError = null;
  r.debug.checkShaderErrors = true;
  r.info.autoReset = true;
  r.info.reset();
  return r;
}

/** Reads the canvas the renderer just drew (sRGB, tone mapped: exactly what a visitor would see). */
export function readCanvas(renderer) {
  const gl = renderer.getContext();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = size.x;
  const h = size.y;
  const buf = new Uint8Array(w * h * 4);
  // Call straight after rendering to the canvas (render target null), while its framebuffer is bound
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return new Pixels(buf, w, h);
}

/** Reads a render target's pixels (linear values, no tone mapping or sRGB output conversion). */
export function readTarget(renderer, target) {
  const { width: w, height: h } = target;
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
  return new Pixels(buf, w, h);
}

/** Pixel access with (u, v) in 0..1 measured from the top-left, like the picture on screen. */
export class Pixels {
  constructor(buf, w, h) {
    this.buf = buf;
    this.w = w;
    this.h = h;
  }

  /** [r, g, b, a] at integer pixel (x, y), y from the top. */
  px(x, y) {
    const xi = Math.min(this.w - 1, Math.max(0, Math.floor(x)));
    const yi = Math.min(this.h - 1, Math.max(0, Math.floor(y)));
    const i = ((this.h - 1 - yi) * this.w + xi) * 4;
    return [this.buf[i], this.buf[i + 1], this.buf[i + 2], this.buf[i + 3]];
  }

  at(u, v) {
    return this.px(u * (this.w - 1), v * (this.h - 1));
  }

  lum(u, v) {
    return luminance(this.at(u, v));
  }

  /** Counts pixels matching `test([r,g,b,a])`, optionally inside a rectangle of (u, v) bounds. */
  count(test, [u0, v0, u1, v1] = [0, 0, 1, 1]) {
    let n = 0;
    for (let y = Math.floor(v0 * this.h); y < Math.ceil(v1 * this.h); y += 1) {
      for (let x = Math.floor(u0 * this.w); x < Math.ceil(u1 * this.w); x += 1) {
        if (test(this.px(x, y))) n += 1;
      }
    }
    return n;
  }

  /** Bounding box { x0, y0, x1, y1, w, h } in pixels of everything matching `test`, or null. */
  bbox(test) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (test(this.px(x, y))) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** The pixel row at height v, as an array of [r, g, b, a]. */
  row(v) {
    const y = Math.round(v * (this.h - 1));
    return Array.from({ length: this.w }, (_, x) => this.px(x, y));
  }

  /** The readback as a PNG data URL (top-left origin), so the page can show exactly what the GPU drew. */
  toDataURL() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const g = canvas.getContext?.('2d');
    if (!g) return null;
    const img = g.createImageData(this.w, this.h);
    for (let y = 0; y < this.h; y += 1) {
      const src = (this.h - 1 - y) * this.w * 4;
      img.data.set(this.buf.subarray(src, src + this.w * 4), y * this.w * 4);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    g.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  /** The pixel column at u, as an array of [r, g, b, a]. */
  column(u) {
    const x = Math.round(u * (this.w - 1));
    return Array.from({ length: this.h }, (_, y) => this.px(x, y));
  }
}

export const luminance = ([r, g, b]) => round(0.2126 * r + 0.7152 * g + 0.0722 * b, 1);
export const rgb = (p) => `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
export const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The sRGB bytes a CSS hex color is displayed as (Color stores linear values; getHex converts back). */
export const hexToRgb = (hex) => {
  const h = new THREE.Color(hex).getHex();
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
};
// Color stores linear values; getHexString() converts back to sRGB for display
export const srgbOf = (color) => {
  const s = color.clone().convertLinearToSRGB();
  return [Math.round(s.r * 255), Math.round(s.g * 255), Math.round(s.b * 255)];
};

/** Renders and reads the canvas, recording the call and what renderer.info counted. */
export function shoot(d, renderer, scene, camera, label = 'renderer.render(scene, camera)') {
  const t0 = performance.now();
  renderer.render(scene, camera);
  const px = readCanvas(renderer);
  const { calls, triangles, points, lines } = renderer.info.render;
  const ms = performance.now() - t0;
  const parts = [`${calls} draw call${calls === 1 ? '' : 's'}`, `${triangles} triangles`];
  if (points) parts.push(`${points} points`);
  if (lines) parts.push(`${lines} lines`);
  d.cmd(`${label} → ${parts.join(', ')}  (${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms incl. readPixels)`);
  return Object.assign(px, { calls, triangles, points, lines });
}
