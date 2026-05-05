import { ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { AppInput } from '../../../../shared/ui';
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
import { WorkspaceSurfaceColorPickerPanel } from './WorkspaceSurfaceColorPickerPanel';

function ModeIconButton(props: {
  channelMode: WorkspaceSurfaceChannelMode;
  compact?: boolean;
  setChannelMode: (value: WorkspaceSurfaceChannelMode) => void;
}) {
  return (
    <button
      aria-label={`Switch channel mode from ${props.channelMode}`}
      className={[
        'inline-flex items-center justify-center rounded-sm text-foreground/72 transition-colors hover:text-foreground',
        props.compact ? 'h-5 w-5' : 'h-9 w-8 border border-border/45'
      ].join(' ')}
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
      <AppInput
        aria-label={props.ariaLabel}
        className="h-9 rounded-sm px-2 text-center text-sm"
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

function HiddenHexInput(props: {
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  return (
    <AppInput
      aria-label="Workspace surface palette hex"
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

function HslFields(props: {
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  return (
    <>
      <ChannelInput ariaLabel="Workspace surface hue value" label="H" max={360} onChange={(value) => applyWorkspaceSurfaceHslChannel({ channel: 'h', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.hslDraft.h} />
      <ChannelInput ariaLabel="Workspace surface saturation value" label="S" max={100} onChange={(value) => applyWorkspaceSurfaceHslChannel({ channel: 's', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.hslDraft.s} />
      <ChannelInput ariaLabel="Workspace surface lightness value" label="L" max={100} onChange={(value) => applyWorkspaceSurfaceHslChannel({ channel: 'l', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.hslDraft.l} />
    </>
  );
}

function RgbFields(props: {
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  return (
    <>
      <ChannelInput ariaLabel="Workspace surface red value" label="R" max={255} onChange={(value) => applyWorkspaceSurfaceRgbChannel({ channel: 'r', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.rgbDraft.r} />
      <ChannelInput ariaLabel="Workspace surface green value" label="G" max={255} onChange={(value) => applyWorkspaceSurfaceRgbChannel({ channel: 'g', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.rgbDraft.g} />
      <ChannelInput ariaLabel="Workspace surface blue value" label="B" max={255} onChange={(value) => applyWorkspaceSurfaceRgbChannel({ channel: 'b', draft: props.draft, onCommit: props.onCommit, value })} value={props.draft.rgbDraft.b} />
    </>
  );
}

function HexField(props: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
}) {
  return (
    <label className="text-sm text-foreground/72">
      <AppInput
        aria-label="Workspace surface visible hex"
        className="h-9 rounded-sm px-2 text-center text-sm"
        onChange={(event) => {
          const parsed = parseWorkspaceSurfaceColor(event.target.value.trim());
          if (!parsed) {
            return;
          }
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
  return (
    <ChannelInput
      ariaLabel="Workspace surface opacity value"
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
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,0.6fr)_2rem] items-end gap-2">
        <HexField currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} />
        <label className="text-sm text-foreground/72">
          <AppInput
            aria-label="Workspace surface opacity value"
            className="h-9 rounded-sm px-2 text-center text-sm"
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
          <ModeIconButton
            channelMode={props.draft.channelMode}
            compact
            setChannelMode={props.draft.setChannelMode}
          />
        </span>
      </div>
    </div>
  );
}

function ValueRow(props: {
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
      <ValueRow currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} />
    </div>
  );
}
