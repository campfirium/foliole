import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui/Dialog';

export function CompanionCustomCssConfirmDialog(props: {
  action: 'delete' | 'reset' | null;
  isBusy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const t = useTranslation();
  const isDelete = props.action === 'delete';
  return (
    <AppDialog open={props.action !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[calc(100vw-2rem)] max-w-md p-5">
          <AppDialogTitle>
            {t(isDelete
              ? 'companion.settings.appearance.css.deleteConfirm.title'
              : 'companion.settings.appearance.css.resetConfirm.title')}
          </AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t(isDelete
              ? 'companion.settings.appearance.css.deleteConfirm.description'
              : 'companion.settings.appearance.css.resetConfirm.description')}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={props.isBusy} onClick={props.onCancel}>
              {t('common.cancel')}
            </AppButton>
            <AppButton
              loading={props.isBusy}
              loadingLabel={t('companion.settings.appearance.css.saving')}
              onClick={props.onConfirm}
              variant="danger"
            >
              {t(isDelete
                ? 'companion.settings.appearance.css.deleteConfirm.action'
                : 'companion.settings.appearance.css.resetConfirm.action')}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
