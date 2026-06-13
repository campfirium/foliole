import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/pdf-user-journey.pdf'
);
const FIRST_PAGE_TEXT = 'Foliole PDF User Journey Page 1 alpha keyword';
const SETTINGS_NAME = /^(Settings|设置)$/;
const APPEARANCE_NAME = /^(Appearance|外观)$/;
const COLOR_MODE_NAME = /^(Mode|模式)$/;
const PDF_DARK_MODE_NAME = /^(PDF in dark mode|深色模式下的 PDF)$/;
const TOGGLE_THEME_NAME = /^(Toggle Light\/Dark Mode|切换浅色\/深色模式)$/;

async function installPdfFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    const target = globalThis as typeof globalThis & {
      __foliolePdfAppearanceOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    target.__foliolePdfAppearanceOriginalShowOpenDialog ??= dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  }, FIXTURE_PATH);
}

async function importPdfThroughRuntime(desktopApp: ElectronApplication, desktopWindow: Page) {
  await installPdfFixtureSelection(desktopApp);
  const importResult = await desktopWindow.evaluate(async () => {
    return globalThis.window?.electronAPI?.invoke('run_text_file_import', {});
  });
  expect(importResult).toMatchObject({ node_id: expect.any(String) });
  return (importResult as { node_id: string }).node_id;
}

async function openImportedPdf(desktopWindow: Page, nodeId: string) {
  const opened = await desktopWindow.evaluate(async (targetNodeId) => {
    return globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId) ?? false;
  }, nodeId);
  expect(opened).toBe(true);
}

async function openAppearanceSettings(desktopWindow: Page) {
  await desktopWindow.getByRole('button', { name: SETTINGS_NAME }).click();
  await desktopWindow.getByRole('button', { name: APPEARANCE_NAME }).click();
  await expect(desktopWindow.getByRole('radiogroup', { name: COLOR_MODE_NAME })).toBeVisible();
}

async function reloadWithDarkInvertedPreference(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-base-color', 'dark');
    window.localStorage.setItem('foliole-pdf-reading-mode', 'inverted');
  });
  await desktopWindow.reload();
  await expect(desktopWindow.locator('main[aria-label]').first()).toBeVisible();
}

async function chooseRadio(desktopWindow: Page, groupName: RegExp, optionName: RegExp) {
  await desktopWindow.getByRole('radiogroup', { name: groupName }).getByRole('radio', { name: optionName }).click();
}

async function collectPdfModeMetrics(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const root = document.documentElement;
    const cropContent = document.querySelector<HTMLElement>('.pdf-document-page-crop-content');
    const cropFrame = document.querySelector<HTMLElement>('[data-testid="pdf-document-page-crop-frame"]');
    const page = document.querySelector<HTMLElement>('.react-pdf__Page');
    const canvas = page?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    const surface = document.querySelector<HTMLElement>('.pdf-document-surface');
    const scrollContainer = document.querySelector<HTMLElement>('.pdf-document-scroll-container');
    const topicRegion = document.querySelector<HTMLElement>('.workspace-region-main-topic');
    const pageStyle = page ? getComputedStyle(page) : null;
    const scrollStyle = scrollContainer ? getComputedStyle(scrollContainer) : null;
    const rootStyle = getComputedStyle(root);
    const resolveCssColor = (value: string) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    };
    return {
      cropFrameWidth: cropFrame?.getBoundingClientRect().width ?? null,
      cropMarginLeft: Number.parseFloat(cropContent?.style.marginLeft || '0'),
      canvasWidth: canvas?.getBoundingClientRect().width ?? null,
      documentSurfaceToken: resolveCssColor(rootStyle.getPropertyValue('--workspace-region-main-document-bg').trim()),
      pageBackground: pageStyle?.backgroundColor ?? null,
      pageFilter: pageStyle?.filter ?? null,
      pageWidth: page?.getBoundingClientRect().width ?? null,
      pdfReadingMode: root.dataset.pdfReadingMode ?? null,
      resolvedBaseColor: root.dataset.resolvedBaseColor ?? null,
      scrollBackground: scrollStyle?.backgroundColor ?? null,
      scrollbarColor: scrollStyle?.scrollbarColor ?? null,
      surfaceBackground: surface ? getComputedStyle(surface).backgroundColor : null,
      topicBackground: topicRegion ? getComputedStyle(topicRegion).backgroundColor : null
    };
  });
}

async function waitForPdfModeMetrics(desktopWindow: Page, expected: { pdfReadingMode: string; resolvedBaseColor: string }) {
  await expect.poll(() => collectPdfModeMetrics(desktopWindow), { timeout: 5000 }).toMatchObject(expected);
  return collectPdfModeMetrics(desktopWindow);
}

function readColorLuminance(color: string | null) {
  const rgb = color?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]);
  }
  const srgb = color?.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (srgb) {
    return 255 * (0.2126 * Number(srgb[1]) + 0.7152 * Number(srgb[2]) + 0.0722 * Number(srgb[3]));
  }
  return Number.NaN;
}

