import {
  AppInput,
  LUCIDE_ICON_OPTIONS,
  settingsFieldClassName
} from '../../../../shared/ui';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import type { useNodeIconSettingsState } from './nodeIconSettingsState';
import { IconGrid, matchesIconQuery } from './SettingsRailIconPicker';

const SVG_PLACEHOLDER = 'Optional SVG. Empty uses the selected Lucide icon.';
const STATE_SVG_PLACEHOLDER = 'Optional SVG. Empty uses the base icon.';

const SEARCH_INPUT_CLASS_NAME =
  'h-9 text-sm focus-visible:border-settings-control-border-hover focus-visible:ring-0 focus-visible:ring-offset-0';
const TEXTAREA_CLASS_NAME = settingsFieldClassName(
  'min-h-[108px] resize-y rounded-md px-3 py-2 font-mono leading-6 placeholder:font-sans placeholder:text-foreground/42'
);

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
export type NodeIconEditTarget =
  | { type: 'svg'; kind: EditableIconKind; title: string }
  | { type: 'state'; state: NodeTreeRowIconState; kind: EditableIconKind; title: string };

export type NodeIconSettingsDialogState = ReturnType<typeof useNodeIconSettingsState>;

function SvgEditDialog(props: {
  iconId: string;
  iconQuery: string;
  onIconChange: (value: string) => void;
  onIconQueryChange: (value: string) => void;
  onSvgChange: (value: string) => void;
  svgValue: string;
}) {
  const filteredIcons = LUCIDE_ICON_OPTIONS.filter((icon) => matchesIconQuery([icon.id, icon.label], props.iconQuery));
  return (
    <div className="grid min-h-0 gap-4">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Lucide icon</p>
        <AppInput
          aria-label="Search icons"
          className={SEARCH_INPUT_CLASS_NAME}
          onChange={(event) => props.onIconQueryChange(event.target.value)}
          placeholder="Search icons..."
          value={props.iconQuery}
        />
        <IconGrid
          icons={filteredIcons}
          selectedIconId={props.iconId}
          onSelect={(iconId) => {
            props.onIconChange(iconId);
            props.onSvgChange('');
          }}
        />
      </div>
      <label className="grid gap-2 text-sm font-medium text-foreground">
        SVG
        <textarea
          aria-label="SVG"
          className={TEXTAREA_CLASS_NAME}
          onChange={(event) => props.onSvgChange(event.target.value)}
          placeholder={SVG_PLACEHOLDER}
          spellCheck={false}
          value={props.svgValue}
        />
      </label>
    </div>
  );
}

function StateShapeDialog(props: { onSvgChange: (value: string) => void; svgValue: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      SVG
      <textarea
        aria-label="SVG"
        className={TEXTAREA_CLASS_NAME}
        onChange={(event) => props.onSvgChange(event.target.value)}
        placeholder={STATE_SVG_PLACEHOLDER}
        spellCheck={false}
        value={props.svgValue}
      />
    </label>
  );
}

export function NodeIconSettingsDialogBody(props: {
  iconQuery: string;
  onIconQueryChange: (value: string) => void;
  state: NodeIconSettingsDialogState;
  target: NodeIconEditTarget;
}) {
  const { target } = props;
  return (
    <div className="min-h-0">
      {target.type === 'svg' ? (
        <SvgEditDialog
          iconId={target.kind === 'reading' ? props.state.topicIcon : props.state.itemIcon}
          iconQuery={props.iconQuery}
          onIconChange={target.kind === 'reading' ? props.state.setTopicIcon : props.state.setItemIcon}
          onIconQueryChange={props.onIconQueryChange}
          onSvgChange={target.kind === 'reading' ? props.state.setTopicSvg : props.state.setItemSvg}
          svgValue={target.kind === 'reading' ? props.state.topicSvg : props.state.itemSvg}
        />
      ) : (
        <StateShapeDialog
          onSvgChange={(value) => props.state.setStateSvg(target.state, target.kind, value)}
          svgValue={props.state.stateStyles[target.state][target.kind].svg}
        />
      )}
    </div>
  );
}
