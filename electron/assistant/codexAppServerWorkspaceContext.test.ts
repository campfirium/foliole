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

it('gives the agent linked article IDs and distinguishes an open linked article', () => {
  const conversationMaterials = [{ nodeId: 'a', title: 'Draft A' }, { nodeId: 'b', title: 'Draft B' }];
  const focused = composeAssistantTurnInput('Shorten this', {
    activeNodeId: 'b', scope: 'node', conversationMaterials
  });
  expect(JSON.stringify(focused)).toContain('this material');
  expect(JSON.stringify(focused)).toContain('Draft A');
  expect(JSON.stringify(focused)).toContain('Draft B');
  expect(JSON.stringify(focused)).toContain('Active Foliole material id: b');
  const unfocused = composeAssistantTurnInput('Compare both', { scope: 'workspace', conversationMaterials });
  expect(JSON.stringify(unfocused)).toContain('No linked material is currently open');
});
