import type { MouseEventHandler } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../../shared/ui';
import type { EditorMouseGestureDirection } from '../../../editor/model/editorMouseGestures';

import { MouseGestureGlyph } from './MouseGestureGlyph';

export function MouseGestureRecordingRow(props: {
  conflictCommandTitle: string | null;
  directions: EditorMouseGestureDirection[];
  onCancel: () => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onMouseMove: MouseEventHandler<HTMLDivElement>;
  onMouseUp: MouseEventHandler<HTMLDivElement>;
  onSave: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="px-5 py-5">
      <div
        className="flex min-h-36 w-full items-center justify-center rounded-md border border-dashed border-settings-control-border-hover bg-settings-control transition-colors hover:border-settings-control-border hover:bg-settings-control-hover"
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={props.onMouseDown}
        onMouseMove={props.onMouseMove}
        onMouseUp={props.onMouseUp}
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
      {props.conflictCommandTitle ? (
        <p className="mt-2 text-ui-sm text-foreground/70">
          {t('settings.mouseGestures.record.conflict', { command: props.conflictCommandTitle })}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <SettingsButton onClick={props.onCancel}>
          {t('settings.mouseGestures.record.cancel')}
        </SettingsButton>
        <SettingsButton
          disabled={!props.directions.length}
          onClick={props.onSave}
        >
          {t(props.conflictCommandTitle ? 'settings.mouseGestures.record.replace' : 'settings.mouseGestures.record.save')}
        </SettingsButton>
      </div>
    </div>
  );
}
