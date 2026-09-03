const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

test.use({ serviceWorkers: 'allow' });

test('Firebase reserved login requests never enter the application cache or offline fallback', async ({ page, context }) => {
  let authReads = 0;
  const appShell = '<!doctype html><title>Isolated login cache test</title><main>APP_SHELL_FIXTURE</main>';
  const worker = fs.readFileSync(path.join(__dirname, '../../sw.js'));
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(worker);
    } else if (pathname.startsWith('/__/')) {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><main>AUTH_FIXTURE_${++authReads}</main>`);
    } else if (pathname.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.end('');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(appShell);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(origin);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      }
    });
    const first = await page.evaluate(async () => (await fetch('/__/auth/iframe?fixture=only')).text());
    const second = await page.evaluate(async () => (await fetch('/__/auth/iframe?fixture=only')).text());
    expect(first).toContain('AUTH_FIXTURE_1');
    expect(second).toContain('AUTH_FIXTURE_2');
    await page.goto(`${origin}/__/auth/handler?fixture=only`);
    await expect(page.locator('main')).toHaveText('AUTH_FIXTURE_3');
    const cacheState = await page.evaluate(async () => {
      const keys = await caches.keys();
      const reserved = [];
      for (const key of keys) {
        for (const request of await (await caches.open(key)).keys()) {
          if (new URL(request.url).pathname.startsWith('/__/')) reserved.push(request.url);
        }
      }
      const shell = await caches.match('/index.html');
      return { reserved, shell: shell ? await shell.text() : '' };
    });
    expect(cacheState.reserved).toEqual([]);
    expect(cacheState.shell).toContain('APP_SHELL_FIXTURE');
    expect(cacheState.shell).not.toContain('AUTH_FIXTURE');
    await page.goto(origin);
    await context.setOffline(true);
    let rejected = false;
    try { await page.goto(`${origin}/__/auth/handler?fixture=offline`, { timeout: 8000 }); }
    catch { rejected = true; }
    expect(rejected, 'Offline login must fail instead of returning a cached app/auth document').toBe(true);
  } finally {
    await context.setOffline(false);
    await new Promise(resolve => server.close(resolve));
  }
});
