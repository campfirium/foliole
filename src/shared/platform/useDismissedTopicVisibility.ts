import { useSyncExternalStore } from 'react';

import {
  getViewHideDismissedTopics,
  requestToggleDismissedTopicVisibility,
  subscribeDismissedTopicVisibility
} from './dismissedTopicVisibilitySetting';

export function useDismissedTopicVisibility() {
  const viewHideDismissedTopics = useSyncExternalStore(
    subscribeDismissedTopicVisibility, getViewHideDismissedTopics, () => false
  );
  return { toggleDismissedTopicsVisibility: requestToggleDismissedTopicVisibility, viewHideDismissedTopics };
}
