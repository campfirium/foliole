import { NATIVE_COMMANDS } from './nativeCommands.js';
import type { NativeCommandArgs, NativeInvoke } from './nativeContract.js';

export function invokeReviewGrade(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.reviewGrade>
) {
  return invoke(NATIVE_COMMANDS.reviewGrade, args);
}

export function invokeReviewPreview(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.reviewPreview>
) {
  return invoke(NATIVE_COMMANDS.reviewPreview, args);
}
