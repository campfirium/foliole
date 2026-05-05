import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_FILE_PATH = 'D:\\T\\test\\GTD 项目管理方法.md';
const HIGHLIGHT_FILE_PATH = 'D:\\T\\test\\GTD 项目管理方法-highlight.md';
const PROMPT_EDITOR_DEBUG_ID = 'prompt-editor';

interface ImportedHighlightNode {
  content: string;
  id: string;
  locator: {
    from: number;
    originalText: string;
    to: number;
  } | null;
  title: string;
}

interface ImportedWorkspaceState {
  childNodes: ImportedHighlightNode[];
  parentId: string;
}

async function installDialogSelections(desktopApp: ElectronApplication, selections: string[]) {
  await desktopApp.evaluate(({ dialog }, filePaths) => {
    const scriptedSelections = [...filePaths];
    let selectionIndex = 0;
    const target = globalThis as typeof globalThis & {
      __folioleOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (!target.__folioleOriginalShowOpenDialog) {
      target.__folioleOriginalShowOpenDialog = dialog.showOpenDialog;
    }
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [scriptedSelections[Math.min(selectionIndex++, scriptedSelections.length - 1)]]
    });
  }, selections);
}

async function restoreDialogSelections(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }) => {
    const target = globalThis as typeof globalThis & {
      __folioleOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (target.__folioleOriginalShowOpenDialog) {
      dialog.showOpenDialog = target.__folioleOriginalShowOpenDialog;
      delete target.__folioleOriginalShowOpenDialog;
    }
  });
}

async function runRealImportAndMerge(desktopApp: ElectronApplication, desktopWindow: Page) {
  await installDialogSelections(desktopApp, [SOURCE_FILE_PATH, HIGHLIGHT_FILE_PATH]);
  try {
    const importResult = await desktopWindow.evaluate(async () => {
      return globalThis.window?.electronAPI?.invoke('run_text_file_import', {});
    });
    if (!importResult || typeof importResult !== 'object' || typeof importResult.node_id !== 'string') {
      throw new Error('parent import did not create a node');
    }

    const mergeResult = await desktopWindow.evaluate(async (nodeId) => {
      return globalThis.window?.electronAPI?.invoke('merge_readwise_topic_highlights', { node_id: nodeId });
    }, importResult.node_id);
    if (!mergeResult || typeof mergeResult !== 'object' || mergeResult.status !== 'merged') {
      throw new Error(`merge did not produce imported highlights: ${String(mergeResult?.status ?? 'unknown')}`);
    }
    return importResult.node_id;
  } finally {
    await restoreDialogSelections(desktopApp);
  }
}

async function readImportedWorkspace(desktopWindow: Page, parentId: string): Promise<ImportedWorkspaceState> {
  return desktopWindow.evaluate(async (resolvedParentId) => {
    const snapshot = await globalThis.window?.electronAPI?.invoke('load_workspace_snapshot', {});
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.activeNodeId === 'undefined') {
      throw new Error('workspace snapshot missing after import');
    }

    const nodesById =
      snapshot && typeof snapshot === 'object' && snapshot.nodesById && typeof snapshot.nodesById === 'object'
        ? (snapshot.nodesById as Record<string, Record<string, unknown>>)
        : {};
    const nodeOrder =
      snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.nodeOrder)
        ? (snapshot.nodeOrder as string[])
        : [];
    if (!nodesById[resolvedParentId]) {
      throw new Error('imported parent missing from workspace snapshot');
    }

    const childNodes = nodeOrder
      .map((nodeId) => nodesById[nodeId])
      .filter(
        (node): node is Record<string, unknown> =>
          Boolean(node) &&
          node.parentNodeId === resolvedParentId &&
          Boolean(node.anchorLink) &&
          typeof node.id === 'string' &&
          typeof node.title === 'string' &&
          typeof node.content === 'string'
      )
      .slice(0, 4)
      .map((node) => {
        const anchorLink = (node.anchorLink ?? null) as { locator?: Record<string, unknown> } | null;
        const locator = anchorLink?.locator;
        return {
          content: String(node.content),
          id: String(node.id),
          locator:
            locator &&
            typeof locator.from === 'number' &&
            typeof locator.to === 'number' &&
            typeof locator.originalText === 'string'
              ? {
                  from: locator.from,
                  originalText: locator.originalText,
                  to: locator.to
                }
              : null,
          title: String(node.title)
        };
      });

    return {
      childNodes,
      parentId: resolvedParentId
    };
  }, parentId);
}

