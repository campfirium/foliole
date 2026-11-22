import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/databaseBackupRuntimeRepository', () => ({
  mergeLibraryInRuntime: vi.fn(),
  pickLibraryMergeAttachmentsInRuntime: vi.fn(),
  pickLibraryMergeSourceInRuntime: vi.fn()
}));

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import {
  mergeLibraryInRuntime,
  pickLibraryMergeAttachmentsInRuntime,
  pickLibraryMergeSourceInRuntime
} from '../../../../shared/platform/databaseBackupRuntimeRepository';

import { LibraryMergeSection } from './LibraryMergeSection';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pickLibraryMergeSourceInRuntime).mockResolvedValue({ sourcePath: '/old/Backups/foliole-2026.db.gz', attachmentsDirectory: null });
  vi.mocked(pickLibraryMergeAttachmentsInRuntime).mockResolvedValue('/old/Assets');
});

it('merges the chosen library with the chosen attachments folder and reports what it added', async () => {
  vi.mocked(mergeLibraryInRuntime).mockResolvedValue({ added: 4, alternatives: 1, unchanged: 2, skippedDeleted: 1,
    reviewsAdded: 7, attachmentsCopied: 3, attachmentsMissing: 0, folderId: 'folder' });
  renderWithLocalization(<LibraryMergeSection isDesktopRuntime />);

  fireEvent.click(screen.getByRole('button', { name: 'Choose library' }));
  expect(await screen.findByText('Library: foliole-2026.db.gz')).toBeTruthy();
  expect(screen.getByText('No attachments folder found. Missing attachments are only counted.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  expect(await screen.findByText('Attachments folder: /old/Assets')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

  expect(await screen.findByText(/Added 4 notes, 1 text alternatives and 7 review records/)).toBeTruthy();
  expect(mergeLibraryInRuntime).toHaveBeenCalledWith({ sourcePath: '/old/Backups/foliole-2026.db.gz',
    attachmentsDirectory: '/old/Assets', folderTitle: expect.stringMatching(/^Merged library · foliole-2026\.db\.gz · \d{4}-\d{2}-\d{2}$/) });
});

it('takes a phone backup zip with the attachments inside it', async () => {
  vi.mocked(pickLibraryMergeSourceInRuntime).mockResolvedValue({ sourcePath: '/Downloads/phone-backup.zip', attachmentsDirectory: null });
  vi.mocked(mergeLibraryInRuntime).mockResolvedValue({ added: 1, alternatives: 0, unchanged: 0, skippedDeleted: 0,
    reviewsAdded: 2, attachmentsCopied: 1, attachmentsMissing: 0, folderId: 'folder' });
  renderWithLocalization(<LibraryMergeSection isDesktopRuntime />);

  fireEvent.click(screen.getByRole('button', { name: 'Choose library' }));
  expect(await screen.findByText('Attachments are taken from inside the phone backup.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Choose folder' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

  expect(await screen.findByText(/Added 1 notes/)).toBeTruthy();
  expect(mergeLibraryInRuntime).toHaveBeenCalledWith(expect.objectContaining({ sourcePath: '/Downloads/phone-backup.zip', attachmentsDirectory: null }));
});

it('names an unreadable phone backup in plain words instead of showing the error code', async () => {
  vi.mocked(mergeLibraryInRuntime).mockRejectedValue(new Error("Error invoking remote method: library_merge_archive_invalid"));
  renderWithLocalization(<LibraryMergeSection isDesktopRuntime />);

  fireEvent.click(screen.getByRole('button', { name: 'Choose library' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));

  await waitFor(() => expect(screen.getByText('Merge stopped. This zip is not a readable phone backup.')).toBeTruthy());
});
