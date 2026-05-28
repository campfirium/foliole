import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

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
  activeKind: EditableIconKind;
  onActiveKindChange: Dispatch<SetStateAction<EditableIconKind>>;
  onReset: () => void;
}) {
  return (
    <header className="flex min-h-14 items-end justify-between gap-4 border-b border-settings-divider/55 bg-settings-shell px-4">
      <AppDialogTitle className="sr-only">Edit navigation icons</AppDialogTitle>
      <div aria-label="Marker kind" className="flex items-end gap-1" role="tablist">
        {(['reading', 'review'] as const).map((kind) => {
          const selected = props.activeKind === kind;
          return (
            <button
              aria-selected={selected}
              className={[
                'min-w-28 rounded-t-md border border-b-0 px-5 py-2.5 text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                selected ? 'border-settings-divider/55 bg-settings-group text-foreground' : 'border-transparent text-foreground/58 hover:text-foreground'
              ].join(' ')}
              key={kind}
              onClick={() => props.onActiveKindChange(kind)}
              role="tab"
              type="button"
            >
              {kind === 'reading' ? 'Topic' : 'Item'}
            </button>
          );
        })}
      </div>
      <button className="mb-2 text-sm text-foreground/68 transition-colors hover:text-foreground" onClick={props.onReset} type="button">
        Reset
      </button>
    </header>
  );
}

export function NodeIconSettingsEditorDialog(props: {
  activeKind: EditableIconKind;
  onActiveKindChange: Dispatch<SetStateAction<EditableIconKind>>;
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
  const activeTitle = props.activeKind === 'reading' ? 'Topic' : 'Item';
  return (
    <AppDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="grid max-h-[calc(100dvh-32px)] w-[min(1100px,calc(100vw-32px))] overflow-hidden rounded-lg border-settings-outline bg-settings-shell p-0 shadow-settings"
          data-settings-nested-dialog="true"
        >
          <EditorHeader activeKind={props.activeKind} onActiveKindChange={props.onActiveKindChange} onReset={props.state.handleReset} />
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_22rem] overflow-auto max-[1120px]:grid-cols-1">
            <div className="px-5">
              <NodeIconSettingsRows kind={props.activeKind} onEdit={props.onEditShape} onResetBase={props.onResetBase} state={props.state} title={activeTitle} />
            </div>
            <NodeIconSettingsPreview />
          </div>
          <footer className="flex justify-end border-t border-settings-divider/55 bg-settings-shell px-4 py-3">
            <AppButton onClick={props.onClose} variant="primary">Done</AppButton>
          </footer>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
