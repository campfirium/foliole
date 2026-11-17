import { ImportAccessDescription, ImportPermissionSettingsButton } from '../../features/import/components/ImportAccessActions';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../shared/ui';
import { AppNoticeDialog } from '../../shared/ui/AppNoticeDialog';
import { useFormalImportAccessNotice } from '../hooks/formalImportAccessNotice';

function closeNotice() {
  useFormalImportAccessNotice.setState({ notice: null });
}

export function FormalImportAccessDialog() {
  const t = useTranslation();
  const notice = useFormalImportAccessNotice(state => state.notice);
  return (
    <AppNoticeDialog open={Boolean(notice)} onOpenChange={open => { if (!open) closeNotice(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{t('desktop.importAccess.title')}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription><ImportAccessDescription /></AppDialogDescription>
            {notice?.names.length ? <ul className="mt-2 max-h-36 overflow-auto break-all text-sm">
              {notice.names.map((name, index) => <li key={index}>{name}</li>)}
            </ul> : null}
          </AppDialogBody>
          <AppDialogActions className="flex-wrap">
            <AppDialogClose asChild><AppButton>{t('desktop.superMemoDrafts.close')}</AppButton></AppDialogClose>
            <ImportPermissionSettingsButton />
            <AppButton onClick={() => { closeNotice(); notice?.chooseAgain(); }}>{t('desktop.importAccess.chooseAgain')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppNoticeDialog>
  );
}
