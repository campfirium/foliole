import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_FILE_PATH = 'D:\\T\\test\\GTD 项目管理方法.md';
const HIGHLIGHT_FILE_PATH = 'D:\\T\\test\\GTD 项目管理方法-highlight.md';
const PROMPT_EDITOR_DEBUG_ID = 'prompt-editor';

interface ImportedHighlightNode {
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
  parentTitle: string;
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

async function reloadWorkspace(desktopWindow: Page) {
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
}

async function importRealMergedHighlights(desktopApp: ElectronApplication, desktopWindow: Page): Promise<ImportedWorkspaceState> {
  const parentId = await runRealImportAndMerge(desktopApp, desktopWindow);
  await reloadWorkspace(desktopWindow);
  return desktopWindow.evaluate(async (resolvedParentId) => {
    const snapshot = await globalThis.window?.electronAPI?.invoke('load_workspace_snapshot', {});
    const nodesById =
      snapshot && typeof snapshot === 'object' && snapshot.nodesById && typeof snapshot.nodesById === 'object'
        ? (snapshot.nodesById as Record<string, Record<string, unknown>>)
        : {};
    const nodeOrder =
      snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.nodeOrder)
        ? (snapshot.nodeOrder as string[])
        : [];
    const parent = nodesById[resolvedParentId];
    if (!parent || typeof parent.title !== 'string') {
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
          typeof node.title === 'string'
      )
      .slice(0, 4)
      .map((node) => {
        const anchorLink = (node.anchorLink ?? null) as { locator?: Record<string, unknown> } | null;
        const locator = anchorLink?.locator;
        return {
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
      parentId: resolvedParentId,
      parentTitle: String(parent.title)
    };
  }, parentId);
}

async function openNodeThroughDebugBridge(desktopWindow: Page, nodeId: string) {
  await desktopWindow.evaluate(async (targetNodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId);
  }, nodeId);
}

async function collectPromptEditorSelection(desktopWindow: Page) {
  return desktopWindow.evaluate((debugId) => {
    const debugApi = globalThis.window?.__folioleDebug;
    const content = debugApi?.getEditorContent?.(debugId) ?? '';
    const selection = debugApi?.getEditorSelection?.(debugId) ?? null;
    return {
      selection,
      selectedText:
        selection && typeof selection.from === 'number' && typeof selection.to === 'number'
          ? content.slice(selection.from, selection.to)
          : ''
    };
  }, PROMPT_EDITOR_DEBUG_ID);
}

async function collectPanelJumpDebug(desktopWindow: Page, args: { childId: string; parentId: string }) {
  return desktopWindow.evaluate(({ childId, parentId, debugId }) => {
    const workspace = globalThis.window?.__folioleWorkspaceDebug;
    const debugApi = globalThis.window?.__folioleDebug;
    return {
      activeNodeId: workspace?.getActiveNodeId?.() ?? null,
      childNode: workspace?.getNode?.(childId) ?? null,
      parentViewState: workspace?.getNodeViewState?.(parentId) ?? null,
      promptSelection: debugApi?.getEditorSelection?.(debugId) ?? null,
      sidebarButtons: Array.from(document.querySelectorAll('[aria-label="Document highlights"] button'))
        .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean),
      traces:
        debugApi
          ?.getTraces?.()
          ?.filter((entry) => {
            const event = typeof entry?.event === 'string' ? entry.event : '';
            return event.includes('reading') || event.includes('restore-selection') || event.includes('reveal-anchor');
          })
          .slice(-40) ?? []
    };
  }, { ...args, debugId: PROMPT_EDITOR_DEBUG_ID });
}

test('merged highlights panel jumps to the imported highlight range inside the current parent document', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const importedWorkspace = await importRealMergedHighlights(desktopApp, desktopWindow);
  expect(importedWorkspace.childNodes.length).toBeGreaterThan(0);
  const targetChild = importedWorkspace.childNodes.find((node) => node.locator);
  expect(targetChild?.locator).not.toBeNull();
  if (!targetChild?.locator) {
    throw new Error('missing imported text locator child');
  }

  await openNodeThroughDebugBridge(desktopWindow, importedWorkspace.parentId);
  await expect(desktopWindow.getByRole('button', { name: importedWorkspace.parentTitle, exact: true })).toBeVisible();
  await desktopWindow.getByRole('button', { name: 'Highlights panel' }).click();

  const debugState = await collectPanelJumpDebug(desktopWindow, {
    childId: targetChild.id,
    parentId: importedWorkspace.parentId
  });
  const targetButtonLabel = debugState.sidebarButtons.find((label) => label.includes(targetChild.title)) ?? null;
  console.log('merged-highlights-panel-jump-debug', JSON.stringify(debugState));
  await testInfo.attach('merged-highlights-panel-jump-debug', {
    body: JSON.stringify(debugState, null, 2),
    contentType: 'application/json'
  });
  expect(targetButtonLabel).not.toBeNull();
  if (!targetButtonLabel) {
    throw new Error(`missing sidebar button for ${targetChild.title}`);
  }

  await desktopWindow.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('[aria-label="Document highlights"] button')).find((node) => {
      return (node.textContent ?? '').replace(/\s+/g, ' ').trim() === label;
    }) as HTMLButtonElement | undefined;
    if (!button) {
      throw new Error(`missing sidebar button ${label}`);
    }
    button.click();
  }, targetButtonLabel);

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for imported highlights panel jump to land on the target text range'
  }).toMatchObject({
    selection: {
      from: targetChild.locator.from,
      to: targetChild.locator.to
    }
  });
});
