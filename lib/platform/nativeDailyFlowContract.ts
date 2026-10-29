import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult } from '../core/flow/dailyFlowContract.js';
import type { DailyFlowSourceSettingsArgs, DailyFlowSourceSettingsResult } from '../core/flow/dailyFlowSourceSettings.js';
import type { DailyFlowViewArgs, DailyFlowViewResult } from '../core/flow/dailyFlowViewContract.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeDailyFlowCommandMap = {
  [NATIVE_COMMANDS.saveDailyFlowSourceSettings]: { args: DailyFlowSourceSettingsArgs; result: DailyFlowSourceSettingsResult };
  [NATIVE_COMMANDS.readDailyFlowView]: { args: DailyFlowViewArgs; result: DailyFlowViewResult };
  [NATIVE_COMMANDS.openDailyFlow]: { args: DailyFlowOpenArgs; result: DailyFlowResult };
  [NATIVE_COMMANDS.commitDailyFlow]: { args: DailyFlowCommitArgs; result: DailyFlowResult };
};
