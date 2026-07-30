import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/main-path-smoke.md'
);
const READING_LINE = 'The reading smoke line should remain visible after the imported node opens.';
const SELECTION_SCREENSHOT = path.resolve(
  '.tmp/artifacts/desktop-acceptance/immersive-reading-selection.png'
);
const NATIVE_CONTROLS_SCREENSHOT = path.resolve(
  '.tmp/artifacts/desktop-acceptance/immersive-reading-native-controls-hidden.png'
);

async function installNativeControlsVisibilitySpy(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(({ BrowserWindow }) => {
    if (process.platform !== 'darwin') return false;
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('missing main window for native-control visibility spy');
    const scope = globalThis as typeof globalThis & {
      __folioleNativeControlsVisibilitySpy?: {
        calls: boolean[];
        original: typeof window.setWindowButtonVisibility;
        window: Electron.BrowserWindow;
      };
    };
    const original = window.setWindowButtonVisibility;
    const calls: boolean[] = [];
    scope.__folioleNativeControlsVisibilitySpy = { calls, original, window };
    window.setWindowButtonVisibility = (visible) => {
      calls.push(visible);
      original.call(window, visible);
    };
    return true;
  });
}

async function readNativeControlsVisibilityCalls(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(() =>
    (globalThis as typeof globalThis & {
      __folioleNativeControlsVisibilitySpy?: { calls: boolean[] };
    }).__folioleNativeControlsVisibilitySpy?.calls ?? []);
}

async function restoreNativeControlsVisibilitySpy(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __folioleNativeControlsVisibilitySpy?: {
        original: Electron.BrowserWindow['setWindowButtonVisibility'];
        window: Electron.BrowserWindow;
      };
    };
    const state = scope.__folioleNativeControlsVisibilitySpy;
    if (!state) return;
    state.window.setWindowButtonVisibility = state.original;
    delete scope.__folioleNativeControlsVisibilitySpy;
  });
}

async function installImportFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    const target = globalThis as typeof globalThis & {
      __folioleImmersiveF11OriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (!target.__folioleImmersiveF11OriginalShowOpenDialog) {
      target.__folioleImmersiveF11OriginalShowOpenDialog = dialog.showOpenDialog;
    }
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fixturePath]
    });
  }, FIXTURE_PATH);
}

async function restoreImportFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }) => {
    const target = globalThis as typeof globalThis & {
      __folioleImmersiveF11OriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (target.__folioleImmersiveF11OriginalShowOpenDialog) {
      dialog.showOpenDialog = target.__folioleImmersiveF11OriginalShowOpenDialog;
      delete target.__folioleImmersiveF11OriginalShowOpenDialog;
    }
  });
}

async function importFixture(desktopApp: ElectronApplication, desktopWindow: Page) {
  await installImportFixtureSelection(desktopApp);
  try {
    const result = await desktopWindow.evaluate(async () => {
      return globalThis.window?.electronAPI?.invoke('run_text_file_import', {});
    });
    if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
      throw new Error(`immersive F11 import did not create a node: ${JSON.stringify(result)}`);
    }
    return result.node_id;
  } finally {
    await restoreImportFixtureSelection(desktopApp);
  }
}

async function openImportedNode(desktopWindow: Page, nodeId: string) {
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const opened = await desktopWindow.evaluate(async (targetNodeId) => {
    return globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId) ?? false;
  }, nodeId);
  expect(opened).toBe(true);
}

async function dragAcrossReadingLine(desktopWindow: Page) {
  const line = desktopWindow.locator('.prompt-editor-host .cm-line').filter({ hasText: READING_LINE }).first();
  const points = await line.evaluate((element, expectedText) => {
    const textNode = Array.from(element.childNodes).find((node) => node.textContent?.includes(expectedText));
    if (!(textNode instanceof Text)) {
      throw new Error('missing reading line text node');
    }
    const textOffset = textNode.data.indexOf(expectedText);
    const startRange = document.createRange();
    startRange.setStart(textNode, textOffset);
    startRange.setEnd(textNode, textOffset + 1);
    const endRange = document.createRange();
    endRange.setStart(textNode, textOffset + expectedText.length - 1);
    endRange.setEnd(textNode, textOffset + expectedText.length);
    const startRect = startRange.getBoundingClientRect();
    const endRect = endRange.getBoundingClientRect();
    return {
      end: { x: endRect.right - 1, y: (endRect.top + endRect.bottom) / 2 },
      start: { x: startRect.left + 1, y: (startRect.top + startRect.bottom) / 2 }
    };
  }, READING_LINE);

  await desktopWindow.mouse.move(points.start.x, points.start.y);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(points.end.x, points.end.y, { steps: 12 });
  await desktopWindow.mouse.up();
}

