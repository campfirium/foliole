import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import { resolveTopicFocusPresentation } from '../features/nodes/components/topicFocusPresentation';
import type { FolderListSortDirection, FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { useDismissedTopicVisibility } from '../shared/platform/useDismissedTopicVisibility';

import { CompanionBrowseMenuSheet } from './CompanionBrowseMenuSheet';
import { CompanionTopActionButton } from './CompanionTopActionButton';

export function CompanionBrowseTopActions(props: {
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenAppearance(): void;
  onOpenCapture(): void;
  showTopicFocusButton?: boolean;
  onSync?: () => void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  syncDisabled?: boolean;
  syncStatus?: string;
  topicFocusDisabled?: boolean;
}) {
  const t = useTranslation();
  const { toggleDismissedTopicsVisibility, viewHideDismissedTopics } = useDismissedTopicVisibility();
  const topicFocusActive = !props.topicFocusDisabled && viewHideDismissedTopics;
  const { icon, labelKey } = resolveTopicFocusPresentation(topicFocusActive);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {supportsCompanionNodeMutationSurface('quick-capture') ? (
        <CompanionTopActionButton
          icon={Plus}
          label={t('companion.capture.title')}
          onClick={props.onOpenCapture}
          testId="companion-capture-open"
        />
      ) : null}
      {props.showTopicFocusButton ? (
        <CompanionTopActionButton
          disabled={Boolean(props.topicFocusDisabled)}
          icon={icon}
          label={t(labelKey)}
          onClick={toggleDismissedTopicsVisibility}
          pressed={topicFocusActive}
        />
      ) : null}
      <CompanionTopActionButton icon={MoreHorizontal} label={t('companion.browse.more')} onClick={() => setIsMenuOpen(true)} />
      <CompanionBrowseMenuSheet
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        onOpenAppearance={props.onOpenAppearance}
        onOpenChange={setIsMenuOpen}
        open={isMenuOpen}
        onToggleTopicFocus={toggleDismissedTopicsVisibility}
        topicFocus={{ active: topicFocusActive, disabled: Boolean(props.topicFocusDisabled) }}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
        {...definedProps({
          onSync: props.onSync,
          syncDisabled: props.syncDisabled,
          syncStatus: props.syncStatus
        })}
      />
    </div>
  );
}