test('PDF dark inverted mode @pdf follows live appearance mode switches', async ({
  desktopApp,
  desktopWindow
}) => {
  await expect(desktopWindow.locator('main[aria-label]').first()).toBeVisible();

  const importedNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openImportedPdf(desktopWindow, importedNodeId);
  await expect(desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ })).toContainText(FIRST_PAGE_TEXT);

  await openAppearanceSettings(desktopWindow);
  await chooseRadio(desktopWindow, COLOR_MODE_NAME, /Dark|深色/);
  await chooseRadio(desktopWindow, PDF_DARK_MODE_NAME, /Inverted|反色/);
  const darkMetrics = await waitForPdfModeMetrics(desktopWindow, {
    pdfReadingMode: 'inverted',
    resolvedBaseColor: 'dark'
  });
  expect(darkMetrics.pageBackground).toBe('rgb(255, 255, 255)');
  expect(darkMetrics.pageFilter).toContain('invert(');
  expect(darkMetrics.scrollBackground).toBe(darkMetrics.surfaceBackground);
  expect(darkMetrics.scrollbarColor).toContain(darkMetrics.surfaceBackground ?? '');
  expect(darkMetrics.surfaceBackground).not.toBe('rgb(244, 244, 244)');
  expect(darkMetrics.cropFrameWidth).toBeLessThan((darkMetrics.pageWidth ?? 0) - 0.5);
  expect(darkMetrics.cropFrameWidth).toBeLessThan((darkMetrics.canvasWidth ?? 0) - 0.5);
  expect(darkMetrics.cropMarginLeft).toBeLessThan(0);

  await chooseRadio(desktopWindow, COLOR_MODE_NAME, /Light|浅色/);
  const lightMetrics = await waitForPdfModeMetrics(desktopWindow, {
    pdfReadingMode: 'original',
    resolvedBaseColor: 'light'
  });
  expect(lightMetrics.pageBackground).toBe('rgb(255, 255, 255)');
  expect(lightMetrics.pageFilter).toBe('none');
  expect(lightMetrics.scrollBackground).toBe(lightMetrics.surfaceBackground);
  expect(lightMetrics.surfaceBackground).not.toBe(darkMetrics.surfaceBackground);

  await chooseRadio(desktopWindow, COLOR_MODE_NAME, /Dark|深色/);
  const restoredDarkMetrics = await waitForPdfModeMetrics(desktopWindow, {
    pdfReadingMode: 'inverted',
    resolvedBaseColor: 'dark'
  });
  expect(restoredDarkMetrics.pageBackground).toBe('rgb(255, 255, 255)');
  expect(restoredDarkMetrics.pageFilter).toContain('invert(');
  expect(restoredDarkMetrics.scrollBackground).toBe(restoredDarkMetrics.surfaceBackground);
  expect(restoredDarkMetrics.scrollbarColor).toContain(restoredDarkMetrics.surfaceBackground ?? '');
  expect(restoredDarkMetrics.surfaceBackground).toBe(darkMetrics.surfaceBackground);
  expect(restoredDarkMetrics.cropFrameWidth).toBeLessThan((restoredDarkMetrics.pageWidth ?? 0) - 0.5);
  expect(restoredDarkMetrics.cropFrameWidth).toBeLessThan((restoredDarkMetrics.canvasWidth ?? 0) - 0.5);
  expect(restoredDarkMetrics.cropMarginLeft).toBeLessThan(0);
});

test('PDF background @pdf follows the rail light and dark toggle immediately', async ({
  desktopApp,
  desktopWindow
}) => {
  await expect(desktopWindow.locator('main[aria-label]').first()).toBeVisible();
  await reloadWithDarkInvertedPreference(desktopWindow);

  const importedNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openImportedPdf(desktopWindow, importedNodeId);
  await expect(desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ })).toContainText(FIRST_PAGE_TEXT);

  const initialDarkMetrics = await waitForPdfModeMetrics(desktopWindow, {
    pdfReadingMode: 'inverted',
    resolvedBaseColor: 'dark'
  });
  expect(readColorLuminance(initialDarkMetrics.surfaceBackground)).toBeLessThan(90);

  await desktopWindow.getByRole('button', { name: TOGGLE_THEME_NAME }).click();
  const restoredLightMetrics = await waitForPdfModeMetrics(desktopWindow, {
    pdfReadingMode: 'original',
    resolvedBaseColor: 'light'
  });
  expect(restoredLightMetrics.surfaceBackground).toBe(restoredLightMetrics.scrollBackground);
  expect(restoredLightMetrics.surfaceBackground).toBe(restoredLightMetrics.documentSurfaceToken);
  expect(readColorLuminance(restoredLightMetrics.surfaceBackground)).toBeGreaterThan(230);
  expect(restoredLightMetrics.surfaceBackground).not.toBe(initialDarkMetrics.surfaceBackground);
  expect(restoredLightMetrics.topicBackground).not.toBe(initialDarkMetrics.topicBackground);

  await desktopWindow.getByRole('button', { name: TOGGLE_THEME_NAME }).click();
  const restoredDarkMetrics = await waitForPdfModeMetrics(desktopWindow, {
    pdfReadingMode: 'inverted',
    resolvedBaseColor: 'dark'
  });
  expect(restoredDarkMetrics.surfaceBackground).toBe(restoredDarkMetrics.scrollBackground);
  expect(readColorLuminance(restoredDarkMetrics.surfaceBackground)).toBeLessThan(90);
  expect(restoredDarkMetrics.surfaceBackground).toBe(initialDarkMetrics.surfaceBackground);
});
