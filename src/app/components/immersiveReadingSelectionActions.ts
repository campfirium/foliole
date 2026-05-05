import type { ImmersiveKeydownSource } from './immersiveReadingKeydownTypes';
import { resolveImmersiveSelectionPayload } from './immersiveReadingSelectionPayload';

export function runImmersiveSelectionAction(args: {
  getReadingSelection: () => { from: number; to: number } | null;
  props: ImmersiveKeydownSource;
  type: 'highlight' | 'note';
}) {
  if (!args.props.activeNodeId) {
    return false;
  }
  const payload = resolveImmersiveSelectionPayload(args);
  if (!payload) {
    return false;
  }
  if (args.type === 'highlight') {
    return args.props.onToggleSelectionHighlight(payload) !== null;
  }
  args.props.onCreateSelectionNote(payload);
  return true;
}
