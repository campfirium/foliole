import { expect, test } from '../desktop/harness/fixtures';
import { expectWorkspaceShell } from '../desktop/harness/settings';

interface DualListMutationTiming {
  activeNodeId: string | null;
  clickAt: number;
  contentFirstMutationAt: number | null;
  contentMutationCount: number;
  folderFirstMutationAt: number | null;
  folderMutationCount: number;
  immediateActiveNodeId: string | null;
  rightTextAfter: string;
  rightTextBefore: string;
}

async function seedDualListTimingWorkspace(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: '', id: 'timing-folder-a', kind: 'folder', title: 'Timing Folder A' },
      { content: '', id: 'timing-folder-b', kind: 'folder', title: 'Timing Folder B' },
      {
        content: '# Timing Topic A1\n\nShort body A1.',
        id: 'timing-topic-a-1',
        kind: 'topic',
        parentNodeId: 'timing-folder-a',
        title: 'Timing Topic A1'
      },
      {
        content: '# Timing Topic B1\n\nShort body B1.',
        id: 'timing-topic-b-1',
        kind: 'topic',
        parentNodeId: 'timing-folder-b',
        title: 'Timing Topic B1'
      }
    ]);
    await api?.openNode?.('timing-folder-a');
  });
}

async function seedDenseFolderTimingWorkspace(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const makeTopics = (folderId: string, prefix: string, idPrefix: string) => Array.from({ length: 800 }, (_, index) => {
      const suffix = String(index).padStart(3, '0');
      return {
        content: `# ${prefix} Topic ${suffix}\n\nShort body ${suffix}.`,
        id: `timing-${idPrefix}-topic-${suffix}`,
        kind: 'topic',
        parentNodeId: folderId,
        title: `${prefix} Topic ${suffix}`
      };
    });
    const nodes = [
      { content: '', id: 'timing-dense-folder-a', kind: 'folder', title: 'Timing Dense Folder A' },
      { content: '', id: 'timing-dense-folder-b', kind: 'folder', title: 'Timing Dense Folder B' },
      ...makeTopics('timing-dense-folder-a', 'Dense A', 'dense-a'),
      ...makeTopics('timing-dense-folder-b', 'Dense B', 'dense-b')
    ];
    await api?.seedNodes?.(nodes);
    await api?.openNode?.('timing-dense-folder-a');
  });
}

async function waitForTreeItemText(desktopWindow: Parameters<typeof expectWorkspaceShell>[0], targetText: string) {
  await desktopWindow.waitForFunction(
    (text) => Array.from(document.querySelectorAll('[role="treeitem"]')).some((element) =>
      (element.textContent ?? '').includes(text)
    ),
    targetText,
    { timeout: 20_000 }
  );
}

async function collectDualListMutationTiming(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  return desktopWindow.evaluate(async (targetTitle): Promise<DualListMutationTiming> => {
    const folderPanel = document.querySelector('.workspace-region-main-folder');
    const contentPanel = document.querySelector('[aria-label="Current folder contents"]');
    const target = Array.from(document.querySelectorAll('[role="treeitem"]')).find((element) =>
      (element.textContent ?? '').includes(targetTitle)
    );
    if (!folderPanel || !contentPanel || !(target instanceof HTMLElement)) {
      throw new Error('missing dual-list timing target');
    }

    const clickAt = performance.now();
    let folderFirstMutationAt: number | null = null;
    let contentFirstMutationAt: number | null = null;
    let folderMutationCount = 0;
    let contentMutationCount = 0;
    const folderObserver = new MutationObserver((records) => {
      folderMutationCount += records.length;
      folderFirstMutationAt = folderFirstMutationAt ?? performance.now();
    });
    const contentObserver = new MutationObserver((records) => {
      contentMutationCount += records.length;
      contentFirstMutationAt = contentFirstMutationAt ?? performance.now();
    });

    folderObserver.observe(folderPanel, { attributes: true, childList: true, characterData: true, subtree: true });
    contentObserver.observe(contentPanel, { attributes: true, childList: true, characterData: true, subtree: true });
    const rightTextBefore = contentPanel.textContent ?? '';
    target.click();
    const immediateActiveNodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;

    await new Promise((resolve) => window.setTimeout(resolve, 800));
    folderObserver.disconnect();
    contentObserver.disconnect();

    return {
      activeNodeId: globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
      clickAt,
      contentFirstMutationAt,
      contentMutationCount,
      folderFirstMutationAt,
      folderMutationCount,
      immediateActiveNodeId,
      rightTextAfter: contentPanel.textContent ?? '',
      rightTextBefore
    };
  }, 'Timing Folder B');
}

