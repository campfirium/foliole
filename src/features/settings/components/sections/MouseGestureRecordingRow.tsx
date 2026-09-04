import type { MouseEventHandler } from 'react';

import type { CommandPaletteItem } from '../../../../shared/commands/types';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../../shared/ui';
import type { EditorMouseGestureDirection } from '../../../editor/model/editorMouseGestures';

import { MouseGestureGlyph } from './MouseGestureGlyph';
import type { MouseGestureRecordingError } from './useMouseGestureRecorder';

export function MouseGestureRecordingRow(props: {
  command: CommandPaletteItem;
  directions: EditorMouseGestureDirection[];
  error: MouseGestureRecordingError;
  onCancel: () => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onSave: () => void;
}) {
  const t = useTranslation();
  const errorText = props.error
    ? t(`settings.mouseGestures.record.${props.error === 'too-short' ? 'tooShort' : 'conflict'}`)
    : null;
  return (
    <div className="grid grid-cols-[minmax(100px,180px)_minmax(0,1fr)] items-center gap-4 border-t border-settings-divider/55 px-5 py-3 first:border-t-0">
      <div
        className="flex min-h-20 items-center justify-center rounded-md border border-dashed border-settings-control-border-hover bg-settings-control"
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={props.onMouseDown}
      >
        {props.directions.length ? (
          <MouseGestureGlyph
            directions={props.directions}
            label={t('settings.mouseGestures.gesture.custom')}
          />
        ) : (
          <span className="px-3 text-center text-ui-sm text-muted-foreground">
            {t('settings.mouseGestures.record.prompt')}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-ui-md text-foreground">{props.command.title}</div>
        {errorText ? <p className="mt-1 text-ui-sm text-destructive">{errorText}</p> : null}
        <div className="mt-3 flex gap-2">
          <SettingsButton onClick={props.onSave}>
            {t('settings.mouseGestures.record.save')}
          </SettingsButton>
          <SettingsButton onClick={props.onCancel}>
            {t('settings.mouseGestures.record.cancel')}
          </SettingsButton>
        </div>
      </div>
    </div>
  );
}
