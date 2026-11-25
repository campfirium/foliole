import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import * as previewRuntime from '../../shared/platform/externalDocumentPreviewRepository';
import * as browseRuntime from '../../shared/platform/externalLibraryBrowseRepository';
import { useExternalLibraryView } from '../hooks/useExternalLibraryView';

import { resetExternalCollapsedRowIds } from './externalLibraryCollapseSettings';
import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import { externalDocumentSurfaceFolders } from './ExternalLibraryDocumentSurface.testSupport';
import { useExternalSearchPreviewDocument } from './externalSearchPreviewState';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

vi.mock('./ExternalPreviewContent', () => ({
  ExternalPreviewContent: ({ preview }: { preview: previewRuntime.ExternalDocumentPreview }) => <div>{preview.content}</div>
}));

const folderA = { ...externalDocumentSurfaceFolders[0]!, folderPath: '/library/Folder A' };
const readwiseArticles = { ...folderA, id: 'readwise-reader-import-articles', folderPath: '/library/Articles' };
const readwiseBooks = { ...folderA, id: 'readwise-reader-import-books', folderPath: '/library/Books' };
const folders = [folderA, readwiseArticles, readwiseBooks];

function entry(folder: typeof folderA, title: string, relativePath: string): browseRuntime.ExternalLibraryBrowseEntry {
  return {
    absolutePath: `${folder.folderPath}/${relativePath}`,
    extension: 'md',
    fileName: `${title}.md`,
    folderId: folder.id,
    folderPath: folder.folderPath,
    modifiedAt: folder.updatedAt,
    openingText: title.includes('Other') ? null : 'Shared search match',
    relativePath,
    title
  };
}

const nestedDocument = entry(folderA, 'Nested note', 'sub/Nested note.md');
const article = entry(readwiseArticles, 'An article', 'sub/An article.md');
const book = entry(readwiseBooks, 'A book', 'A book.md');
const entries = [nestedDocument, article, book, entry(folderA, 'Other note', 'Other note.md')];
const nodesById = { notes: createWorkspaceContentNode({ id: 'notes', kind: 'folder', title: 'Notes' }) };
const noop = () => undefined;

function ExternalWorkspace() {
  const view = useExternalLibraryView();
  const document = view.selection.kind === 'document' ? view.selection : null;
  const previewState = useExternalSearchPreviewDocument(document?.absolutePath ?? null, {
    folderId: document?.folderId,
    sourceKind: document?.sourceKind
  });

  return (
    <>
      <button disabled={!view.canGoBack} onClick={view.goBack} type="button">History back</button>
      <button disabled={!view.canGoForward} onClick={view.goForward} type="button">History forward</button>
      <WorkspaceDualListContent activeNodeId="notes" externalEntriesByFolderId={view.entriesByFolderId}
        externalFolders={view.folders} externalSelection={view.selection} isExternalViewOpen={view.isExternalViewOpen}
        isStudyMode={false} isTrashViewOpen={false} isVirtualViewOpen={false} nodesById={nodesById} listNodesById={nodesById}
        nodeOrder={['notes']} onOpenExternalSelection={view.openExternalSelection} onOpenMoveToNode={noop} onOpenNotesView={noop}
        onOpenTrashView={noop} onSelectNode={noop} onSelectNodeInVirtualView={noop} onSelectTrashNode={noop}
        reviewCurrentNodeId={null} selectedTrashNodeId={null} trashedNodeIds={[]} />
      {view.isExternalViewOpen && (
        <ExternalLibraryDocumentSurface canGoBack={view.canGoBack} canGoForward={view.canGoForward}
          documentMaxWidth={760} editorAppearanceKey="preview" entriesByFolderId={view.entriesByFolderId}
          folders={view.folders} onGoBack={view.goBack} onGoForward={view.goForward} onOpenImportedNode={noop}
          onOpenSelection={view.openExternalSelection} onPreviewEditorReady={noop} previewState={previewState}
          selection={view.selection} />
      )}
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetExternalCollapsedRowIds();
  vi.spyOn(browseRuntime, 'loadExternalLibraryFolders').mockResolvedValue(folders);
  vi.spyOn(browseRuntime, 'loadExternalLibraryBrowseEntries').mockImplementation(async (id) =>
    entries.filter((item) => item.folderId === id)
  );
  vi.spyOn(previewRuntime, 'loadExternalDocumentPreview').mockImplementation(async (path) => {
    const document = entries.find((item) => item.absolutePath === path);
    return document ? { ...document, content: `Preview of ${document.title}` } : null;
  });
});

