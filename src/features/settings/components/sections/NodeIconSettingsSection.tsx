import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import {
  type NodeIconStateAppearance,
  type NodeIconStrokeStyle
} from '../../../nodes/components/nodeIconAppearanceSettings';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { CheckboxField, ColorField, NumberField, StrokeStyleSelect } from './nodeIconSettingFields';
import { useNodeIconSettingsState } from './nodeIconSettingsState';

const SAMPLE_SVG = '<svg viewBox="0 0 16 16"><path d="M2 12C5 10 8 6 14 3" fill="none" stroke="currentColor"/></svg>';
function PreviewIcon(props: {
  kind: NodeTreeRowIconKind;
  label: string;
  contentOpacity?: number;
  state: NodeTreeRowIconState;
}) {
  return (
    <div
      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2 py-1 text-foreground"
      data-node-icon-preview={`${props.kind}-${props.state}`}
    >
      <span
        className="inline-flex items-center gap-1.5"
        style={props.contentOpacity !== undefined ? { opacity: props.contentOpacity } : undefined}
      >
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center">
          <NodeTreeRowIcon kind={props.kind} state={props.state} />
        </span>
        <span>{props.label}</span>
      </span>
    </div>
  );
}

function SvgRow(props: { description: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <SettingsRow className="items-start" description={props.description} title={props.label}>
      <SettingsControlSlot className="flex-[0_0_360px] flex-col items-stretch">
        <label className="flex w-full">
          <span className="sr-only">{props.label}</span>
          <textarea
            aria-label={props.label}
            className="min-h-[92px] w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-45"
            onChange={(event) => props.onChange(event.target.value)}
            placeholder={SAMPLE_SVG}
            rows={4}
            spellCheck={false}
            value={props.value}
          />
        </label>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function StateStyleRow(props: {
  appearance: NodeIconStateAppearance;
  label: string;
  onColorChange: (value: string) => void;
  onDashLengthChange: (value: number) => void;
  onGapLengthChange: (value: number) => void;
  onLineWidthChange: (value: number) => void;
  onStrokeStyleChange: (value: NodeIconStrokeStyle) => void;
  dismissedOptions?: {
    onFadeEnabledChange: (value: boolean) => void;
    onFadeOpacityChange: (value: number) => void;
    onFadeWholeRowChange: (value: boolean) => void;
  };
}) {
  const showDashControls = props.appearance.strokeStyle === 'dashed';
  const fadeOptions = props.dismissedOptions;
  return (
    <SettingsRow
      className="items-start"
      description="Choose line type and color for this node state. Dashed states can tune dash and gap lengths."
      title={props.label}
    >
      <SettingsControlSlot className="flex-[0_0_360px] flex-col items-stretch">
        <div className="flex flex-wrap gap-2">
          <StrokeStyleSelect compact label={`${props.label} stroke style`} onChange={props.onStrokeStyleChange} value={props.appearance.strokeStyle} />
          <NumberField label={`${props.label} line width`} onChange={props.onLineWidthChange} step={0.05} value={props.appearance.lineWidth} />
          <ColorField label={`${props.label} color`} onChange={props.onColorChange} value={props.appearance.color} />
        </div>
        {showDashControls ? (
          <div className="flex flex-wrap gap-2">
            <NumberField label={`${props.label} dash length`} onChange={props.onDashLengthChange} step={0.25} value={props.appearance.dashLength} />
            <NumberField label={`${props.label} gap length`} onChange={props.onGapLengthChange} step={0.25} value={props.appearance.gapLength} />
          </div>
        ) : null}
        {fadeOptions ? (
          <div className="flex flex-col gap-2">
            <CheckboxField checked={props.appearance.fadeEnabled} label="Enable dismissed fade" onChange={fadeOptions.onFadeEnabledChange} />
            {props.appearance.fadeEnabled ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <NumberField label="Dismissed fade opacity" onChange={fadeOptions.onFadeOpacityChange} step={0.05} value={props.appearance.fadeOpacity} />
                </div>
                <CheckboxField checked={props.appearance.fadeWholeRow} label="Fade the whole row" onChange={fadeOptions.onFadeWholeRowChange} />
              </>
            ) : null}
          </div>
        ) : null}
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function PreviewRow(props: {
  dismissedFadeOpacity: number;
  dismissedFadeWholeRow: boolean;
  onReset: () => void;
}) {
  return (
    <SettingsRow
      className="items-start"
      description="Topic and item SVGs keep type semantics. Pending, scheduled, and dismissed styling comes entirely from state settings."
      title="Preview"
    >
      <SettingsControlSlot className="flex-[0_0_360px] flex-col items-stretch">
        <div aria-label="Node icon preview" className="flex flex-wrap items-center gap-2.5">
          <PreviewIcon kind="reading" label="Topic pending" state="pending" />
          <PreviewIcon kind="review" label="Item pending" state="pending" />
          <PreviewIcon kind="reading" label="Topic scheduled" state="scheduled" />
          <PreviewIcon kind="review" label="Item scheduled" state="scheduled" />
          <PreviewIcon
            contentOpacity={props.dismissedFadeWholeRow ? props.dismissedFadeOpacity : undefined}
            kind="reading"
            label="Topic dismissed"
            state="dismissed"
          />
          <PreviewIcon
            contentOpacity={props.dismissedFadeWholeRow ? props.dismissedFadeOpacity : undefined}
            kind="review"
            label="Item dismissed"
            state="dismissed"
          />
        </div>
        <AppButton className="self-start" onClick={props.onReset} variant="primary">
          Restore default node icon settings
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function NodeIconSettingsSection() {
  const state = useNodeIconSettingsState();

  return (
    <SettingsSection ariaLabel="Node icon settings section" title="Node icons">
      <SvgRow
        description="Paste the SVG used for topic nodes. Leave empty to fall back to the built-in geometry icon."
        label="Topic node SVG"
        onChange={state.setTopicSvg}
        value={state.topicSvg}
      />
      <SvgRow
        description="Paste the SVG used for item nodes. Leave empty to reuse the topic SVG fallback behavior."
        label="Item node SVG"
        onChange={state.setItemSvg}
        value={state.itemSvg}
      />
      <StateStyleRow
        appearance={state.stateStyles.pending}
        label="Pending state"
        onColorChange={(value) => state.setStateColor('pending', value)}
        onDashLengthChange={(value) => state.setStateDashLength('pending', value)}
        onGapLengthChange={(value) => state.setStateGapLength('pending', value)}
        onLineWidthChange={(value) => state.setStateLineWidth('pending', value)}
        onStrokeStyleChange={(value) => state.setStateStrokeStyle('pending', value)}
      />
      <StateStyleRow
        appearance={state.stateStyles.scheduled}
        label="Scheduled state"
        onColorChange={(value) => state.setStateColor('scheduled', value)}
        onDashLengthChange={(value) => state.setStateDashLength('scheduled', value)}
        onGapLengthChange={(value) => state.setStateGapLength('scheduled', value)}
        onLineWidthChange={(value) => state.setStateLineWidth('scheduled', value)}
        onStrokeStyleChange={(value) => state.setStateStrokeStyle('scheduled', value)}
      />
      <StateStyleRow
        appearance={state.stateStyles.dismissed}
        dismissedOptions={{
          onFadeEnabledChange: state.setDismissedFadeEnabled,
          onFadeOpacityChange: state.setDismissedFadeOpacity,
          onFadeWholeRowChange: state.setDismissedFadeWholeRow
        }}
        label="Dismissed state"
        onColorChange={(value) => state.setStateColor('dismissed', value)}
        onDashLengthChange={(value) => state.setStateDashLength('dismissed', value)}
        onGapLengthChange={(value) => state.setStateGapLength('dismissed', value)}
        onLineWidthChange={(value) => state.setStateLineWidth('dismissed', value)}
        onStrokeStyleChange={(value) => state.setStateStrokeStyle('dismissed', value)}
      />
      <PreviewRow
        dismissedFadeOpacity={state.stateStyles.dismissed.fadeOpacity}
        dismissedFadeWholeRow={state.stateStyles.dismissed.fadeEnabled && state.stateStyles.dismissed.fadeWholeRow}
        onReset={state.handleReset}
      />
    </SettingsSection>
  );
}