test('keeps F11 as immersive reading in the desktop host', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const importedNodeId = await importFixture(desktopApp, desktopWindow);
  await openImportedNode(desktopWindow, importedNodeId);

  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(READING_LINE);
  const nativeControlsSpyInstalled = await installNativeControlsVisibilitySpy(desktopApp);
  try {
    await desktopWindow.keyboard.press('F11');
    await desktopWindow.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
    await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(READING_LINE);
    await expect(desktopWindow.getByLabel('Window controls')).toHaveCount(0);
    if (nativeControlsSpyInstalled) {
      await expect.poll(() => readNativeControlsVisibilityCalls(desktopApp)).toContain(false);
    }
    await mkdir(path.dirname(NATIVE_CONTROLS_SCREENSHOT), { recursive: true });
    await desktopWindow.screenshot({ path: NATIVE_CONTROLS_SCREENSHOT });
    await testInfo.attach('immersive-reading-native-controls-hidden', {
      contentType: 'image/png',
      path: NATIVE_CONTROLS_SCREENSHOT
    });

    await desktopWindow.keyboard.press('Escape');
    if (nativeControlsSpyInstalled) {
      await expect.poll(() => readNativeControlsVisibilityCalls(desktopApp)).toContain(true);
    }
  } finally {
    await restoreNativeControlsVisibilitySpy(desktopApp);
  }
});

test('keeps an explicit text selection visible in immersive reading', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  const importedNodeId = await importFixture(desktopApp, desktopWindow);
  await openImportedNode(desktopWindow, importedNodeId);
  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(READING_LINE);

  const normalSelectionBackground = await desktopWindow.locator('.prompt-editor-host .cm-line').first()
    .evaluate((line) => getComputedStyle(line, '::selection').backgroundColor);

  await desktopWindow.keyboard.press('F11');
  await desktopWindow.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  await dragAcrossReadingLine(desktopWindow);
  await expect.poll(() => desktopWindow.evaluate(() => {
    const selection = globalThis.window?.__folioleDebug?.getEditorSelection?.('prompt-editor');
    return selection ? selection.to - selection.from : 0;
  })).toBeGreaterThan(0);
  const selectionState = await desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleDebug;
    const content = debugApi?.getEditorContent?.('prompt-editor') ?? '';
    const editor = document.querySelector('.prompt-editor-host .cm-editor') as HTMLElement | null;
    const line = document.querySelector('.prompt-editor-host .cm-line') as HTMLElement | null;
    const selection = debugApi.getEditorSelection?.('prompt-editor') ?? null;
    return {
      hasParagraphMarker: Boolean(document.querySelector('.prompt-editor-host .cm-paragraph-marker-line')),
      paragraphMarkerActive: editor?.dataset.paragraphMarkerActive ?? null,
      selectedText: selection ? content.slice(selection.from, selection.to) : '',
      selectionBackground: line ? getComputedStyle(line, '::selection').backgroundColor : null
    };
  });

  await desktopWindow.waitForTimeout(100);
  await mkdir(path.dirname(SELECTION_SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ path: SELECTION_SCREENSHOT });

  expect(selectionState).toMatchObject({
    hasParagraphMarker: true,
    paragraphMarkerActive: 'false',
    selectionBackground: normalSelectionBackground
  });
  expect(selectionState.selectedText).toContain('reading smoke line should remain visible');
  expect(selectionState.selectionBackground).not.toBe('rgba(0, 0, 0, 0)');
});
