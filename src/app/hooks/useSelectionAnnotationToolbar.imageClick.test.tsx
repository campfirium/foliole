import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { useSelectionAnnotationToolbar } from './useSelectionAnnotationToolbar';

afterEach(() => { document.body.innerHTML = ''; });

function createFixture() {
  const image = '![Cover](asset://cover.png)';
  const parent: Node = { id: 'parent', parentNodeId: null, kind: 'topic', title: 'Cover', content: image,
    createdAt: '2026-10-31', updatedAt: '2026-10-31', reveal: null, review: null };
  const child: Node = { ...parent, id: 'child', parentNodeId: parent.id, content: `${image}\n※ Existing note`,
    anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 0, to: image.length, originalText: image } },
    imageRegions: [{ attachmentId: 'cover', regions: [{ id: 'region', x: 0, y: 0, width: 1, height: 1 }] }] };
  const editor = document.createElement('div');
  editor.className = 'cm-editor';
  const surface = document.createElement('span');
  surface.className = 'cm-md-image-surface';
  surface.dataset.mdImageHighlighted = 'true';
  const region = document.createElement('div');
  region.className = 'cm-md-image-cloze-region';
  region.dataset.regionScope = 'full-image';
  region.dataset.regionId = 'region';
  const actions = document.createElement('div');
  actions.className = 'cm-md-image-cloze-actions';
  actions.hidden = true;
  surface.append(region, actions);
  editor.append(surface);
  document.body.append(editor);
  const setContextMenu = vi.fn();
  renderHook(() => useSelectionAnnotationToolbar({ activeNodeId: parent.id, editorRef: { current: null },
    isTrashViewOpen: false, nodesById: { parent, child }, selectionToolbarEnabled: true, setContextMenu,
    trashedNodeIds: [] }));
  return { actions, child, region, setContextMenu };
}

it('opens an existing image annotation from click when compatibility mouseup is absent', () => {
  const { child, region, setContextMenu } = createFixture();
  act(() => region.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
  expect(setContextMenu).toHaveBeenCalledWith(expect.objectContaining({
    existingHighlight: expect.objectContaining({ nodeId: child.id, content: child.content, note: 'Existing note' })
  }));
});

it('does not open the annotation while an image cloze draft awaits confirmation', () => {
  const { actions, region, setContextMenu } = createFixture();
  actions.hidden = false;
  act(() => region.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
  expect(setContextMenu).not.toHaveBeenCalled();
});

it('opens once when the browser delivers both mouseup and click', () => {
  const { region, setContextMenu } = createFixture();
  act(() => {
    region.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    region.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  });
  expect(setContextMenu).toHaveBeenCalledTimes(1);
});
