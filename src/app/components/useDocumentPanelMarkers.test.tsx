import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { getFormulaClozeEditorPresentation } from '../../features/formula-cloze/model/formulaClozePresentation';
import type { FormulaAnchorLocator, Node } from '../../features/nodes/model/nodeTypes';
import { patchWorkspaceRecord, readWorkspaceRecordPatch, recordWorkspaceRecordPatch } from '../../shared/workspaceRecordPatch';
import { enforceWorkspaceRendererBoundary } from '../../store/workspaceRendererBoundary';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { useDocumentPanelFormulaClozePresentation } from './useDocumentPanelFormulaClozePresentation';
import { useDocumentPanelTextAnchorState } from './useDocumentPanelTextAnchorState';

const parent = { id: 'marker-parent', parentNodeId: null, content: 'Alpha Beta', reveal: null, kind: 'topic' } as Node;
const text = {
  id: 'text', parentNodeId: parent.id,
  anchorLink: { id: 'text-anchor', kind: 'highlight', locator: { from: 6, to: 10, originalText: 'Beta' } }
} as Node;
const formula = {
  id: 'formula', parentNodeId: parent.id,
  anchorLink: {
    id: 'formula-anchor', kind: 'cloze', locator: {
      kind: 'formula-region', display: 'inline', formulaSource: '$x$', occurrenceKey: 'inline:1',
      fallbackRect: { x: 0, y: 0, width: 1, height: 1 },
      selection: {
        algorithm: 'katex-dom-leaf-v1', fallbackRect: { x: 0, y: 0, width: 1, height: 1 },
        leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'x' }]
      }
    }
  }
} as Node;

interface MarkerProps {
  nodesById: Record<string, Node>;
  editorContent: string;
  trashedNodeIds: string[];
}

function useMarkers(props: MarkerProps) {
  useDocumentPanelFormulaClozePresentation({ ...props, activeNode: parent, editorNodeId: parent.id });
  return useDocumentPanelTextAnchorState({ ...props, activeNodeId: parent.id } as DocumentPanelSectionProps);
}

it('keeps nonempty markers without traversing unrelated nodes on consecutive scheduling patches', () => {
  let parentReads = 0;
  const unrelated = { id: 'unrelated', parentNodeId: null, content: '', reveal: null, priority: 1 } as Node;
  const nodesById: Record<string, Node> = { [parent.id]: parent, text, formula, unrelated };
  for (let i = 0; i < 1000; i++) {
    nodesById[`other-${i}`] = { id: `other-${i}`, get parentNodeId() { parentReads++; return null; } } as Node;
  }
  const initialProps = { nodesById, editorContent: parent.content, trashedNodeIds: [] as string[] };
  const { result, rerender, unmount } = renderHook(useMarkers, { initialProps });
  expect(result.current).toEqual([{ from: 6, to: 10, kind: 'highlight', nodeId: 'text' }]);
  const presentation = getFormulaClozeEditorPresentation(parent.id);
  const locator = formula.anchorLink!.locator as FormulaAnchorLocator;
  expect(presentation).toEqual({
    canCreate: true, hiddenRegionIds: [], outlinedRegionIds: ['formula-anchor'],
    regions: [{
      id: 'formula-anchor', display: locator.display, fallbackRect: locator.fallbackRect,
      formulaSource: '$x$', occurrenceKey: locator.occurrenceKey, selection: locator.selection
    }]
  });
  parentReads = 0;
  let next = nodesById;
  for (let priority = 2; priority < 5; priority++) {
    const previous = next;
    // The renderer boundary receives the normalized scheduling action and records its affected nodes.
    next = enforceWorkspaceRendererBoundary<{ activeNodeId: string; nodesById: Record<string, Node> }>({
      activeNodeId: parent.id, nodesById: { ...previous, unrelated: { ...unrelated, priority } }
    }, { activeNodeId: parent.id, nodesById: previous }).nodesById!;
    expect(readWorkspaceRecordPatch(next, previous)).toContain('unrelated');
    parentReads = 0;
    rerender({ ...initialProps, nodesById: next });
    expect(result.current).toEqual([{ from: 6, to: 10, kind: 'highlight', nodeId: 'text' }]);
    expect(getFormulaClozeEditorPresentation(parent.id)).toEqual(presentation);
    expect(parentReads).toBe(0);
  }
  expect(parentReads).toBe(0);
  unmount();
  expect(getFormulaClozeEditorPresentation(parent.id)).toBeNull();
});

it('updates draft offsets, marker edits, reparenting, trash, restore and untracked replacements', () => {
  const initialProps: MarkerProps = {
    nodesById: { [parent.id]: parent, text, formula }, editorContent: parent.content, trashedNodeIds: [] as string[]
  };
  const { result, rerender, unmount } = renderHook(useMarkers, { initialProps });
  const draft = { ...initialProps, editorContent: 'Prefix Alpha Beta' };
  rerender(draft);
  expect(result.current).toEqual([{ from: 13, to: 17, kind: 'highlight', nodeId: 'text' }]);
  rerender({ ...draft, trashedNodeIds: ['text', 'formula'] });
  expect(result.current).toEqual([]);
  expect(getFormulaClozeEditorPresentation(parent.id)?.regions).toEqual([]);
  rerender(draft);
  expect(result.current).toHaveLength(1);
  expect(getFormulaClozeEditorPresentation(parent.id)?.regions).toHaveLength(1);
  const moved = patchWorkspaceRecord(draft.nodesById, { text: { ...text, parentNodeId: 'elsewhere' } });
  rerender({ ...draft, nodesById: moved });
  expect(result.current).toEqual([]);
  const edited = patchWorkspaceRecord(moved, {
    text: { ...text, anchorLink: { ...text.anchorLink!, locator: { from: 0, to: 5, originalText: 'Alpha' } } },
    formula: { ...formula, anchorLink: null }
  });
  rerender({ ...draft, nodesById: edited });
  expect(result.current).toEqual([{ from: 7, to: 12, kind: 'highlight', nodeId: 'text' }]);
  expect(getFormulaClozeEditorPresentation(parent.id)?.regions).toEqual([]);
  const removed = { ...edited };
  delete removed.text;
  recordWorkspaceRecordPatch(edited, removed, ['text']);
  rerender({ ...draft, nodesById: removed });
  expect(result.current).toEqual([]);
  const changedFormula = patchWorkspaceRecord(removed, { formula: {
    ...formula, anchorLink: { ...formula.anchorLink!, locator: {
      ...(formula.anchorLink!.locator as FormulaAnchorLocator), formulaSource: '$y$'
    } }
  } });
  rerender({ ...draft, nodesById: changedFormula });
  expect(getFormulaClozeEditorPresentation(parent.id)?.regions[0]?.formulaSource).toBe('$y$');
  const added = patchWorkspaceRecord(changedFormula, { text });
  rerender({ ...draft, nodesById: added });
  expect(result.current).toEqual([{ from: 13, to: 17, kind: 'highlight', nodeId: 'text' }]);
  expect(getFormulaClozeEditorPresentation(parent.id)?.regions[0]?.formulaSource).toBe('$y$');
  rerender(initialProps);
  expect(result.current).toEqual([{ from: 6, to: 10, kind: 'highlight', nodeId: 'text' }]);
  expect(getFormulaClozeEditorPresentation(parent.id)?.regions).toHaveLength(1);
  unmount();
});
