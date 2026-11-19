import { useState } from 'react';

import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import { isManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionAddToDive } from './CompanionAddToDive';
import { CompanionBottomSheet } from './CompanionBottomSheet';
import { companionWorkspaceCreateLabels, useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceMenuActions, companionWorkspaceRowClass as rowClass } from './CompanionWorkspaceMenuActions';
import { CompanionWorkspaceNodeForm } from './CompanionWorkspaceNodeForm';

export type WorkspaceNodeSheetState = { mode: 'menu' | 'rename' | 'move' | 'create' | 'create-dive' | 'create-index' | 'delete' | 'add-to-dive' | 'convert-to-dive' | 'convert-to-index'; nodeId: string | null; parentNodeId: string | null; kind?: NodeKind };

export function CompanionWorkspaceNodeSheet(props: { state: WorkspaceNodeSheetState; onClose(): void }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const [mode, setMode] = useState(props.state.mode);
  const node = actions?.snapshot?.nodesById[props.state.nodeId ?? ''];
  if (!actions) return null;
  const disabled = actions.busy || actions.pending;
  const menuRow = (label: string, onClick: () => void) => <button key={label} type="button" disabled={disabled} className={rowClass} onClick={onClick}>{label}</button>;
  const adding = mode === 'add-to-dive';
  const conversion = mode === 'convert-to-dive' ? 'dive' : mode === 'convert-to-index' ? 'index' : null;
  const title = mode === 'create-dive' || mode === 'create-index' ? t(companionWorkspaceCreateLabels[mode])
    : adding ? t('desktop.nodeList.addToDive.title') : node?.title ?? t('companion.browse.more');
  const failureKey = actions.pending ? 'companion.workspace.savedRefreshError'
    : adding ? 'desktop.nodeList.addToDive.saveFailed'
    : conversion ? 'desktop.nodeList.dive.convertFailed' : 'companion.reading.historyError';
  return <CompanionBottomSheet open onOpenChange={open => { if (!open && !actions.busy) props.onClose(); }} title={title}>
    {actions.error && <p role="status" className="py-3 text-sm text-error">{t(failureKey)}</p>}
    {actions.pending ? <button type="button" disabled={actions.busy} className={rowClass}
      onClick={actions.retryRefresh}>{t('companion.selection.refresh')}</button> : adding ? <CompanionAddToDive
      snapshot={actions.snapshot} sourceId={node?.id} disabled={disabled} onSelect={actions.addToDive} /> :
      (mode === 'convert-to-dive' || mode === 'convert-to-index') ? (node?.virtualFilter && conversion ? <>
        {conversion === 'dive' && !isManualVirtualNodeFilter(node.virtualFilter) && <p className="py-2 text-sm text-companion-text-secondary">
          {t('companion.directory.convertMatchingToDive')}</p>}
        {menuRow(t(conversion === 'dive' ? 'desktop.nodeList.dive.convertToDive' : 'desktop.nodeList.dive.convertToIndex'),
          () => actions.convertDirectory(node.id, conversion, JSON.stringify(node.virtualFilter)))}
      </> : null) : mode === 'menu' ? (node ? <CompanionWorkspaceMenuActions nodeId={node.id}
        onSelect={state => {
          if (state.mode === 'create') actions.open(state);
          else setMode(state.mode);
        }} /> : null)
      : <CompanionWorkspaceNodeForm mode={mode} node={node} parentNodeId={props.state.parentNodeId} initialKind={props.state.kind} />}
  </CompanionBottomSheet>;
}
