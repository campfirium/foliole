import { useCallback, useEffect, useState } from 'react';

import {
  getViewHideDismissedTopics,
  setViewHideDismissedTopics,
  TOGGLE_DISMISSED_TOPIC_VISIBILITY_EVENT
} from './dismissedTopicVisibilitySetting';

export function useDismissedTopicVisibility() {
  const [viewHideDismissedTopics, setViewHideDismissedTopicsState] = useState(getViewHideDismissedTopics);
  const toggleDismissedTopicsVisibility = useCallback(() => {
    setViewHideDismissedTopicsState((current) => {
      const next = !current;
      setViewHideDismissedTopics(next);
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener(TOGGLE_DISMISSED_TOPIC_VISIBILITY_EVENT, toggleDismissedTopicsVisibility);
    return () => window.removeEventListener(TOGGLE_DISMISSED_TOPIC_VISIBILITY_EVENT, toggleDismissedTopicsVisibility);
  }, [toggleDismissedTopicsVisibility]);

  return { toggleDismissedTopicsVisibility, viewHideDismissedTopics };
}
