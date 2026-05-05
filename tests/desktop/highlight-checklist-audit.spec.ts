import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedChecklistWorkspace(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Alpha Beta Gamma Delta',
        id: 'checklist-parent',
        kind: 'topic',
        title: 'Checklist Parent'
      }
    ]);
    await api?.createTextHighlightChild?.({
      anchorId: 'checklist-highlight',
      anchorLink: {
        id: 'checklist-highlight',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 10
        }
      },
      parentNodeId: 'checklist-parent',
      text: 'Beta'
    });
    await api?.createTextClozeChild?.({
      anchorId: 'checklist-cloze',
      anchorLink: {
        id: 'checklist-cloze',
        kind: 'cloze',
        locator: {
          ranges: [
            {
              from: 0,
              originalText: 'Alpha',
              to: 5
            },
            {
              from: 11,
              originalText: 'Gamma',
              to: 16
            }
          ]
        }
      },
      answer: 'Alpha\nGamma',
      parentNodeId: 'checklist-parent',
      prompt: '[...] Beta [...] Delta'
    });
    await api?.openNode?.('checklist-parent');
  });
}

async function collectAnchorAuditState(desktopWindow: import('@playwright/test').Page) {
  return desktopWindow.evaluate(() => ({
    activeNodeId: globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
    clozeTexts: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-cloze')).map((node) => (node.textContent ?? '').trim()).filter(Boolean),
    highlightTexts: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-highlight, .prompt-editor-host .cm-md-highlight-overlap'))
      .map((node) => (node.textContent ?? '').trim())
      .filter(Boolean),
    sidebarLabels: Array.from(document.querySelectorAll('[aria-label="Document highlights"] li'))
      .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }));
}

test('soft delete and restore keep parent text anchors in sync', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedChecklistWorkspace(desktopWindow);

  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toContainText('Beta');
  let state = await collectAnchorAuditState(desktopWindow);
  expect(state.clozeTexts).toEqual(expect.arrayContaining(['Alpha', 'Gamma']));
  expect(state.activeNodeId).toBe('checklist-parent');

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const clozeNode = api?.listNodes?.().find((node) => node.title === '[...] Beta [...] Delta');
    if (!clozeNode) {
      throw new Error('missing cloze node');
    }
    await api?.deleteNode?.(clozeNode.id);
    await api?.openNode?.('checklist-parent');
  });

  state = await collectAnchorAuditState(desktopWindow);
  await testInfo.attach('text-anchor-after-soft-delete', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json'
  });
  expect(state.highlightTexts).toEqual(expect.arrayContaining(['Beta']));
  expect(state.clozeTexts).toEqual([]);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const clozeNode = api?.listNodes?.().find((node) => node.title === '[...] Beta [...] Delta');
    if (!clozeNode) {
      throw new Error('missing cloze node');
    }
    await api?.restoreNode?.(clozeNode.id);
    await api?.openNode?.('checklist-parent');
  });

  state = await collectAnchorAuditState(desktopWindow);
  await testInfo.attach('text-anchor-after-restore', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json'
  });
  expect(state.highlightTexts).toEqual(expect.arrayContaining(['Beta']));
  expect(state.clozeTexts).toEqual(expect.arrayContaining(['Alpha', 'Gamma']));
});

test('permanent delete removes text anchors from the parent document', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedChecklistWorkspace(desktopWindow);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const highlightNode = api?.listNodes?.().find((node) => node.title === 'Beta');
    const clozeNode = api?.listNodes?.().find((node) => node.title === '[...] Beta [...] Delta');
    if (!highlightNode || !clozeNode) {
      throw new Error('missing text anchor nodes');
    }
    await api?.deleteNodePermanently?.(highlightNode.id);
    await api?.deleteNodePermanently?.(clozeNode.id);
    await api?.openNode?.('checklist-parent');
  });

  const state = await collectAnchorAuditState(desktopWindow);
  await testInfo.attach('text-anchor-after-permanent-delete', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json'
  });

  expect(state.highlightTexts).toEqual([]);
  expect(state.clozeTexts).toEqual([]);
  expect(state.sidebarLabels).toEqual([]);
});
