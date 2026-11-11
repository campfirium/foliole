import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { parseReadingResumeState, readReadingResumeOffset } from '../../lib/core/sync/readingResumeState';
import { encodePdfReadingPosition, pdfReadingContentHash } from '../../lib/platform/pdfReadingPosition';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionPdfTextResume } from '../shared/platform/companion/reading/companionPdfTextResume';
import { loadCompanionReadableArticle } from '../shared/platform/companionWorkspaceSync';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';
import { useCompanionViewStateSync } from './useCompanionViewStateSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

const attachment = 'b'.repeat(64);
type Library = Awaited<ReturnType<typeof createResumeLibrary>>;

function seedPdf(library: Library) {
  library.database.prepare("UPDATE nodes SET content = ?, resource_references = ? WHERE id = 'article'")
    .run('# Article\n\nLinked PDF source ready for the reader surface.',
      JSON.stringify([{ storage_key: `${attachment}.pdf`, role: 'reference', original_name: 'Original.pdf' }]));
  const addPage = library.database.prepare('INSERT INTO pdf_page_text(attachment_id,page,text) VALUES (?,?,?)');
  addPage.run(attachment, 1, 'Opening words');
  addPage.run(attachment, 3, '## Third chapter\n\nHighlighted words');
  addPage.run(attachment, 5, '## Fifth chapter\n\nUnique search result');
  const highlightedText = 'Highlighted words';
  const from = '# Article\n\nOpening words\n\n## Third chapter\n\n'.length;
  const anchor = { id: 'highlight', kind: 'highlight',
    locator: { from, to: from + highlightedText.length, originalText: highlightedText } };
  library.database.prepare(`INSERT INTO nodes (id,parent_id,title,kind,content,anchor_link,created_at,updated_at)
    VALUES ('highlight','article','Highlighted words','topic','Highlighted words',?,'2026-11-11','2026-11-11')`)
    .run(JSON.stringify(anchor));
}

async function renderReader(library: Library, searchMatch?: { matchStart: number; query: string }) {
  const snapshot = await library.reopen();
  const article = (await loadCompanionPdfTextResume((await loadCompanionReadableArticle(snapshot, 'article'))!))!;
  expect(article.pdfTextReading?.starts.map(row => row.page)).toEqual([1, 3, 5]);
  function Reader() {
    const scroll = useCompanionViewStateSync({ activeAction: 'recent', readableArticleNodeId: 'article',
      reviewNodeId: null, selectedBrowseNodeId: 'article' });
    return <ImmersiveReadableArticle snapshot={snapshot} readableArticle={article} onExit={() => {}}
      searchMatch={searchMatch} onScrollTopChange={scroll} />;
  }
  return render(<LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><CompanionDraftProvider>
    <Reader />
  </CompanionDraftProvider></MouseGestureSettingsProvider></LocalizationProvider>);
}

function currentOffset(library: Library) {
  const payload = library.database.prepare("SELECT payload_json FROM node_reading_resume WHERE node_id='article'").pluck().get();
  return typeof payload === 'string'
    ? readReadingResumeOffset(parseReadingResumeState(payload), pdfReadingContentHash(attachment)) : undefined;
}

async function chooseOutline(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(await within(dialog).findByRole('button', { name: label }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

it('persists the original PDF page after opening a search hit and after choosing headings and highlights', async () => {
  const library = await createResumeLibrary();
  const restoreGeometry = installReadingRangeGeometry();
  try {
    seedPdf(library);
    await renderReader(library, { matchStart: 0, query: 'Unique search result' });
    const body = await screen.findByRole('document', { name: 'Topic body' });
    await waitFor(() => expect(currentOffset(library)).toBe(encodePdfReadingPosition(5, 0)), { timeout: 2500 });
    fireEvent.click(body);
    await chooseOutline('Third chapter');
    await waitFor(() => expect(currentOffset(library)).toBe(encodePdfReadingPosition(3, 0)), { timeout: 2500 });
    await chooseOutline('Fifth chapter');
    await waitFor(() => expect(currentOffset(library)).toBe(encodePdfReadingPosition(5, 0)), { timeout: 2500 });
    await chooseOutline('Highlighted words');
    await waitFor(() => expect(currentOffset(library)).toBe(encodePdfReadingPosition(3, 0)), { timeout: 2500 });
  } finally {
    cleanup();
    restoreGeometry();
    await library.close();
  }
});

it('keeps an in-document search match as the new PDF position when the reader closes the search', async () => {
  const library = await createResumeLibrary();
  const restoreGeometry = installReadingRangeGeometry();
  try {
    seedPdf(library);
    await renderReader(library);
    fireEvent.click(await screen.findByRole('document', { name: 'Topic body' }));
    fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Find in document' }));
    const field = await screen.findByRole('textbox', { name: 'Find in document' });
    fireEvent.change(field, { target: { value: 'Unique search result' } });
    await waitFor(() => expect(screen.getByTestId('companion-document-search-status')).toHaveTextContent('1 / 1'));
    expect(currentOffset(library)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close document search' }));
    await waitFor(() => expect(currentOffset(library)).toBe(encodePdfReadingPosition(5, 0)), { timeout: 2500 });
  } finally {
    cleanup();
    restoreGeometry();
    await library.close();
  }
});

it('saves an applied PDF jump when the reader leaves before the completion callback', async () => {
  const library = await createResumeLibrary();
  const restoreGeometry = installReadingRangeGeometry();
  try {
    seedPdf(library);
    const reader = await renderReader(library);
    const body = await screen.findByRole('document', { name: 'Topic body' });
    const editor = EditorView.findFromDOM(body)!;
    fireEvent.click(body);
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fifth chapter' }));
    await waitFor(() => expect(editor.state.selection.main.from).toBe(editor.state.doc.toString().indexOf('Fifth chapter')));
    expect(currentOffset(library)).toBeUndefined();
    reader.unmount();
    await waitFor(() => expect(currentOffset(library)).toBe(encodePdfReadingPosition(5, 0)), { timeout: 2500 });
    await library.reopen();
    expect(currentOffset(library)).toBe(encodePdfReadingPosition(5, 0));
  } finally {
    cleanup();
    restoreGeometry();
    await library.close();
  }
});
