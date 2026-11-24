import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';

import { superMemoNoticeKind, type SuperMemoNotice } from './superMemoNotice';

const descriptions = {
  selectionRead: 'desktop.superMemoDrafts.selectionReadFailed',
  collectionChoice: 'desktop.superMemoDrafts.collectionChoiceHelp',
  xmlAccess: 'desktop.superMemoDrafts.xmlAccess',
  xmlRead: 'desktop.superMemoDrafts.xmlRead',
  xmlUpdated: 'desktop.superMemoDrafts.sourceUpdated',
  xmlSize: 'desktop.superMemoDrafts.xmlSize',
  xmlFormat: 'desktop.superMemoDrafts.xmlFormat',
  collectionAccess: 'desktop.superMemoDrafts.collectionAccess',
  collectionRead: 'desktop.superMemoDrafts.collectionRead',
  collectionMismatch: 'desktop.superMemoDrafts.collectionMismatch',
  sourceMismatch: 'desktop.superMemoDrafts.exportStatus.unverified',
  preview: 'desktop.superMemoDrafts.previewFailed',
  convert: 'desktop.superMemoDrafts.convertFailed',
  save: 'desktop.superMemoDrafts.saveLinkFailed'
} as const;

type NoticeProps = {
  error: SuperMemoNotice; busy: boolean; candidates?: { directory: string; name: string }[] | undefined;
  onClose(): void; recover(choice: boolean | string): void; retry(): void;
  inline?: boolean;
  reload?: boolean;
};

function RecoveryActions({ error: notice, busy, inline, reload, onClose, recover, retry }: NoticeProps) {
  const t = useTranslation();
  const error = superMemoNoticeKind(notice);
  const collection = error && error.startsWith('collection');
  const close = <AppButton variant="ghost" disabled={busy} onClick={inline ? onClose : undefined}>
    {t('desktop.superMemoDrafts.close')}
  </AppButton>;
  const canRetryXml = error === 'xmlUpdated' || error === 'xmlAccess' || error === 'xmlRead' || error === 'xmlSize' || error === 'xmlFormat' ||
    (inline && error === 'preview');
  return (
    <>
      {error !== 'collectionAccess' ? (inline ? close : <AppDialogClose asChild>{close}</AppDialogClose>) : null}
      {canRetryXml ? <AppButton disabled={busy} onClick={retry}>{t(reload ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.importAccess.chooseAgain')}</AppButton> : null}
      {collection ? <AppButton variant="ghost" disabled={busy} onClick={() => recover(false)}>{t('desktop.superMemoDrafts.continueXml')}</AppButton> : null}
      {collection ? <AppButton disabled={busy} onClick={() => recover(true)}>{t('desktop.superMemoDrafts.chooseCollection')}</AppButton> : null}
    </>
  );
}

export function SuperMemoLoadNotice(props: NoticeProps) {
  const t = useTranslation();
  const { error: notice, busy, inline, candidates, onClose, recover } = props;
  const error = superMemoNoticeKind(notice);
  if (!error) return null;
  const title = t(error === 'collectionAccess' ? 'desktop.superMemoDrafts.collectionAccessTitle'
    : error === 'collectionChoice' ? 'desktop.superMemoDrafts.collectionChoiceTitle' :
      error === 'xmlUpdated' ? 'desktop.superMemoDrafts.sourceUpdatedTitle' :
        error === 'convert' ? 'desktop.superMemoDrafts.importFailedTitle' : 'desktop.superMemoDrafts.loadFailed');
  const description = <>
    {t(descriptions[error])}
    {typeof notice === 'object' ? <code className="mt-2 block select-all break-all">{notice.code}</code> : null}
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