afterEach(() => vi.restoreAllMocks());

function documentList() {
  return screen.getByRole('tree', { name: 'External folder contents' });
}

function openTitleSearch(value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), { target: { value } });
}

function sortByName() {
  fireEvent.keyDown(screen.getByRole('button', { name: /Sort list by / }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Name' }));
}

function expectDocumentTitles(titles: string[]) {
  expect(within(documentList()).getAllByRole('treeitem').map((row) => row.textContent)).toEqual(titles);
}

function renderExternalWorkspace() {
  renderWithLocalization(<AppearanceSettingsProvider><ExternalWorkspace /></AppearanceSettingsProvider>);
}

it('keeps Reference selected when opening a nested document and restores that scope through history', async () => {
  renderExternalWorkspace();
  await screen.findByRole('treeitem', { name: /Folder A/ });
  const heading = screen.getByRole('treeitem', { name: 'External' });
  fireEvent.click(heading);
  await screen.findByRole('treeitem', { name: nestedDocument.title });
  sortByName();
  openTitleSearch('Shared');
  const expectedTitles = [book.title, article.title, nestedDocument.title];
  expectDocumentTitles(expectedTitles);

  const scrollContainer = documentList().closest<HTMLElement>('.app-scrollbar')!;
  scrollContainer.scrollTop = 60;
  fireEvent.click(screen.getByRole('treeitem', { name: nestedDocument.title }));
  expect(await screen.findByText(`Preview of ${nestedDocument.title}`)).toBeVisible();
  expect(heading).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: nestedDocument.title, selected: true })).toBeVisible();
  expectDocumentTitles(expectedTitles);
  expect(screen.getByRole('searchbox', { name: 'Search topic titles' })).toHaveValue('Shared');
  expect(documentList().closest('.app-scrollbar')).toBe(scrollContainer);
  expect(scrollContainer.scrollTop).toBe(60);
  expect(screen.getByRole('button', { name: 'Refresh external documents' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'History back' }));
  expect(heading).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: nestedDocument.title, selected: false })).toBeVisible();
  expect(screen.queryByText(`Preview of ${nestedDocument.title}`)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
  expect(await screen.findByText(`Preview of ${nestedDocument.title}`)).toBeVisible();
  expect(heading).toHaveAttribute('aria-selected', 'true');
  expectDocumentTitles(expectedTitles);
});

it('keeps Readwise selected during keyboard opening, then follows explicit folder and directory selection', async () => {
  renderExternalWorkspace();
  const readwise = await screen.findByRole('treeitem', { name: 'Readwise' });
  fireEvent.click(readwise);
  await screen.findByRole('treeitem', { name: book.title });
  sortByName();
  fireEvent.keyDown(screen.getByRole('treeitem', { name: book.title }), { key: 'ArrowDown' });
  expect(await screen.findByText(`Preview of ${article.title}`)).toBeVisible();
  expect(readwise).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: article.title, selected: true })).toBeVisible();
  expectDocumentTitles([book.title, article.title]);

  const folder = screen.getByRole('treeitem', { name: /Folder A/ });
  fireEvent.click(folder);
  expect(folder).toHaveAttribute('aria-selected', 'true');
  expectDocumentTitles([nestedDocument.title, 'Other note']);
  fireEvent.keyDown(folder, { key: 'ArrowRight' });
  fireEvent.click(screen.getByRole('treeitem', { name: /^sub\b/ }));
  expect(screen.getByRole('treeitem', { name: /^sub\b/, selected: true })).toBeVisible();
  expectDocumentTitles([nestedDocument.title]);
  fireEvent.click(screen.getByRole('treeitem', { name: nestedDocument.title }));
  expect(await screen.findByText(`Preview of ${nestedDocument.title}`)).toBeVisible();
  expect(readwise).toHaveAttribute('aria-selected', 'false');
  expect(folder).toHaveAttribute('aria-selected', 'true');
  expectDocumentTitles([nestedDocument.title]);
});
