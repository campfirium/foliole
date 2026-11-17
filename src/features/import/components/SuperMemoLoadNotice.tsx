import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';

import { ImportAccessDescription, ImportPermissionSettingsButton } from './ImportAccessActions';
import type { SuperMemoNotice } from './useSuperMemoDraft';

const descriptions = {
  'xml-only': 'desktop.superMemoDrafts.collectionHelp',
  xmlAccess: 'desktop.superMemoDrafts.xmlAccess',
  xmlRead: 'desktop.superMemoDrafts.xmlRead',
  xmlSize: 'desktop.superMemoDrafts.xmlSize',
  xmlFormat: 'desktop.superMemoDrafts.xmlFormat',
  collectionAccess: 'desktop.superMemoDrafts.collectionAccess',
  collectionRead: 'desktop.superMemoDrafts.collectionRead',
  collectionMismatch: 'desktop.superMemoDrafts.collectionMismatch',
  preview: 'desktop.superMemoDrafts.previewFailed',
  convert: 'desktop.superMemoDrafts.convertFailed'
} as const;

export function SuperMemoLoadNotice({ error, busy, onClose, recover, retry }: {
  error: SuperMemoNotice; busy: boolean; onClose(): void; recover(chooseFolder: boolean): void; retry(): void;
}) {
  const t = useTranslation();
  if (!error) return null;
  const collection = error === 'xml-only' || error.startsWith('collection');
  const permission = error === 'xmlAccess' || error === 'collectionAccess';
  return (
    <AppDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{t(error === 'xml-only' ? 'desktop.superMemoDrafts.noCollection' : 'desktop.superMemoDrafts.loadFailed')}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>{t(descriptions[error])} {permission ? <ImportAccessDescription /> : null}</AppDialogDescription>
          </AppDialogBody>
          <AppDialogActions className="flex-wrap">
            <AppDialogClose asChild><AppButton disabled={busy}>{t('desktop.superMemoDrafts.close')}</AppButton></AppDialogClose>
            {permission ? <ImportPermissionSettingsButton /> : null}
            {error === 'xmlAccess' ? <AppButton disabled={busy} onClick={retry}>{t('desktop.importAccess.chooseAgain')}</AppButton> : null}
            {collection ? <AppButton disabled={busy} onClick={() => recover(true)}>{t('desktop.superMemoDrafts.chooseCollection')}</AppButton> : null}
            {collection ? <AppButton disabled={busy} onClick={() => recover(false)}>{t('desktop.superMemoDrafts.continueXml')}</AppButton> : null}
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
