import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { companionArticleChildIds } from '../shared/platform/companion/reading/companionReadingDemand';
import { getSelectionCommandPayloadForContentRanges } from '../shared/selectionCommandPayload';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import { findCompanionExistingHighlightFromPayload } from './companionExistingHighlightActions';
import { resolveExistingHighlightAtPoint } from './companionSelectionToolbarState';

function snapshot(): WorkspaceSnapshot {
  const node = (id: string): WorkspaceNodeSnapshot => ({
    id, content: 'Alpha Beta Gamma', parentNodeId: null, kind: 'topic', title: id,
    createdAt: 'now', updatedAt: 'now', hideTitleHeading: false, isTitleManual: false,
    reading: null, review: null, reveal: null, anchorLink: null
  });
  const note = { ...node('note'), parentNodeId: 'source', content: 'Beta\n※ Thought',
    anchorLink: { id: 'anchor', kind: 'highlight' as const, locator: { from: 6, to: 10, originalText: 'Beta' } } };
  return { activeNodeId: 'source', nodesById: { source: node('source'), note },
    nodeOrder: ['source', 'note'], trashedNodeIds: [], untitledSequenceByParent: {} };
}

function atPoint(state: WorkspaceSnapshot, content = 'Inserted Alpha Beta Gamma') {
  const editorRef = { current: { getContent: () => content,
    getDocumentPositionAtClientPoint: () => 15, getSelection: () => ({ from: 0, to: 0 }) } as unknown as EditorAdapter };
  return resolveExistingHighlightAtPoint({ editorRef, nodeId: 'source', point: { clientX: 1, clientY: 1 }, snapshot: state });
}

function fromPayload(state: WorkspaceSnapshot, content = 'Inserted Alpha Beta Gamma') {
  const payload = getSelectionCommandPayloadForContentRanges('source', 'Inserted Alpha Beta Gamma', [{ from: 15, to: 19 }]);
  return findCompanionExistingHighlightFromPayload(state, payload, content);
}

it.each([atPoint, fromPayload])('uses the editor body for matching and preserves the snapshot (%#)', (lookup) => {
  const state = snapshot();
  const before = JSON.stringify(state);
  Object.freeze(state.nodesById.source);
  Object.freeze(state.nodesById);
  expect(lookup(state)).toEqual({ nodeId: 'note', originalText: 'Beta', note: 'Thought' });
  expect(JSON.stringify(state)).toBe(before);
  expect(lookup(state, '')).toBeNull();
});

it.each([atPoint, fromPayload])('keeps ambiguity and trash rejection after draft relocation (%#)', (lookup) => {
  const state = snapshot();
  state.nodesById.overlap = { ...state.nodesById.note!, id: 'overlap' };
  expect(lookup(state)).toBeNull();
  state.trashedNodeIds = ['overlap'];
  expect(lookup(state)?.nodeId).toBe('note');
  state.trashedNodeIds.push('note');
  expect(lookup(state)).toBeNull();
});

it.each([100, 1000, 10000])('reuses article relations without revisiting %i unrelated nodes', (count) => {
  for (const lookup of [atPoint, fromPayload]) {
    const state = snapshot();
    let visits = 0;
    for (let i = 0; i < count; i += 1) {
      const id = `other-${i}`;
      state.nodesById[id] = { ...state.nodesById.source!, id,
        get parentNodeId() { visits += 1; return null; } };
    }
    companionArticleChildIds(state.nodesById, 'source');
    visits = 0;
    expect(lookup(state)?.nodeId).toBe('note');
    expect(visits).toBe(0);
  }
});

it.each([atPoint, fromPayload])('refreshes targets after anchor changes, reparenting and replacement (%#)', (lookup) => {
  const state = snapshot();
  expect(lookup(state)?.nodeId).toBe('note');
  state.nodesById = patchWorkspaceRecord(state.nodesById, {
    note: { ...state.nodesById.note!, parentNodeId: 'other-source' }
  });
  expect(lookup(state)).toBeNull();
  state.nodesById = patchWorkspaceRecord(state.nodesById, {
    note: { ...state.nodesById.note!, parentNodeId: 'source' }
  });
  expect(lookup(state)?.nodeId).toBe('note');
  state.nodesById = patchWorkspaceRecord(state.nodesById, {
    note: { ...state.nodesById.note!, anchorLink: null }
  });
  expect(lookup(state)).toBeNull();
  state.nodesById = snapshot().nodesById;
  expect(lookup(state)?.nodeId).toBe('note');
});
