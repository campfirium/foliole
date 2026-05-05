import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppInput,
  LUCIDE_ICON_OPTIONS,
  settingsFieldClassName
} from '../../../../shared/ui';
import type { NodeIconEffect, NodeIconStateAppearance } from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { CheckboxField, ColorField, EffectSelect, NumberField } from './nodeIconSettingFields';
import type { useNodeIconSettingsState } from './nodeIconSettingsState';
import { IconGrid, matchesIconQuery } from './SettingsRailIconPicker';

const SVG_PLACEHOLDER = 'Paste custom SVG here. Leave empty to use the selected Lucide icon.';
const STATE_SVG_PLACEHOLDER = 'Paste state SVG here. Leave empty to inherit the base icon.';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
export type NodeIconEditTarget =
  | { type: 'svg'; kind: EditableIconKind; title: string }
  | { type: 'state'; state: NodeTreeRowIconState; kind: EditableIconKind; title: string };

function SvgEditDialog(props: {
  color: string;
  iconId: string;
  iconQuery: string;
  lineWidth: number;
  onColorChange: (value: string) => void;
  onIconChange: (value: string) => void;
  onIconQueryChange: (value: string) => void;
  onLineWidthChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  onSvgChange: (value: string) => void;
  scale: number;
  svgValue: string;
}) {
  const filteredIcons = LUCIDE_ICON_OPTIONS.filter((icon) => matchesIconQuery([icon.id, icon.label], props.iconQuery));
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Lucide icon</p>
        <AppInput
          aria-label="Search icons"
          className="h-9 text-sm"
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
          className={settingsFieldClassName('min-h-[76px] resize-y rounded-sm px-3 py-2 font-mono leading-6')}
          onChange={(event) => props.onSvgChange(event.target.value)}
          placeholder={SVG_PLACEHOLDER}
          spellCheck={false}
          value={props.svgValue}
        />
      </label>
      <div className="grid grid-cols-[7.5rem_7.5rem_minmax(9.5rem,auto)] gap-3">
        <NumberField label="Line width" onChange={props.onLineWidthChange} step={0.05} value={props.lineWidth} />
        <NumberField label="Scale" onChange={props.onScaleChange} step={0.05} value={props.scale} />
        <ColorField label="Color" onChange={props.onColorChange} value={props.color} />
      </div>
    </div>
  );
}

