import { Focus, Scan } from 'lucide-react';

export function resolveTopicFocusPresentation(active: boolean) {
  return active
    ? { icon: Focus, labelKey: 'desktop.nodeList.showAllTopics' } as const
    : { icon: Scan, labelKey: 'desktop.nodeList.hideDismissedAndShelvedTopics' } as const;
}
