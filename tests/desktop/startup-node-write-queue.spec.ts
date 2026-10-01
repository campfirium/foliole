import { mkdir } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import type { DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const count of [100, 1000]) {
  test(`persists ${count} foreground creations and edits with automatic search maintenance`, async ({ browserName }, testInfo) => {
    test.setTimeout(180_000);
    void browserName;
    const root = testInfo.outputPath('state');
    await mkdir(root, { recursive: true });
    let session: DesktopSession | undefined;
    const launch = async () => {
      session = await launchDesktopSession({ env: {
        ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: root
      } }) as DesktopSession;
      await expectWorkspaceShell(session.firstWindow);
    };
    try {
      await launch();
      await session!.firstWindow.evaluate(async (size) => {
        const api = window.electronAPI!;
        const now = new Date().toISOString();
        for (let index = 0; index < size; index += 1) {
          await api.invoke('create_topic', {
            nodeId: `queue-${index}`, parentNodeId: null, kind: 'topic',
            title: `QueueSentinel${index}`, isTitleManual: true,
            content: `Original body ${index}`, reveal: null, anchorLink: null,
            position: index, createdAt: now, updatedAt: now, nodeOrder: []
          });
        }
        const id = `queue-${size - 1}`;
        const node = (await api.invoke('load_workspace_snapshot'))!.nodesById[id]!;
        await api.invoke('update_node_content', {
          ...node, nodeId: id, content: 'SavedQueueNeedle',
          reveal: node.reveal ?? null, anchorLink: node.anchorLink ?? null,
          position: node.position ?? null, updatedAt: new Date().toISOString()
        });
      }, count);
      await expect.poll(() => session!.firstWindow.evaluate(async () =>
        (await window.electronAPI!.invoke('search_workspace', { query: 'SavedQueueNeedle' }))?.results.map((node) => node.id)
      ), { timeout: 30_000 }).toContain(`queue-${count - 1}`);
      await session!.close();
      await launch();
      const persisted = await session!.firstWindow.evaluate(async (size) => {
        const api = window.electronAPI!;
        const snapshot = (await api.invoke('load_workspace_snapshot'))!;
        const nodes = Object.values(snapshot.nodesById).filter((node) => node.id.startsWith('queue-'));
        return {
          count: nodes.length, versioned: nodes.every((node) => Boolean(node.currentVersionId)),
          content: (await api.invoke('load_node_document', { nodeId: `queue-${size - 1}` }))?.content
        };
      }, count);
      expect(persisted).toEqual({ count, versioned: true, content: 'SavedQueueNeedle' });
      await testInfo.attach('persisted-node-and-search-result', {
        body: JSON.stringify(persisted), contentType: 'application/json'
      });
    } finally {
      await session?.close();
    }
  });
}