async function importRealMergedHighlights(desktopApp: ElectronApplication, desktopWindow: Page): Promise<ImportedWorkspaceState> {
  const parentId = await runRealImportAndMerge(desktopApp, desktopWindow);
  await reloadWorkspace(desktopWindow);
  return readImportedWorkspace(desktopWindow, parentId);
}

async function reloadWorkspace(desktopWindow: Page) {
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
}

async function openNodeThroughDebugBridge(desktopWindow: Page, nodeId: string) {
  await desktopWindow.evaluate(async (targetNodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId);
  }, nodeId);
}

async function setSavedParentSelection(
  desktopWindow: Page,
  args: { from: number; nodeId: string; scrollTop?: number; to: number }
) {
  await desktopWindow.evaluate((payload) => {
    return globalThis.window?.__folioleWorkspaceDebug?.setNodeViewState?.(payload) ?? false;
  }, args);
}

async function collectPromptEditorSelection(desktopWindow: Page) {
  return desktopWindow.evaluate((debugId) => {
    const debugApi = globalThis.window?.__folioleDebug;
    const content = debugApi?.getEditorContent?.(debugId) ?? '';
    const selection = debugApi?.getEditorSelection?.(debugId) ?? null;
    return {
      content,
      selection,
      selectedText:
        selection && typeof selection.from === 'number' && typeof selection.to === 'number'
          ? content.slice(selection.from, selection.to)
          : ''
    };
  }, PROMPT_EDITOR_DEBUG_ID);
}

test('merged highlight children jump back to their own parent ranges from source info', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const importedWorkspace = await importRealMergedHighlights(desktopApp, desktopWindow);
  expect(importedWorkspace.childNodes).toHaveLength(4);

  const jumpResults: Array<{
    actualSelection: { from: number; to: number } | null;
    childId: string;
    expectedLocator: ImportedHighlightNode['locator'];
    selectedText: string;
    title: string;
  }> = [];

  for (const [index, childNode] of importedWorkspace.childNodes.entries()) {
    const previousSelection = jumpResults[jumpResults.length - 1]?.actualSelection ?? null;
    if (index > 0 && previousSelection) {
      await setSavedParentSelection(desktopWindow, {
        from: previousSelection.from,
        nodeId: importedWorkspace.parentId,
        scrollTop: Math.max(previousSelection.from - 200, 0),
        to: previousSelection.to
      });
    }

    await openNodeThroughDebugBridge(desktopWindow, childNode.id);
    await expect(desktopWindow.getByRole('button', { name: childNode.title, exact: true })).toBeVisible();

    await desktopWindow.getByRole('button', { name: 'Source info panel' }).click();
    await expect(desktopWindow.getByRole('button', { name: 'Open parent note' })).toBeVisible();
    await desktopWindow.getByRole('button', { name: 'Open parent note' }).click();

    await expect.poll(async () => {
      return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
    }).toBe(importedWorkspace.parentId);

    await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
      message: `waiting for merged child ${childNode.id} to reveal its parent range`
    }).toMatchObject({
        selection: childNode.locator
          ? {
              from: childNode.locator.from,
              to: childNode.locator.to
            }
          : null
      });

    const currentSelection = await collectPromptEditorSelection(desktopWindow);
    jumpResults.push({
      actualSelection: currentSelection.selection,
      childId: childNode.id,
      expectedLocator: childNode.locator,
      selectedText: currentSelection.selectedText,
      title: childNode.title
    });
  }

  await testInfo.attach('merged-highlight-parent-jump-results', {
    body: JSON.stringify(jumpResults, null, 2),
    contentType: 'application/json'
  });

  expect(new Set(jumpResults.map((entry) => `${entry.actualSelection?.from}:${entry.actualSelection?.to}`)).size).toBe(4);
  expect(jumpResults.every((entry) => entry.actualSelection?.from === entry.expectedLocator?.from)).toBe(true);
  expect(jumpResults.every((entry) => entry.actualSelection?.to === entry.expectedLocator?.to)).toBe(true);
});
