import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { ExternalDocumentPreviewPanel } from './ExternalDocumentPreviewPanel';

const mocks = vi.hoisted(() => ({
  editorAppearanceKey: 'preview',
  loadPreview: vi.fn(),
  markdownEditorMounted: vi.fn()
}));

vi.mock('../../shared/platform/externalDocumentPreviewRepository', () => ({
  loadExternalDocumentPreview: (absolutePath: string) => mocks.loadPreview(absolutePath)
}));

vi.mock('../../shared/platform/externalDocumentImportRepository', () => ({
  importExternalDocument: vi.fn()
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => {
    React.useEffect(() => {
      mocks.markdownEditorMounted();
    }, []);
    return <div>{props.value}</div>;
  }
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: mocks.editorAppearanceKey })
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
  mocks.editorAppearanceKey = 'preview';
  mocks.loadPreview.mockReset();
  mocks.markdownEditorMounted.mockReset();
});

it('remounts the floating external preview editor when editor appearance changes', async () => {
  mocks.loadPreview.mockResolvedValue({
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });
  const props = {
    onClose: vi.fn(),
    onOpenImportedNode: vi.fn(),
    onOpenInExternalLibrary: vi.fn(),
    request: { absolutePath: '/library/topic.md', folderId: 'folder-1' }
  };

  const { rerender } = render(<ExternalDocumentPreviewPanel {...props} />);
  await screen.findByText('# Topic');
  expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(1);

  mocks.editorAppearanceKey = 'source';
  rerender(<ExternalDocumentPreviewPanel {...props} />);

  expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(2);
});
