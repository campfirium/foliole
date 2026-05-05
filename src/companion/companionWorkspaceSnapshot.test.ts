import { describe, expect, it } from 'vitest';

import { resolveReadableCompanionArticle } from './companionWorkspaceSnapshot';

describe('resolveReadableCompanionArticle', () => {
  it('prefers the active readable node', () => {
    const result = resolveReadableCompanionArticle({
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': { content: '', id: 'node-1', title: 'Empty' },
        'node-2': { content: 'Readable body', id: 'node-2', title: 'Readable title' }
      },
      trashedNodeIds: [],
      untitledSequenceByParent: {}
    } as never);

    expect(result).toEqual({
      content: 'Readable body',
      hideTitleHeading: false,
      nodeId: 'node-2',
      title: 'Readable title'
    });
  });

  it('falls back to the first readable non-trashed node', () => {
    const result = resolveReadableCompanionArticle({
      activeNodeId: null,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': { content: 'Hidden', id: 'node-1', title: 'Trashed title' },
        'node-2': { content: 'Visible', id: 'node-2', title: 'Visible title' }
      },
      trashedNodeIds: ['node-1'],
      untitledSequenceByParent: {}
    } as never);

    expect(result?.nodeId).toBe('node-2');
  });
});
