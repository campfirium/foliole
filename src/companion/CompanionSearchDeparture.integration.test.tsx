import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import * as searchApi from '../shared/platform/companionFullTextSearch';

import { CompanionSearchContent } from './CompanionSearchContent';
import { renderCompanionShellSearchSurface } from './CompanionShellSearchSurface';
import { useCompanionSearchNavigation } from './useCompanionSearchNavigation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub
  };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await library?.close();
  library = null;
});

it('ignores a pending topic open after leaving search while a current open still succeeds', async () => {
  library = await createSearchLibrary(1, 10);
  const onOpen = vi.fn();
  const view = renderWithLocalization(<CompanionSearchContent onOpenTopic={onOpen} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
  const topic = await screen.findByRole('button', { name: /000000/ });
  const available = searchApi.isCompanionSearchTopicAvailable;
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  let finished!: () => void;
  const completed = new Promise<void>((resolve) => { finished = resolve; });
  const read = vi.spyOn(searchApi, 'isCompanionSearchTopicAvailable').mockImplementationOnce(async (id) => {
    const result = await available(id);
    await waiting;
    finished();
    return result;
  });
  fireEvent.click(topic);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => { finish(); await completed; });
  expect(onOpen).not.toHaveBeenCalled();
  renderWithLocalization(<CompanionSearchContent onOpenTopic={onOpen} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
  fireEvent.click(await screen.findByRole('button', { name: /000000/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ nodeId: '000000' }), 'alpha');
});

vi.mock('./CompanionShellReadableArticle', () => ({
  CompanionShellReadableArticle: ({ onExit, surface }: { onExit(): void; surface: { readableArticle: unknown } }) =>
    surface.readableArticle ? <button onClick={onExit}>Return to results</button> : null
}));

function SearchNavigationSurface({ loadBody }: { loadBody(): Promise<void> }) {
  const [activeAction, setActiveAction] = useState<'search' | 'recent'>('search');
  const [selected, setSelected] = useState<string | null>(null);
  const [article, setArticle] = useState<{ nodeId: string } | null>(null);
  const surface = {
    activeAction, selectedBrowseNodeId: selected, readableArticle: article,
    handleSelectBrowseNode(nodeId: string) {
      setSelected(nodeId); setActiveAction('recent');
      void loadBody().then(() => setArticle({ nodeId }));
    },
    handleExitSearchArticle() { setSelected(null); setArticle(null); setActiveAction('search'); }
  };
  const navigation = useCompanionSearchNavigation(surface as never);
  return renderCompanionShellSearchSurface({
    externalDocument: navigation.externalDocument, pdfResult: navigation.pdfResult,
    isTopicOpen: navigation.isTopicOpen, onExitTopic: navigation.exitTopic,
    onExitExternalDocument: navigation.exitExternalDocument, onExitPdf: navigation.exitPdf,
    onOpenTopic: navigation.openTopic, onOpenExternalDocument: navigation.openExternalDocument,
    onOpenPdf: navigation.openPdf, searchMatch: navigation.searchMatch,
    surface: surface as never, workspaceSync: { state: { endpoint_url: null, remembered_targets: [] } } as never
  });
}

it('retains the fixed query and loaded SQLite results while a topic body loads and after returning', async () => {
  library = await createSearchLibrary();
  let finish!: () => void;
  const pendingBody = new Promise<void>((resolve) => { finish = resolve; });
  library.database.exec('DELETE FROM external_documents; DELETE FROM pdf_page_text');
  const loadBody = vi.fn(() => pendingBody);
  renderWithLocalization(<SearchNavigationSurface loadBody={loadBody} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
  await screen.findByRole('button', { name: /000124/ });
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await screen.findByRole('button', { name: /000085/ });
  fireEvent.click(screen.getByRole('button', { name: /000124/ }));
  await waitFor(() => expect(loadBody).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Return to results' })).toBeNull();
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue('alpha'));
  await act(async () => { finish(); await pendingBody; });
  fireEvent.click(await screen.findByRole('button', { name: 'Return to results' }));
  expect(screen.getByRole('searchbox')).toHaveValue('alpha');
  expect(screen.getByRole('button', { name: /000085/ })).toBeInTheDocument();
});
