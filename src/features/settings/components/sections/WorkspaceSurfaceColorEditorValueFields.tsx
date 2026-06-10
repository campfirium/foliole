import { ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, settingsCompactButtonClassName, settingsCompactFieldClassName } from '../../../../shared/ui';
import {
  formatWorkspaceSurfaceColorHex,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue,
  withWorkspaceSurfaceAlpha
} from '../../model/workspaceSurfaceColor';

import {
  applyWorkspaceSurfaceHslChannel,
  applyWorkspaceSurfaceOpacity,
  applyWorkspaceSurfaceRgbChannel,
  nextWorkspaceSurfaceChannelMode,
  syncDraftsFromWorkspaceSurfaceColor,
  type WorkspaceSurfaceChannelMode,
  type WorkspaceSurfaceEditorDraft
} from './WorkspaceSurfaceColorEditorFieldState';

function ModeIconButton(props: {
  channelMode: WorkspaceSurfaceChannelMode;
  compact?: boolean;
  setChannelMode: (value: WorkspaceSurfaceChannelMode) => void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-label={t('settings.appearance.surface.colorEditor.switchMode', { mode: props.channelMode })}
      className={settingsCompactButtonClassName(props.compact ? 'size-5' : 'h-9 w-8')}
      onClick={(event) => {
        event.preventDefault();
        props.setChannelMode(nextWorkspaceSurfaceChannelMode(props.channelMode));
      }}
      type="button"
    >
      <ChevronsUpDown className={props.compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.1} />
    </button>
  );
}

function ChannelInput(props: {
  ariaLabel: string;
  label: string;
  labelSlot?: ReactNode;
  max: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="space-y-1 text-sm text-foreground/72">
      <input
        aria-label={props.ariaLabel}
        className={settingsCompactFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
        max={props.max}
        min={0}
        onChange={(event) => props.onChange(Number(event.target.value))}
        type="number"
        value={props.value}
      />
      <span className="flex items-center justify-center gap-1 text-[0.95rem] text-foreground/82">
        <span>{props.label}</span>
        {props.labelSlot}
      </span>
    </label>
  );
}

function HslFields(props: {
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  return (
    <>
      <ChannelInput ariaLabel={t('settings.appearance.surface.colorEditor.hue')} label="H" max={360} onChange={(value) => applyWorkspaceSurfaceHslChannel({ channel: 'h', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.hslDraft.h} />
      <ChannelInput ariaLabel={t('settings.appearance.surface.colorEditor.saturation')} label="S" max={100} onChange={(value) => applyWorkspaceSurfaceHslChannel({ channel: 's', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.hslDraft.s} />
      <ChannelInput ariaLabel={t('settings.appearance.surface.colorEditor.lightness')} label="L" max={100} onChange={(value) => applyWorkspaceSurfaceHslChannel({ channel: 'l', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.hslDraft.l} />
    </>
  );
}

function RgbFields(props: {
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  return (
    <>
      <ChannelInput ariaLabel={t('settings.appearance.surface.colorEditor.red')} label="R" max={255} onChange={(value) => applyWorkspaceSurfaceRgbChannel({ channel: 'r', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.rgbDraft.r} />
      <ChannelInput ariaLabel={t('settings.appearance.surface.colorEditor.green')} label="G" max={255} onChange={(value) => applyWorkspaceSurfaceRgbChannel({ channel: 'g', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.rgbDraft.g} />
      <ChannelInput ariaLabel={t('settings.appearance.surface.colorEditor.blue')} label="B" max={255} onChange={(value) => applyWorkspaceSurfaceRgbChannel({ channel: 'b', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.rgbDraft.b} />
    </>
  );
}

function HexField(props: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  return (
    <label className="text-sm text-foreground/72">
      <input
        aria-label={t('settings.appearance.surface.colorEditor.visibleHex')}
        className={settingsCompactFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
        onChange={(event) => {
          const parsed = parseWorkspaceSurfaceColor(event.target.value.trim());
          if (!parsed) return;
          const nextColor = withWorkspaceSurfaceAlpha(parsed, props.draft.alphaDraft);
          syncDraftsFromWorkspaceSurfaceColor(props.draft, nextColor);
          props.onCommit(nextColor);
        }}
        value={formatWorkspaceSurfaceColorHex(props.currentColor)}
      />
    </label>
  );
}

function OpacityField(props: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
  showInlineToggle?: boolean;
}) {
  const t = useTranslation();
  return (
    <ChannelInput
      ariaLabel={t('settings.appearance.surface.colorEditor.opacity')}
      label="O"
      labelSlot={props.showInlineToggle ? <ModeIconButton channelMode={props.draft.channelMode} compact setChannelMode={props.draft.setChannelMode} /> : null}
      max={100}
      onChange={(value) => applyWorkspaceSurfaceOpacity({
        currentColor: props.currentColor,
        draft: props.draft,
        onCommit: props.onCommit,
        value
      })}
      value={props.draft.alphaDraft}
    />
  );
}

function HexModeRow(props: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  const t = useTranslation();
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,0.6fr)_2rem] items-end gap-2">
        <HexField currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} />
        <label className="text-sm text-foreground/72">
          <input
            aria-label={t('settings.appearance.surface.colorEditor.opacity')}
            className={settingsCompactFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
            max={100}
            min={0}
            onChange={(event) => applyWorkspaceSurfaceOpacity({
              currentColor: props.currentColor,
              draft: props.draft,
              onCommit: props.onCommit,
              value: Number(event.target.value)
            })}
            type="number"
            value={props.draft.alphaDraft}
          />
        </label>
        <span aria-hidden="true" className="block h-9" />
      </div>
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,0.6fr)_2rem] items-center gap-2 text-[0.95rem] text-foreground/82">
        <span className="text-center">HEX</span>
        <span className="text-center">O</span>
        <span className="flex items-center justify-center">
          <ModeIconButton channelMode={props.draft.channelMode} compact setChannelMode={props.draft.setChannelMode} />
        </span>
      </div>
    </div>
  );
}

export function WorkspaceSurfaceColorEditorValueFields(props: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  if (props.draft.channelMode === 'hex') {
    return <HexModeRow currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} />;
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {props.draft.channelMode === 'hsl'
        ? <HslFields draft={props.draft} onCommit={props.onCommit} />
        : <RgbFields draft={props.draft} onCommit={props.onCommit} />}
      <OpacityField currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} showInlineToggle />
    </div>
  );
}
