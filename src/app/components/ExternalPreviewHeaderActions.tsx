import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import type { OpenedLocalFileSaveStatus } from './useOpenedLocalFileEditing';

export function ExternalPreviewHeaderActions(args: {
  importedNodeId: string | null;
  isImporting: boolean;
  localFileEditing: {
    flushSave: (force?: boolean) => Promise<boolean>;
    isEditable: boolean;
    reloadFromDisk: () => Promise<void>;
    status: OpenedLocalFileSaveStatus;
  };
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <LocalFileSaveActions editing={args.localFileEditing} />
      <ExternalImportAction
        importedNodeId={args.importedNodeId}
        isImporting={args.isImporting}
        onHandleImport={args.onHandleImport}
        onOpenImportedNodeId={args.onOpenImportedNodeId}
      />
    </div>
  );
}

function LocalFileSaveActions(args: {
  editing: {
    flushSave: (force?: boolean) => Promise<boolean>;
    isEditable: boolean;
    reloadFromDisk: () => Promise<void>;
    status: OpenedLocalFileSaveStatus;
  };
}) {
  const t = useTranslation();
  if (!args.editing.isEditable) return null;
  if (args.editing.status === 'saved' || args.editing.status === 'saving' || args.editing.status === 'unsaved') {
    return null;
  }
  return (
    <>
      <span className="text-xs text-foreground/45">{localFileStatusLabel(args.editing.status, t)}</span>
      {args.editing.status === 'conflict' ? (
        <>
          <AppButton onClick={() => void args.editing.flushSave(true)} size="sm" variant="ghost">{t('desktop.externalLibrary.localFile.saveMine')}</AppButton>
          <AppButton onClick={() => void args.editing.reloadFromDisk()} size="sm" variant="ghost">{t('desktop.externalLibrary.localFile.reload')}</AppButton>
        </>
      ) : null}
    </>
  );
}

function ExternalImportAction(args: {
  importedNodeId: string | null;
  isImporting: boolean;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const isImported = Boolean(args.importedNodeId);
  const label = isImported ? t('desktop.externalLibrary.preview.imported') : t('desktop.externalLibrary.preview.import');
  const actionLabel = isImported ? t('desktop.externalLibrary.preview.openImported') : t('desktop.externalLibrary.preview.importToFoliole');
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <AppButton
          aria-label={actionLabel}
          disabled={args.isImporting}
          onClick={() => {
            if (args.importedNodeId) {
              args.onOpenImportedNodeId(args.importedNodeId);
              return;
            }
            args.onHandleImport();
          }}
          size="sm"
          variant="ghost"
        >
          {label}
        </AppButton>
      </AppTooltipTrigger>
      <AppTooltipContent side="bottom">{actionLabel}</AppTooltipContent>
    </AppTooltip>
  );
}

function localFileStatusLabel(status: OpenedLocalFileSaveStatus, t: ReturnType<typeof useTranslation>) {
  if (status === 'conflict') return t('desktop.externalLibrary.localFile.status.conflict');
  if (status === 'error') return t('desktop.externalLibrary.localFile.status.error');
  if (status === 'missing') return t('desktop.externalLibrary.localFile.status.missing');
  if (status === 'saving') return t('desktop.externalLibrary.localFile.status.saving');
  if (status === 'unsaved') return t('desktop.externalLibrary.localFile.status.unsaved');
  return t('desktop.externalLibrary.localFile.status.saved');
}
