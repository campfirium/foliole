import { useMemo, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { canUseManualVirtualFolderSource } from '../../lib/core/nodes/virtualNodeResults';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';
import type { CompanionIndexSourceChange } from '../shared/platform/companion/runtime/companionIndexSources';
import { selectCanonicalVisibleNodeIds } from '../shared/workspaceCanonicalSelectors';

import { CompanionDestinationPicker } from './CompanionMoveDestinationPicker';
import { buildCompanionDestinationTree } from './companionMoveDestinationTree';

export const companionIndexSourcePromptKeys = {
  add: 'companion.index.addSourcePrompt', remove: 'companion.index.removeSourcePrompt'
} as const;

export function CompanionIndexSourceForm({ index, snapshot, change, disabled, onSubmit }: {
  index: WorkspaceNodeSnapshot;
  snapshot: WorkspaceSnapshot;
  change: CompanionIndexSourceChange;
  disabled: boolean;
  onSubmit(sourceId: string): void;
}) {
  const { locale, t } = useLocalization();
  const [sourceId, select] = useState('');
  const tree = useMemo(() => {
    const current = new Set(index.manualChildOrder ?? []);
    const nodes = snapshot.nodesById;
    const ids = change === 'add' ? selectCanonicalVisibleNodeIds(snapshot) : [...current];
    const candidates = ids.flatMap(id => {
      const node = nodes[id];
      if (!node) return [];
      return change === 'remove' || (!current.has(id) && canUseManualVirtualFolderSource(node)) ? [node] : [];
    });
    return buildCompanionDestinationTree(candidates, nodes, node => resolveNodeDisplayTitle(locale, node.id, node.title));
  }, [change, index.manualChildOrder, locale, snapshot]);
  const canSubmit = !disabled && tree.rows.get(sourceId)?.selectable;
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (canSubmit) onSubmit(sourceId);
  }}>
    <CompanionDestinationPicker tree={tree} title={t('companion.index.sources')}
      searchLabel={t('companion.workspace.searchDiveSources')} emptyLabel={t('companion.index.noSources')}
      disabled={disabled} value={sourceId} onChange={select} />
    <button className="min-h-11 w-full rounded bg-companion-subtle px-3 text-sm disabled:opacity-40" type="submit" disabled={!canSubmit}>
      {t(change === 'add' ? 'companion.index.addSource' : 'companion.index.removeSource')}
    </button>
  </form>;
}
