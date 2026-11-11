import { webcrypto } from 'node:crypto';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { loadDesktopReadingResume, saveDesktopReadingResume } from '../../electron/database/readingResume';
import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { parseReadingResumeState, readReadingResumeOffset } from '../../lib/core/sync/readingResumeState';
import { encodePdfReadingPosition, pdfReadingContentHash } from '../../lib/platform/pdfReadingPosition';
import { CodeMirrorEditorNavigation } from '../features/editor/adapters/codeMirrorEditorNavigation';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionPdfTextResume } from '../shared/platform/companion/reading/companionPdfTextResume';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { currentCompanionRequestSyncDatabaseHost } from '../shared/platform/companion/sync/framed/companionRequestSyncDatabaseHost';
import { loadCompanionReadableArticle, loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node, publish } from '../test/dailyFlowExceptions.testSupport';

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

const attachment = 'a'.repeat(64);
const pdfPages = ['Opening words', 'Third page words', 'Fifth page words'];
const storedOffset = (page: number) => encodePdfReadingPosition(page, 0.75);

function seedDesktopPdf(peer: Peer) {
  node(peer, 'article', 'topic');
  peer.db.prepare("UPDATE nodes SET content = ?, resource_references = ? WHERE id = 'article'")
    .run('# article\n\nLinked PDF source ready for the reader surface.',
      JSON.stringify([{ storage_key: `${attachment}.pdf`, role: 'reference', original_name: 'Original.pdf' }]));
  publish(peer, 'article');
}

function saveDesktopPage(peer: Peer, page: number) {
  const context = loadDesktopReadingResume(peer.driver, 'article', attachment);
  expect(context).not.toBeNull();
  saveDesktopReadingResume(peer.driver, { context: context!, offset: storedOffset(page),
    hostName: peer.name, updatedAt: new Date().toISOString() });
}

async function mountPdfSurface() {
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  const article = (await loadCompanionPdfTextResume((await loadCompanionReadableArticle(snapshot, 'article'))!))!;
  expect(article.pdfTextReading?.starts.map(row => row.page)).toEqual([1, 3, 5]);
  const restoreGeometry = installReadingRangeGeometry();
  let visible = article.pdfTextReading!.starts[0]!.start;
  vi.spyOn(CodeMirrorEditorNavigation.prototype, 'getDocumentPositionAtViewportY').mockImplementation(() => visible);
  const reveal = vi.spyOn(CodeMirrorEditorNavigation.prototype, 'revealReadingPosition').mockImplementation(offset => { visible = offset; });
  let flush!: () => Promise<void>;
  function ReadingSurface() {
    const scroll = useCompanionViewStateSync({ activeAction: 'recent', readableArticleNodeId: 'article',
      reviewNodeId: null, selectedBrowseNodeId: 'article' });
    flush = scroll.flush;
    return <ImmersiveReadableArticle onExit={() => {}} onScrollTopChange={scroll} readableArticle={article} snapshot={snapshot} />;
  }
  const view = render(<LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><CompanionDraftProvider>
    <ReadingSurface />
  </CompanionDraftProvider></MouseGestureSettingsProvider></LocalizationProvider>);
  await screen.findByText(pdfPages[0]!);
  const surface = view.container.querySelector('[data-companion-reading-surface]')!;
  return { restoreGeometry, reveal, surface, flush: () => act(flush), moveToPageThree: () => {
    visible = article.pdfTextReading!.starts[1]!.start;
    fireEvent.wheel(surface, { deltaY: -60 });
    fireEvent.scroll(surface, { target: { scrollTop: 600 } });
  } };
}

it('offers a committed desktop PDF page on the open mobile reader and jumps only on acceptance', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  const { exchangeBodySyncOverHttp } = await import('../test/bodySyncHttp.testSupport');
  const library = await createSearchLibrary(0);
  let restoreGeometry: (() => void) | undefined;
  try {
    const { desktop, mobile } = await connectCompanionPeer(library);
    const host = await currentCompanionRequestSyncDatabaseHost();
    const exchange = () => exchangeBodySyncOverHttp(desktop, mobile, host);
    seedDesktopPdf(desktop);
    await exchange();
    const addPage = library.database.prepare('INSERT INTO pdf_page_text(attachment_id,page,text) VALUES (?,?,?)');
    pdfPages.forEach((text, index) => addPage.run(attachment, index * 2 + 1, text));
    const reader = await mountPdfSurface();
    restoreGeometry = reader.restoreGeometry;
    const mobileOffset = () => {
      const payload = library.database.prepare("SELECT payload_json FROM node_reading_resume WHERE node_id='article'").pluck().get() as string;
      return readReadingResumeOffset(parseReadingResumeState(payload), pdfReadingContentHash(attachment));
    };
    const jump = () => screen.queryByRole('button', { name: 'Jump to position' });

    saveDesktopPage(desktop, 3);
    await act(exchange);
    expect(await screen.findByRole('button', { name: 'Jump to position' })).toBeVisible();
    expect(reader.reveal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
    await reader.flush();
    expect(jump()).toBeNull();
    expect(mobileOffset()).toBe(storedOffset(3));
    expect(reader.reveal).not.toHaveBeenCalled();

    saveDesktopPage(desktop, 1);
    await act(exchange);
    expect(mobileOffset()).toBe(storedOffset(1));
    expect(jump()).toBeNull();

    saveDesktopPage(desktop, 5);
    await act(exchange);
    expect(reader.reveal).not.toHaveBeenCalled();
    fireEvent.wheel(reader.surface, { deltaY: 40 });
    fireEvent.click(await screen.findByRole('button', { name: 'Jump to position' }));
    fireEvent.scroll(reader.surface, { target: { scrollTop: 900 } });
    expect(reader.reveal).toHaveBeenCalledExactlyOnceWith('# article\n\nOpening words\n\nThird page words\n\n'.length);
    expect(jump()).toBeNull();
    await reader.flush();
    expect(mobileOffset()).toBe(storedOffset(5));
    expect(library.database.prepare("SELECT scroll_top FROM node_view_state WHERE node_id='article'").get()).toBeUndefined();
    reader.moveToPageThree();
    await reader.flush();
    expect(mobileOffset()).toBe(encodePdfReadingPosition(3, 0));
    await act(exchange);
    expect(loadDesktopReadingResume(desktop.driver, 'article', attachment)?.offset).toBe(encodePdfReadingPosition(3, 0));
  } finally {
    cleanup();
    restoreGeometry?.();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await library.close();
    await closeLibraries();
  }
});
