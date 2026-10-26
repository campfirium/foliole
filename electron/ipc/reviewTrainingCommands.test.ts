import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleReviewTrainingCommand } from './reviewTrainingCommands.js';

vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => { throw new Error('unexpected_database_access'); } }));
vi.mock('../database/attachmentResourceDescription.js', () => ({ currentLibraryScope: () => 'current-library' }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

it('rejects malformed folder input before accessing storage', () => {
  for (const args of [{}, { folderId: 5, libraryScope: 'current-library' },
    { folderId: null, libraryScope: 'current-library', sql: 'SELECT 1' }]) {
    expect(() => handleReviewTrainingCommand(NATIVE_COMMANDS.loadReviewTrainingInput, args)).toThrow();
  }
});

it('rejects a library switch while the worker was running', () => {
  expect(() => handleReviewTrainingCommand(NATIVE_COMMANDS.loadReviewTrainingInput,
    { folderId: null, libraryScope: 'previous-library' })).toThrow('review_training_library_changed');
});

it('rejects missing or invalid training results before accessing storage', () => {
  expect(() => handleReviewTrainingCommand(NATIVE_COMMANDS.saveReviewTrainingModel, {})).toThrow();
  expect(() => handleReviewTrainingCommand(NATIVE_COMMANDS.saveReviewTrainingModel,
    { libraryScope: 'current-library', model: { folderId: 'folder', weights: [Infinity], enabled: true } })).toThrow();
});
