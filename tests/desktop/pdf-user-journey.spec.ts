import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/pdf-user-journey.pdf'
);
const INVALID_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/pdf-invalid-user-journey.pdf'
);
const FIRST_PAGE_TEXT = 'Foliole PDF User Journey Page 1 alpha keyword';
const SECOND_PAGE_TEXT = 'Foliole PDF User Journey Page 2 beta keyword';
const THIRD_PAGE_TEXT = 'Foliole PDF User Journey Page 3 gamma keyword';
const PDF_PAGE_INPUT_NAME = /PDF page|PDF 页码/;
const PDF_SEARCH_INPUT_NAME = /PDF search|PDF 搜索/;
const ZOOM_IN_NAME = /Zoom in|放大/;
const ZOOM_VALUE_NAME = /Set zoom level|设置缩放级别/;
const PDF_HIGHLIGHT_TEXT = 'gamma keyword';

async function installPdfFixtureSelection(desktopApp: ElectronApplication, fixturePath = FIXTURE_PATH) {
  await desktopApp.evaluate(({ dialog }, selectedFixturePath) => {
    const target = globalThis as typeof globalThis & {
      __foliolePdfJourneyOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (!target.__foliolePdfJourneyOriginalShowOpenDialog) {
      target.__foliolePdfJourneyOriginalShowOpenDialog = dialog.showOpenDialog;
    }
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedFixturePath]
    });
  }, fixturePath);
}

async function restorePdfFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }) => {
    const target = globalThis as typeof globalThis & {
      __foliolePdfJourneyOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (target.__foliolePdfJourneyOriginalShowOpenDialog) {
      dialog.showOpenDialog = target.__foliolePdfJourneyOriginalShowOpenDialog;
      delete target.__foliolePdfJourneyOriginalShowOpenDialog;
    }
  });
}

async function importPdfThroughRuntime(desktopApp: ElectronApplication, desktopWindow: Page, fixturePath = FIXTURE_PATH) {
  await installPdfFixtureSelection(desktopApp, fixturePath);
  try {
    const importResult = await desktopWindow.evaluate(async () => {
      return globalThis.window?.electronAPI?.invoke('run_text_file_import', {});
    });
    if (!importResult || typeof importResult !== 'object' || typeof importResult.node_id !== 'string') {
      throw new Error(`PDF import did not create a node: ${JSON.stringify(importResult)}`);
    }
    return importResult.node_id;
  } finally {
    await restorePdfFixtureSelection(desktopApp);
  }
}

async function expectWorkspaceReady(desktopWindow: Page) {
  await expect(desktopWindow.locator('main[aria-label]').first()).toBeVisible();
}

function getPdfReaderRegion(desktopWindow: Page) {
  return desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ });
}

async function openImportedPdf(desktopWindow: Page, nodeId: string) {
  const opened = await desktopWindow.evaluate(async (targetNodeId) => {
    return globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId) ?? false;
  }, nodeId);
  expect(opened).toBe(true);
  await expect.poll(() => desktopWindow.evaluate(() => {
    return globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
  })).toBe(nodeId);
}

async function expectPdfPageReady(desktopWindow: Page, pageNumber: number) {
  const expectedText = pageNumber === 1 ? FIRST_PAGE_TEXT : pageNumber === 2 ? SECOND_PAGE_TEXT : THIRD_PAGE_TEXT;
  await expect(getPdfReaderRegion(desktopWindow)).toContainText(expectedText);
}

async function jumpToPdfPage(desktopWindow: Page, pageNumber: number) {
  const pageInput = desktopWindow.getByRole('textbox', { name: PDF_PAGE_INPUT_NAME });
  await pageInput.fill(String(pageNumber));
  await pageInput.press('Enter');
  await expect(pageInput).toHaveValue(String(pageNumber));
  await expectPdfPageReady(desktopWindow, pageNumber);
}

async function collectPdfViewState(desktopWindow: Page, nodeId: string) {
  return desktopWindow.evaluate((targetNodeId) => {
    return globalThis.window?.__folioleWorkspaceDebug?.getNodeViewState?.(targetNodeId) ?? null;
  }, nodeId);
}

async function createPdfHighlightChild(desktopWindow: Page, parentNodeId: string) {
  const highlightNodeId = await desktopWindow.evaluate(async ({ parentNodeId: targetParentNodeId, text }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.createTextHighlightChild?.({
      anchorId: 'playwright-pdf-highlight',
      anchorLink: {
        id: 'playwright-pdf-highlight',
        kind: 'highlight',
        locator: {
          page: 3,
          rects: [{ height: 0.045, width: 0.28, x: 0.12, y: 0.18 }],
          x: 0.26,
          y: 0.2
        }
      },
      parentNodeId: targetParentNodeId,
      text
    }) ?? null;
  }, { parentNodeId, text: PDF_HIGHLIGHT_TEXT });
  expect(typeof highlightNodeId).toBe('string');
  return highlightNodeId;
}

