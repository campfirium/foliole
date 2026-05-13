import { describe, expect, it } from 'vitest';

import { createMockEditorView } from './codeMirrorEditorViewTestSupport';
import { createTestDomRect, createTestDomRectList, createTestSelection } from './domGeometryTestSupport';
import { createMockEditorAdapter } from './editorAdapterTestSupport';
import { createTestWorkspaceState } from './workspaceStateTestSupport';

describe('test fixture helpers', () => {
  it('creates a workspace state from the real initial state shape', () => {
    const state = createTestWorkspaceState({ activeNodeId: 'node-1' });

    expect(state.activeNodeId).toBe('node-1');
    expect(state.reviewSession.queueNodeIds).toEqual([]);
    expect(state.openNode('node-1')).toBeNull();
  });

  it('fails loudly when an editor adapter method is not stubbed', () => {
    const adapter = createMockEditorAdapter({ getContent: () => 'body' });

    expect(adapter.getContent()).toBe('body');
    expect(() => adapter.focus()).toThrow('Unexpected EditorAdapter.focus call');
  });

  it('creates DOM rect lists that support index access and iteration', () => {
    const rect = createTestDomRect({ height: 20, left: 10, top: 5, width: 30 });
    const list = createTestDomRectList([rect]);

    expect(list[0]).toBe(rect);
    expect(list.item(0)).toBe(rect);
    expect(Array.from(list)).toEqual([rect]);
  });

  it('creates selection and CodeMirror view fixtures with overridable methods', () => {
    const selection = createTestSelection({ isCollapsed: false, rangeCount: 1 });
    const view = createMockEditorView();

    expect(selection.isCollapsed).toBe(false);
    expect(selection.rangeCount).toBe(1);
    view.dispatch({ changes: { from: 0, insert: 'x', to: 0 } });
    expect(view.dispatch).toHaveBeenCalledTimes(1);
  });
});
