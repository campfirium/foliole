import type { SplitTopicRecordingDetail } from '../../lib/platform/supportRecordingEntry';
import { APP_COMMAND_IDS } from '../shared/commands/ids';
import {
  getDesktopSupportRecordingStart,
  recordDesktopSupportEntry
} from '../shared/platform/supportLog/desktopSupportLog';

export interface SplitTopicTrace {
  startedAt: number;
  attempt: number;
}

let recording: { startedAt: number; attempts: number } | undefined;

export function traceSplitTopicClick(commandId: string, inFlow: boolean, enabled: boolean): SplitTopicTrace | undefined {
  if (commandId !== APP_COMMAND_IDS.splitTopic) return;
  const startedAt = getDesktopSupportRecordingStart();
  if (startedAt === undefined) return;
  if (recording?.startedAt !== startedAt) recording = { startedAt, attempts: 0 };
  const trace = { startedAt, attempt: ++recording.attempts };
  recordSplitTopicTrace(trace, { event: 'split.topic.clicked', inFlow, enabled });
  return trace;
}

export function recordSplitTopicTrace(trace: SplitTopicTrace | undefined, detail: SplitTopicRecordingDetail) {
  if (trace) recordDesktopSupportEntry(trace.startedAt, { ...detail, attempt: trace.attempt });
}
