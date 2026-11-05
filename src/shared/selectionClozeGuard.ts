import {
  getLongClozeFrontGuardThreshold,
  getLongClozeFrontGuardMode,
  getLongClozeSelectionGuardMin
} from './config/longClozeFrontGuardSetting';
import { shouldGuardLongSelectionClozeFront } from './selectionAnnotationActions';
import type { SelectionAnnotationPayload } from './selectionAnnotationActions';

export type LongClozeGuardAction = 'cloze' | 'highlight' | 'remind';
export function resolveLongClozeGuardAction(payload: Pick<SelectionAnnotationPayload, 'selectionText' | 'clozeContent'>): LongClozeGuardAction {
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
