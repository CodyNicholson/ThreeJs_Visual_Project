// Runs every demo that needs neither a GPU nor the network straight in Node (jsdom) with real
// Three.js, and fails on any failed self-check. GPU and network demos run in headless Chromium
// (e2e/run-suite.mjs), which clicks "Run all demos" on the built site.
import { describe, expect, it } from 'vitest';
import { DEMOS } from '../demos/catalog.js';
import { defaultInputs } from '../components/DemoView.jsx';
import { runAction, runTest } from '../api.js';

const cpuDemos = DEMOS.filter((d) => !d.gpu && !d.network);
const failed = (result) => result.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);

describe('CPU demos run real Three.js and pass their own checks', () => {
  it('covers a meaningful share of the lab', () => {
    expect(cpuDemos.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cpuDemos.map((d) => [d.id, d]))('%s', async (_, demo) => {
    const result = await runTest(demo, defaultInputs(demo));
    expect(result.demo).toBe(demo.id);
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(failed(result)).toEqual([]);
  }, 20000);

  it.each(cpuDemos.flatMap((d) => d.actions.filter((a) => a.tone === 'ghost' && !a.gpu && !a.network).map((a) => [`${d.id} → ${a.id}`, d, a])))('mistake %s reproduces and the fix passes', async (_, demo, action) => {
    const result = await runAction(action, defaultInputs(demo));
    expect(failed(result)).toEqual([]);
  }, 20000);

  it.each(cpuDemos.map((d) => [d.id, d]))('%s clamps hostile inputs', async (_, demo) => {
    const hostile = Object.fromEntries((demo.inputs || []).map((i) => [i.name, i.type === 'number' ? '1e9' : '<script>alert(1)</script>']));
    const result = await runTest(demo, hostile);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('<script>');
  }, 20000);
});
