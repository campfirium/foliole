import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { bootReport } from './boot.js';
import { asString } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { reviewGrade, reviewPreview } from './review.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleReviewCommand(request: InvokeRequest) {
  const args = (request.args ?? {}) as Record<string, unknown>;

  if (request.command === NATIVE_COMMANDS.bootReport) {
    await bootReport(asString(args.stage, 'stage'), args.payload ?? null);
    return null;
  }
  if (request.command === NATIVE_COMMANDS.reviewGrade) {
    const result = reviewGrade(args as unknown as Parameters<typeof reviewGrade>[0]);
    notifyWorkspaceContentChanged();
    return result;
  }
  if (request.command === NATIVE_COMMANDS.reviewPreview) {
    return reviewPreview(args as unknown as Parameters<typeof reviewPreview>[0]);
  }
  return undefined;
}
