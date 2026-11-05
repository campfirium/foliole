// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { initialCompanionNavigation } from './companionNavigationState';
import { CompanionPdfTextVersionToolbar, useCompanionPdfReadingEntry } from './CompanionPdfReadingEntry';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Reader() {
  const reading = useCompanionPdfReadingEntry({ nodeId: 'article', title: 'PDF',
    content: '# PDF\n\nExisting readable body', pdfAttachmentId: 'pdf', bodyStatus: 'ready' });
  if (reading.isViewingOriginal) return <p>Original reader</p>;
  return <><article>Existing readable body</article>
    <CompanionPdfTextVersionToolbar onOpenPdf={reading.onOpenPdf}
      originalUnavailable={reading.originalUnavailable} onDismiss={reading.dismissOriginalUnavailable} /></>;
}

it('reopens persisted original-view state as text and keeps restricted clicks out of durable navigation', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 13; wv) Chrome/108.0.5359.128');
  const library = await createResumeLibrary();
  try {
    let snapshot = await library.snapshot();
    const scope = snapshot.libraryScope!;
    const old = { ...initialCompanionNavigation(true), originalPdfNodeId: 'article' };
    await saveCompanionNavigationResume(scope, JSON.stringify(old));
    const tree = () => <LocalizationProvider initialLanguagePreference="en">
      <CompanionNavigationProvider ready snapshot={snapshot} libraryScope={scope}><Reader /></CompanionNavigationProvider>
    </LocalizationProvider>;
    const first = render(tree());
    expect(await screen.findByText('Existing readable body')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Android System WebView');
    expect(screen.getByText('Existing readable body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await runCompanionSyncWriterTask(async () => undefined);
    expect(JSON.parse((await loadCompanionNavigationResume(scope))!)).toMatchObject(old);
    first.unmount();
    snapshot = await library.reopen();
    render(tree());
    expect(await screen.findByText('Existing readable body')).toBeInTheDocument();
    expect(screen.queryByText('Original reader')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  } finally { cleanup(); await library.close(); }
});
