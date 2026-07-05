import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ExternalDocumentPreviewPanel } from './ExternalDocumentPreviewPanel';

const loadRuntimeExternalSearchPreview = vi.fn();

vi.mock('../../shared/platform/externalDocumentPreviewRepository', () => ({
  loadExternalDocumentPreview: (absolutePath: string) => loadRuntimeExternalSearchPreview(absolutePath)
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <textarea readOnly value={props.value} />
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: 'preview' })
}));

vi.mock('./LinkPanelStack', () => ({
  LinkPanelStack: () => null
}));

beforeAll(() => {
  class MockResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

beforeEach(() => {
  loadRuntimeExternalSearchPreview.mockReset();
});

it('closes the floating external preview on Escape, including fullscreen mode', async () => {
  loadRuntimeExternalSearchPreview.mockResolvedValueOnce({
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });
  const onClose = vi.fn();

  renderWithLocalization(
    <ExternalDocumentPreviewPanel
      onClose={onClose}
      onOpenImportedNode={vi.fn()}
      onOpenInExternalLibrary={vi.fn()}
      request={{
        absolutePath: '/library/topic.md',
        folderId: 'folder-1'
      }}
    />
  );

  await screen.findByDisplayValue('# Topic');
  fireEvent.click(screen.getByRole('button', { name: 'Full screen preview' }));
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Close preview' })).not.toBeInTheDocument();
});
