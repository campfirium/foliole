import { useMemo } from 'react';

import { canUseDiveSource } from '../../lib/core/database/diveSourceEligibility';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';
import { selectCanonicalVisibleNodeIds } from '../shared/workspaceCanonicalSelectors';

import { CompanionDestinationPicker } from './CompanionMoveDestinationPicker';
import { buildCompanionDestinationTree } from './companionMoveDestinationTree';

export function CompanionDiveSourcePicker(props: {
  snapshot: WorkspaceSnapshot; disabled: boolean; value: string; onChange(value: string): void;
}) {
  const { locale, t } = useLocalization();
  const tree = useMemo(() => {
    const nodes = props.snapshot.nodesById;
    const targets = selectCanonicalVisibleNodeIds(props.snapshot).flatMap(id => {
      const node = nodes[id];
      return node && canUseDiveSource(node, nodes[node.parentNodeId ?? '']?.kind) ? [node] : [];
    });
    return buildCompanionDestinationTree(targets, nodes,
      node => resolveNodeDisplayTitle(locale, node.id, node.title) || t('desktop.search.context.untitled'));
  }, [locale, props.snapshot, t]);
  return <CompanionDestinationPicker tree={tree} title={t('desktop.nodeList.dive.sources')}
    searchLabel={t('companion.workspace.searchDiveSources')} emptyLabel={t('desktop.palette.move.noResults')}
    rootLabel={t('companion.workspace.noDiveSource')} disabled={props.disabled} value={props.value} onChange={props.onChange} />;
}
