import { render, screen } from '@testing-library/react';
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
  onAnswerChange: vi.fn(),
  onEditorChange: vi.fn(),
  onRevealDocumentPosition: vi.fn(),
  onRevealDocumentSelection: vi.fn(),
  onResolveDocumentPositionAtViewportY: vi.fn(() => null),
  reveal: ''
};

function getLayoutCallProps() {
  const calls = layoutMocks.renderDocumentPanelBodyLayout.mock.calls as unknown as Array<[Record<string, unknown>]>;
  expect(calls[0]).toBeDefined();
  return calls[0]![0];
}

describe('DocumentPanelBody', () => {
  beforeEach(() => {
    layoutMocks.renderDocumentPanelBodyLayout.mockClear();
    metricsMocks.useDocumentPanelBodyMetrics.mockClear();
  });

  it('does not pass shared image height to non-item layouts', () => {
    render(<DocumentPanelBody {...baseProps} fitBlockImagesToViewport={false} />);

    const calledProps = getLayoutCallProps();
    expect(calledProps.fitBlockImagesToViewport).toBe(false);
    expect(calledProps).not.toHaveProperty('sharedBlockImageMaxHeight');
  });

  it('passes shared image height when viewport fitting is enabled', () => {
    render(<DocumentPanelBody {...baseProps} fitBlockImagesToViewport />);

    const calledProps = getLayoutCallProps();
    expect(calledProps.fitBlockImagesToViewport).toBe(true);
    expect(calledProps.sharedBlockImageMaxHeight).toBe(321);
  });

  it('keeps the document body top gap compact below the header chrome', () => {
    render(<DocumentPanelBody {...baseProps} fitBlockImagesToViewport={false} />);

    expect(screen.getByTestId('document-panel-layout').parentElement).toHaveClass('pt-2');
  });
});
