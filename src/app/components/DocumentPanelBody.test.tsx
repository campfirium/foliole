import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const layoutMocks = vi.hoisted(() => ({
  renderDocumentPanelBodyLayout: vi.fn(() => <div data-testid="document-panel-layout" />)
}));

const metricsMocks = vi.hoisted(() => ({
  useDocumentPanelBodyMetrics: vi.fn(() => ({
    handleAnswerImageLoadStateChange: vi.fn(),
    handlePromptImageLoadStateChange: vi.fn(),
    layoutRef: { current: null },
    setAnswerImageMetrics: vi.fn(),
    setPromptImageMetrics: vi.fn(),
    sharedBlockImageMaxHeight: 321
  }))
}));

vi.mock('./documentPanelBodyLayout', () => ({
  renderDocumentPanelBodyLayout: layoutMocks.renderDocumentPanelBodyLayout
}));

vi.mock('./useDocumentPanelBodyMetrics', () => ({
  useDocumentPanelBodyMetrics: metricsMocks.useDocumentPanelBodyMetrics
}));

import { DocumentPanelBody } from './DocumentPanelBody';

const baseProps = {
  documentMaxWidth: 760,
  editorAppearanceKey: 'appearance-1',
  editorContent: '![Cover](https://example.com/topic.png)',
  editorNodeId: 'node-1',
  hasAnswerSection: false,
  isDocumentResizing: false,
  onAnswerChange: vi.fn(),
  onEditorChange: vi.fn(),
  onResetLayout: vi.fn(),
  onRevealDocumentPosition: vi.fn(),
  onRevealDocumentSelection: vi.fn(),
  onResolveDocumentPositionAtViewportY: vi.fn(() => null),
  onStartDocumentResize: vi.fn(),
  reveal: ''
};

describe('DocumentPanelBody', () => {
  beforeEach(() => {
    layoutMocks.renderDocumentPanelBodyLayout.mockClear();
    metricsMocks.useDocumentPanelBodyMetrics.mockClear();
  });

  it('does not pass shared image height to non-item layouts', () => {
    render(<DocumentPanelBody {...baseProps} fitBlockImagesToViewport={false} />);

    expect(layoutMocks.renderDocumentPanelBodyLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        fitBlockImagesToViewport: false,
        sharedBlockImageMaxHeight: undefined
      })
    );
  });

  it('passes shared image height when viewport fitting is enabled', () => {
    render(<DocumentPanelBody {...baseProps} fitBlockImagesToViewport />);

    expect(layoutMocks.renderDocumentPanelBodyLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        fitBlockImagesToViewport: true,
        sharedBlockImageMaxHeight: 321
      })
    );
  });
});
