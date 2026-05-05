import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editorLifecycle = vi.hoisted(() => ({
  mountedNodeIds: [] as string[],
  unmountedNodeIds: [] as string[]
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { nodeId: string | null }) => {
    useEffect(() => {
      editorLifecycle.mountedNodeIds.push(props.nodeId ?? 'none');
      return () => {
        editorLifecycle.unmountedNodeIds.push(props.nodeId ?? 'none');
      };
    }, [props.nodeId]);
    return null;
  }
}));

import {
  computeSharedBlockImageMaxHeight,
  renderDocumentPanelBodyLayout
} from './documentPanelBodyLayout';

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
    const view = render(
      renderDocumentPanelBodyLayout({
        documentMaxWidth: 760,
        editorAppearanceKey: 'appearance-1',
        editorContent: 'Alpha',
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
      })
    );

    expect(editorLifecycle.mountedNodeIds).toEqual(['node-1']);
    expect(editorLifecycle.unmountedNodeIds).toEqual([]);

    view.rerender(
      renderDocumentPanelBodyLayout({
        documentMaxWidth: 760,
        editorAppearanceKey: 'appearance-1',
        editorContent: 'Beta',
        editorNodeId: 'node-2',
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
      })
    );

    expect(editorLifecycle.unmountedNodeIds).toEqual(['node-1']);
    expect(editorLifecycle.mountedNodeIds).toEqual(['node-1', 'node-2']);
  });
});
