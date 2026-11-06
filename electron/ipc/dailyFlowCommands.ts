import type { BrowserWindow } from 'electron';

import { dailyFlowCommitSchema } from '../../lib/core/flow/dailyFlowContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { commitDesktopDailyFlow, openDesktopDailyFlow, readDesktopDailyFlowView, saveDesktopDailyFlowSourceSettings } from '../database/dailyFlow.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleDailyFlowCommand(command: string, args: Record<string, unknown>, origin: BrowserWindow | null = null) {
  if (command === NATIVE_COMMANDS.saveDailyFlowSourceSettings) {
    const result = await saveDesktopDailyFlowSourceSettings(args);
    void requestDesktopHighValueSync();
    return result;
  }
  if (command === NATIVE_COMMANDS.readDailyFlowView) return readDesktopDailyFlowView(args);
  if (command === NATIVE_COMMANDS.openDailyFlow) return openDesktopDailyFlow(args);
  if (command !== NATIVE_COMMANDS.commitDailyFlow) return undefined;
  const input = dailyFlowCommitSchema.parse(args);
  const result = await commitDesktopDailyFlow(input);
  if (input.grade || input.reviewHistory || input.readings?.length) {
    notifyWorkspaceContentChanged(null, { refreshingWindow: origin, workspaceScope: { kind: 'nodes', nodeIds: [],
      readingNodeIds: input.readings?.map(value => value.nodeId) ?? [],
      reviewNodeIds: input.grade ? [input.grade.nodeId] : input.reviewHistory ? [input.reviewHistory.nodeId] : [] } });
  }
  return result;
}
