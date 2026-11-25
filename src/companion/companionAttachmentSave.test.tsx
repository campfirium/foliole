import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import {
  companionAttachmentFileName,
  findCompanionImageStorageKey
} from '../shared/platform/companion/reading/companionAttachmentSave';

import { CompanionImageCopyMenu } from './CompanionImageCopyMenu';
import { ReadingActionsLayer } from './CompanionReadingActionsLayer';

const native = vi.hoisted(() => ({ saveAttachment: vi.fn(), resolve: vi.fn(), pluginAvailable: true }));
vi.mock('@capacitor/core', async (load) => {
  const core = await load<typeof import('@capacitor/core')>();
  return {
    ...core,
    Capacitor: { ...core.Capacitor, isNativePlatform: () => true, isPluginAvailable: () => native.pluginAvailable },
    registerPlugin: (name: string) => name === 'FolioleArticleHandoff'
      ? { saveAttachment: native.saveAttachment } : core.registerPlugin(name)
  };
});
vi.mock('../shared/platform/attachmentResources', async (load) => ({
  ...await load<object>(), resolveRuntimeAttachmentResource: native.resolve
}));

const pdfHash = 'b'.repeat(64);
const imageHash = 'a'.repeat(64);

beforeEach(() => {
  native.pluginAvailable = true;
  native.saveAttachment.mockReset().mockResolvedValue({ status: 'saved' });
  native.resolve.mockReset().mockResolvedValue({ status: 'ready', resource_url: 'file:///x', mime_type: 'application/pdf' });
});
afterEach(cleanup);

it('names saved files safely and keeps the stored extension', () => {
  expect(companionAttachmentFileName('Report: Q1/Q2', '.pdf', 'Document')).toBe('Report_ Q1_Q2.pdf');
  expect(companionAttachmentFileName('paper.PDF', '.pdf', 'Document')).toBe('paper.PDF');
  expect(companionAttachmentFileName('  ', '.png', 'Image')).toBe('Image.png');
  expect(companionAttachmentFileName('..hidden', '.png', 'Image')).toBe('hidden.png');
});

it('finds only library image attachments in image Markdown', () => {
  expect(findCompanionImageStorageKey(`![Diagram|320](asset://${imageHash}.png)`)).toBe(`${imageHash}.png`);
  expect(findCompanionImageStorageKey('![Remote](https://example.com/a.png)')).toBeNull();
  expect(findCompanionImageStorageKey(`![Bad](asset://${imageHash}.pdf)`)).toBeNull();
});

function renderPdfActions(close = vi.fn(), pdfAttachmentId: string | null = pdfHash) {
  renderWithLocalization(<ReadingActionsLayer actionsOpen onOpenActions={close} onFindInDocument={() => {}}
    onOpenReadingSheet={() => {}} handoffContext={{ snapshot: null, isContentEditing: false }}
    readableArticle={{ title: 'Field notes', nodeId: 'topic', bodyStatus: 'ready', content: 'Body',
      hideTitleHeading: false, persistedNodeViewState: null, pdfAttachmentId, textAnchorDecorations: [] }} />);
  return close;
}

it('saves the stored PDF original from the reading actions and closes the sheet', async () => {
  const close = renderPdfActions();
  fireEvent.click(screen.getByRole('button', { name: 'Export original PDF…' }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(native.resolve).toHaveBeenCalledWith(`asset://${pdfHash}.pdf`);
  expect(native.saveAttachment).toHaveBeenCalledExactlyOnceWith({
    storage_key: `${pdfHash}.pdf`, content_hash: pdfHash, mime_type: 'application/pdf', file_name: 'Field notes.pdf'
  });
});

it('keeps the sheet open with a message when the PDF original is not on this device', async () => {
  native.resolve.mockResolvedValue({ status: 'missing_file', resource_url: null, mime_type: 'application/pdf' });
  const close = renderPdfActions();
  fireEvent.click(screen.getByRole('button', { name: 'Export original PDF…' }));
  expect(await screen.findByText('Could not export this PDF.')).toBeInTheDocument();
  expect(native.saveAttachment).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it('offers no PDF save for topics without an original or without the native host', () => {
  renderPdfActions(vi.fn(), null);
  expect(screen.queryByRole('button', { name: 'Export original PDF…' })).not.toBeInTheDocument();
  cleanup();
  native.pluginAvailable = false;
  renderPdfActions();
  expect(screen.queryByRole('button', { name: 'Export original PDF…' })).not.toBeInTheDocument();
});

it('saves a library image from the long-press menu under its alt text', async () => {
  const onClose = vi.fn();
  renderWithLocalization(<CompanionImageCopyMenu markdown={`![Diagram|320](asset://${imageHash}.png)`}
    x={10} y={10} onClose={onClose} isCurrent={() => true} />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Export image' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(native.saveAttachment).toHaveBeenCalledExactlyOnceWith({
    storage_key: `${imageHash}.png`, content_hash: imageHash, mime_type: 'image/png', file_name: 'Diagram.png'
  });
});

it('does not offer saving for images outside the library', () => {
  renderWithLocalization(<CompanionImageCopyMenu markdown="![Remote](https://example.com/a.png)"
    x={10} y={10} onClose={() => {}} isCurrent={() => true} />);
  expect(screen.getByRole('menuitem', { name: 'Copy image' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Export image' })).not.toBeInTheDocument();
});
