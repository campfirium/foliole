import { expect, it } from 'vitest';

import {
  documentPanelBodyMock,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

it('shows folder-style empty copy when the trash view has no selected topic', () => {
  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isTrashViewOpen: true,
    isWorkspaceHydrated: true,
    nodesById: {}
  });

  expect(
    documentPanelBodyMock.mock.calls.some(([props]) =>
      props &&
      typeof props === 'object' &&
      'emptyState' in props &&
      (props as { emptyState?: { title?: string; description?: string } }).emptyState?.title === 'This folder is empty' &&
      (props as { emptyState?: { description?: string } }).emptyState?.description ===
        'Topics and folders will appear here after you add them to this folder.'
    )
  ).toBe(true);
});