async function collectDenseFolderMutationTiming(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  return desktopWindow.evaluate(async (targetTitle): Promise<DualListMutationTiming> => {
    const folderPanel = document.querySelector('.workspace-region-main-folder');
    const contentPanel = document.querySelector('[aria-label="Current folder contents"]');
    const target = Array.from(document.querySelectorAll('[role="treeitem"]')).find((element) =>
      (element.textContent ?? '').includes(targetTitle)
    );
    if (!folderPanel || !contentPanel || !(target instanceof HTMLElement)) {
      throw new Error('missing dense dual-list timing target');
    }

    const clickAt = performance.now();
    let folderFirstMutationAt: number | null = null;
    let contentFirstMutationAt: number | null = null;
    let folderMutationCount = 0;
    let contentMutationCount = 0;
    const folderObserver = new MutationObserver((records) => {
      folderMutationCount += records.length;
      folderFirstMutationAt = folderFirstMutationAt ?? performance.now();
    });
    const contentObserver = new MutationObserver((records) => {
      contentMutationCount += records.length;
      contentFirstMutationAt = contentFirstMutationAt ?? performance.now();
    });

    folderObserver.observe(folderPanel, { attributes: true, childList: true, characterData: true, subtree: true });
    contentObserver.observe(contentPanel, { attributes: true, childList: true, characterData: true, subtree: true });
    const rightTextBefore = contentPanel.textContent ?? '';
    target.click();
    const immediateActiveNodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;

    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    folderObserver.disconnect();
    contentObserver.disconnect();

    return {
      activeNodeId: globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
      clickAt,
      contentFirstMutationAt,
      contentMutationCount,
      folderFirstMutationAt,
      folderMutationCount,
      immediateActiveNodeId,
      rightTextAfter: contentPanel.textContent ?? '',
      rightTextBefore
    };
  }, 'Timing Dense Folder B');
}

test('collects first mutation timing for dual-list folder switch', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedDualListTimingWorkspace(desktopWindow);
  await waitForTreeItemText(desktopWindow, 'Timing Folder B');

  const timing = await collectDualListMutationTiming(desktopWindow);
  await testInfo.attach('dual-list-first-mutation', {
    body: JSON.stringify(timing, null, 2),
    contentType: 'application/json'
  });
  console.log(JSON.stringify(timing, null, 2));

  expect(timing.activeNodeId).toBe('timing-folder-b');
  expect(timing.rightTextAfter).toContain('Timing Topic B1');
});

test('collects first mutation timing for a dense folder switch', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedDenseFolderTimingWorkspace(desktopWindow);
  await waitForTreeItemText(desktopWindow, 'Timing Dense Folder B');

  const timing = await collectDenseFolderMutationTiming(desktopWindow);
  await testInfo.attach('dual-list-dense-first-mutation', {
    body: JSON.stringify(timing, null, 2),
    contentType: 'application/json'
  });
  console.log(JSON.stringify(timing, null, 2));

  expect(timing.activeNodeId).toBe('timing-dense-folder-b');
  expect(timing.rightTextAfter).toContain('Dense B Topic');
});
