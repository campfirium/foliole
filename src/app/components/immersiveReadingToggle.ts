import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';

import type { ImmersiveKeydownSource } from './immersiveReadingKeydownTypes';

export function toggleImmersiveReading(args: {
  canToggleImmersiveMode: boolean;
  captureReadingSelectionFromViewport: () => EditorSelection | null;
  isImmersiveEditing: boolean;
  props: ImmersiveKeydownSource;
  queueReadingSelectionRestore: () => EditorSelection | null;
  suppressNextSelectionRestore: () => void;
}) {
  if (!args.canToggleImmersiveMode && !args.props.isImmersiveMode) {
    return;
  }
  pushDebugTrace('immersive.toggle.requested', {
    isImmersiveMode: args.props.isImmersiveMode,
    isImmersiveEditing: args.isImmersiveEditing
  });
  if (!args.props.isImmersiveMode) {
    const selection = args.captureReadingSelectionFromViewport();
    if (selection) {
      args.suppressNextSelectionRestore();
      args.props.beginApplyingReadingPosition(selection, 'enter-immersive');
    }
  } else if (!args.isImmersiveEditing) {
    const selection = args.queueReadingSelectionRestore();
    if (selection) {
      args.suppressNextSelectionRestore();
      args.props.beginApplyingReadingPosition(selection, 'exit-immersive');
    }
  }
  args.props.onToggleImmersiveMode();
}
