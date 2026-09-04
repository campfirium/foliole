import type { MouseEventHandler } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../../shared/ui';
import type { EditorMouseGestureDirection } from '../../../editor/model/editorMouseGestures';

import { MouseGestureGlyph } from './MouseGestureGlyph';
import type { MouseGestureRecordingError } from './useMouseGestureRecorder';

export function MouseGestureRecordingRow(props: {
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
    <div className="px-5 py-5">
      <div
        className="flex min-h-36 w-full items-center justify-center rounded-md border border-dashed border-settings-control-border-hover bg-settings-control transition-colors hover:border-settings-control-border hover:bg-settings-control-hover"
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
      {errorText ? <p className="mt-2 text-ui-sm text-destructive">{errorText}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <SettingsButton onClick={props.onCancel}>
          {t('settings.mouseGestures.record.cancel')}
        </SettingsButton>
        <SettingsButton
          disabled={!props.directions.length || Boolean(props.error)}
          onClick={props.onSave}
        >
          {t('settings.mouseGestures.record.save')}
        </SettingsButton>
      </div>
    </div>
  );
}
