// Headless smoke test: loads www/index.html in installed Chrome (same Blink/V8
// engine family as Android System WebView) and drives the game while capturing
// any console errors or uncaught exceptions. Screenshots intro + live game.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME = 'file:///' + path.join(ROOT, 'www', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'dist', 'smoke');

const errors = [];
const warnings = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  // Pixel-class phone viewport.
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') errors.push('console.error: ' + m.text());
    else if (t === 'warning') warnings.push('console.warn: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => {
    // Ignore favicon noise; report anything else that fails to load.
    if (!/favicon/.test(r.url())) errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText));
  });

  await page.goto(GAME, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(600);

  // 1) Intro screen
  const introTitle = await page.$eval('#dayStartTitle', (el) => el.textContent.trim()).catch(() => null);
  await page.screenshot({ path: path.join(OUT, '01-intro.png') });

  // 2) Clock in -> live game
  const clockInClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /clock in/i.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '02-after-clockin.png') });

  // Read some live state to confirm the game engine is running.
  const liveState = await page.evaluate(() => {
    const txt = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    return {
      focus: txt('focusVal') || txt('focus'),
      bowel: txt('bowelVal') || txt('bowel'),
      hasActionGrid: !!document.querySelector('[data-action="coffee"]'),
      // Pull any exposed globals if present (non-fatal if undefined)
      stateType: typeof window.state,
    };
  });

  // 3) Take a couple of actions and file work to exercise handlers.
  const actionLog = [];
  for (const act of ['coffee', 'work', 'hydrate']) {
    const clicked = await page.evaluate((a) => {
      const b = document.querySelector(`[data-action="${a}"]`);
      if (b) { b.click(); return true; }
      return false;
    }, act);
    actionLog.push(`${act}: ${clicked ? 'clicked' : 'NOT FOUND'}`);
    await sleep(700);
    // Dismiss any event modal that may have popped up by clicking its first choice/primary button.
    await page.evaluate(() => {
      const modal = [...document.querySelectorAll('.modal.show')].find((m) => m.id !== 'dayStartModal');
      if (modal) { const b = modal.querySelector('button'); if (b) b.click(); }
    });
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, '03-after-actions.png') });

  // Snapshot any visible activity-feed text as evidence the sim advanced.
  const feed = await page.evaluate(() => {
    const f = document.querySelector('.feed, #feed, .activity, #activity');
    return f ? f.innerText.split('\n').filter(Boolean).slice(0, 6) : [];
  });

  await browser.close();

  const report = {
    introTitle,
    clockInClicked,
    liveState,
    actionLog,
    feedSample: feed,
    errorCount: errors.length,
    errors,
    warningCount: warnings.length,
    warnings: warnings.slice(0, 10),
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });
