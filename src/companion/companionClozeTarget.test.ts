import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { collectDocumentTextAnchorDecorations } from '../features/editor/model/documentTextAnchorDecorations';

import { findCompanionExistingHighlightAtPosition, findCompanionClozeTarget } from './companionExistingHighlightActions';

function node(id: string, kind: 'highlight' | 'cloze' | null): WorkspaceNodeSnapshot {
  return { id, parentNodeId: kind ? 'source' : null, kind: kind === 'cloze' ? 'item' : 'topic',
    content: 'Alpha Beta Gamma', title: id, anchorLink: kind ? { id, kind, locator: { from: 6, to: 10, originalText: 'Beta' } } : null,
    createdAt: 'now', updatedAt: 'now', hideTitleHeading: false, isTitleManual: false, reading: null, review: null, reveal: null };
}
function snapshot(): WorkspaceSnapshot {
  return { nodesById: { source: node('source', null), cloze: node('cloze', 'cloze') },
    nodeOrder: ['source', 'cloze'], activeNodeId: 'source', trashedNodeIds: [], untitledSequenceByParent: {} };
}
it('identifies the cloze item from its source mark', () => {
  expect(findCompanionExistingHighlightAtPosition({ snapshot: snapshot(), parentNodeId: 'source', position: 7 }))
    .toEqual({ nodeId: 'cloze', kind: 'cloze', originalText: 'Beta' });
});
it('does not guess a target in overlapping marks but allows the explicitly opened item', () => {
  const state = snapshot();
  state.nodesById.highlight = node('highlight', 'highlight');
  expect(findCompanionExistingHighlightAtPosition({ snapshot: state, parentNodeId: 'source', position: 7 })).toBeNull();
  expect(findCompanionClozeTarget(state, 'cloze')).toMatchObject({ nodeId: 'cloze', kind: 'cloze' });
});
it('removes all marks of one multi-range cloze while preserving overlapping marks and source text', () => {
  const state = snapshot();
  state.nodesById.cloze!.anchorLink!.locator = { ranges: [
    { from: 0, to: 5, originalText: 'Alpha' }, { from: 6, to: 10, originalText: 'Beta' }
  ] };
  state.nodesById.highlight = node('highlight', 'highlight');
  const collect = () => collectDocumentTextAnchorDecorations({ ...state, parentContent: state.nodesById.source!.content });
  expect(collect().filter((mark) => mark.nodeId === 'cloze')).toHaveLength(2);
  state.trashedNodeIds = ['cloze'];
  expect(collect().map((mark) => mark.nodeId)).toEqual(['highlight']);
  expect(state.nodesById.source!.content).toBe('Alpha Beta Gamma');
  expect(findCompanionClozeTarget(state, 'cloze')).toBeNull();
  state.trashedNodeIds = [];
  expect(collect().filter((mark) => mark.nodeId === 'cloze')).toHaveLength(2);
});
