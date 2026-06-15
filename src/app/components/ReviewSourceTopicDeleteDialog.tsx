import type { KeyboardEvent } from 'react';

import { matchesShortcut, matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import { isEditableKeyboardTarget } from '../hooks/workspaceKeyboardTarget';

interface ReviewSourceTopicDeleteDialogProps {
  deleteSourceTopicShortcuts?: CommandShortcutSet | undefined;
  isOpen: boolean;
  nodeTitle: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReviewSourceTopicDeleteDialog(props: ReviewSourceTopicDeleteDialogProps) {
  const t = useTranslation();
  const title = props.nodeTitle?.trim() || t('desktop.deleteSourceTopic.fallback');
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!shouldConfirmSourceTopicDelete(event, props.deleteSourceTopicShortcuts)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    props.onConfirm();
  };
  return (
    <AppDialog open={props.isOpen} onOpenChange={(open) => (!open ? props.onCancel() : undefined)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5" onKeyDownCapture={handleKeyDownCapture}>
          <AppDialogTitle>{t('desktop.deleteSourceTopic.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t('desktop.deleteSourceTopic.description', { title })}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppDialogClose asChild>
              <AppButton variant="ghost">{t('common.cancel')}</AppButton>
            </AppDialogClose>
            <AppButton variant="danger" onClick={props.onConfirm}>
              {t('desktop.deleteSourceTopic.confirm')}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function shouldConfirmSourceTopicDelete(event: KeyboardEvent, shortcuts: CommandShortcutSet | undefined) {
  const nativeEvent = event.nativeEvent;
  if (
    event.defaultPrevented ||
    nativeEvent.defaultPrevented ||
    nativeEvent.isComposing ||
    nativeEvent.repeat ||
    isEditableKeyboardTarget(event.target) ||
    isEditableKeyboardTarget(document.activeElement)
  ) {
    return false;
  }
  return matchesShortcut(nativeEvent, { key: 't' }) || matchesShortcutSet(nativeEvent, shortcuts);
}
