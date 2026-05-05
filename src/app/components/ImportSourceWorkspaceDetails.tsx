import { X } from 'lucide-react';

import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import type { DraftImportSource, DraftImportSourceField } from './importSourceWorkspaceModel';
import { ImportSourceWorkspaceReadwiseSection } from './ImportSourceWorkspaceReadwiseSection';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

type ImportSourceWorkspaceDetailsProps = {
  open: boolean;
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  sources: DraftImportSource[];
  onOpenChange: (open: boolean) => void;
  onOpenReadwiseConfig: () => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onDisableKeepImport: (sourceId: string, scope: 'sources') => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string, scope: 'sources') => void;
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
        onOpenReadwiseConfig={props.onOpenReadwiseConfig}
        readwiseReaderConfig={props.readwiseReaderConfig}
        readwiseRootPath={props.readwiseRootPath}
      />
      <div className="overflow-auto">
        <ImportSourceTable
          onChange={props.onChange}
          onChooseHighlightFolder={props.onChooseHighlightFolder}
          onChoosePrimaryFolder={props.onChoosePrimaryFolder}
          onDisableKeepImport={(sourceId) => props.onDisableKeepImport(sourceId, 'sources')}
          onCopySource={props.onCopySource}
          onDeleteSource={props.onDeleteSource}
          onPreviewKeepImport={(sourceId) => void props.onPreviewKeepImport(sourceId, 'sources')}
          sources={props.sources}
        />
      </div>
    </div>
  );
}

export function ImportSourceWorkspaceDetails({
  open,
  readwiseRootPath,
  readwiseReaderConfig,
  sources,
  onOpenChange,
  onOpenReadwiseConfig,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onDisableKeepImport,
  onCopySource,
  onDeleteSource,
  onPreviewKeepImport
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
              onChange={onChange}
              onChooseHighlightFolder={onChooseHighlightFolder}
              onChoosePrimaryFolder={onChoosePrimaryFolder}
              onDisableKeepImport={onDisableKeepImport}
              onCopySource={onCopySource}
              onDeleteSource={onDeleteSource}
              onOpenReadwiseConfig={onOpenReadwiseConfig}
              onPreviewKeepImport={onPreviewKeepImport}
              readwiseReaderConfig={readwiseReaderConfig}
              readwiseRootPath={readwiseRootPath}
              sources={sources}
            />
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
