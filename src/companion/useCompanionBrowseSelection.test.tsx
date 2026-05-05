import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { useCompanionBrowseSelection } from './useCompanionBrowseSelection';

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'pdf-node',
    nodeOrder: ['pdf-node'],
    nodesById: {
      'pdf-node': {
        anchorLink: null,
        attachments: [{ attachmentId: 'pdf-att', mimeType: 'application/pdf', originalName: 'paper.pdf', role: 'reference' }],
        content: '# Paper\n\nLinked PDF source ready for the reader surface.',
        createdAt: '2026-04-27T09:00:00.000Z',
        hideTitleHeading: false,
        id: 'pdf-node',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Paper',
        updatedAt: '2026-04-27T09:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

describe('useCompanionBrowseSelection', () => {
  it('keeps native readable PDF text when selecting the same snapshot node', () => {
    const { result } = renderHook(() => useCompanionBrowseSelection(createSnapshot(), {
      content: '# Paper\n\nExtracted PDF text',
      hideTitleHeading: false,
      nodeId: 'pdf-node',
      persistedNodeViewState: null,
      pdfAttachmentId: 'pdf-att',
      textAnchorDecorations: [],
      title: 'Paper'
    }));

    act(() => result.current.setSelectedBrowseNodeId('pdf-node'));

    expect(result.current.readableArticle?.content).toBe('# Paper\n\nExtracted PDF text');
  });
});
