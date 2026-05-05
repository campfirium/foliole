import { X } from 'lucide-react';

import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import type { DraftImportSource, DraftImportSourceField } from './importSourceWorkspaceModel';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

type ImportSourceWorkspaceDetailsProps = {
  open: boolean;
  sources: DraftImportSource[];
  onOpenChange: (open: boolean) => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onRunNow: (sourceId: string) => void;
};

function ImportSourceWorkspaceHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex items-center justify-between px-6 pb-3 pt-5">
      <div className="min-w-0 pr-4">
        <AppDialogTitle className="text-[1.02rem] font-semibold">Import management</AppDialogTitle>
        <p className="mt-1 text-sm text-foreground/68">
          Use this space for long-running sources like Readwise, a managed Inbox folder, and later import rules.
        </p>
      </div>
      <AppButton aria-label="Close import management" className="size-8 px-0" onClick={onClose} variant="ghost">
        <X aria-hidden="true" size={15} strokeWidth={1.9} />
      </AppButton>
    </header>
  );
}

export function ImportSourceWorkspaceDetails({
  open,
  sources,
  onOpenChange,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onCopySource,
  onDeleteSource,
  onRunNow
}: ImportSourceWorkspaceDetailsProps) {
  return (
    <AppDialog onOpenChange={onOpenChange} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 h-[min(760px,calc(100vh-120px))] w-[min(1360px,calc(100vw-180px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section aria-label="Import management" className="flex h-full min-h-0 flex-col">
            <ImportSourceWorkspaceHeader onClose={() => onOpenChange(false)} />
            <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
              <ImportSourceTable
                onChange={onChange}
                onChooseHighlightFolder={onChooseHighlightFolder}
                onChoosePrimaryFolder={onChoosePrimaryFolder}
                onChangeAction={onChangeAction}
                onCopySource={onCopySource}
                onDeleteSource={onDeleteSource}
                onRunNow={onRunNow}
                sources={sources}
              />
            </div>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
