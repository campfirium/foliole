export type {
  SelectionCommandEntry,
  SelectionCommandPayload
} from '../shared/selectionCommandPayload';
export {
  getSelectionCommandPayload,
  getSelectionCommandPayloadForContentRanges,
  getSelectionCommandPayloadForRanges
} from '../shared/selectionCommandPayload';

export function normalizeContextMenuPosition(left: number, top: number) {
  const menuWidth = 200;
  const menuHeight = 110;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - menuWidth)),
    top: Math.max(8, Math.min(top, window.innerHeight - menuHeight))
  };
}
