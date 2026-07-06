import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';

const mocks = vi.hoisted(() => ({
  useCompanionExternalDirectory: vi.fn(),
  useCompanionExternalDocument: vi.fn()
}));

vi.mock('../shared/localization/LocalizationProvider', () => ({
  useTranslation: () => (key: string) => key
}));

vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: mocks.useCompanionExternalDirectory,
  useCompanionExternalDocument: mocks.useCompanionExternalDocument
}));

vi.mock('./CompanionReadableArticleSurface', () => ({
  ImmersiveReadableArticle: (props: { onExit(): void; readableArticle: { title: string } }) => (
    <button onClick={props.onExit} type="button">
      Exit {props.readableArticle.title}
    </button>
  )
}));

const externalDirectory = {
  entries: [
    {
      absolutePath: 'external-1:sub/doc.md',
      documentId: 'external-1:sub/doc.md',
      extension: 'md' as const,
      fileName: 'doc.md',
      folderId: 'external-1',
      modifiedAt: '2026-04-26T01:00:00.000Z',
      openingText: 'Opening text',
      relativePath: 'sub/doc.md',
      title: 'Doc title'
    }
  ],
  folders: [{ documentCount: 1, folderPath: '/library/readwise', id: 'external-1' }]
};

function renderExternalDocumentArticle(args: {
  onChangeSelection?: (selection: CompanionDirectorySelection) => void;
  onExitArticle?: (selection: CompanionDirectorySelection) => void;
}) {
  const onChangeSelection = args.onChangeSelection ?? vi.fn<(selection: CompanionDirectorySelection) => void>();
  const onExitArticle = args.onExitArticle ?? vi.fn<(selection: CompanionDirectorySelection) => void>();
  render(
    <CompanionDirectoryContent
      onChangeSelection={onChangeSelection}
      onExitArticle={onExitArticle}
      onSelectNode={vi.fn()}
      selection={{ documentId: 'external-1:sub/doc.md', kind: 'externalDocument' }}
      snapshot={null}
      sortDirection="asc"
      sortKey="name"
    />
  );
  return { onChangeSelection, onExitArticle };
}

describe('CompanionDirectoryContent external article exit', () => {
  it('uses the article exit callback so the shell can restore navigation state', () => {
    mocks.useCompanionExternalDirectory.mockReturnValue(externalDirectory);
    mocks.useCompanionExternalDocument.mockReturnValue({
      content: '# Doc title\n\nBody',
      document_id: 'external-1:sub/doc.md',
      title: 'Doc title'
    });
    const { onChangeSelection, onExitArticle } = renderExternalDocumentArticle({});

    fireEvent.click(screen.getByRole('button', { name: 'Exit Doc title' }));

    expect(onExitArticle).toHaveBeenCalledWith({
      directoryPath: 'sub',
      folderId: 'external-1',
      kind: 'externalDirectory'
    });
    expect(onChangeSelection).not.toHaveBeenCalled();
  });
});