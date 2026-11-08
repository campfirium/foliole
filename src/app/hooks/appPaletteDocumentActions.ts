import { requestToggleDismissedTopicVisibility } from '../../shared/platform/runtime/dismissedTopicVisibilitySetting';
import { requestDocumentComparisonViewToggle, requestSourceUpdateReview } from '../components/documentComparisonView';
import { requestDocumentTopicSearchOpen } from '../components/documentTopicSearchEvents';

export function createPaletteDocumentActions() {
  return {
    findInTopic: requestDocumentTopicSearchOpen,
    onToggleDismissedTopicsVisibility: requestToggleDismissedTopicVisibility,
    reviewSourceUpdate: requestSourceUpdateReview,
    toggleComparisonView: requestDocumentComparisonViewToggle
  };
}
