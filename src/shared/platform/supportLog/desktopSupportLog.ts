import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSupportLogAction, NativeSupportLogState } from '../../../../lib/platform/nativeUtilityContract';
import type { SupportRecordingEntry } from '../../../../lib/platform/supportRecordingEntry';
import { getRuntimeInvoke } from '../runtimeInvoke';

export type { NativeSupportLogAction, NativeSupportLogState };

let recordingStartedAt: number | undefined;
const recordingListeners = new Set<() => void>();

export function subscribeDesktopSupportRecording(listener: () => void) {
  recordingListeners.add(listener);
  return () => recordingListeners.delete(listener);
}

function setRecordingStartedAt(value: number | undefined) {
  if (recordingStartedAt === value) return;
  recordingStartedAt = value;
  recordingListeners.forEach(listener => listener());
}

export function getDesktopSupportRecordingStart() {
  return recordingStartedAt;
}

export function recordDesktopSupportEntry(startedAt: number, entry: SupportRecordingEntry) {
  if (recordingStartedAt !== startedAt) return;
  const invoke = getRuntimeInvoke();
  void invoke?.(NATIVE_COMMANDS.desktopSupportLog, { action: 'record', startedAt, entry }).then(result => {
    if (recordingStartedAt === startedAt && result.phase !== 'recording') setRecordingStartedAt(undefined);
  }).catch(() => undefined);
}

export async function runDesktopSupportLogAction(action: NativeSupportLogAction): Promise<NativeSupportLogState> {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Desktop log unavailable');
  const result = await invoke(NATIVE_COMMANDS.desktopSupportLog, { action });
  if (result?.phase === 'idle' || result?.phase === 'ready') {
    setRecordingStartedAt(undefined);
    return result;
  }
  if (result?.phase === 'recording' && Number.isFinite(result.startedAt)) {
    setRecordingStartedAt(result.startedAt);
    return result;
  }
  throw new Error('Invalid desktop log state');
}