test('PDF user journey @pdf imports, reads, searches, zooms, and restores page state', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceReady(desktopWindow);

  const importedNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openImportedPdf(desktopWindow, importedNodeId);
  await expect(getPdfReaderRegion(desktopWindow)).toBeVisible();
  await expectPdfPageReady(desktopWindow, 1);
  await expect(getPdfReaderRegion(desktopWindow).getByText('/ 3').first()).toBeVisible();

  await jumpToPdfPage(desktopWindow, 2);
  await expect.poll(() => collectPdfViewState(desktopWindow, importedNodeId)).toMatchObject({
    selection: { from: 2, to: 0 }
  });

  await desktopWindow.getByRole('textbox', { name: PDF_SEARCH_INPUT_NAME }).fill('gamma keyword');
  await expect(desktopWindow.getByText('1 / 1')).toBeVisible();

  await desktopWindow.getByRole('button', { name: ZOOM_IN_NAME }).click();
  await desktopWindow.getByRole('button', { name: ZOOM_VALUE_NAME }).click();
  await desktopWindow.getByRole('menuitem', { name: '150%' }).click();
  await expect(desktopWindow.getByRole('button', { name: ZOOM_VALUE_NAME })).toHaveText('150%');

  await desktopWindow.reload();
  await expectWorkspaceReady(desktopWindow);
  await openImportedPdf(desktopWindow, importedNodeId);
  await expect(desktopWindow.getByRole('textbox', { name: PDF_PAGE_INPUT_NAME })).toHaveValue('2');
  await expectPdfPageReady(desktopWindow, 2);
});

test('PDF inverted dark mode @pdf crops rendered page side gutters', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceReady(desktopWindow);

  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-base-color', 'dark');
    window.localStorage.setItem('foliole-pdf-reading-mode', 'inverted');
    document.documentElement.dataset.resolvedBaseColor = 'dark';
    document.documentElement.dataset.pdfReadingMode = 'inverted';
  });

  const importedNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openImportedPdf(desktopWindow, importedNodeId);
  await expectPdfPageReady(desktopWindow, 1);

  const cropMetrics = await desktopWindow.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]');
    const cropFrame = shell?.querySelector<HTMLElement>('[data-testid="pdf-document-page-crop-frame"]') ?? null;
    const cropContent = shell?.querySelector<HTMLElement>('.pdf-document-page-crop-content') ?? null;
    const page = shell?.querySelector<HTMLElement>('.react-pdf__Page') ?? null;
    const canvas = page?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    if (!cropFrame || !cropContent || !page || !canvas) {
      return null;
    }
    const frameWidth = cropFrame.getBoundingClientRect().width;
    const pageWidth = page.getBoundingClientRect().width;
    const canvasWidth = canvas.getBoundingClientRect().width;
    const marginLeft = Number.parseFloat(cropContent.style.marginLeft || '0');
    if (frameWidth > 0 && pageWidth > 0 && canvasWidth > 0 && frameWidth < pageWidth - 0.5 && marginLeft < 0) {
      return { canvasWidth, frameWidth, marginLeft, pageWidth };
    }
    return null;
  });

  const metrics = await cropMetrics.jsonValue();
  expect(metrics).toMatchObject({
    marginLeft: expect.any(Number)
  });
});

test('PDF highlight journey @pdf shows a saved highlight marker and child highlight row', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceReady(desktopWindow);

  const importedNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openImportedPdf(desktopWindow, importedNodeId);
  await createPdfHighlightChild(desktopWindow, importedNodeId);
  await jumpToPdfPage(desktopWindow, 3);

  await expect(getPdfReaderRegion(desktopWindow).getByTestId('pdf-highlight-rect').first()).toBeVisible();
  await expect(desktopWindow.getByRole('treeitem', { name: PDF_HIGHLIGHT_TEXT })).toBeVisible();
});

test('PDF error journey @pdf shows an unavailable state for an invalid PDF', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceReady(desktopWindow);

  const importedNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow, INVALID_FIXTURE_PATH);
  await openImportedPdf(desktopWindow, importedNodeId);

  await expect(getPdfReaderRegion(desktopWindow)).toContainText(/PDF preview unavailable|PDF 预览不可用/);
});

test('PDF switching journey @pdf keeps page state isolated between imported PDFs', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceReady(desktopWindow);

  const firstNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  const secondNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);

  await openImportedPdf(desktopWindow, firstNodeId);
  await jumpToPdfPage(desktopWindow, 2);
  await expect.poll(() => collectPdfViewState(desktopWindow, firstNodeId)).toMatchObject({
    selection: { from: 2, to: 0 }
  });

  await openImportedPdf(desktopWindow, secondNodeId);
  await expect(desktopWindow.getByRole('textbox', { name: PDF_PAGE_INPUT_NAME })).toHaveValue('1');
  await jumpToPdfPage(desktopWindow, 3);
  await expect.poll(() => collectPdfViewState(desktopWindow, secondNodeId)).toMatchObject({
    selection: { from: 3, to: 0 }
  });

  await openImportedPdf(desktopWindow, firstNodeId);
  await expect(desktopWindow.getByRole('textbox', { name: PDF_PAGE_INPUT_NAME })).toHaveValue('2');
});
