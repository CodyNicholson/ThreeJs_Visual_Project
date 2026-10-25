// Runs demo buttons. Three.js lives in the browser, so there is no backend: each action has a
// `run(inputs)` function that executes real Three.js code in this page and returns a DemoResult:
// { demo, commands, data, checks: [{ name, passed, detail }], elapsedMs }.

/** Runs one demo button and adds the wall-clock time the browser spent on it. */
export async function runAction(action, inputs) {
  const started = performance.now();
  const result = await action.run(inputs);
  return { ...result, clientMs: Math.round(performance.now() - started) };
}

/** Runs a demo's self-test: its `test.action` with the default inputs plus `test.inputs`. */
export function runTest(demo, defaults) {
  const action = demo.actions.find((a) => a.id === demo.test.action);
  if (!action) return Promise.reject(new Error(`${demo.id}: test action "${demo.test.action}" not found`));
  return runAction(action, { ...defaults, ...(demo.test.inputs || {}) });
}
