import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPublishToDiscourseCommand } from './discoursePublishCommand';
import { createPublishToFolioleCommand } from './foliolePublishCommand';
import { createPublishToWordPressCommand } from './wordpressPublishCommand';

export function createPublishingPaletteActions(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return {
    publishToFoliole: createPublishToFolioleCommand(args),
    publishToDiscourse: createPublishToDiscourseCommand(args),
    publishToWordPress: createPublishToWordPressCommand(args)
  };
}