function StateEditDialog(props: {
  appearance: NodeIconStateAppearance;
  isDismissed: boolean;
  onColorChange: (value: string) => void;
  onEffectChange: (value: NodeIconEffect) => void;
  onFadeEnabledChange: (value: boolean) => void;
  onFadeOpacityChange: (value: number) => void;
  onFadeWholeRowChange: (value: boolean) => void;
  onInnerLineWidthChange: (value: number) => void;
  onInnerScaleChange: (value: number) => void;
  onLineWidthChange: (value: number) => void;
  onOuterLineWidthChange: (value: number) => void;
  onOuterScaleChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  onSvgChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium text-foreground">
        SVG
        <textarea
          aria-label="SVG"
          className={settingsFieldClassName('min-h-[120px] resize-y rounded-sm px-3 py-2 font-mono leading-6')}
          onChange={(event) => props.onSvgChange(event.target.value)}
          placeholder={STATE_SVG_PLACEHOLDER}
          spellCheck={false}
          value={props.appearance.svg}
        />
      </label>
      <div className="grid grid-cols-[8.25rem_7.5rem_7.5rem_minmax(9.5rem,auto)] gap-3">
        <EffectSelect compact label="Effect" onChange={props.onEffectChange} value={props.appearance.effect} />
        <NumberField label="Line width" onChange={props.onLineWidthChange} step={0.05} value={props.appearance.lineWidth} />
        <NumberField label="Scale" onChange={props.onScaleChange} step={0.05} value={props.appearance.scale} />
        <ColorField label="Color" onChange={props.onColorChange} value={props.appearance.color} />
      </div>
      {props.appearance.effect === 'double-line' ? (
        <div className="flex flex-wrap gap-3">
          <NumberField label="Outer scale" onChange={props.onOuterScaleChange} step={0.05} value={props.appearance.outerScale} />
          <NumberField label="Outer width" onChange={props.onOuterLineWidthChange} step={0.05} value={props.appearance.outerLineWidth} />
          <NumberField label="Inner scale" onChange={props.onInnerScaleChange} step={0.05} value={props.appearance.innerScale} />
          <NumberField label="Inner width" onChange={props.onInnerLineWidthChange} step={0.05} value={props.appearance.innerLineWidth} />
        </div>
      ) : null}
      {props.isDismissed ? (
        <div className="grid gap-2 border-t border-settings-divider/55 pt-3">
          <CheckboxField checked={props.appearance.fadeEnabled} label="Enable fade" onChange={props.onFadeEnabledChange} />
          {props.appearance.fadeEnabled ? (
            <>
              <NumberField label="Fade opacity" onChange={props.onFadeOpacityChange} step={0.05} value={props.appearance.fadeOpacity} />
              <CheckboxField checked={props.appearance.fadeWholeRow} label="Fade the whole row" onChange={props.onFadeWholeRowChange} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function NodeIconSettingsDialog(props: {
  editTarget: NodeIconEditTarget | null;
  iconQuery: string;
  onClose: () => void;
  onIconQueryChange: (value: string) => void;
  onReset: (target: NodeIconEditTarget) => void;
  state: ReturnType<typeof useNodeIconSettingsState>;
}) {
  const target = props.editTarget;
  if (!target) return null;
  const appearance = target.type === 'state' ? props.state.stateStyles[target.state][target.kind] : null;
  return (
    <AppDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="grid w-[min(580px,calc(100vw-48px))] gap-5 rounded-lg border-settings-outline bg-settings-shell p-5 shadow-settings">
          <AppDialogTitle>{target.title}</AppDialogTitle>
          {target.type === 'svg' ? (
            <SvgEditDialog
              color={target.kind === 'reading' ? props.state.topicColor : props.state.itemColor}
              iconId={target.kind === 'reading' ? props.state.topicIcon : props.state.itemIcon}
              iconQuery={props.iconQuery}
              lineWidth={target.kind === 'reading' ? props.state.topicLineWidth : props.state.itemLineWidth}
              onColorChange={target.kind === 'reading' ? props.state.setTopicColor : props.state.setItemColor}
              onIconChange={target.kind === 'reading' ? props.state.setTopicIcon : props.state.setItemIcon}
              onIconQueryChange={props.onIconQueryChange}
              onLineWidthChange={target.kind === 'reading' ? props.state.setTopicLineWidth : props.state.setItemLineWidth}
              onScaleChange={target.kind === 'reading' ? props.state.setTopicScale : props.state.setItemScale}
              onSvgChange={target.kind === 'reading' ? props.state.setTopicSvg : props.state.setItemSvg}
              scale={target.kind === 'reading' ? props.state.topicScale : props.state.itemScale}
              svgValue={target.kind === 'reading' ? props.state.topicSvg : props.state.itemSvg}
            />
          ) : appearance ? (
            <StateEditDialog
              appearance={appearance}
              isDismissed={target.state === 'dismissed'}
              onColorChange={(value) => props.state.setStateColor(target.state, target.kind, value)}
              onEffectChange={(value) => props.state.setStateEffect(target.state, target.kind, value)}
              onFadeEnabledChange={(value) => props.state.setDismissedFadeEnabled(target.kind, value)}
              onFadeOpacityChange={(value) => props.state.setDismissedFadeOpacity(target.kind, value)}
              onFadeWholeRowChange={(value) => props.state.setDismissedFadeWholeRow(target.kind, value)}
              onInnerLineWidthChange={(value) => props.state.setStateInnerLineWidth(target.state, target.kind, value)}
              onInnerScaleChange={(value) => props.state.setStateInnerScale(target.state, target.kind, value)}
              onLineWidthChange={(value) => props.state.setStateLineWidth(target.state, target.kind, value)}
              onOuterLineWidthChange={(value) => props.state.setStateOuterLineWidth(target.state, target.kind, value)}
              onOuterScaleChange={(value) => props.state.setStateOuterScale(target.state, target.kind, value)}
              onScaleChange={(value) => props.state.setStateScale(target.state, target.kind, value)}
              onSvgChange={(value) => props.state.setStateSvg(target.state, target.kind, value)}
            />
          ) : null}
          <footer className="flex justify-between border-t border-settings-divider/55 pt-4">
            <AppButton onClick={() => props.onReset(target)}>Reset</AppButton>
            <AppButton onClick={props.onClose} variant="primary">Done</AppButton>
          </footer>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
