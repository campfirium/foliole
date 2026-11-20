import { useMemo, useState } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';
import { selectCanonicalVisibleNodeIds } from '../shared/workspaceCanonicalSelectors';

import { CompanionDestinationPicker } from './CompanionMoveDestinationPicker';
import { buildCompanionDestinationTree } from './companionMoveDestinationTree';

/** Picks a folder or topic that is not yet a direct source of this Dive. */
export function CompanionDiveAddSourceForm({ dive, snapshot, disabled, onSubmit }: {
  dive: WorkspaceNodeSnapshot;
  snapshot: WorkspaceSnapshot;
  disabled: boolean;
  onSubmit(sourceId: string): void;
}) {
  const { locale, t } = useLocalization();
  const [sourceId, select] = useState('');
  const tree = useMemo(() => {
    const current = new Set(dive.manualChildOrder ?? []);
    const nodes = snapshot.nodesById;
    const candidates = selectCanonicalVisibleNodeIds(snapshot).flatMap(id => {
      const node = nodes[id];
      return node && !current.has(id) && canUseDiveSource(node, nodes[node.parentNodeId ?? '']?.kind) ? [node] : [];
    });
    return buildCompanionDestinationTree(candidates, nodes,
      node => resolveNodeDisplayTitle(locale, node.id, node.title) || t('desktop.search.context.untitled'));
  }, [dive.manualChildOrder, locale, snapshot, t]);
  const canSubmit = !disabled && tree.rows.get(sourceId)?.selectable;
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (canSubmit) onSubmit(sourceId);
  }}>
    <CompanionDestinationPicker tree={tree} title={t('desktop.nodeList.dive.sources')}
      searchLabel={t('companion.workspace.searchDiveSources')} emptyLabel={t('desktop.palette.move.noResults')}
      disabled={disabled} value={sourceId} onChange={select} />
    <button className="min-h-11 w-full rounded bg-companion-subtle px-3 text-sm disabled:opacity-40" type="submit" disabled={!canSubmit}>
      {t('companion.dive.addSource')}
    </button>
  </form>;
}
