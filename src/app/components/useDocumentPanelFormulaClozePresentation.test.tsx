import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import {
  FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT,
  getFormulaClozeEditorPresentation
} from '../../features/formula-cloze/model/formulaClozePresentation';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { useDocumentPanelFormulaClozePresentation } from './useDocumentPanelFormulaClozePresentation';

const parent = { id: 'parent', kind: 'topic', content: '$E=mc^2$', title: 'Parent' } as Node;

it('keeps the parent presentation registered across unrelated updates and removes it on unmount', () => {
  const props = { activeNode: parent, editorNodeId: 'parent', nodesById: { parent }, trashedNodeIds: [] as string[] };
  const { rerender, unmount } = renderHook((value: typeof props) => useDocumentPanelFormulaClozePresentation(value), { initialProps: props });
  const states: Array<unknown> = [];
  const notifications: string[] = [];
  const listener = (event: Event) => {
    notifications.push((event as CustomEvent<{ editorNodeId: string }>).detail.editorNodeId);
    states.push(getFormulaClozeEditorPresentation('parent'));
  };
  window.addEventListener(FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT, listener);
  rerender({ ...props, nodesById: { ...props.nodesById } });
  expect(notifications).toEqual([]);
  expect(getFormulaClozeEditorPresentation('parent')).toMatchObject({ canCreate: true });
  unmount();
  window.removeEventListener(FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT, listener);
  expect(notifications).toEqual(['parent']);
  expect(states).toEqual([null]);
});

it('disables formula region creation while displaying an Item', () => {
  const item = { ...parent, kind: 'item' as const, reveal: 'Answer' };
  const { unmount } = renderHook(() => useDocumentPanelFormulaClozePresentation({
    activeNode: item, editorNodeId: item.id, nodesById: { [item.id]: item }, trashedNodeIds: []
  }));
  expect(getFormulaClozeEditorPresentation(item.id)).toMatchObject({ canCreate: false });
  unmount();
});
