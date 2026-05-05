import { writeFile } from 'node:fs/promises';

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

import { test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

type ElementDiagnostics = {
  backgroundColor: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
  className: string;
  exists: boolean;
  opacity: string;
  pointerEvents: string;
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  } | null;
  tagName: string | null;
  zIndex: string;
};

type SettingsLayoutDiagnostics = {
  centerElement: {
    className: string;
    tagName: string | null;
    text: string;
  };
  content: ElementDiagnostics;
  dialog: ElementDiagnostics;
  header: ElementDiagnostics;
  overlay: ElementDiagnostics;
  sidebar: ElementDiagnostics;
  sidebarSurface: ElementDiagnostics;
  viewport: {
    height: number;
    width: number;
  };
};

async function readElementDiagnostics(locator: Locator): Promise<ElementDiagnostics> {
  if ((await locator.count()) === 0) {
    return {
      backgroundColor: '',
      borderColor: '',
      borderRadius: '',
      boxShadow: '',
      className: '',
      exists: false,
      opacity: '',
      pointerEvents: '',
      rect: null,
      tagName: null,
      zIndex: ''
    };
  }

  return locator.first().evaluate((element) => {
    const roundRect = (rect: DOMRect | null) => {
      if (!rect) {
        return null;
      }
      return {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.x),
        y: Math.round(rect.y)
      };
    };

    if (!(element instanceof HTMLElement)) {
      return {
        backgroundColor: '',
        borderColor: '',
        borderRadius: '',
        boxShadow: '',
        className: '',
        exists: false,
        opacity: '',
        pointerEvents: '',
        rect: null,
        tagName: null,
        zIndex: ''
      };
    }

    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      className: element.className,
      exists: true,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      rect: roundRect(element.getBoundingClientRect()),
      tagName: element.tagName,
      zIndex: style.zIndex
    };
  });
}

async function readCenterElement(page: Page) {
  return page.evaluate(() => {
    const centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return {
      className: centerElement instanceof HTMLElement ? centerElement.className : '',
      tagName: centerElement instanceof HTMLElement ? centerElement.tagName : null,
      text: centerElement?.textContent?.slice(0, 120) ?? ''
    };
  });
}

async function collectSettingsLayoutDiagnostics(page: Page, dialog: Locator): Promise<SettingsLayoutDiagnostics> {
  const overlay = page.locator('[aria-label="Settings"][role="presentation"]');
  const sidebar = page.getByLabel('Settings categories');
  const sidebarSurface = sidebar.locator(':scope > div').first();
  const content = dialog.locator(':scope > div').last();
  const header = content.locator('header').first();

  return {
    centerElement: await readCenterElement(page),
    content: await readElementDiagnostics(content),
    dialog: await readElementDiagnostics(dialog),
    header: await readElementDiagnostics(header),
    overlay: await readElementDiagnostics(overlay),
    sidebar: await readElementDiagnostics(sidebar),
    sidebarSurface: await readElementDiagnostics(sidebarSurface),
    viewport: await page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth
    }))
  };
}

async function saveDiagnosticsArtifacts(
  testInfo: TestInfo,
  page: Page,
  dialog: Locator,
  diagnostics: SettingsLayoutDiagnostics
) {
  const diagnosticsJson = JSON.stringify(diagnostics, null, 2);
  await testInfo.attach('settings-layout-diagnostics', {
    body: diagnosticsJson,
    contentType: 'application/json'
  });
  await writeFile(testInfo.outputPath('settings-layout-diagnostics.json'), diagnosticsJson);
  await page.screenshot({
    path: testInfo.outputPath('settings-panel-window.png'),
    fullPage: true
  });
  await dialog.screenshot({
    path: testInfo.outputPath('settings-panel-layout.png')
  });
}

function assertSettingsLayoutDiagnostics(diagnostics: SettingsLayoutDiagnostics) {
  expect(diagnostics.dialog.exists).toBe(true);
  expect(diagnostics.overlay.exists).toBe(true);
  expect(diagnostics.sidebar.exists).toBe(true);
  expect(diagnostics.sidebarSurface.exists).toBe(true);
  expect(diagnostics.dialog.className).toContain('bg-settings-shell');
  expect(diagnostics.dialog.className).toContain('border-settings-outline');
  expect(diagnostics.dialog.className).toContain('shadow-settings');
  expect(diagnostics.dialog.className).toContain('rounded-2xl');
  expect(diagnostics.content.className).toContain('bg-settings-shell');
  expect(diagnostics.header.className).toContain('border-settings-divider');
  expect(diagnostics.sidebarSurface.className).toContain('bg-settings-sidebar');
  expect(diagnostics.sidebarSurface.className).toContain('border-settings-outline');
  expect(diagnostics.dialog.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(diagnostics.content.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(diagnostics.sidebarSurface.backgroundColor).toBe('rgb(246, 246, 244)');
  expect(diagnostics.centerElement.className).toContain('app-scrollbar');
  expect(diagnostics.dialog.rect?.width).toBeGreaterThan(1100);
  expect(diagnostics.dialog.rect?.x).toBeGreaterThan(150);
  expect(diagnostics.dialog.rect?.y).toBeGreaterThan(50);
}

test('collects settings panel layout diagnostics', async ({ desktopWindow }, testInfo) => {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: 'Editor' }).click();
  await desktopWindow.waitForTimeout(250);

  const diagnostics = await collectSettingsLayoutDiagnostics(desktopWindow, dialog);

  await saveDiagnosticsArtifacts(testInfo, desktopWindow, dialog, diagnostics);
  assertSettingsLayoutDiagnostics(diagnostics);
});
