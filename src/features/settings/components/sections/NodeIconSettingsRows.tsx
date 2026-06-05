import { useTranslation, type Translate } from '../../../../shared/localization/LocalizationProvider';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import type { NodeIconEditTarget } from './NodeIconSettingsDialog';
import { ControlGrid, ControlHeader } from './NodeIconSettingsRangeGrid';
import { getBaseConfig } from './nodeIconSettingsRowConfig';
import { DismissedControls, DoubleLineControls, OpacityHeader, PrimaryControls, SettingRow } from './NodeIconSettingsRowControls';
import type { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type NodeIconSettingsState = ReturnType<typeof useNodeIconSettingsState>;

function getKindLabel(t: Translate, kind: EditableIconKind) {
  return t(kind === 'reading' ? 'settings.icons.node.topic' : 'settings.icons.node.item');
}

function getStateLabel(t: Translate, state: NodeTreeRowIconState) {
  if (state === 'pending') return t('settings.icons.node.pending');
  if (state === 'scheduled') return t('settings.icons.node.scheduled');
  return t('settings.icons.node.dismissed');
}

function getStateTitle(t: Translate, kind: EditableIconKind, state: NodeTreeRowIconState) {
  return t('settings.icons.node.stateTitle', { kind: getKindLabel(t, kind), state: getStateLabel(t, state) });
}

function getBaseTitle(t: Translate, kind: EditableIconKind) {
  return t('settings.icons.node.baseTitle', { kind: getKindLabel(t, kind) });
}

function BaseRow(props: {
  kind: EditableIconKind;
  onEdit: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  state: NodeIconSettingsState;
}) {
  const base = getBaseConfig(props.state, props.kind);
  const t = useTranslation();
  const title = getBaseTitle(t, props.kind);
  return (
    <SettingRow baseOnly color={base.color} kind={props.kind} onEditShape={() => props.onEdit({ type: 'svg', kind: props.kind, title: t('settings.icons.node.editMarker', { title }) })} onReset={() => props.onResetBase(props.kind)} previewState="scheduled" setColor={base.setColor} title={title}>
      <PrimaryControls lineWidth={base.lineWidth} onLineWidthChange={base.setLineWidth} onScaleChange={base.setScale} scale={base.scale} />
    </SettingRow>
  );
}

function StateRow(props: {
  kind: EditableIconKind;
  nodeState: NodeTreeRowIconState;
  onEdit: (target: NodeIconEditTarget) => void;
  state: NodeIconSettingsState;
}) {
  const appearance = props.state.stateStyles[props.nodeState][props.kind];
  const t = useTranslation();
  const title = getStateTitle(t, props.kind, props.nodeState);
  return (
    <SettingRow
      color={appearance.color}
      kind={props.kind}
      onEditShape={() => props.onEdit({ type: 'state', state: props.nodeState, kind: props.kind, title: t('settings.icons.node.editMarker', { title }) })}
      onReset={() => props.state.resetStateAppearance(props.nodeState, props.kind)}
      previewState={props.nodeState}
      setColor={(value) => props.state.setStateColor(props.nodeState, props.kind, value)}
      title={title}
      {...(props.nodeState === 'scheduled'
        ? {
            secondaryChildren: (
              <ControlGrid>
                <DoubleLineControls appearance={appearance} kind={props.kind} nodeState={props.nodeState} state={props.state} />
              </ControlGrid>
            ),
            secondaryLabel: t('settings.icons.node.innerRing')
          }
        : {})}
    >
      <PrimaryControls
        lineWidth={appearance.lineWidth}
        onLineWidthChange={(value) => props.state.setStateLineWidth(props.nodeState, props.kind, value)}
        onScaleChange={(value) => props.state.setStateScale(props.nodeState, props.kind, value)}
        scale={appearance.scale}
      />
    </SettingRow>
  );
}

export function NodeIconSettingsRows(props: {
  onEdit: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  state: NodeIconSettingsState;
}) {
  const t = useTranslation();
  return (
    <section aria-label={t('settings.icons.node.markersAria')} className="w-fit overflow-visible bg-settings-group">
      <ControlHeader />
      <BaseRow kind="reading" onEdit={props.onEdit} onResetBase={props.onResetBase} state={props.state} />
      {(['pending', 'scheduled', 'dismissed'] as const).map((nodeState) => (
        <StateRow key={`reading-${nodeState}`} kind="reading" nodeState={nodeState} onEdit={props.onEdit} state={props.state} />
      ))}
      <BaseRow kind="review" onEdit={props.onEdit} onResetBase={props.onResetBase} state={props.state} />
      {(['pending', 'scheduled'] as const).map((nodeState) => (
        <StateRow key={`review-${nodeState}`} kind="review" nodeState={nodeState} onEdit={props.onEdit} state={props.state} />
      ))}
      <section aria-label={t('settings.icons.node.opacityAria')} className="border-t border-settings-divider/65 px-4 py-3">
        <OpacityHeader />
        <DismissedControls appearance={props.state.stateStyles.dismissed.reading} kind="reading" state={props.state} />
      </section>
    </section>
  );
}
