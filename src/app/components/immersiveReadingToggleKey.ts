import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';

import type { ImmersiveKeydownSource } from './immersiveReadingKeydownTypes';

export function handleImmersiveToggleKey(args: {
  canToggleImmersiveMode: boolean;
  captureReadingSelectionFromViewport: () => void;
  event: KeyboardEvent;
  getReadingSelection: () => { from: number; to: number } | null;
  isImmersiveEditing: boolean;
  props: ImmersiveKeydownSource;
  queueReadingSelectionRestore: () => void;
  shortcuts: CommandShortcutSet | undefined;
  suppressNextSelectionRestore: () => void;
}) {
  if (!matchesShortcutSet(args.event, args.shortcuts)) {
    return false;
  }
  if (!args.canToggleImmersiveMode && !args.props.isImmersiveMode) {
    return true;
  }
  args.event.preventDefault();
  pushDebugTrace('immersive.toggle.requested', {
    isImmersiveMode: args.props.isImmersiveMode,
    isImmersiveEditing: args.isImmersiveEditing
  });
  args.suppressNextSelectionRestore();
  if (!args.props.isImmersiveMode) {
    args.captureReadingSelectionFromViewport();
    const readingSelection = args.getReadingSelection() ?? args.props.editorAdapterRef.current?.getSelection() ?? { from: 0, to: 0 };
    args.props.beginApplyingReadingPosition(readingSelection, 'enter-immersive');
  } else if (!args.isImmersiveEditing) {
    const readingSelection = args.getReadingSelection() ?? args.props.editorAdapterRef.current?.getSelection() ?? { from: 0, to: 0 };
    args.queueReadingSelectionRestore();
    args.props.beginApplyingReadingPosition(readingSelection, 'exit-immersive');
  }
  args.props.onToggleImmersiveMode();
  return true;
}
