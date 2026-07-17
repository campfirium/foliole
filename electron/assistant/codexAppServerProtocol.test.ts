// @vitest-environment node

import { expect, it } from 'vitest';

import { composeAssistantTurnInput, createInitializeMessage } from './codexAppServerProtocol.js';

it('opts into the pinned experimental dynamic tool protocol', () => {
  expect(createInitializeMessage('0.6.5-test')).toMatchObject({
    params: { capabilities: { experimentalApi: true } }
  });
});

it('formats complete Foliole actions without exposing implementation details', () => {
  const input = composeAssistantTurnInput('Find notes about embeddings', {
    agentControl: {
      capabilities: [
        'materials.read',
        'materials.search',
        'materials.listChildren',
        'materials.update',
        'virtualFolders.list',
        'virtualFolders.read',
        'virtualFolders.create',
        'materials.create',
        'materials.move',
        'materials.restore',
        'virtualFolders.update',
        'virtualFolders.deleteSoft'
      ],
      state: 'running'
    },
    activeParentNodeId: 'workspace-parent',
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Read-only Foliole tools are available for this turn');
  expect(input).toContain('Active Foliole parent material id: workspace-parent');
  expect(input).not.toContain('create a Topic or Folder');
  expect(input).not.toContain('Change Foliole data');
  for (const leak of ['Agent Control', 'MCP', 'FOLIOLE_AGENT_DESCRIPTOR', 'foliole-agent', '127.0.0.1']) {
    expect(input).not.toContain(leak);
  }
});

it('formats a stopped Agent Control context without claiming unread content access', () => {
  const input = composeAssistantTurnInput('What else is in this folder?', {
    agentControl: {
      capabilities: [
        'materials.read',
        'materials.search',
        'materials.listChildren',
        'virtualFolders.list',
        'virtualFolders.read'
      ],
      state: 'stopped'
    },
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Foliole tools are unavailable for this turn');
  expect(input).not.toContain('Available Foliole actions');
});

it('formats missing Agent Control read/search capabilities as unavailable', () => {
  const input = composeAssistantTurnInput('Find related notes', {
    agentControl: {
      capabilities: ['foundation.capabilities'],
      state: 'running'
    },
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Read-only Foliole tools are available for this turn');
  expect(input).not.toContain('Available Foliole actions');
});

it('formats current editor selection as explicit assistant context', () => {
  const input = composeAssistantTurnInput('Explain this', {
    activeTitle: 'Topic',
    schemaVersion: 1,
    scope: 'node',
    selection: {
      charCount: 13,
      ranges: [{ from: 2, to: 15 }],
      text: 'Selected text',
      truncated: false
    }
  });

  expect(input).toContain('Current editor selection');
  expect(input).toContain('Current editor selection, 13 chars:');
  expect(input).toContain('Selected text');
  expect(input).toContain('selection is present, treat it as the most specific focus');
  expect(input).toContain('asking about the active Foliole topic or folder');
  expect(input).toContain('User message:\nExplain this');
});

it('formats folder children with ids for follow-up Agent Control reads', () => {
  const input = composeAssistantTurnInput('Summarize this folder', {
    activeKind: 'folder',
    activeNodeId: 'folder-1',
    activeTitle: 'Memo',
    folder: {
      childCount: 2,
      children: [
        {
          anchorKind: 'highlight',
          hasContent: true,
          kind: 'topic',
          nodeId: 'child-a',
          preview: 'Opening text',
          title: 'Child A'
        },
        {
          hasContent: false,
          kind: 'folder',
          nodeId: 'child-b',
          specialKind: 'virtual',
          title: 'Child B'
        }
      ],
      truncated: false
    },
    schemaVersion: 1,
    scope: 'node'
  });

  expect(input).toContain('Active Foliole object type: folder');
  expect(input).toContain('Active Foliole material id: folder-1');
  expect(input).toContain('Direct Foliole children: 2 of 2.');
  expect(input).toContain('Child A [topic, id=child-a, anchor=highlight]: Opening text');
  expect(input).toContain('Child B [folder, id=child-b, special=virtual]');
  expect(input).toContain('use the included direct Topics and Folders first');
  expect(input).toContain('Foliole Aide history is a local global thread index');
  expect(input).toContain('only removes the local Foliole history entry');
});

it('formats special folder entries without treating their own id as the preferred material read', () => {
  const input = composeAssistantTurnInput('What is in this inbox?', {
    activeKind: 'folder',
    activeNodeId: 'special-inbox',
    activeSpecialKind: 'inbox',
    activeTitle: 'Inbox',
    agentControl: {
      capabilities: ['materials.read', 'materials.search'],
      state: 'running'
    },
    folder: {
      childCount: 1,
      children: [{ hasContent: true, kind: 'topic', nodeId: 'topic-1', title: 'Topic 1' }],
      truncated: false
    },
    schemaVersion: 1,
    scope: 'node'
  });

  expect(input).toContain('Active Foliole special entry: inbox');
  expect(input).toContain('For a special Folder, use included children first and search');
});

it('formats active anchors with parent material read guidance', () => {
  const input = composeAssistantTurnInput('Explain this highlight', {
    activeKind: 'topic',
    activeNodeId: 'highlight-1',
    activeTitle: 'Highlight note',
    agentControl: {
      capabilities: ['materials.read'],
      state: 'running'
    },
    anchor: {
      id: 'anchor-1',
      kind: 'highlight',
      parentNodeId: 'parent-1',
      parentTitle: 'Parent article',
      text: 'Important highlighted text'
    },
    path: ['Parent article', 'Highlight note'],
    schemaVersion: 1,
    scope: 'node'
  });

  expect(input).toContain('Active Foliole anchor: highlight, id=anchor-1');
  expect(input).toContain('Anchor parent material id: parent-1');
  expect(input).toContain('Anchor text:\nImportant highlighted text');
  expect(input).toContain('read its parent Topic for source context');
});
