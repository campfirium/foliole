import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { WorkspaceGridContent, type WorkspaceGridContentSource } from './WorkspaceGridContent';

const observed = vi.hoisted(() => ({ projecting: false, projection: {} as object }));
vi.mock('../../features/nodes/model/workspaceListNode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/workspaceListNode')>();
  return {
    ...actual,
    projectWorkspaceListNodesById: (...args: Parameters<typeof actual.projectWorkspaceListNodesById>) => {
      observed.projecting = true;
      try {
        return actual.projectWorkspaceListNodesById(...args);
      } finally {
        observed.projecting = false;
      }
    }
  };
});
vi.mock('./externalSearchPreviewState', () => ({ useExternalSearchPreviewDocument: () => ({}) }));
vi.mock('./useWorkspaceTopicEditorFocusRoundTrip', () => ({
  selectWorkspaceTopicEditorFocusRoundTripInput: () => ({}),
  useWorkspaceTopicEditorFocusRoundTrip: () => ({})
}));
vi.mock('./workspaceDocumentSurfaceProps', () => ({ selectWorkspaceDocumentSurfaceProps: () => ({}) }));
vi.mock('./workspaceGridContentProps', () => ({
  selectWorkspaceGridColumnProps: (args: { listNodesById: object }) => {
    observed.projection = args.listNodesById;
    return args;
  }
}));
vi.mock('./workspaceLayoutGridContentColumns', () => ({ renderWorkspaceGridColumns: () => null }));

const diagnosticGlobal = globalThis as typeof globalThis & {
  __FOLIOLE_EDITOR_INPUT_DIAG?: boolean;
  folioleEditorInputDiagnostics: { clear: () => void; records: Array<{ event: string; details: object }> };
};

function makeSource(count: number): WorkspaceGridContentSource {
  const nodesById = Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const id = `topic-${index}`;
    return [id, {
      id, title: id, kind: 'topic', content: '', parentNodeId: null,
      createdAt: '2026-10-28', updatedAt: '2026-10-28', review: null
    } as Node];
  }));
  return {
    nodeList: { nodesById, nodeOrder: Object.keys(nodesById) },
    navigation: { activeNodeId: null }, document: { editorContent: '' },
    layoutChrome: {}, externalLibrary: { isExternalViewOpen: false },
    readingPosition: { getReadingPositionSelection: () => null }
  } as unknown as WorkspaceGridContentSource;
}

function grid(props: WorkspaceGridContentSource) {
  return <WorkspaceGridContent
    activeRightPanelId="outline" documentNodeId={null} isImmersiveEditing={false}
    onEnterImmersiveEdit={() => undefined} onShouldSuppressSelectionRestore={() => false}
    onSelectNode={() => undefined} props={props}
  />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  diagnosticGlobal.__FOLIOLE_EDITOR_INPUT_DIAG = false;
  diagnosticGlobal.folioleEditorInputDiagnostics.clear();
});

describe('Grid diagnostic metadata', () => {
  it.each([100, 1000])('does no diagnostic enumeration with diagnostics off (%i topics)', (count) => {
    diagnosticGlobal.__FOLIOLE_EDITOR_INPUT_DIAG = false;
    const source = makeSource(count);
    const expected = toWorkspaceListNodesById(source.nodeList.nodesById);
    const enumerated: object[] = [];
    const keys = Object.keys;
    vi.spyOn(Object, 'keys').mockImplementation((value: object) => {
      if (!observed.projecting) enumerated.push(value);
      return keys(value);
    });
    const view = render(grid(source));
    const first = observed.projection;
    expect(first).toEqual(expected);
    view.rerender(grid(source));
    expect(observed.projection).toBe(first);
    expect(enumerated.filter((value) => value === source.nodeList.nodesById || value === first)).toHaveLength(0);
    const changed = { ...source, nodeList: { ...source.nodeList,
      nodesById: { ...source.nodeList.nodesById,
        'topic-0': { ...source.nodeList.nodesById['topic-0']!, title: 'Changed title' }
      }
    } };
    enumerated.length = 0;
    view.rerender(grid(changed));
    expect(observed.projection).toEqual(toWorkspaceListNodesById(changed.nodeList.nodesById));
    expect(observed.projection).not.toBe(first);
    expect(enumerated.filter((value) => value === changed.nodeList.nodesById || value === observed.projection)).toHaveLength(0);
    expect(diagnosticGlobal.folioleEditorInputDiagnostics.records).toEqual([]);
  });

  it('preserves enabled counts and projection reuse across diagnostic toggles', () => {
    const source = makeSource(3);
    diagnosticGlobal.__FOLIOLE_EDITOR_INPUT_DIAG = true;
    const view = render(grid(source));
    const first = observed.projection;
    expect(diagnosticGlobal.folioleEditorInputDiagnostics.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'workspace-grid-list-projection', details: expect.objectContaining({ nodeCount: 3, previousNodeCount: 0 }) }),
      expect.objectContaining({ event: 'workspace-grid-content-total', details: expect.objectContaining({ listNodeCount: 3, hasExternalOutline: false }) })
    ]));
    diagnosticGlobal.__FOLIOLE_EDITOR_INPUT_DIAG = false;
    view.rerender(grid(source));
    expect(observed.projection).toBe(first);
    diagnosticGlobal.folioleEditorInputDiagnostics.clear();
    diagnosticGlobal.__FOLIOLE_EDITOR_INPUT_DIAG = true;
    view.rerender(grid({ ...source, nodeList: { ...source.nodeList, nodesById: { ...source.nodeList.nodesById } } }));
    expect(observed.projection).toBe(first);
    expect(diagnosticGlobal.folioleEditorInputDiagnostics.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'workspace-grid-list-projection', details: expect.objectContaining({ nodeCount: 3, previousNodeCount: 3 }) })
    ]));
  });
});
