import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import { useDocumentPanelInteractions } from './documentPanelSectionSupport';

function createProps(onEditorReady = vi.fn()) {
  return {
    nodeOrder: [],
    nodesById: {},
    onEditorReady,
    onOpenExternalLink: vi.fn(),
    onSelectNode: vi.fn(),
    trashedNodeIds: []
  } as never;
}

it('publishes editor readiness as render state for overlays', () => {
  const onEditorReady = vi.fn();
  const adapter = { restoreSelection: vi.fn() } as unknown as EditorAdapter;
  const { result } = renderHook(() => useDocumentPanelInteractions(createProps(onEditorReady)));

  expect(result.current.editorAdapter).toBeNull();

  act(() => {
    result.current.handleEditorReady(adapter);
  });

  expect(result.current.editorAdapter).toBe(adapter);
  expect(onEditorReady).toHaveBeenCalledWith(adapter);
});
