const { test, expect } = require('@playwright/test');

const RELEASE = '20.15.7';
const CLOUD_RELEASE = '20.26.0';
const APP_SHELL_RELEASE = '20.23.2';
const BUSINESS_RELEASE = '20.23.0';
const TEACHER_KPI_RELEASE = '20.22.0';
const BRANCH_SCOPE_RELEASE = '20.22.0';
const ROLE_UX_RELEASE = '20.20.1';
const ROLE_UX_STYLE_RELEASE = '20.25.10';
const PWA_RELEASE = '20.18.3';
const PWA_STYLE_RELEASE = '20.18.0';
const CLEAN_FIELD_RELEASE = '20.19.0';
const LANGUAGE_RELEASE = '20.25.0';
const INTERFACE_CLARITY_STYLE_RELEASE = '20.25.5';
const SCHEDULER_UI_RELEASE = '20.25.0';
const PREMIUM_CONTROLS_RELEASE = '20.25.10';

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
  expect(styles).toContain(`./css/core/78-v20259-premium-responsive-controls.css?v=${PREMIUM_CONTROLS_RELEASE}`);
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
    const reference = document.getElementById('lessonTitle').getBoundingClientRect();
    const startStyle = getComputedStyle(document.getElementById('startTime'));
    const endStyle = getComputedStyle(document.getElementById('endTime'));
    return { startLeft: start.left, startRight: start.right, startBottom: start.bottom, endLeft: end.left, endRight: end.right, endTop: end.top, startWidth: start.width, endWidth: end.width, referenceLeft: reference.left, referenceRight: reference.right, viewportWidth: innerWidth, startAppearance: startStyle.webkitAppearance || startStyle.appearance, endAppearance: endStyle.webkitAppearance || endStyle.appearance };
  });
  expect(boxes.endLeft >= boxes.startRight || boxes.endTop >= boxes.startBottom).toBe(true);
  expect(Math.abs(boxes.startWidth - boxes.endWidth)).toBeLessThanOrEqual(2);
  if (boxes.viewportWidth <= 700) {
    expect(Math.abs(boxes.startLeft - boxes.referenceLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(boxes.endLeft - boxes.referenceLeft)).toBeLessThanOrEqual(2);
    expect(boxes.startRight).toBeLessThanOrEqual(boxes.referenceRight + 1);
    expect(boxes.endRight).toBeLessThanOrEqual(boxes.referenceRight + 1);
    expect(boxes.startAppearance).toBe('none');
    expect(boxes.endAppearance).toBe('none');
  }
});

test('lesson start and end time values are centered with balanced inset', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => ['startTime','endTime'].map(id => {
    const style = getComputedStyle(document.getElementById(id));
    return { textAlign: style.textAlign, paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight), viewportWidth: innerWidth };
  }));
  for (const field of result) {
    expect(field.textAlign).toBe('center');
    expect(Math.abs(field.paddingLeft - field.paddingRight)).toBeLessThanOrEqual(1);
    expect(field.paddingLeft).toBeGreaterThanOrEqual(field.viewportWidth <= 700 ? 16 : 40);
  }
});

