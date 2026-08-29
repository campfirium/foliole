import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { registerFormulaClozeEditorPresentation, unregisterFormulaClozeEditorPresentation } from '../../formula-cloze/model/formulaClozePresentation';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRefreshImageClozePresentation = vi.fn();
const mockSetNodeId = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor() {}
    destroy() {}
    focus() {}
    getContent() { return ''; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    getScrollTop() { return 0; }
    getSelection() { return { from: 0, to: 0 }; }
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
    refreshImageClozePresentation() { mockRefreshImageClozePresentation(); }
    replaceRange() {}
    replaceSelection() {}
    restoreSelection() {}
    revealSelection() {}
    setContent() {}
    setDiffDecorations() {}
    setHideTitleHeading() {}
    setNodeId(nodeId: string | null) { mockSetNodeId(nodeId); }
    setParagraphMarker() {}
    setScrollTop() {}
    setSearchDecorations() {}
    setSelection() {}
    setTextAnchorDecorations() {}
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor() {
  return render(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="$E=mc^2$" />, {
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
      </LocalizationProvider>
    )
  });
}

describe('MarkdownEditor formula cloze presentation refresh', () => {
  beforeEach(() => {
    mockRefreshImageClozePresentation.mockClear();
    mockSetNodeId.mockClear();
    unregisterFormulaClozeEditorPresentation('node-1');
  });

  it('refreshes for initial content and after the presentation listener is installed for the current node', async () => {
    renderEditor();

    await waitFor(() => {
      expect(mockSetNodeId).toHaveBeenCalledWith('node-1');
      expect(mockRefreshImageClozePresentation).toHaveBeenCalledTimes(3);
    });
  });

  it('refreshes when formula cloze regions are registered externally', async () => {
    renderEditor();

    await waitFor(() => expect(mockSetNodeId).toHaveBeenCalledWith('node-1'));
    mockRefreshImageClozePresentation.mockClear();
    registerFormulaClozeEditorPresentation('node-1', {
      canCreate: false,
      hiddenRegionIds: ['formula-region-1'],
      outlinedRegionIds: [],
      regions: [
        {
          display: 'inline',
          fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
          formulaSource: '$E=mc^2$',
          id: 'formula-region-1',
          occurrenceKey: 'inline:0:8:E=mc^2',
          selection: {
            algorithm: 'katex-dom-leaf-v1',
            fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
            leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'E=mc2' }]
          }
        }
      ]
    });

    await waitFor(() => expect(mockRefreshImageClozePresentation).toHaveBeenCalledTimes(1));
  });
});
