import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeCommandArgs,
  NativeCommandResult,
  NativeInvoke,
  NativeReviewGradeArgs,
  NativeReviewGradeResult,
  NativeReviewPreviewArgs,
  NativeReviewPreviewResult
} from './nativeContract.js';

export function invokeReviewGrade(
  invoke: NativeInvoke,
  args: NativeReviewGradeArgs
): Promise<NativeReviewGradeResult> {
  return invoke(NATIVE_COMMANDS.reviewGrade, args);
}

export function invokeReviewPreview(
  invoke: NativeInvoke,
  args: NativeReviewPreviewArgs
): Promise<NativeReviewPreviewResult> {
  return invoke(NATIVE_COMMANDS.reviewPreview, args);
}

export function invokeBootReport(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.bootReport>
): Promise<NativeCommandResult<typeof NATIVE_COMMANDS.bootReport>> {
  return invoke(NATIVE_COMMANDS.bootReport, args);
}
