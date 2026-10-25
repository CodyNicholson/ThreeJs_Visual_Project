// End-to-end test for the browser-only lab: opens the built site in headless Chromium (software
// WebGL 2 via SwiftShader), runs the "Run all demos" self-test, then opens every demo page and
// presses every button (including each "Do it wrong" reproduction). Exits 1 on any failed check,
// error banner, uncaught page error or Content-Security-Policy violation.
//   node run-suite.mjs http://localhost:3900 [--shots /out]
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:3900').replace(/\/$/, '');
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
let failures = 0;
const fail = (msg) => { failures += 1; console.log(`FAIL ${msg}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const pageErrors = new Map();
let where = 'start';
page.on('pageerror', (e) => {
  const key = `${where}: ${e.message}`;
  if (!pageErrors.has(key)) pageErrors.set(key, (e.stack || '').split('\n').slice(1, 4).join(' | '));
});
// The Content-Security-Policy header blocks rather than throws, so violations only show up in the console
const cspViolations = new Set();
page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) cspViolations.add(`${where}: ${m.text()}`); });

where = 'suite';
await page.goto(`${base}/#suite`);
const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
console.log(`WebGL 2 in this browser: ${webgl2}`);
if (!webgl2) fail('no WebGL 2: the GPU demos cannot run');

// 1. The in-page self-test suite
await page.getByRole('button', { name: 'Run all demos', exact: true }).click();
await page.waitForFunction(() => window.__labSuiteDone === true, null, { timeout: 600000 });
const suite = await page.evaluate(() => window.__labSuite);
for (const r of suite) {
  const bad = r.checks.filter((c) => !c.passed);
  if (r.status === 'pass') console.log(`ok   suite ${r.id} (${r.checks.length} checks, ${r.ms} ms)`);
  else fail(`suite ${r.id}: ${r.error || bad.map((c) => `${c.name} → ${c.detail}`).join(' | ')}`);
}
if (shots) await page.screenshot({ path: `${shots}/suite.png`, fullPage: true });

// 2. Every button on every demo page
const ids = suite.map((r) => r.id);
let actions = 0;
for (const id of ids) {
  where = id;
  await page.goto(`${base}/#${id}`);
  await page.waitForSelector('h2');
  const labels = await page.$$eval('.controls .actions button', (els) => els.map((e) => e.textContent.trim()));
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.btn-busy'), null, { timeout: 120000 });
    await page.waitForTimeout(150);
    const error = await page.$eval('.controls .error', (e) => e.textContent).catch(() => null);
    const pill = await page.$eval('.result-panel .pill-ok, .result-panel .pill-bad', (e) => e.textContent).catch(() => null);
    const failedChecks = await page.$$eval('.checks .check-bad', (els) => els.map((e) => e.textContent.trim()));
    actions += 1;
    if (error) fail(`${id} → "${label}": ${error}`);
    else if (!pill || failedChecks.length) fail(`${id} → "${label}": ${pill || 'no result'} ${failedChecks.join(' | ')}`);
    else console.log(`ok   ${id} → "${label}": ${pill}`);
  }
  if (shots) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/${id}.png`, fullPage: true });
  }
}

// 3. The other pages render
for (const hash of ['overview', 'pitfalls']) {
  where = hash;
  await page.goto(`${base}/#${hash}`);
  await page.waitForSelector('h2');
  if (shots) await page.screenshot({ path: `${shots}/${hash}.png`, fullPage: true });
}

pageErrors.forEach((stack, key) => fail(`uncaught page error on ${key} @ ${stack}`));
cspViolations.forEach((msg) => fail(`CSP violation on ${msg}`));
console.log(`\n${suite.length} demos in the suite, ${actions} buttons pressed, ${failures} failure(s)`);
await browser.close();
process.exit(failures ? 1 : 0);
