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

interface ReviewSourceTopicDeleteDialogProps {
  isOpen: boolean;
  nodeTitle: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReviewSourceTopicDeleteDialog(props: ReviewSourceTopicDeleteDialogProps) {
  const t = useTranslation();
  const title = props.nodeTitle?.trim() || t('desktop.deleteSourceTopic.fallback');
  return (
    <AppDialog open={props.isOpen} onOpenChange={(open) => (!open ? props.onCancel() : undefined)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
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
