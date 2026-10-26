import { generatorParameters } from 'ts-fsrs';
import { expect, it, vi } from 'vitest';

import { REVIEW_TRAINING_ENGINE } from '../../lib/core/review/trainingModel.js';
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

it('rejects retired global training requests and saves before accessing storage', () => {
  expect(() => handleReviewTrainingCommand(NATIVE_COMMANDS.loadReviewTrainingInput,
    { folderId: null, libraryScope: 'current-library' })).toThrow('review_training_folder_invalid');
  const model = { folderId: null, weights: [...generatorParameters().w], enabled: false, reviewCount: 2048,
    trainedAt: '2026-10-27T00:00:00.000Z', engine: REVIEW_TRAINING_ENGINE, candidate: null, baseline: null };
  expect(() => handleReviewTrainingCommand(NATIVE_COMMANDS.saveReviewTrainingModel,
    { model, libraryScope: 'current-library' })).toThrow('review_training_folder_invalid');
});
