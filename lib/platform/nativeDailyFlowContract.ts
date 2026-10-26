import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult } from '../core/flow/dailyFlowContract.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeDailyFlowCommandMap = {
  [NATIVE_COMMANDS.openDailyFlow]: { args: DailyFlowOpenArgs; result: DailyFlowResult };
  [NATIVE_COMMANDS.commitDailyFlow]: { args: DailyFlowCommitArgs; result: DailyFlowResult };
};
