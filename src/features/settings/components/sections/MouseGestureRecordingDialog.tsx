import type { MouseEventHandler } from 'react';

import type { CommandPaletteItem } from '../../../../shared/commands/types';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  settingsNestedDialogSurfaceClassName
} from '../../../../shared/ui';
import type { EditorMouseGestureDirection } from '../../../editor/model/editorMouseGestures';

import { MouseGestureRecordingRow } from './MouseGestureRecordingRow';
import type { MouseGestureRecordingError } from './useMouseGestureRecorder';

export function MouseGestureRecordingDialog(props: {
  command: CommandPaletteItem | undefined;
  directions: EditorMouseGestureDirection[];
  error: MouseGestureRecordingError;
  onCancel: () => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onSave: () => void;
}) {
  const t = useTranslation();
  if (!props.command) return null;
  return (
    <AppDialog open onOpenChange={(open) => !open && props.onCancel()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className={settingsNestedDialogSurfaceClassName(
            'shell',
            'w-[min(480px,calc(100vw-32px))] overflow-hidden p-0'
          )}
          data-settings-nested-dialog="true"
        >
          <header className="border-b border-settings-divider/55 px-5 py-4">
            <AppDialogTitle className="text-ui-lg">
              {t('settings.mouseGestures.record.add', { command: props.command.title })}
            </AppDialogTitle>
          </header>
          <MouseGestureRecordingRow
            directions={props.directions}
            error={props.error}
            onCancel={props.onCancel}
            onMouseDown={props.onMouseDown}
            onSave={props.onSave}
          />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
