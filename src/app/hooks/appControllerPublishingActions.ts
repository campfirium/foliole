import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPublishToDiscourseCommand } from './discoursePublishCommand';
import { createPublishToWordPressCommand } from './wordpressPublishCommand';

export function createPublishingPaletteActions(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return {
    publishToDiscourse: createPublishToDiscourseCommand(args),
    publishToWordPress: createPublishToWordPressCommand(args)
  };
}
