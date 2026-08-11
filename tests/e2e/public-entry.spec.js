const { test, expect } = require('@playwright/test');

const RELEASE = '20.15.7';
const CLOUD_RELEASE = '20.19.7';
const APP_SHELL_RELEASE = '20.19.5';
const BUSINESS_RELEASE = '20.17.0';
const TEACHER_KPI_RELEASE = '20.15.8';
const BRANCH_SCOPE_RELEASE = '20.15.9';
const ROLE_UX_RELEASE = '20.19.4';
const ROLE_UX_STYLE_RELEASE = '20.19.6';
const PWA_RELEASE = '20.18.2';
const PWA_STYLE_RELEASE = '20.18.0';
const CLEAN_FIELD_RELEASE = '20.19.0';

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
  expect(sources).toContain(`./js/modules/business/business-logic.js?v=${BUSINESS_RELEASE}`);
  expect(sources).toContain(`./js/modules/notifications/notification-center.js?v=${RELEASE}`);
  expect(sources).toContain(`./js/core/firebase-auth-and-cloud-sync.module.js?v=${CLOUD_RELEASE}`);
  expect(sources).toContain(`./js/app/app-shell.js?v=${APP_SHELL_RELEASE}`);
  expect(sources).toContain(`./js/ui/clean-field-hints.js?v=${CLEAN_FIELD_RELEASE}`);
  expect(sources).toContain(`./js/modules/teachers/teacher-kpi.js?v=${TEACHER_KPI_RELEASE}`);
  expect(sources).toContain(`./js/core/branch-business-scope.js?v=${BRANCH_SCOPE_RELEASE}`);
  expect(sources).toContain(`./js/app/v20014-role-responsive-ux.js?v=${ROLE_UX_RELEASE}`);
  expect(sources).toContain(`./js/core/pwa-installation.js?v=${PWA_RELEASE}`);
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  expect(styles).toContain(`./css/core/73-v20014-role-responsive-ux.css?v=${ROLE_UX_STYLE_RELEASE}`);
  expect(styles).toContain(`./css/core/77-pwa-install-and-update.css?v=${PWA_STYLE_RELEASE}`);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBe('./manifest.webmanifest');
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleIcon).toBe('./icon-192.png?v=20.18.1');
});

test('form fields do not show redundant placeholder hints', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[placeholder]')).toHaveCount(0);
});

test('public entry has no horizontal viewport overflow', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('iPad install action opens usable Safari guidance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-webkit');
  await page.goto('/index.html', { waitUntil: 'load' });
  const install = page.locator('#pwaInstallBtn');
  await expect(install).toHaveCount(1);
  await install.evaluate(element => element.click());
  const guide = page.locator('#pwaInstallGuide');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('加入主畫面');
  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await guide.locator('.pwa-guide-done').evaluate(element => element.click());
  await expect(guide).toBeHidden();
});
