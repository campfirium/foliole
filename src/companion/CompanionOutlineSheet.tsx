import { useMemo, useRef, useState, type MutableRefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { EditorTextAnchorDecoration } from '../features/editor/adapters/EditorAdapter';
import { collectDocumentOutlineNavigation, countDirectOutlineObjects } from '../features/editor/model/documentOutlineNavigation';
import { collectVisibleOutlineRows } from '../features/editor/model/documentOutlineVisibleRows';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState } from '../shared/ui';
import { VirtualListSurface } from '../shared/ui/VirtualListSurface';

import { CompanionFullscreenSheet } from './CompanionFullscreenSheet';
import { OutlineEntryRow, OutlineSectionHeading } from './CompanionOutlineRows';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionOutlineCardNavigation } from './useCompanionOutlineCardNavigation';
import { useCompanionOutlineExpansion } from './useCompanionOutlineExpansion';

interface OutlineSheetProps {
  activity?: CompanionReadingActivity | undefined;
  content: string;
  nodeId: string;
  snapshot?: WorkspaceSnapshot | null | undefined;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  onOpenChange(open: boolean): void;
  onOpenNode?: ((nodeId: string) => void) | undefined;
  onSelect(item: { from: number; to: number }): void;
  open: boolean;
}

function OutlineContents(props: OutlineSheetProps & { scrollElementRef: MutableRefObject<HTMLDivElement | null> }) {
  const t = useTranslation();
  const model = useMemo(() => collectDocumentOutlineNavigation({
    content: props.content, activeNodeId: props.nodeId, snapshot: props.snapshot ?? null,
    textAnchorDecorations: props.textAnchorDecorations ?? []
  }), [props.content, props.nodeId, props.snapshot, props.textAnchorDecorations]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const navigation = useCompanionOutlineCardNavigation({ ...props, entries: model.entries });
  const { expanded: expandedEntries, toggle: toggleEntry, markManual } = useCompanionOutlineExpansion(model, props.scrollElementRef);
  const rows = useMemo(() => collectVisibleOutlineRows(model, collapsed, expandedEntries), [model, collapsed, expandedEntries]);
  function toggle(id: string) {
    markManual();
    setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function select(id: string) {
    const entry = model.entries[id];
    if (entry?.action === 'position' && entry.selection) props.onSelect(entry.selection);
    else if (await navigation.open(id)) props.onOpenChange(false);
  }
  return <>
    {navigation.error ? <p className="py-3 text-sm text-error" role="alert">{t('companion.reading.outline.openError')}</p> : null}
    {rows.length ? <VirtualListSurface items={rows} getItemKey={row => row.key} estimateSize={() => 56}
      scrollElementRef={props.scrollElementRef} accountForOffset measureItems overscan={4} renderItem={row => row.entry
        ? <OutlineEntryRow entry={row.entry} depth={row.depth}
          count={countDirectOutlineObjects(row.entry.childIds, model.entries)} expanded={expandedEntries.has(row.entry.id)}
          onToggle={() => toggleEntry(row.entry!.id)}
          disabled={navigation.busy || (row.entry.action === 'card' && (!props.onOpenNode || props.activity?.editing === true))} onSelect={() => void select(row.entry!.id)} />
        : <OutlineSectionHeading section={row.section} count={countDirectOutlineObjects(row.section.entryIds, model.entries)} expanded={!collapsed.has(row.section.id)} disabled={navigation.busy}
          onSelect={() => { if (row.section.selection) props.onSelect(row.section.selection); }} onToggle={() => toggle(row.section.id)} />
      } /> : <AppEmptyState className="items-start py-5 text-left text-companion-text-secondary"
      title={t('companion.reading.outline.empty')} description={t('companion.reading.outline.emptyDescription')} />}
  </>;
}

export function OutlineSheet(props: OutlineSheetProps) {
  const t = useTranslation();
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  return <CompanionFullscreenSheet scrollElementRef={scrollElementRef} onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.outline')}>
    {props.open ? <OutlineContents key={props.nodeId} {...props} scrollElementRef={scrollElementRef} /> : null}
  </CompanionFullscreenSheet>;
}
