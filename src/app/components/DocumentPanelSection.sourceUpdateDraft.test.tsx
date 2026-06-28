import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  baseNode,
  createSectionElement,
  mockSourceUpdatePreview,
  openSourceUpdatePanel,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

it('keeps source update draft commits bound to the node that opened the panel', () => {
  mockSourceUpdatePreview();
  const onNodeContentChange = vi.fn();
  const view = renderSectionWithProps({
    activeNodeId: 'node-1',
    editorContent: 'Alpha body',
    editorNodeId: 'node-1',
    onNodeContentChange
  });

  const panelProps = openSourceUpdatePanel();

  act(() => {
    panelProps?.onCurrentContentChange('Alpha source draft');
  });

  view.rerender(createSectionElement({
    activeNodeId: 'node-2',
    editorContent: 'Beta body',
    editorNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': baseNode,
      'node-2': { ...baseNode, id: 'node-2', title: 'Node 2' }
    },
    onNodeContentChange
  }));

  expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Alpha source draft');
  expect(onNodeContentChange).not.toHaveBeenCalledWith('node-2', 'Alpha source draft');
});

it('does not commit a source update draft through raw editor fallback without a node id', () => {
  mockSourceUpdatePreview();
  const onEditorChange = vi.fn();
  const onNodeContentChange = vi.fn();
  renderSectionWithProps({
    activeNodeId: null,
    editorContent: 'Alpha body',
    editorNodeId: null,
    onEditorChange,
    onNodeContentChange
  });

  const panelProps = openSourceUpdatePanel();

  act(() => {
    panelProps?.onCurrentContentChange('Detached source draft');
    panelProps?.onOpenChange(false);
  });

  expect(onEditorChange).not.toHaveBeenCalled();
  expect(onNodeContentChange).not.toHaveBeenCalled();
});
