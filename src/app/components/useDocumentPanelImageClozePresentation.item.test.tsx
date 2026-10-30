import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { getImageClozeEditorPresentation } from '../../features/image-cloze/model/imageClozePresentation';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { useDocumentPanelImageClozePresentation } from './useDocumentPanelImageClozePresentation';

it('disables new image regions in an Item even when it has no saved image regions', () => {
  const item = { id: 'item', kind: 'item', content: '![Image](asset://image.png)',
    anchorLink: null, imageRegions: null } as Node;
  const { unmount } = renderHook(() => useDocumentPanelImageClozePresentation({
    activeNode: item, editorNodeId: item.id, nodesById: { [item.id]: item },
    onOpenNode: () => {}, trashedNodeIds: []
  }));
  expect(getImageClozeEditorPresentation(item.id)).toMatchObject({ canCreate: false });
  unmount();
});
