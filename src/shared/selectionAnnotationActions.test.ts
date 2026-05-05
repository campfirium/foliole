import { describe, expect, it } from 'vitest';

import {
  createSelectionAnnotatedHighlightContent,
  createSelectionAnnotationAnchorLink,
  createSelectionClozeDraft,
  createSelectionHighlightContent,
  getSelectionClozeFrontLength,
  shouldGuardLongSelectionClozeFront,
  type SelectionAnnotationPayload
} from './selectionAnnotationActions';

function createPayload(): SelectionAnnotationPayload {
  return {
    anchorId: 'anchor-1',
    clozeContent: 'Alpha [...] Gamma',
    entries: [{ locator: { from: 6, originalText: 'Beta', to: 10 } }],
    parentNodeId: 'parent',
    selectionText: 'Beta'
  };
}

describe('selection annotation actions', () => {
  it('builds shared highlight and note content from the selection payload', () => {
    const payload = createPayload();

    expect(createSelectionHighlightContent(payload)).toBe('Beta');
    expect(createSelectionAnnotatedHighlightContent(payload, 'Reader note')).toBe('Beta\n※ Reader note');
  });

  it('builds shared cloze drafts and anchor links', () => {
    const payload = createPayload();

    expect(createSelectionClozeDraft(payload)).toEqual({ answer: 'Beta', prompt: 'Alpha [...] Gamma' });
    expect(createSelectionAnnotationAnchorLink(payload, 'cloze')).toEqual({
      id: 'anchor-1',
      kind: 'cloze',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    });
  });

  it('guards cloze actions by the generated card front length', () => {
    const payload = { ...createPayload(), clozeContent: 'A'.repeat(501) };

    expect(getSelectionClozeFrontLength(payload)).toBe(501);
    expect(shouldGuardLongSelectionClozeFront(payload, 500)).toBe(true);
    expect(shouldGuardLongSelectionClozeFront({ ...payload, clozeContent: 'A'.repeat(500) }, 500)).toBe(false);
  });
});
