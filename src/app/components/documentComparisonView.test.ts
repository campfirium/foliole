import { describe, expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { canOpenDocumentComparisonView, type DocumentComparisonEligibility } from './documentComparisonView';

const topic: Node = {
  bodyStatus: 'ready',
  content: 'Body',
  createdAt: '',
  hasContent: true,
  hasReveal: false,
  id: 'topic-1',
  kind: 'topic',
  parentNodeId: null,
  reveal: '',
  review: null,
  title: 'Topic',
  updatedAt: ''
};

function eligibility(overrides: Partial<DocumentComparisonEligibility> = {}): DocumentComparisonEligibility {
  return {
    activeNode: topic,
    activeNodeId: topic.id,
    editorNodeId: topic.id,
    isEditorReadOnly: false,
    isExternalViewOpen: false,
    isFoliolePublishedContext: false,
    isImmersiveMode: false,
    isReviewOnly: false,
    isTrashViewOpen: false,
    ...overrides
  };
}

describe('canOpenDocumentComparisonView', () => {
  it('allows a loaded editable ordinary Topic', () => {
    expect(canOpenDocumentComparisonView(eligibility())).toBe(true);
  });

  it.each([
    { name: 'folder', value: eligibility({ activeNode: { ...topic, kind: 'folder' } }) },
    { name: 'derived Topic', value: eligibility({ activeNode: { ...topic, anchorLink: { id: 'anchor', kind: 'highlight' } } }) },
    { name: 'Trash', value: eligibility({ isTrashViewOpen: true }) },
    { name: 'Published', value: eligibility({ isFoliolePublishedContext: true }) },
    { name: 'external preview', value: eligibility({ isExternalViewOpen: true }) },
    { name: 'review-only', value: eligibility({ isReviewOnly: true }) },
    { name: 'immersive', value: eligibility({ isImmersiveMode: true }) },
    { name: 'PDF-only', value: eligibility({ activeNode: { ...topic, attachments: [{ attachmentId: 'pdf', mimeType: 'application/pdf', originalName: 'topic.pdf', role: 'source' }] } }) }
  ])('rejects $name contexts', ({ value }) => {
    expect(canOpenDocumentComparisonView(value)).toBe(false);
  });
});
