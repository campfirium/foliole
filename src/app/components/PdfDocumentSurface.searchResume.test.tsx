import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import type { NativePdfDocumentSearchResult } from '../../../lib/platform/nativePdfDocumentSearchContract';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import '../../test/reactPdfMock';

import { PdfDocumentSurface } from './PdfDocumentSurface';

vi.mock('../../features/pdf/components/PdfReadingViewContext', () => ({
  usePdfReadingView: () => null,
  PdfReadingViewProvider: ({ children }: { children: ReactNode }) => children
}));

const attachmentId = 'a'.repeat(64);
const resumeContext = {
  clock: {}, contentHash: 'b'.repeat(64), libraryEpoch: 'library', nodeId: 'reader',
  offset: null, pdfAttachmentId: attachmentId
};
const matches = [1, 2].map(page => ({
  fragments: [{ end: 7, page, start: 0 }], id: `${page}:0`, match_start: 0, page
}));

afterEach(() => {
  delete window.electronAPI;
});

it('keeps the second match as the reading position when a refined query has no matches', async () => {
  let finishSearch!: (result: NativePdfDocumentSearchResult) => void;
  const pending = new Promise<NativePdfDocumentSearchResult>(resolve => { finishSearch = resolve; });
  const invoke = vi.fn(async (command: string, args?: { query?: string }) => {
    if (command === NATIVE_COMMANDS.loadReadingResume) return resumeContext;
    if (command === NATIVE_COMMANDS.searchPdfDocument) {
      return args?.query === 'keyword' ? { matches, status: 'ready' } : pending;
    }
    return null;
  });
  const unlisten = () => () => undefined;
  window.electronAPI = {
    invoke: invoke as unknown as NativeInvoke,
    onManagedInboxUpdated: unlisten,
    onNativeMenuCommand: unlisten,
    onSearchIndexRebuildStatus: unlisten,
    onWindowResized: unlisten
  };

  const persist = vi.fn();
  renderWithLocalization(<PdfDocumentSurface
    highlightLocators={[]}
    nodeId="reader"
    onPersistViewState={persist}
    pdfIndexStatus="ready"
    persistedPageCount={9}
    persistedPageDimensions={{}}
    sourceHint={`foliole-asset://attachment/${attachmentId}.pdf`}
  />);
  const input = await screen.findByLabelText('PDF search');

  fireEvent.change(input, { target: { value: 'keyword' } });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 2'));
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('2 / 2'));
  expect(persist).toHaveBeenLastCalledWith(
    expect.objectContaining({ selection: expect.objectContaining({ from: 2 }) }), resumeContext
  );

  const writesBeforeRefining = persist.mock.calls.length;
  fireEvent.change(input, { target: { value: 'keyword-never-occurs' } });
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.searchPdfDocument, { node_id: 'reader', query: 'keyword-never-occurs' });
  await act(async () => finishSearch({ matches: [], status: 'ready' }));

  expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('No matches');
  expect(persist).toHaveBeenCalledTimes(writesBeforeRefining);
  expect(persist).toHaveBeenLastCalledWith(
    expect.objectContaining({ selection: expect.objectContaining({ from: 2 }) }), resumeContext
  );
});
