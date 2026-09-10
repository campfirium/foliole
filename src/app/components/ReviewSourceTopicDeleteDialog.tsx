import type { KeyboardEvent } from 'react';

import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
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
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))]" layout="task" onKeyDownCapture={handleKeyDownCapture}>
          <AppDialogTitle>{t('desktop.deleteSourceTopic.title')}</AppDialogTitle>
          <AppDialogBody><AppDialogDescription>{t('desktop.deleteSourceTopic.description', { title })}</AppDialogDescription></AppDialogBody>
          <AppDialogActions>
            <AppDialogClose asChild>
              <AppButton variant="ghost">{t('common.cancel')}</AppButton>
            </AppDialogClose>
            <AppButton variant="danger" onClick={props.onConfirm}>
              {t('desktop.deleteSourceTopic.confirm')}
            </AppButton>
          </AppDialogActions>
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
  return matchesShortcutSet(nativeEvent, shortcuts);
}
