import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { bootReport } from './boot.js';
import { parseReviewGradeArgs, parseReviewPreviewArgs } from './commandParserReview.js';
import { asString } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { reviewGrade, reviewPreview } from './review.js';
import { handleReviewTrainingCommand } from './reviewTrainingCommands.js';

export async function handleReviewCommand(request: InvokeRequest) {
  const args = (request.args ?? {}) as Record<string, unknown>;

  if (request.command === NATIVE_COMMANDS.bootReport) {
    await bootReport(asString(args.stage, 'stage'), args.payload ?? null);
    return null;
  }
  if (request.command === NATIVE_COMMANDS.reviewGrade) {
    return runWithDatabaseConnectionOwner(() => reviewGrade(parseReviewGradeArgs(args)));
  }
  if (request.command === NATIVE_COMMANDS.reviewPreview) {
    return runWithDatabaseConnectionOwner(() => reviewPreview(parseReviewPreviewArgs(args)));
  }
  if ([NATIVE_COMMANDS.loadReviewTrainingPlan, NATIVE_COMMANDS.loadReviewTrainingInput, NATIVE_COMMANDS.saveReviewTrainingModel]
    .some(command => command === request.command)) {
    return runWithDatabaseConnectionOwner(() => handleReviewTrainingCommand(request.command, args));
  }
  return undefined;
}
