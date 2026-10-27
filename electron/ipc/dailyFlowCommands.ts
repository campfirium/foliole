import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { commitDesktopDailyFlow, openDesktopDailyFlow, readDesktopDailyFlowView, saveDesktopDailyFlowSourceSettings } from '../database/dailyFlow.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

export async function handleDailyFlowCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.saveDailyFlowSourceSettings) {
    const result = await saveDesktopDailyFlowSourceSettings(args);
    void requestDesktopHighValueSync();
    return result;
  }
  if (command === NATIVE_COMMANDS.readDailyFlowView) return readDesktopDailyFlowView(args);
  if (command === NATIVE_COMMANDS.openDailyFlow) return openDesktopDailyFlow(args);
  if (command !== NATIVE_COMMANDS.commitDailyFlow) return undefined;
  const result = await commitDesktopDailyFlow(args);
  if (args.grade || args.reviewHistory || args.readings) void requestDesktopHighValueSync();
  return result;
}
