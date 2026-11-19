import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { listVisibleDives } from '../shared/diveMembership';
import { useLocalization } from '../shared/localization/LocalizationProvider';

import { CompanionDestinationPicker } from './CompanionMoveDestinationPicker';
import { buildCompanionDestinationTree } from './companionMoveDestinationTree';

export function CompanionAddToDive(props: {
  snapshot: WorkspaceSnapshot | null;
  sourceId: string | undefined;
  disabled: boolean;
  onSelect(diveId: string, sourceId: string): void;
}) {
  const { locale, t } = useLocalization();
  const { snapshot, sourceId } = props;
  const tree = useMemo(() => {
    const targets = snapshot && sourceId ? listVisibleDives(snapshot)
      .filter(dive => !dive.directSourceIds.includes(sourceId))
      .sort((a, b) => a.title.localeCompare(b.title, locale) || a.id.localeCompare(b.id))
      .map(dive => snapshot.nodesById[dive.id]!) : [];
    return buildCompanionDestinationTree(targets, Object.fromEntries(targets.map(node => [node.id, node])), node => node.title);
  }, [locale, snapshot, sourceId]);
  if (!sourceId || !tree.rows.size) return <p role="status" className="py-3 text-sm text-companion-text-secondary">
    {t('desktop.nodeList.addToDive.empty')}
  </p>;
  return <CompanionDestinationPicker tree={tree} title={t('desktop.nodeList.addToDive.results')}
    searchLabel={t('desktop.nodeList.addToDive.placeholder')} emptyLabel={t('desktop.nodeList.addToDive.noResults')}
    disabled={props.disabled} value="" onChange={diveId => props.onSelect(diveId, sourceId)} />;
}
