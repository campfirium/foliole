import type { CompanionFlowHistoryControls } from './CompanionFlowHistoryContext';

export function applyCompanionFlowAndroidBack(controls: CompanionFlowHistoryControls | null): boolean {
  if (!controls) return false;
  if (!controls.busy && (controls.canUndo || controls.refreshPending)) controls.apply('undo');
  return true;
}
