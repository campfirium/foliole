import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

import { resolveReadableCompanionArticleByNodeId } from './companionReadableArticle';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createPdfNode(): SnapshotNode {
  return {
    attachments: [{
      attachmentId: 'pdf-attachment-1',
      mimeType: 'application/pdf',
      originalName: 'Paper.pdf',
      role: 'reference'
    }],
    anchorLink: null,
    content: '# Paper\n\nLinked PDF source ready for the reader surface.',
    createdAt: '2026-04-27T08:00:00.000Z',
    hideTitleHeading: false,
    id: 'node-pdf',
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Paper',
    updatedAt: '2026-04-27T08:00:00.000Z'
  };
}

describe('companion readable PDF articles', () => {
  it('exposes the reference PDF attachment for the companion reader surface', () => {
    const snapshot: WorkspaceSnapshot = {
      activeNodeId: 'node-pdf',
      nodeOrder: ['node-pdf'],
      nodesById: { 'node-pdf': createPdfNode() },
      trashedNodeIds: [],
      untitledSequenceByParent: {}
    };

    expect(resolveReadableCompanionArticleByNodeId(snapshot, 'node-pdf')?.pdfAttachmentId).toBe('pdf-attachment-1');
  });
});