test('mobile lesson date and all single-line editor controls are contained and centered', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    const backdrop = document.getElementById('lessonModal');
    backdrop.classList.add('show');
    const modal = backdrop.querySelector('.modal');
    const modalRect = modal.getBoundingClientRect();
    const date = document.getElementById('lessonDate');
    date.value = '2026-08-10';
    const dateRect = date.getBoundingClientRect();
    const controls = [...modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,.btn')]
      .filter(control => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map(control => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        return {
          id: control.id || control.textContent.trim().slice(0, 20),
          align: style.textAlign,
          lineHeight: style.lineHeight,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          height: rect.height
        };
      });
    return {
      viewportWidth: innerWidth,
      modalLeft: modalRect.left,
      modalRight: modalRect.right,
      dateLeft: dateRect.left,
      dateRight: dateRect.right,
      dateHeight: dateRect.height,
      dateAlign: getComputedStyle(date).textAlign,
      controls
    };
  });
  expect(result.dateAlign).toBe('center');
  expect(result.dateHeight).toBeLessThanOrEqual(52);
  expect(result.dateHeight).toBeGreaterThanOrEqual(48);
  expect(result.dateLeft).toBeGreaterThanOrEqual(result.modalLeft + 14);
  expect(result.dateRight).toBeLessThanOrEqual(result.modalRight - 14);
  for (const control of result.controls) {
    expect(control.align, control.id).toBe('center');
    expect(control.left, control.id).toBeGreaterThanOrEqual(result.modalLeft + 14);
    expect(control.right, control.id).toBeLessThanOrEqual(result.modalRight - 14);
    expect(control.height, control.id).toBeLessThanOrEqual(52);
  }
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
    window.renderStudents?.();
    const filter = document.getElementById('crmTeacherFilter');
    const rect = filter?.getBoundingClientRect() || { left: -1, right: innerWidth + 1 };
    return { exists: !!filter, left: rect.left, right: rect.right, width: innerWidth };
  });
  expect(result.exists).toBe(true);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width);
});

test('lesson report dialog scrolls independently for every role and viewport', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  for (const role of ['owner', 'branch_manager', 'teacher']) {
    const result = await page.evaluate(currentRole => {
      document.body.classList.remove('auth-locked', 'teacher-cloud-role', 'branch-manager-cloud-role');
      document.body.classList.toggle('teacher-cloud-role', currentRole === 'teacher');
      document.body.classList.toggle('branch-manager-cloud-role', currentRole === 'branch_manager');
      document.body.dataset.cloudRole = currentRole;
      document.body.dataset.roleUx = currentRole;
      const backdrop = document.getElementById('teacherReportModal');
      const dialog = backdrop.querySelector('.modal');
      backdrop.classList.add('show');
      const style = getComputedStyle(dialog);
      const rect = dialog.getBoundingClientRect();
      const output = { overflowY: style.overflowY, top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight };
      backdrop.classList.remove('show');
      return output;
    }, role);
    expect(['auto', 'scroll']).toContain(result.overflowY);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
  }
});

test('lesson editor scrolls independently above the mobile navigation', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    const backdrop = document.getElementById('lessonModal');
    const dialog = backdrop.querySelector('.modal');
    backdrop.classList.add('show');
    const style = getComputedStyle(dialog);
    const backdropStyle = getComputedStyle(backdrop);
    const rect = dialog.getBoundingClientRect();
    const nav = document.querySelector('nav');
    return {
      overflowY: style.overflowY,
      touchAction: style.touchAction,
      backdropOverflow: backdropStyle.overflowY,
      modalZ: Number(backdropStyle.zIndex),
      navZ: nav ? Number(getComputedStyle(nav).zIndex) : 0,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: innerHeight
    };
  });
  expect(['auto', 'scroll']).toContain(result.overflowY);
  expect(result.touchAction).toContain('pan-y');
  expect(result.backdropOverflow).toBe('hidden');
  expect(result.modalZ).toBeGreaterThan(result.navZ);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
});

test('owner metric grids and numeric fields stay centered', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.dataset.cloudRole = 'owner';
    const metric = document.querySelector('.metric');
    const number = document.getElementById('studentRate');
    return {
      metricAlign: metric ? getComputedStyle(metric).textAlign : '',
      metricItems: metric ? getComputedStyle(metric).alignItems : '',
      numberAlign: number ? getComputedStyle(number).textAlign : ''
    };
  });
  expect(result.metricAlign).toBe('center');
  expect(result.metricItems).toBe('center');
  expect(result.numberAlign).toBe('center');
});

