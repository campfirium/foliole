import { X } from 'lucide-react';

import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import type { DraftImportSource, DraftImportSourceField } from './importSourceWorkspaceModel';
import { ImportSourceWorkspaceReadwiseSection } from './ImportSourceWorkspaceReadwiseSection';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

type ImportSourceWorkspaceDetailsProps = {
  detailsOpen: boolean;
  open: boolean;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
  sources: DraftImportSource[];
  onChooseReadwiseRootFolder: () => void;
  onOpenChange: (open: boolean) => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChangeReadwise: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChooseReadwisePrimaryFolder: (sourceId: string) => void;
  onChooseReadwiseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onChangeReadwiseAction: (sourceId: string, value: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onToggleDetails: () => void;
  onRunNow: (sourceId: string) => void;
};

function ImportSourceWorkspaceHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex items-center justify-between px-6 pb-3 pt-5">
      <div className="min-w-0 pr-4">
        <AppDialogTitle className="text-[1.02rem] font-semibold">Import management</AppDialogTitle>
        <p className="mt-1 text-sm text-foreground/68">
          Set up long-running imports here. Readwise Reader is ready first, and later sources can follow the same panel.
        </p>
      </div>
      <AppButton aria-label="Close import management" className="size-8 px-0" onClick={onClose} variant="ghost">
        <X aria-hidden="true" size={15} strokeWidth={1.9} />
      </AppButton>
    </header>
  );
}

function ImportSourceWorkspaceBody(props: Omit<ImportSourceWorkspaceDetailsProps, 'open' | 'onOpenChange'>) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
      <ImportSourceWorkspaceReadwiseSection
        detailsOpen={props.detailsOpen}
        onChange={props.onChangeReadwise}
        onChooseRootFolder={props.onChooseReadwiseRootFolder}
        onChooseHighlightFolder={props.onChooseReadwiseHighlightFolder}
        onChoosePrimaryFolder={props.onChooseReadwisePrimaryFolder}
        onChangeAction={props.onChangeReadwiseAction}
        onToggleDetails={props.onToggleDetails}
        onRunNow={props.onRunNow}
        readwiseRootPath={props.readwiseRootPath}
        sources={props.readwiseSources}
      />
      <div className="overflow-auto">
        <ImportSourceTable
          onChange={props.onChange}
          onChooseHighlightFolder={props.onChooseHighlightFolder}
          onChoosePrimaryFolder={props.onChoosePrimaryFolder}
          onChangeAction={props.onChangeAction}
          onCopySource={props.onCopySource}
          onDeleteSource={props.onDeleteSource}
          onRunNow={props.onRunNow}
          sources={props.sources}
        />
      </div>
    </div>
  );
}

export function ImportSourceWorkspaceDetails({
  detailsOpen,
  open,
  readwiseRootPath,
  readwiseSources,
  sources,
  onChooseReadwiseRootFolder,
  onOpenChange,
  onChange,
  onChangeReadwise,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChooseReadwisePrimaryFolder,
  onChooseReadwiseHighlightFolder,
  onChangeAction,
  onChangeReadwiseAction,
  onCopySource,
  onDeleteSource,
  onToggleDetails,
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
            <ImportSourceWorkspaceBody
              detailsOpen={detailsOpen}
              onChange={onChange}
              onChangeAction={onChangeAction}
              onChangeReadwise={onChangeReadwise}
              onChangeReadwiseAction={onChangeReadwiseAction}
              onChooseHighlightFolder={onChooseHighlightFolder}
              onChoosePrimaryFolder={onChoosePrimaryFolder}
              onChooseReadwiseHighlightFolder={onChooseReadwiseHighlightFolder}
              onChooseReadwisePrimaryFolder={onChooseReadwisePrimaryFolder}
              onChooseReadwiseRootFolder={onChooseReadwiseRootFolder}
              onCopySource={onCopySource}
              onDeleteSource={onDeleteSource}
              onRunNow={onRunNow}
              onToggleDetails={onToggleDetails}
              readwiseRootPath={readwiseRootPath}
              readwiseSources={readwiseSources}
              sources={sources}
            />
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
