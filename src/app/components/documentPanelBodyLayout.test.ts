import { render } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editorLifecycle = vi.hoisted(() => ({
  mountedNodeIds: [] as string[],
  unmountedNodeIds: [] as string[]
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: {
    contentPaddingBottom?: string;
    nodeId: string | null;
    reviewCaretLineHighlight?: boolean;
    trailingDivider?: boolean;
  }) => {
    useEffect(() => {
      editorLifecycle.mountedNodeIds.push(props.nodeId ?? 'none');
      return () => {
        editorLifecycle.unmountedNodeIds.push(props.nodeId ?? 'none');
      };
    }, [props.nodeId]);
    return createElement('div', {
      'data-testid': `editor-${props.nodeId ?? 'none'}`,
      'data-content-padding-bottom': props.contentPaddingBottom,
      'data-review-caret-line': props.reviewCaretLineHighlight ? 'true' : 'false',
      'data-trailing-divider': props.trailingDivider ? 'true' : 'false'
    });
  }
}));

import {
  computeSharedBlockImageMaxHeight,
  type DocumentPanelBodyLayoutProps,
  renderDocumentPanelBodyLayout
} from './documentPanelBodyLayout';

function createLayoutProps(overrides: Partial<DocumentPanelBodyLayoutProps> = {}): DocumentPanelBodyLayoutProps {
  return {
    documentMaxWidth: 760,
    editorAppearanceKey: 'appearance-1',
    editorContent: 'Alpha',
    editorNodeId: 'node-1',
    hasAnswerSection: false,
    onAnswerChange: vi.fn(),
    onEditorChange: vi.fn(),
    onRevealDocumentPosition: vi.fn(),
    onRevealDocumentSelection: vi.fn(),
    onResolveDocumentPositionAtViewportY: vi.fn(() => null),
    reveal: '',
    ...overrides
  };
}

describe('computeSharedBlockImageMaxHeight', () => {
  it('splits remaining height evenly across prompt and answer images when space is sufficient', () => {
    expect(
      computeSharedBlockImageMaxHeight({
        answerMetrics: { imageCount: 1, nonImageHeight: 80, viewportHeight: 400 },
        availableHeight: 820,
        promptMetrics: { imageCount: 1, nonImageHeight: 100, viewportHeight: 420 }
      })
    ).toBe(312);
  });

  it('keeps the shared image height at the base minimum when space is tight', () => {
    expect(
      computeSharedBlockImageMaxHeight({
        answerMetrics: { imageCount: 1, nonImageHeight: 170, viewportHeight: 190 },
        availableHeight: 560,
        promptMetrics: { imageCount: 1, nonImageHeight: 180, viewportHeight: 190 }
      })
    ).toBe(120);
  });

  it('uses the tighter editor when prompt and answer have different non-image heights', () => {
    expect(
      computeSharedBlockImageMaxHeight({
        answerMetrics: { imageCount: 1, nonImageHeight: 24, viewportHeight: 467 },
        availableHeight: 934,
        promptMetrics: { imageCount: 1, nonImageHeight: 60, viewportHeight: 467 }
      })
    ).toBe(399);
  });
});

describe('renderDocumentPanelBodyLayout', () => {
  beforeEach(() => {
    editorLifecycle.mountedNodeIds.length = 0;
    editorLifecycle.unmountedNodeIds.length = 0;
  });

  it('recreates the prompt editor when switching to another node', () => {
    const view = render(renderDocumentPanelBodyLayout(createLayoutProps()));

    expect(editorLifecycle.mountedNodeIds).toEqual(['node-1']);
    expect(editorLifecycle.unmountedNodeIds).toEqual([]);

    view.rerender(
      renderDocumentPanelBodyLayout(createLayoutProps({
        editorContent: 'Beta',
        editorNodeId: 'node-2'
      }))
    );

    expect(editorLifecycle.unmountedNodeIds).toEqual(['node-1']);
    expect(editorLifecycle.mountedNodeIds).toEqual(['node-1', 'node-2']);
  });

  it('keeps the answer divider between the prompt and answer sections', () => {
    const view = render(
      renderDocumentPanelBodyLayout(createLayoutProps({
        hasAnswerSection: true,
        reveal: 'Beta'
      }))
    );

    expect(view.container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(view.getByTestId('editor-node-1')).toHaveAttribute('data-trailing-divider', 'false');
  });

  it('passes the reader end cushion only to the prompt editor', () => {
    const view = render(
      renderDocumentPanelBodyLayout(createLayoutProps({
        editorContentPaddingBottom: 'clamp(6rem, 36dvh, 26rem)',
        hasAnswerSection: true,
        reveal: 'Beta'
      }))
    );

    expect(view.getByTestId('editor-node-1')).toHaveAttribute('data-content-padding-bottom', 'clamp(6rem, 36dvh, 26rem)');
    expect(view.getByTestId('editor-node-1::answer')).not.toHaveAttribute('data-content-padding-bottom');
  });

  it('limits the review caret-line hint to the prompt editor', () => {
    const view = render(
      renderDocumentPanelBodyLayout(createLayoutProps({
        hasAnswerSection: true,
        reveal: 'Beta',
        reviewCaretLineHighlight: true
      }))
    );

    expect(view.getByTestId('editor-node-1')).toHaveAttribute('data-review-caret-line', 'true');
    expect(view.getByTestId('editor-node-1::answer')).toHaveAttribute('data-review-caret-line', 'false');
  });
});
