import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';

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
  const collectionAccess = error === 'collectionAccess';
  const showMacPermissions = error === 'xmlAccess' && resolveRuntimeOperatingSystem() === 'macos';
  const title = collectionAccess ? 'desktop.superMemoDrafts.collectionAccessTitle'
    : error === 'xml-only' ? 'desktop.superMemoDrafts.noCollection' : 'desktop.superMemoDrafts.loadFailed';
  return (
    <AppDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{t(title)}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>
              {t(descriptions[error])}
              {showMacPermissions ? <span className="mt-2 block">{t('desktop.superMemoDrafts.macPermissionLocation')}</span> : null}
            </AppDialogDescription>
          </AppDialogBody>
          <AppDialogActions className="flex-wrap">
            {!collectionAccess ? <AppDialogClose asChild>
              <AppButton variant="ghost" disabled={busy}>{t('desktop.superMemoDrafts.close')}</AppButton>
            </AppDialogClose> : null}
            {error === 'xmlAccess' ? <AppButton disabled={busy} onClick={retry}>{t('desktop.importAccess.chooseAgain')}</AppButton> : null}
            {collection ? <AppButton variant="ghost" disabled={busy} onClick={() => recover(false)}>{t('desktop.superMemoDrafts.continueXml')}</AppButton> : null}
            {collection ? <AppButton disabled={busy} onClick={() => recover(true)}>{t('desktop.superMemoDrafts.chooseCollection')}</AppButton> : null}
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
