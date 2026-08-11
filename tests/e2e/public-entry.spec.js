const { test, expect } = require('@playwright/test');

const RELEASE = '20.15.7';
const CLOUD_RELEASE = '20.25.1';
const APP_SHELL_RELEASE = '20.23.2';
const BUSINESS_RELEASE = '20.23.0';
const TEACHER_KPI_RELEASE = '20.22.0';
const BRANCH_SCOPE_RELEASE = '20.22.0';
const ROLE_UX_RELEASE = '20.20.1';
const ROLE_UX_STYLE_RELEASE = '20.24.2';
const PWA_RELEASE = '20.18.3';
const PWA_STYLE_RELEASE = '20.18.0';
const CLEAN_FIELD_RELEASE = '20.19.0';
const LANGUAGE_RELEASE = '20.25.0';
const INTERFACE_CLARITY_STYLE_RELEASE = '20.25.1';
const SCHEDULER_UI_RELEASE = '20.25.0';

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
  expect(sources).toContain(`./js/core/ui-language.js?v=${LANGUAGE_RELEASE}`);
  expect(sources).toContain(`./js/modules/calendar/scheduler-ui.js?v=${SCHEDULER_UI_RELEASE}`);
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  expect(styles).toContain(`./css/core/73-v20014-role-responsive-ux.css?v=${ROLE_UX_STYLE_RELEASE}`);
  expect(styles).toContain(`./css/core/77-pwa-install-and-update.css?v=${PWA_STYLE_RELEASE}`);
  expect(styles).toContain(`./css/core/67-v185-interface-clarity.css?v=${INTERFACE_CLARITY_STYLE_RELEASE}`);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBe('./manifest.webmanifest');
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleIcon).toBe('./icon-192.png?v=20.18.1');
});

test('teacher schedule hides the location legend', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('body').evaluate(element => {
    element.classList.add('teacher-cloud-role');
    element.dataset.roleUx = 'teacher';
  });
  await expect(page.locator('#calendar .location-legend')).toBeHidden();
});

test('English mode translates the major application workspaces', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.DanbridgeLanguage.setLanguage('en'));
  const translatedBody = await page.locator('body').textContent();
  for (const label of ['Security', 'Smart Scheduling Assistant', 'Lesson Reports', 'Notification Center', 'Finance Center']) {
    expect(translatedBody).toContain(label);
  }
  for (const untranslated of ['安全設定', '智慧排課助手', '課程回報', '通知中心', '財務中心']) {
    expect(translatedBody).not.toContain(untranslated);
  }
});

test('finance month helper stays clear of the month field', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const boxes = await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.className = 'v187-finance-month-bar';
    bar.innerHTML = '<label><span>資料月份</span><input type="month" value="2026-08"></label><small>切換後自動更新財務、老師 KPI、學生收款與支出資料</small>';
    document.body.appendChild(bar);
    const input = bar.querySelector('input').getBoundingClientRect();
    const helper = bar.querySelector('small').getBoundingClientRect();
    const result = { inputRight: input.right, inputBottom: input.bottom, helperLeft: helper.left, helperTop: helper.top };
    bar.remove();
    return result;
  });
  expect(boxes.helperLeft >= boxes.inputRight || boxes.helperTop >= boxes.inputBottom).toBe(true);
});

test('iPad lesson start and end fields do not overlap', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const boxes = await page.evaluate(() => {
    const modal = document.querySelector('#lessonModal .modal');
    modal.parentElement.classList.add('show');
    const start = document.getElementById('startTime').getBoundingClientRect();
    const end = document.getElementById('endTime').getBoundingClientRect();
    return { startRight: start.right, startBottom: start.bottom, endLeft: end.left, endTop: end.top, startWidth: start.width, endWidth: end.width };
  });
  expect(boxes.endLeft >= boxes.startRight || boxes.endTop >= boxes.startBottom).toBe(true);
  expect(Math.abs(boxes.startWidth - boxes.endWidth)).toBeLessThanOrEqual(2);
});

test('desktop roles use document scrolling instead of a sidebar scrollbar', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    return { width: window.innerWidth, overflow: getComputedStyle(document.querySelector('body > nav')).overflowY };
  });
  if (result.width >= 1100) expect(result.overflow).toBe('visible');
});

test('student teacher filter stays inside the viewport', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    document.getElementById('authScreen')?.classList.add('hidden');
    document.querySelectorAll('[data-auth-isolated]').forEach(element => {
      element.inert = false;element.removeAttribute('aria-hidden');delete element.dataset.authIsolated;
    });
    window.switchTab('students');
    const filter = document.getElementById('crmTeacherFilter');
    const rect = filter.getBoundingClientRect();
    return { exists: !!filter, left: rect.left, right: rect.right, width: innerWidth };
  });
  expect(result.exists).toBe(true);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width);
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
