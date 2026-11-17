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

type NoticeProps = {
  error: SuperMemoNotice; busy: boolean; candidates?: { directory: string; name: string }[] | undefined;
  onClose(): void; recover(choice: boolean | string): void; retry(): void;
  inline?: boolean;
};

function RecoveryActions({ error, busy, inline, onClose, recover, retry }: NoticeProps) {
  const t = useTranslation();
  const collection = typeof error === 'string' && error.startsWith('collection');
  const close = <AppButton variant="ghost" disabled={busy} onClick={inline ? onClose : undefined}>
    {t('desktop.superMemoDrafts.close')}
  </AppButton>;
  const canRetryXml = error === 'xmlAccess' || (inline && !collection && error !== 'convert' && error !== 'save');
  return (
    <>
      {error !== 'collectionAccess' ? (inline ? close : <AppDialogClose asChild>{close}</AppDialogClose>) : null}
      {canRetryXml ? <AppButton disabled={busy} onClick={retry}>{t('desktop.importAccess.chooseAgain')}</AppButton> : null}
      {collection ? <AppButton variant="ghost" disabled={busy} onClick={() => recover(false)}>{t('desktop.superMemoDrafts.continueXml')}</AppButton> : null}
      {collection ? <AppButton disabled={busy} onClick={() => recover(true)}>{t('desktop.superMemoDrafts.chooseCollection')}</AppButton> : null}
    </>
  );
}

export function SuperMemoLoadNotice(props: NoticeProps) {
  const t = useTranslation();
  const { error, busy, inline, candidates, onClose, recover } = props;
  if (!error) return null;
  const title = t(error === 'collectionAccess' ? 'desktop.superMemoDrafts.collectionAccessTitle'
    : error === 'collectionChoice' ? 'desktop.superMemoDrafts.collectionChoiceTitle' : 'desktop.superMemoDrafts.loadFailed');
  const description = <>
    {t(descriptions[error])}
    {error === 'xmlAccess' && resolveRuntimeOperatingSystem() === 'macos'
      ? <span className="mt-2 block">{t('desktop.superMemoDrafts.macPermissionLocation')}</span> : null}
  </>;
  const matches = error === 'collectionChoice' ? <div className="flex flex-col items-start gap-2">
    {candidates?.map(candidate => <AppButton key={candidate.directory} disabled={busy}
      title={candidate.directory} onClick={() => recover(candidate.directory)}>{candidate.name}</AppButton>)}
  </div> : null;
  if (inline) return (
    <section aria-label={title} className="space-y-3 rounded-lg border border-settings-divider p-4 text-sm">
      <h4 className="font-semibold">{title}</h4>
      <p role="alert" className="text-foreground/75">{description}</p>
      {matches}
      <div className="flex flex-wrap gap-2"><RecoveryActions {...props} /></div>
    </section>
  );
  return (
    <AppDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>{description}</AppDialogDescription>
            {matches}
          </AppDialogBody>
          <AppDialogActions className="flex-wrap"><RecoveryActions {...props} /></AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
