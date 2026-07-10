// @vitest-environment node

import { expect, it } from 'vitest';

import { composeAssistantTurnInput } from './codexAppServerProtocol.js';

it('formats Agent Control API availability as on-demand context access', () => {
  const input = composeAssistantTurnInput('Find notes about embeddings', {
    agentControl: {
      capabilities: [
        'materials.read',
        'materials.search',
        'materials.listChildren',
        'materials.update',
        'virtualFolders.list',
        'virtualFolders.read',
        'virtualFolders.create'
      ],
      cliPath: 'C:\\Foliole\\resources\\scripts\\agent-control\\foliole-agent.mjs',
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      endpoint: 'http://127.0.0.1:3841',
      state: 'running',
      tracePath: 'C:\\Foliole\\cache\\agent-control-mcp-trace.jsonl'
    },
    activeParentNodeId: 'workspace-parent',
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Local Agent Control API state: running');
  expect(input).toContain('Agent Control enabled capabilities: materials.read, materials.search, materials.listChildren, materials.update, virtualFolders.list, virtualFolders.read, virtualFolders.create');
  expect(input).toContain('Agent Control descriptor env var: FOLIOLE_AGENT_DESCRIPTOR');
  expect(input).toContain('Agent Control CLI path: C:\\Foliole\\resources\\scripts\\agent-control\\foliole-agent.mjs');
  expect(input).toContain('Agent Control MCP trace path: C:\\Foliole\\cache\\agent-control-mcp-trace.jsonl');
  expect(input).toContain('Active Foliole parent material id: workspace-parent');
  expect(input).toContain('foliole_materials_read');
  expect(input).toContain('foliole_materials_search');
  expect(input).toContain('foliole_materials_list_children');
  expect(input).toContain('use parent.id/title/kind/special_kind/parent_titles');
  expect(input).toContain('foliole_virtual_folders_list');
  expect(input).toContain('foliole_virtual_folders_read');
  expect(input).toContain('MCP exposes only discovery and read tools');
  expect(input).toContain('enabled write capabilities in the descriptor do not mean write tools are available through MCP');
  expect(input).toContain('read-only MCP tools cannot update, delete, or create Foliole materials');
  expect(input).toContain('MCP tool calls are recorded in the local trace path for diagnostics');
  expect(input).toContain('Descriptor write routes such as materials/update');
  expect(input).toContain('node C:\\Foliole\\resources\\scripts\\agent-control\\foliole-agent.mjs <route>');
  expect(input).toContain('backup_path for recovery evidence');
  expect(input).toContain('If the local CLI entrypoint is unavailable');
  expect(input).toContain('list top-level materials');
  expect(input).toContain('curated material sets');
  expect(input).toContain('parent_titles for node path disambiguation');
  expect(input).toContain('anchor_kind/special_kind material identity');
  expect(input).toContain('Treat anchor_kind=highlight/cloze as derived Topic identity');
  expect(input).toContain('special_kind as Home/Inbox/Trash/Virtual entry identity');
  expect(input).toContain('source.readable_material_id');
  expect(input).toContain('direct child summaries');
  expect(input).toContain('returned parent_id');
  expect(input).toContain('active parent material id');
  expect(input).toContain('search first, compare parent_titles, then read');
  expect(input).toContain('Use foliole_materials_read with the active material id');
  expect(input).toContain('Do not call Agent Control write routes');
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
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      state: 'stopped'
    },
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Local Agent Control API state: stopped');
  expect(input).toContain('Agent Control is not running for this turn');
  expect(input).not.toContain('search first, compare parent_titles');
  expect(input).not.toContain('Use foliole_materials_read with the active material id');
  expect(input).not.toContain('list top-level materials');
});

it('formats missing Agent Control read/search capabilities as unavailable', () => {
  const input = composeAssistantTurnInput('Find related notes', {
    agentControl: {
      capabilities: ['foundation.capabilities'],
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      state: 'running'
    },
    schemaVersion: 1,
    scope: 'workspace'
  });

  expect(input).toContain('Agent Control enabled capabilities: foundation.capabilities');
  expect(input).toContain('materials.read is not enabled');
  expect(input).toContain('materials.search is not enabled');
  expect(input).toContain('materials.listChildren is not enabled');
  expect(input).toContain('virtualFolders.list is not enabled');
  expect(input).toContain('virtualFolders.read is not enabled');
  expect(input).not.toContain('source.readable_material_id');
  expect(input).not.toContain('search first, compare parent_titles');
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
  expect(input).toContain('use the included direct topics and folders first');
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
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
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
  expect(input).toContain('prefer the included direct children or search');
  expect(input).toContain('use foliole_materials_read on child ids');
});

it('formats active anchors with parent material read guidance', () => {
  const input = composeAssistantTurnInput('Explain this highlight', {
    activeKind: 'topic',
    activeNodeId: 'highlight-1',
    activeTitle: 'Highlight note',
    agentControl: {
      capabilities: ['materials.read'],
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
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
  expect(input).toContain('use foliole_materials_read with the parent material id');
});
