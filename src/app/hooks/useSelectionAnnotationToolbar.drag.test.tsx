import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useSelectionAnnotationToolbar } from './useSelectionAnnotationToolbar';

vi.mock('../contextCommands', () => ({
  getSelectionCommandPayload: () => ({ selectionText: 'Welcome' })
}));

afterEach(() => {
  document.body.innerHTML = '';
});

it('does not replace the annotation panel when its drag ends over the editor', () => {
  const toolbar = document.createElement('div');
  toolbar.dataset.annotationToolbar = 'true';
  const editor = document.createElement('div');
  editor.className = 'cm-editor';
  document.body.append(toolbar, editor);
  const setContextMenu = vi.fn();
  renderHook(() => useSelectionAnnotationToolbar({
    activeNodeId: 'node-1',
    editorRef: { current: null },
    isTrashViewOpen: false,
    nodesById: {} as never,
    selectionToolbarEnabled: true,
    setContextMenu,
    trashedNodeIds: []
  }));

  act(() => {
    toolbar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  });
  expect(setContextMenu).not.toHaveBeenCalled();

  act(() => {
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  });
  expect(setContextMenu).toHaveBeenCalledWith(expect.objectContaining({ mode: 'annotation-toolbar' }));
});
