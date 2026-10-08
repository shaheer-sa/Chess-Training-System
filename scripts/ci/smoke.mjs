// Supervisor-owned smoke check (not an Antigravity test).
// Serves dist/, visits Home and every main-nav page at 360px and 1280px,
// fails on console errors, page errors or horizontal scroll, and saves full-page screenshots.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4321;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'smoke-screenshots';
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // server not up yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const problems = [];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';

async function checkPage(page, width, idx, label) {
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) problems.push(`${width}px "${label}": horizontal scroll of ${overflow}px`);
  await page.screenshot({ path: `${OUT}/${width}-${idx}-${slug(label)}.png`, fullPage: true });
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  for (const width of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('console', m => { if (m.type() === 'error') problems.push(`${width}px console error: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${width}px page error: ${e.message}`));
    await page.goto(BASE);
    await checkPage(page, width, 0, 'home');

    const mobile = width < 768;
    const nav = () => page.locator('nav[aria-label="Main navigation"]:visible');
    const openMenu = async () => { if (mobile) await page.locator('button[aria-controls="mobile-menu"]').click(); };

    await openMenu();
    const labels = await nav().locator('a').allInnerTexts();
    if (labels.length === 0) problems.push(`${width}px: no main navigation links found`);
    if (mobile) await page.keyboard.press('Escape');

    for (const [i, label] of labels.entries()) {
      await openMenu();
      await nav().getByRole('link', { name: label, exact: true }).click();
      await checkPage(page, width, i + 1, label);
    }
    await page.close();
  }
  await browser.close();
} catch (e) {
  problems.push(`smoke script error: ${e.message}`);
} finally {
  server.kill();
}

if (problems.length) {
  console.log('SMOKE CHECK FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Smoke check passed. Screenshots saved to ${OUT}/`);
