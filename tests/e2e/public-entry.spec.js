const { test, expect } = require('@playwright/test');

const RELEASE = '20.15.7';
const TEACHER_KPI_RELEASE = '20.15.8';

test('signed-out entry keeps private application content isolated', async ({ page }) => {
  await page.route('https://www.gstatic.com/**', route => route.abort());
  await page.route('https://*.googleapis.com/**', route => route.abort());

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveClass(/auth-locked/);

  const isolation = await page.locator('main').evaluate(element => ({ display: getComputedStyle(element).display }));
  expect(isolation).toEqual({ display: 'none' });
});

test('critical teacher and finance resources load the current release', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const sources = await page.locator('script[src]').evaluateAll(elements => elements.map(element => element.getAttribute('src')));
  expect(sources).toContain(`./js/modules/business/business-logic.js?v=${RELEASE}`);
  expect(sources).toContain(`./js/modules/notifications/notification-center.js?v=${RELEASE}`);
  expect(sources).toContain(`./js/core/firebase-auth-and-cloud-sync.module.js?v=${RELEASE}`);
  expect(sources).toContain(`./js/modules/teachers/teacher-kpi.js?v=${TEACHER_KPI_RELEASE}`);
});

test('public entry has no horizontal viewport overflow', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
