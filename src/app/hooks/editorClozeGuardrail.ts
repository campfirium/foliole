import {
  getLongClozeFrontGuardThreshold,
  getLongClozeFrontGuardMode,
  getLongClozeSelectionGuardMin
} from '../../features/editor/model/longClozeFrontGuardSetting';
import { shouldGuardLongSelectionClozeFront } from '../../shared/selectionAnnotationActions';
import type { SelectionCommandPayload } from '../contextCommands';

export type LongClozeGuardAction = 'cloze' | 'highlight' | 'remind';
export interface LongClozeGuardOptions {
  onRemind?: () => void;
  skipGuard?: boolean;
}

export function resolveLongClozeGuardAction(payload: SelectionCommandPayload): LongClozeGuardAction {
  const selectionMin = getLongClozeSelectionGuardMin();
  const shouldCheckSelection = selectionMin <= 0 || payload.selectionText.trim().length > selectionMin;
  if (!shouldCheckSelection || !shouldGuardLongSelectionClozeFront(payload, getLongClozeFrontGuardThreshold())) {
    return 'cloze';
  }

  const mode = getLongClozeFrontGuardMode();
  if (mode === 'off') {
    return 'cloze';
  }
  if (mode === 'convert') {
    return 'highlight';
  }
  return 'remind';
}
