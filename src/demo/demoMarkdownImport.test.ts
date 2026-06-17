import { describe, expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  applyDemoMarkdownImport,
  createDemoMarkdownFileEntry,
  createDemoMarkdownPasteEntry,
  type DemoMarkdownImportEntry
} from './demoMarkdownImport';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

describe('Demo Markdown import', () => {
  it('imports pasted Markdown as an active reading topic', () => {
    const snapshot = createDemoWorkspaceSnapshot('/demo/welcome-to-foliole/', new Date('2026-06-17T00:00:00.000Z'));
    const entry = createDemoMarkdownPasteEntry('# Local Topic\n\nBody');

    const result = applyDemoMarkdownImport(snapshot, entry ? [entry] : [], '2026-06-17T10:00:00.000Z');

    expect(result.importedTopicIds).toHaveLength(1);
    const topic = requireNode(result.state.nodesById[result.importedTopicIds[0]!]);
    expect(topic.title).toBe('Local Topic');
    expect(topic.parentNodeId).toMatch(/^demo-local-/);
    expect(topic.reading).toMatchObject({
      lastHandledAt: '2026-06-17T10:00:00.000Z',
      nextAt: '2026-06-17T10:00:00.000Z',
      readingPosition: 0,
      repetitionCount: 0,
      state: 'active'
    });
    expect(result.state.reviewSession.currentNodeId).toBe(topic.id);
    expect(result.state.reviewSession.queueNodeIds[0]).toBe(topic.id);
  });

  it('imports Markdown files as a Folder tree without overwriting existing topics', () => {
    const snapshot = createDemoWorkspaceSnapshot('/demo/welcome-to-foliole/', new Date('2026-06-17T00:00:00.000Z'));
    const firstEntry = createDemoMarkdownFileEntry({
      markdown: '# First\n\nBody',
      name: 'first.md',
      relativePath: 'Vault/Area/first.md'
    });
    const secondEntry = createDemoMarkdownFileEntry({
      markdown: 'Second body',
      name: 'second.md',
      relativePath: 'Vault/second.md'
    });
    const ignoredEntry = createDemoMarkdownFileEntry({
      markdown: 'Image',
      name: 'image.png',
      relativePath: 'Vault/image.png'
    });

    const result = applyDemoMarkdownImport(
      snapshot,
      [firstEntry, secondEntry, ignoredEntry].filter((entry): entry is DemoMarkdownImportEntry => Boolean(entry)),
      '2026-06-17T10:00:00.000Z'
    );

    expect(result.importedTopicIds).toHaveLength(2);
    const inbox = requireNode(result.state.nodesById[INBOX_NODE_ID]);
    const importRootId = inbox.manualChildOrder?.at(-1);
    expect(importRootId).toBeTruthy();
    const importRoot = requireNode(result.state.nodesById[importRootId!]);
    expect(importRoot.kind).toBe('folder');
    expect(importRoot.title).toBe('Imported Markdown');
    expect(importRoot.manualChildOrder).toHaveLength(1);
    const vaultFolder = requireNode(result.state.nodesById[importRoot.manualChildOrder![0]!]);
    expect(vaultFolder.title).toBe('Vault');
    expect(vaultFolder.manualChildOrder).toHaveLength(2);
    expect(requireNode(result.state.nodesById[result.importedTopicIds[0]!]).title).toBe('First');
    expect(requireNode(result.state.nodesById[result.importedTopicIds[1]!]).title).toBe('second');
  });
});

function requireNode<T>(node: T | undefined): T {
  if (!node) {
    throw new Error('Expected node to exist.');
  }
  return node;
}
