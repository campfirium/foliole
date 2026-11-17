import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';

import type { SuperMemoNotice } from './superMemoDraftSourceActions';

const descriptions = {
  collectionChoice: 'desktop.superMemoDrafts.collectionChoiceHelp',
  xmlAccess: 'desktop.superMemoDrafts.xmlAccess',
  xmlRead: 'desktop.superMemoDrafts.xmlRead',
  xmlSize: 'desktop.superMemoDrafts.xmlSize',
  xmlFormat: 'desktop.superMemoDrafts.xmlFormat',
  collectionAccess: 'desktop.superMemoDrafts.collectionAccess',
  collectionRead: 'desktop.superMemoDrafts.collectionRead',
  collectionMismatch: 'desktop.superMemoDrafts.collectionMismatch',
  preview: 'desktop.superMemoDrafts.previewFailed',
  convert: 'desktop.superMemoDrafts.convertFailed',
  save: 'desktop.superMemoDrafts.saveLinkFailed'
} as const;

export function SuperMemoLoadNotice({ error, busy, candidates, onClose, recover, retry }: {
  error: SuperMemoNotice; busy: boolean; candidates?: { directory: string; name: string }[] | undefined;
  onClose(): void; recover(choice: boolean | string): void; retry(): void;
}) {
  const t = useTranslation();
  if (!error) return null;
  const collection = error.startsWith('collection');
  const collectionAccess = error === 'collectionAccess';
  const showMacPermissions = error === 'xmlAccess' && resolveRuntimeOperatingSystem() === 'macos';
  const title = collectionAccess ? 'desktop.superMemoDrafts.collectionAccessTitle'
    : error === 'collectionChoice' ? 'desktop.superMemoDrafts.collectionChoiceTitle' : 'desktop.superMemoDrafts.loadFailed';
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
            {error === 'collectionChoice' ? <div className="flex flex-col items-start gap-2">
              {candidates?.map(candidate => <AppButton key={candidate.directory} disabled={busy}
                onClick={() => recover(candidate.directory)}>{candidate.name}</AppButton>)}
            </div> : null}
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