test('mobile lesson dates, record month and form controls use consistent typography', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    const lessonDate = document.getElementById('lessonDate');
    const lessonMonth = document.getElementById('lessonMonth');
    const label = document.querySelector('#lessonModal label');
    const input = document.getElementById('lessonTitle');
    const button = document.querySelector('#lessonModal .btn');
    const color = document.getElementById('teacherColor');
    return {
      dateAlign: getComputedStyle(lessonDate).textAlign,
      monthAlign: getComputedStyle(lessonMonth).textAlign,
      labelWeight: getComputedStyle(label).fontWeight,
      inputWeight: getComputedStyle(input).fontWeight,
      buttonWeight: getComputedStyle(button).fontWeight,
      inputSize: getComputedStyle(input).fontSize,
      buttonSize: getComputedStyle(button).fontSize,
      colorWidth: color.getBoundingClientRect().width,
      viewportWidth: innerWidth
    };
  });
  expect(result.dateAlign).toBe('center');
  expect(result.monthAlign).toBe('center');
  if (result.viewportWidth <= 700) {
    expect(result.labelWeight).toBe('700');
    expect(result.inputWeight).toBe('700');
    expect(result.buttonWeight).toBe('700');
    expect(result.inputSize).toBe(result.buttonSize);
  }
  expect(result.colorWidth).toBeLessThanOrEqual(70);
});

test('all workspaces use the unified responsive control system', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    const sections = [...document.querySelectorAll('main section')];
    const problems = [];
    const expectedFieldHeight = 44;
    const expectedButtonHeight = 44;
    for (const section of sections) {
      sections.forEach(item => item.classList.toggle('active', item === section));
      const controls = section.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="hidden"]),select,textarea');
      for (const control of controls) {
        const style = getComputedStyle(control);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = control.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cssHeight = parseFloat(style.height);
        if (cssHeight + 1 < expectedFieldHeight || rect.right > innerWidth + 1 || rect.left < -1) problems.push(`${section.id}:${control.id || control.tagName}:field:h${Math.round(cssHeight)}:l${Math.round(rect.left)}:r${Math.round(rect.right)}:vw${innerWidth}`);
      }
      for (const button of section.querySelectorAll('.btn')) {
        const style = getComputedStyle(button);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cssMinHeight = parseFloat(style.minHeight);
        if (cssMinHeight + 1 < expectedButtonHeight || rect.right > innerWidth + 1 || rect.left < -1) problems.push(`${section.id}:${button.id || button.textContent.trim().slice(0,20)}:button:h${Math.round(cssMinHeight)}:l${Math.round(rect.left)}:r${Math.round(rect.right)}:vw${innerWidth}`);
      }
    }
    return {
      problems,
      expectedFieldHeight,
      expectedButtonHeight,
      premiumSheet: [...document.styleSheets].find(sheet => sheet.href?.includes('78-v20259'))?.href || ''
    };
  });
  expect(result.premiumSheet).toContain('78-v20259-premium-responsive-controls.css');
  expect(result.problems).toEqual([]);
});

test('winter and summer registration month stays inside its card', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    const camps = document.getElementById('camps');
    camps.classList.add('active');
    const month = document.getElementById('summerRegistrationMonth');
    const card = month.parentElement;
    const label = card.querySelector(':scope > label');
    const cardRect = card.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const monthRect = month.getBoundingClientRect();
    const style = getComputedStyle(card);
    return {
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      labelLeft: labelRect.left,
      labelTop: labelRect.top,
      labelBottom: labelRect.bottom,
      monthLeft: monthRect.left,
      monthRight: monthRect.right,
      monthBottom: monthRect.bottom,
      paddingLeft: parseFloat(style.paddingLeft),
      paddingTop: parseFloat(style.paddingTop),
      monthAlign: getComputedStyle(month).textAlign
    };
  });
  expect(result.paddingLeft).toBeGreaterThanOrEqual(14);
  expect(result.paddingTop).toBeGreaterThanOrEqual(14);
  expect(result.labelLeft).toBeGreaterThanOrEqual(result.cardLeft + 13);
  expect(result.labelTop).toBeGreaterThanOrEqual(result.cardTop + 13);
  expect(result.labelBottom).toBeLessThan(result.monthBottom);
  expect(result.monthLeft).toBeGreaterThanOrEqual(result.cardLeft + 13);
  expect(result.monthRight).toBeLessThanOrEqual(result.cardRight - 13);
  expect(result.monthBottom).toBeLessThanOrEqual(result.cardBottom - 13);
  expect(result.monthAlign).toBe('center');
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
