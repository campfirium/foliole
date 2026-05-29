import { useEffect } from 'react';

import { onWindowEscape } from '../../../../shared/platform/keyboard';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../../../shared/ui';
import type { NodeTreeRowIconKind } from '../../../nodes/components/NodeTreeRowIconModel';

import type { NodeIconEditTarget } from './NodeIconSettingsDialog';
import { NodeIconSettingsPreview } from './NodeIconSettingsPreview';
import { NodeIconSettingsRows } from './NodeIconSettingsRows';
import type { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

function EditorHeader(props: {
  onReset: () => void;
}) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-4 border-b border-settings-divider/65 bg-settings-group px-6">
      <div className="min-w-0">
        <AppDialogTitle>Navigation icons</AppDialogTitle>
      </div>
      <button className="text-sm text-foreground/68 transition-colors hover:text-foreground" onClick={props.onReset} type="button">
        Reset all
      </button>
    </header>
  );
}

export function NodeIconSettingsEditorDialog(props: {
  onClose: () => void;
  onEditShape: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  open: boolean;
  state: ReturnType<typeof useNodeIconSettingsState>;
}) {
  useEffect(() => {
    if (!props.open) return undefined;
    return onWindowEscape(() => {
      props.onClose();
      return true;
    });
  }, [props.onClose, props.open]);
  if (!props.open) return null;
  return (
    <AppDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay className="bg-transparent" />
        <AppDialogContent
          aria-describedby={undefined}
          className="grid max-h-[min(760px,calc(100dvh-36px))] w-fit max-w-[calc(100vw-36px)] grid-rows-[auto_minmax(0,auto)_auto] overflow-hidden rounded-lg border-settings-outline bg-settings-group p-0 shadow-settings"
          data-settings-nested-dialog="true"
        >
          <EditorHeader onReset={props.state.handleReset} />
          <div className="grid min-h-0 grid-cols-[minmax(0,max-content)_16rem] border-b border-settings-divider/65 max-[900px]:grid-cols-1">
            <main className="min-h-0 px-6 pb-3 pt-4">
              <div className="grid w-fit overflow-visible">
                <NodeIconSettingsRows onEdit={props.onEditShape} onResetBase={props.onResetBase} state={props.state} />
              </div>
            </main>
            <NodeIconSettingsPreview state={props.state} />
          </div>
          <footer className="flex justify-end bg-settings-control/45 px-6 py-3">
            <AppButton onClick={props.onClose} variant="primary">Done</AppButton>
          </footer>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
