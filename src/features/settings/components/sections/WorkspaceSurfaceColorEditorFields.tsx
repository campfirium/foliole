import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue,
  withWorkspaceSurfaceAlpha
} from '../../model/workspaceSurfaceColor';

import {
  applyWorkspaceSurfaceOpacity,
  syncDraftsFromWorkspaceSurfaceColor,
  type WorkspaceSurfaceEditorDraft
} from './WorkspaceSurfaceColorEditorFieldState';
import { WorkspaceSurfaceColorEditorValueFields } from './WorkspaceSurfaceColorEditorValueFields';
import { WorkspaceSurfaceColorPickerPanel } from './WorkspaceSurfaceColorPickerPanel';

function HiddenHexInput(props: {
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  return (
    <input
      aria-label={t('settings.appearance.surface.colorEditor.paletteHex')}
      className="sr-only"
      onChange={(event) => {
        const parsed = parseWorkspaceSurfaceColor(event.target.value.trim());
        if (!parsed) {
          return;
        }
        const nextColor = withWorkspaceSurfaceAlpha(parsed, props.draft.alphaDraft);
        syncDraftsFromWorkspaceSurfaceColor(props.draft, nextColor);
        props.onCommit(nextColor);
      }}
      value=""
    />
  );
}

export function WorkspaceSurfaceColorEditorFields(props: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  return (
    <div className="space-y-3">
      <HiddenHexInput draft={props.draft} onCommit={props.onCommit} />
      <WorkspaceSurfaceColorPickerPanel
        color={props.currentColor}
        onAlphaChange={(alphaPercent) => applyWorkspaceSurfaceOpacity({
          currentColor: props.currentColor,
          draft: props.draft,
          onCommit: props.onCommit,
          value: alphaPercent
        })}
        onColorChange={(color) => {
          syncDraftsFromWorkspaceSurfaceColor(props.draft, color);
          props.onCommit(color);
        }}
      />
      <WorkspaceSurfaceColorEditorValueFields currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} />
    </div>
  );
}
