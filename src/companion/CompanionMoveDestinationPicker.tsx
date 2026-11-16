import { Check, ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';
import { VirtualListSurface } from '../shared/ui/VirtualListSurface';

import { buildMoveDestinationTree, visibleMoveDestinations, type MoveDestinationRow } from './companionMoveDestinationTree';

import './companionMoveDestinationPicker.css';

interface PickerProps {
  node: WorkspaceNodeSnapshot;
  nodes: Record<string, WorkspaceNodeSnapshot>;
  disabled: boolean;
  value: string;
  onChange(value: string): void;
}

export function CompanionMoveDestinationPicker(props: PickerProps) {
  const { locale, t } = useLocalization();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => buildMoveDestinationTree(props.node, props.nodes,
    node => resolveNodeDisplayTitle(locale, node.id, node.title) || t('desktop.search.context.untitled')),
  [props.node, props.nodes, locale, t]);
  const rows = useMemo(() => visibleMoveDestinations(tree, expanded, query), [tree, expanded, query]);
  const searching = Boolean(query.trim());
  const rootLabel = t('companion.workspace.root');
  const showRoot = props.node.kind === 'folder' && (!searching || rootLabel.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = tree.rows.get(props.value);
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <section className="companion-move-picker" aria-label={t('desktop.palette.move.dialog')}>
    <input type="search" aria-label={t('desktop.palette.move.empty')} placeholder={t('desktop.palette.move.empty')}
      disabled={props.disabled} value={query} onChange={event => setQuery(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
    <div className="companion-move-list app-scrollbar" ref={scrollRef} role="group"
      aria-label={searching ? t('desktop.palette.node.results') : t('desktop.palette.move.dialog')}>
      {showRoot &&
        <button type="button" className="companion-move-root" disabled={props.disabled}
          aria-pressed={props.value === ''} onClick={() => props.onChange('')}>
          <Folder aria-hidden="true" size={18} /><span>{rootLabel}</span>{props.value === '' && <Check aria-hidden="true" size={18} />}
        </button>}
      <VirtualListSurface items={rows} getItemKey={row => row.id} estimateSize={() => searching ? 76 : 52}
        scrollElementRef={scrollRef} autoScroll={false} accountForOffset measureItems
        renderItem={row => <DestinationRow row={row} disabled={props.disabled} searching={searching}
          selected={props.value === row.id} expanded={expanded.has(row.id)} onToggle={() => toggle(row.id)}
          onSelect={() => props.onChange(row.id)} />} />
      {rows.length === 0 && !showRoot && <p role="status">{t('desktop.palette.move.noResults')}</p>}
    </div>
    <p className="companion-move-location">{selected?.path ?? (props.value === '' && props.node.kind === 'folder' ? rootLabel : '')}</p>
  </section>;
}

function DestinationRow(props: {
  row: MoveDestinationRow; disabled: boolean; searching: boolean; selected: boolean; expanded: boolean;
  onToggle(): void; onSelect(): void;
}) {
  const { row } = props;
  const Icon = row.kind === 'folder' ? Folder : FileText;
  const Chevron = props.expanded ? ChevronDown : ChevronRight;
  return <div className="companion-move-row" data-selected={props.selected}
    style={{ paddingInlineStart: props.searching ? 0 : Math.min(row.depth, 5) * 14 }}>
    {!props.searching && (row.hasChildren ? <button type="button" className="companion-move-toggle"
      aria-label={row.title} aria-expanded={props.expanded} disabled={props.disabled} onClick={props.onToggle}>
      <Chevron aria-hidden="true" size={18} /></button> : <span className="companion-move-toggle" />)}
    <button type="button" className="companion-move-choice" aria-label={row.path} aria-pressed={props.selected}
      disabled={props.disabled || !row.selectable} onClick={props.onSelect}>
      <Icon aria-hidden="true" size={18} />
      <span><span>{row.title}</span>{props.searching && <small>{row.path}</small>}</span>
      {props.selected && <Check aria-hidden="true" size={18} />}
    </button>
  </div>;
}
