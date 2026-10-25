import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hasWebGL2 } from '../lab/gpu.js';
import { disposeTree } from '../lab/lab.js';

function resetRenderer(renderer) {
  renderer.setRenderTarget(null);
  renderer.setScissorTest(false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = false;
  renderer.sortObjects = true;
  renderer.autoClear = true;
  renderer.setClearColor(0x0b1120, 1);
}

/**
 * A live, interactive Three.js view. `create({ renderer, canvas, width, height })` builds a stage
 * (it may be async) and returns { scene, camera, tick?(dt, t), render?(renderer, dt), resize?(w, h),
 * onPointer?(ndc, type), controls?: false | { target: [x, y, z], configure?(orbitControls) }, dispose?(), hud?() }. The stage is
 * rebuilt whenever `buildKey` changes. The canvas is created here (not in JSX) so a disposed,
 * context-lost canvas is never reused, and rendering pauses while the view is off screen.
 */
export default function ThreeStage({ create, buildKey, height = 340, label = '3D view' }) {
  const hostRef = useRef(null);
  const ctx = useRef({});
  const [hud, setHud] = useState('');
  const [problem, setProblem] = useState(() => (hasWebGL2() ? null : 'WebGL 2 is not available in this browser, so the live 3D view is off. The demo buttons still report what they can.'));

  // Renderer, canvas, resize and visibility: once per mount
  useEffect(() => {
    if (problem) return undefined;
    const host = hostRef.current;
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-label', label);
    host.prepend(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      canvas.remove();
      setProblem(`Could not start WebGL: ${e.message}`);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.info.autoReset = false;
    const c = ctx.current;
    c.renderer = renderer;
    c.canvas = canvas;
    c.timer = new THREE.Timer();
    c.visible = true;

    const size = () => {
      const w = Math.max(1, host.clientWidth);
      const h = height;
      renderer.setSize(w, h, false);
      canvas.style.width = '100%';
      canvas.style.height = `${h}px`;
      const cam = c.stage?.camera;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      c.stage?.resize?.(w, h);
    };
    c.size = size;
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    let frames = 0;
    let lastHud = performance.now();
    const loop = (timestamp) => {
      const stage = c.stage;
      if (!stage || !c.visible) return;
      c.timer.update(timestamp);
      // The first rAF timestamp can predate the Timer's start (negative delta); long pauses give huge ones
      const dt = Math.max(0, Math.min(c.timer.getDelta(), 0.1));
      renderer.info.reset();
      stage.tick?.(dt, c.timer.getElapsed());
      c.controls?.update(dt);
      if (stage.render) stage.render(renderer, dt);
      else renderer.render(stage.scene, stage.camera);
      frames += 1;
      const now = performance.now();
      if (now - lastHud > 500) {
        const fps = Math.round((frames * 1000) / (now - lastHud));
        const { calls, triangles } = renderer.info.render;
        const extra = stage.hud ? ` · ${stage.hud()}` : '';
        setHud(`${fps} fps · ${calls} draw call${calls === 1 ? '' : 's'} · ${triangles.toLocaleString()} triangles${extra}`);
        frames = 0;
        lastHud = now;
      }
    };
    renderer.setAnimationLoop(loop);

    const io = new IntersectionObserver(([entry]) => {
      c.visible = entry.isIntersecting;
    });
    io.observe(host);

    const pointer = (type) => (event) => {
      if (!c.stage?.onPointer) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      c.stage.onPointer(ndc, type, event);
    };
    const onMove = pointer('move');
    const onClick = pointer('click');
    const onLeave = () => c.stage?.onPointer?.(null, 'leave');
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerleave', onLeave);
      teardownStage(c);
      renderer.dispose();
      // dispose() keeps the WebGL context alive; release it so remounts never hit the context limit
      renderer.forceContextLoss();
      canvas.remove();
      ctx.current = {};
    };
  }, [height, label, problem]);

  // The stage itself: rebuilt when buildKey changes
  useEffect(() => {
    const c = ctx.current;
    if (problem || !c.renderer) return undefined;
    let cancelled = false;
    teardownStage(c);
    resetRenderer(c.renderer);
    const width = Math.max(1, hostRef.current.clientWidth);
    Promise.resolve()
      .then(() => create({ renderer: c.renderer, canvas: c.canvas, width, height }))
      .then((stage) => {
        if (cancelled || !stage) {
          if (stage) teardownStage({ stage });
          return;
        }
        c.stage = stage;
        if (stage.controls !== false) {
          const controls = new OrbitControls(stage.camera, c.canvas);
          controls.enableDamping = true;
          if (stage.controls?.target) controls.target.fromArray(stage.controls.target);
          stage.controls?.configure?.(controls);
          controls.update();
          c.controls = controls;
        }
        c.size();
      })
      .catch((e) => !cancelled && setProblem(`The live view failed to build: ${e.message}`));
    return () => {
      cancelled = true;
    };
    // `create` is rebuilt every render by design; buildKey decides when the stage really changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey, height, problem]);

  return (
    <div className="stage" ref={hostRef} style={{ minHeight: height }}>
      {problem ? <div className="empty stage-problem">{problem}</div> : <div className="stage-hud" aria-hidden="true">{hud}</div>}
    </div>
  );
}

function teardownStage(c) {
  c.controls?.dispose();
  c.controls = null;
  if (c.stage) {
    c.stage.dispose?.();
    if (c.stage.scene) disposeTree(c.stage.scene);
  }
  c.stage = null;
}
