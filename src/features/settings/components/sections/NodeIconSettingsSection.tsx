import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  DEFAULT_NODE_ICON_BASE_APPEARANCE_BY_KIND
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind } from '../../../nodes/components/NodeTreeRowIconModel';

import { NodeIconSettingsDialog, type NodeIconEditTarget } from './NodeIconSettingsDialog';
import { NodeIconSettingsEditorDialog } from './NodeIconSettingsEditorDialog';
import { NodeIconSettingsOverview } from './NodeIconSettingsOverview';
import { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

function resetBase(state: ReturnType<typeof useNodeIconSettingsState>, kind: EditableIconKind) {
  const defaultAppearance = DEFAULT_NODE_ICON_BASE_APPEARANCE_BY_KIND[kind];
  if (kind === 'reading') {
    state.setTopicIcon('');
    state.setTopicSvg('');
    state.setTopicColor(defaultAppearance.color);
    state.setTopicLineWidth(defaultAppearance.lineWidth);
    state.setTopicScale(defaultAppearance.scale);
    return;
  }
  state.setItemIcon('');
  state.setItemSvg('');
  state.setItemColor(defaultAppearance.color);
  state.setItemLineWidth(defaultAppearance.lineWidth);
  state.setItemScale(defaultAppearance.scale);
}

function resetEditTarget(state: ReturnType<typeof useNodeIconSettingsState>, target: NodeIconEditTarget) {
  if (target.type === 'svg') {
    resetBase(state, target.kind);
    return;
  }
  state.setStateIcon(target.state, target.kind, '');
  state.setStateSvg(target.state, target.kind, '');
}

export function NodeIconSettingsSection(props: {
  onSettingsBackdropTransparentChange: (value: boolean) => void;
}) {
  const { onSettingsBackdropTransparentChange } = props;
  const t = useTranslation();
  const state = useNodeIconSettingsState();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NodeIconEditTarget | null>(null);
  const [iconQuery, setIconQuery] = useState('');

  useEffect(() => {
    onSettingsBackdropTransparentChange(editorOpen);
    return () => onSettingsBackdropTransparentChange(false);
  }, [editorOpen, onSettingsBackdropTransparentChange]);

  return (
    <section aria-label={t('settings.icons.node.sectionAria')} className="mb-8 last:mb-0">
      <div className="overflow-hidden rounded-md bg-settings-group">
        <NodeIconSettingsOverview onEdit={() => setEditorOpen(true)} />
      </div>
      <NodeIconSettingsEditorDialog
        onClose={() => setEditorOpen(false)}
        onEditShape={setEditTarget}
        onResetBase={(kind) => resetBase(state, kind)}
        open={editorOpen}
        state={state}
      />
      <NodeIconSettingsDialog
        editTarget={editTarget}
        iconQuery={iconQuery}
        onClose={() => {
          setEditTarget(null);
          setIconQuery('');
        }}
        onIconQueryChange={setIconQuery}
        resetLabel={editTarget?.type === 'state' ? t('settings.icons.useBase') : t('settings.icons.reset')}
        onReset={(target) => resetEditTarget(state, target)}
        state={state}
      />
    </section>
  );
}
