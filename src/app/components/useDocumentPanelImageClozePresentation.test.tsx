import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { expect, it, vi } from 'vitest';

import * as imageCloze from '../../features/image-cloze/model/imageCloze';
import { getImageClozeEditorPresentation, IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT } from '../../features/image-cloze/model/imageClozePresentation';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { baseNode } from './DocumentPanelSection.imageClozeTestSupport';
import { useDocumentPanelImageClozePresentation } from './useDocumentPanelImageClozePresentation';

const region = { id: 'region', x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const groups = [{ attachmentId: 'asset', regions: [region] }];
const image = '![Image](asset://asset.png)';
const parent: Node = { ...baseNode, content: `${image}\n${image}` };
const child: Node = { ...baseNode, id: 'child', parentNodeId: parent.id, imageRegions: groups };

it('keeps the registered nonempty presentation through unrelated React commits and updates real dependencies', () => {
  const derive = vi.spyOn(imageCloze, 'deriveImageClozeRegionsFromChildren');
  const notify = vi.fn();
  window.addEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, notify);
  const onOpenNode = vi.fn();
  const initial = { activeNode: parent, editorNodeId: parent.id, onOpenNode,
    nodesById: { [parent.id]: parent, child, other: { ...baseNode, id: 'other' } }, trashedNodeIds: [] as string[] };
  const hook = renderHook(useDocumentPanelImageClozePresentation, { initialProps: initial });
  const presentation = () => getImageClozeEditorPresentation(parent.id);
  expect(presentation()?.regions).toEqual([{ ...region, attachmentId: 'asset' }]);
  const initialPresentation = presentation();
  const initialCalls = derive.mock.calls.length;
  notify.mockClear();
  const changed = { ...initial, nodesById: { ...initial.nodesById,
    other: { ...initial.nodesById.other, priority: 99, updatedAt: 'later' },
    child: { ...child, priority: 12 },
  }, activeNode: { ...parent, priority: 42 }, trashedNodeIds: [] };
  act(() => hook.rerender(changed));
  expect(presentation()).toBe(initialPresentation);
  expect(notify).not.toHaveBeenCalled();
  expect(derive).toHaveBeenCalledTimes(initialCalls);
  act(() => hook.rerender({ ...changed, trashedNodeIds: ['child'] }));
  expect(presentation()).toBeNull();
  act(() => hook.rerender(changed));
  expect(presentation()?.regions).toEqual([{ ...region, attachmentId: 'asset' }]);
  const resized = { ...child, imageRegions: [{ attachmentId: 'asset', regions: [{ ...region, width: 0.8 }] }] };
  act(() => hook.rerender({ ...changed, nodesById: { ...changed.nodesById, child: resized } }));
  expect(presentation()?.regions[0]?.width).toBe(0.8);
  const callsBeforeCallback = derive.mock.calls.length;
  const nextOpenNode = vi.fn();
  act(() => hook.rerender({ ...changed, onOpenNode: nextOpenNode }));
  const callsAfterSourceReset = derive.mock.calls.length;
  act(() => hook.rerender({ ...changed, onOpenNode }));
  expect(derive.mock.calls.length).toBe(callsAfterSourceReset);
  expect(callsAfterSourceReset).toBe(callsBeforeCallback + 1);
  expect(presentation()?.onOpenNode).toBe(onOpenNode);
  hook.unmount();
  window.removeEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, notify);
  derive.mockRestore();
});

it('updates grandchild deduplication, moves, occurrence binding and source content', () => {
  const excerpt: Node = { ...child, id: 'excerpt', anchorLink: { id: 'excerpt-link', kind: 'image-excerpt',
    locator: { from: image.length + 1, to: parent.content.length, originalText: image } } };
  const grandchild: Node = { ...child, id: 'grandchild', parentNodeId: child.id };
  const initial = { activeNode: parent, editorNodeId: parent.id, onOpenNode: vi.fn(),
    nodesById: { [parent.id]: parent, child, grandchild, excerpt }, trashedNodeIds: [] as string[] };
  const hook = renderHook(useDocumentPanelImageClozePresentation, { initialProps: initial });
  const regions = () => getImageClozeEditorPresentation(parent.id)?.regions;
  const occurrence = { ...region, attachmentId: 'asset', openNodeId: 'excerpt',
    imageRange: { from: image.length + 1, to: parent.content.length } };
  expect(regions()).toEqual([occurrence]);
  hook.rerender({ ...initial, trashedNodeIds: ['grandchild'] });
  expect(regions()).toEqual([{ ...region, attachmentId: 'asset' }, occurrence]);
  hook.rerender(initial);
  expect(regions()).toEqual([occurrence]);
  hook.rerender({ ...initial, nodesById: { ...initial.nodesById, grandchild: { ...grandchild, parentNodeId: 'elsewhere' } } });
  expect(regions()).toEqual([{ ...region, attachmentId: 'asset' }, occurrence]);
  hook.rerender({ ...initial, activeNode: { ...parent, content: 'changed' } });
  expect(regions()).toBeUndefined();
  hook.unmount();
});


it('handles one committed production priority action without recomputing image regions', () => {
  const previous = useWorkspaceStore.getState();
  useWorkspaceStore.setState({ nodesById: { [parent.id]: parent, child, other: { ...baseNode, id: 'other' } } });
  const derive = vi.spyOn(imageCloze, 'deriveImageClozeRegionsFromChildren');
  const onOpenNode = vi.fn();
  const trashedNodeIds: string[] = [];
  let commits = 0;
  const hook = renderHook(() => {
    const nodesById = useWorkspaceStore((state) => state.nodesById);
    useLayoutEffect(() => { commits += 1; });
    useDocumentPanelImageClozePresentation({ activeNode: parent, editorNodeId: parent.id,
      nodesById, onOpenNode, trashedNodeIds });
  });
  const presentation = getImageClozeEditorPresentation(parent.id);
  const initialCommits = commits;
  const initialCalls = derive.mock.calls.length;
  act(() => useWorkspaceStore.getState().updateNodePriority('other', 5));
  expect(useWorkspaceStore.getState().nodesById.other?.priority).toBe(5);
  expect(commits - initialCommits).toBe(1);
  expect(derive.mock.calls.length - initialCalls).toBe(0);
  expect(getImageClozeEditorPresentation(parent.id)).toBe(presentation);
  hook.unmount();
  derive.mockRestore();
  useWorkspaceStore.setState(previous, true);
});
