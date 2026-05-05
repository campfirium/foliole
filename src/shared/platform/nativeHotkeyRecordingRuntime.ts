import { getElectronAPI, type NativeKeyboardInputPayload } from './electronApi';

export type RuntimeKeyboardInputPayload = NativeKeyboardInputPayload;
export type RuntimeHotkeyRecordingUnlisten = () => void;

export function startRuntimeHotkeyRecording(
  handler: (payload: RuntimeKeyboardInputPayload) => void
): RuntimeHotkeyRecordingUnlisten | null {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.onNativeKeyboardInput || !electronAPI.setNativeHotkeyRecordingActive) {
    return null;
  }
  electronAPI.setNativeHotkeyRecordingActive(true);
  const unsubscribe = electronAPI.onNativeKeyboardInput(handler);
  return () => {
    electronAPI.setNativeHotkeyRecordingActive?.(false);
    unsubscribe();
  };
}
