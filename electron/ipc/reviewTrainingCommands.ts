import { z } from 'zod';

import { isSpecialRootNode } from '../../lib/core/database/nodeMutationSpecialRoots.js';
import { readReviewTrainingInput, readReviewTrainingPlan } from '../../lib/core/database/reviewTrainingInput.js';
import { reviewModelKey, reviewTrainingModelSchema } from '../../lib/core/review/trainingModel.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { openDatabaseConnection } from '../database/connection.js';
import { writeSettingRecord } from '../database/settingRecords.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

const identity = z.object({ folderId: z.string().min(1).nullable(), libraryScope: z.string().min(1) }).strict();
const save = z.object({ model: reviewTrainingModelSchema, libraryScope: z.string().min(1) }).strict();

function assertLibrary(scope: string) {
  if (scope !== currentLibraryScope()) throw new Error('review_training_library_changed');
}

export function handleReviewTrainingCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadReviewTrainingPlan) {
    return readReviewTrainingPlan(openDatabaseConnection().driver, currentLibraryScope());
  }
  if (command === NATIVE_COMMANDS.loadReviewTrainingInput) {
    const input = identity.parse(args);
    assertLibrary(input.libraryScope);
    return readReviewTrainingInput(openDatabaseConnection().driver, input.folderId, input.libraryScope);
  }
  if (command === NATIVE_COMMANDS.saveReviewTrainingModel) {
    const input = save.parse(args);
    assertLibrary(input.libraryScope);
    const model = { ...input.model, trainedAt: new Date().toISOString() };
    const driver = openDatabaseConnection().driver;
    driver.transaction(() => {
      if (model.folderId !== null) {
        const folder = driver.queryOne('SELECT id FROM nodes WHERE id = ? AND kind = ? AND deleted_at IS NULL', [model.folderId, 'folder']);
        if (!folder || isSpecialRootNode(model.folderId)) throw new Error('review_training_folder_invalid');
      }
      writeSettingRecord(driver, { key: reviewModelKey(model.folderId), valueJson: JSON.stringify(model), updatedAt: model.trainedAt });
    });
    void requestDesktopHighValueSync();
    return null;
  }
  return undefined;
}
