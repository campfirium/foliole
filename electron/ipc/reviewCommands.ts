import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

import { bootReport } from './boot.js';
import { parseReviewGradeArgs, parseReviewPreviewArgs } from './commandParserReview.js';
import { asString } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { reviewGrade, reviewPreview } from './review.js';

export async function handleReviewCommand(request: InvokeRequest) {
  const args = (request.args ?? {}) as Record<string, unknown>;

  if (request.command === NATIVE_COMMANDS.bootReport) {
    await bootReport(asString(args.stage, 'stage'), args.payload ?? null);
    return null;
  }
  if (request.command === NATIVE_COMMANDS.reviewGrade) {
    const result = await runWithDatabaseConnectionOwner(() => reviewGrade(parseReviewGradeArgs(args)));
    void requestDesktopHighValueSync();
    return result;
  }
  if (request.command === NATIVE_COMMANDS.reviewPreview) {
    return runWithDatabaseConnectionOwner(() => reviewPreview(parseReviewPreviewArgs(args)));
  }
  return undefined;
}
