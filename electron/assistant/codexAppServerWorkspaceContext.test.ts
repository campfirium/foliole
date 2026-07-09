// @vitest-environment node

import { expect, it } from 'vitest';

import { composeAssistantTurnInput } from './codexAppServerProtocol.js';

it('labels workspace-level folder summaries as top-level Foliole materials', () => {
  const input = composeAssistantTurnInput('What is in this workspace?', {
    folder: {
      childCount: 2,
      children: [
        { hasContent: true, kind: 'folder', nodeId: 'root-a', title: 'Root A' },
        { hasContent: true, kind: 'topic', nodeId: 'root-b', preview: 'Opening note', title: 'Root B' }
      ],
      truncated: false
    },
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Current Foliole scope: workspace');
  expect(input).toContain('workspace-level top-level Foliole materials');
  expect(input).toContain('Direct Foliole children: 2 of 2.');
  expect(input).toContain('Root A [folder, id=root-a]');
  expect(input).toContain('Root B [topic, id=root-b]: Opening note');
});

it('tells the assistant to answer location questions from Foliole context, not the process cwd', () => {
  const input = composeAssistantTurnInput('Where am I?', {
    activeKind: 'folder',
    activeNodeId: 'memo',
    activeTitle: 'Memo',
    path: ['Memo'],
    schemaVersion: 1,
    scope: 'node'
  });

  expect(input).toContain('Current product surface: Foliole Desktop workspace Assistant panel');
  expect(input).toContain('Current Foliole scope: node');
  expect(input).toContain('Active path: Memo');
  expect(input).toContain('Treat this packet as the current Foliole working context, not as the development repository context');
  expect(input).toContain('Do not answer location questions from the process working directory');
  expect(input).toContain('When the user asks what you know, can see, or have as context');
});

it('labels parent-folder entries as nearby directory siblings', () => {
  const input = composeAssistantTurnInput('What else is here?', {
    activeKind: 'topic',
    activeNodeId: 'topic-a',
    activeTitle: 'Topic A',
    parentFolder: {
      childCount: 2,
      children: [
        { hasContent: true, isActive: true, kind: 'topic', nodeId: 'topic-a', title: 'Topic A' },
        { hasContent: true, kind: 'topic', nodeId: 'topic-b', preview: 'Neighbor', title: 'Topic B' }
      ],
      truncated: false
    },
    schemaVersion: 1,
    scope: 'node'
  });

  expect(input).toContain('parent-folder entries are the active material directory siblings');
  expect(input).toContain('Parent Foliole folder entries: 2 of 2.');
  expect(input).toContain('Topic A [topic, id=topic-a, active]');
  expect(input).toContain('Topic B [topic, id=topic-b]: Neighbor');
});
