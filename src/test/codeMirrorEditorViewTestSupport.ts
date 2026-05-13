import type { EditorView } from '@codemirror/view';
import { vi } from 'vitest';

export interface MockEditorViewState {
  doc?: unknown;
  facet?: (facet: unknown) => unknown;
  selection?: unknown;
}

export interface MockEditorViewOverrides {
  dispatch?: ReturnType<typeof vi.fn>;
  state?: MockEditorViewState;
}

export type MockEditorView = EditorView & {
  dispatch: ReturnType<typeof vi.fn>;
};

export function createMockEditorView(overrides: MockEditorViewOverrides = {}): MockEditorView {
  return {
    dispatch: overrides.dispatch ?? vi.fn(),
    state: {
      doc: overrides.state?.doc ?? { toString: () => '' },
      facet: overrides.state?.facet ?? (() => null),
      selection: overrides.state?.selection ?? { main: { from: 0, to: 0 } }
    } as EditorView['state']
  } as MockEditorView;
}
