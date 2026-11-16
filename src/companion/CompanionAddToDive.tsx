import { useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { listVisibleDives } from '../shared/diveMembership';
import { useTranslation } from '../shared/localization/LocalizationProvider';

export function CompanionAddToDive(props: {
  snapshot: WorkspaceSnapshot | null;
  sourceId: string | undefined;
  disabled: boolean;
  onSelect(diveId: string, sourceId: string): void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const { snapshot, sourceId } = props;
  const targets = snapshot && sourceId
    ? listVisibleDives(snapshot).filter(dive => !dive.directSourceIds.includes(sourceId))
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    : [];
  const results = targets.filter(dive => dive.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    {targets.length > 0 && <input aria-label={t('desktop.nodeList.addToDive.placeholder')}
      className="min-h-11 w-full border-b border-companion-divider bg-transparent px-1 text-base"
      onChange={event => setQuery(event.target.value)} value={query}
      placeholder={t('desktop.nodeList.addToDive.placeholder')} type="search" />}
    <div aria-label={t('desktop.nodeList.addToDive.results')} role="group">
      {results.map(dive => <button key={dive.id} type="button" disabled={props.disabled}
        className="block min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm [overflow-wrap:anywhere]"
        onClick={() => { if (sourceId) props.onSelect(dive.id, sourceId); }}>{dive.title}</button>)}
    </div>
    {results.length === 0 && <p role="status" className="py-3 text-sm text-companion-text-secondary">
      {t(targets.length ? 'desktop.nodeList.addToDive.noResults' : 'desktop.nodeList.addToDive.empty')}
    </p>}
  </>;
}
