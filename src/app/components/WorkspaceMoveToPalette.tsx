import { useMemo, useRef } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { AppMoveToNodeState } from '../hooks/appMoveToNodeState';

import { WorkspaceDestinationPalette } from './WorkspaceDestinationPalette';
import { buildNodeSearchResults } from './workspaceNodeSearch';

export function WorkspaceMoveToPalette({ state }: { state: AppMoveToNodeState }) {
  const t = useTranslation();
  const busy = useRef(false);
  const destinations = useMemo(() => buildNodeSearchResults(
    state.nodeOrder, state.nodesById, state.recentNodeIds, state.trashedNodeIds, '', Infinity
  ).map(({ id, title, path }) => ({
    id,
    title: path ? `${path} / ${title}` : title
  })), [state.nodeOrder, state.nodesById, state.recentNodeIds, state.trashedNodeIds]);

  async function move(id: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      await state.onOpenNode(id);
    } finally {
      busy.current = false;
    }
  }

  const label = t('desktop.palette.move.dialog');
  const placeholder = state.sourceTitle ?
    t('desktop.palette.move.sourcePlaceholder', { title: state.sourceTitle }) :
    t('desktop.palette.move.selectionPlaceholder');

  return <WorkspaceDestinationPalette action={t('desktop.palette.move.execute')}
    dialogLabel={label} emptyLabel={t('desktop.palette.move.empty')}
    findDestinations={(query) => destinations.filter((entry) =>
      entry.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))}
    noResultsLabel={t('desktop.palette.move.noResults')}
    onClose={() => { if (!busy.current) state.onClose(); }} onSelect={(id) => void move(id)}
    placeholder={placeholder} />;
}
