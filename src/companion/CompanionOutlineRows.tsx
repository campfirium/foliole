import { ArrowUpRight, ChevronDown, ChevronRight, MapPin } from 'lucide-react';

import type { DocumentOutlineSection, DocumentPositionEntry } from '../features/editor/model/documentOutlineNavigation';
import { NodeTreeRowIcon } from '../features/nodes/components/NodeTreeRowIcon';
import { useTranslation } from '../shared/localization/LocalizationProvider';

const outlineButtonClassName = 'min-h-11 min-w-0 flex-1 py-3 text-left text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50';

function OutlineExpansionButton(props: { count: number; title: string; expanded: boolean; disabled: boolean; onToggle(): void }) {
  const t = useTranslation();
  const Chevron = props.expanded ? ChevronDown : ChevronRight;
  return <button aria-expanded={props.expanded} disabled={props.disabled}
    aria-label={t('companion.reading.outline.toggle', { title: props.title, count: props.count })}
    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 px-2 text-sm text-companion-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
    onClick={props.onToggle} type="button">
    <span>{props.count}</span><Chevron aria-hidden="true" className="h-4 w-4" />
  </button>;
}

export function OutlineSectionHeading(props: {
  section: DocumentOutlineSection;
  count: number;
  expanded: boolean;
  disabled: boolean;
  onSelect(): void;
  onToggle(): void;
}) {
  const t = useTranslation();
  const section = props.section;
  if (section.kind === 'body' || section.kind === 'unplaced') return null;
  const description = section.kind === 'preface' ? t('companion.reading.outline.beforeHeading') : section.text;
  return <div className="flex items-center border-b border-companion-divider" style={{ paddingLeft: Math.max(0, section.level - 1) * 12 }}>
    {section.selection ? <button className={outlineButtonClassName} disabled={props.disabled} onClick={props.onSelect} type="button">
      {section.text}
    </button> : <span aria-label={description} className="min-w-0 flex-1 py-3 text-sm text-companion-text-secondary">{section.text}</span>}
    {section.entryIds.length ? <OutlineExpansionButton count={props.count} title={description} expanded={props.expanded}
      disabled={props.disabled} onToggle={props.onToggle} /> : null}
  </div>;
}

export function OutlineEntryRow(props: {
  entry: DocumentPositionEntry;
  depth: number;
  count: number;
  expanded: boolean;
  disabled: boolean;
  onSelect(): void;
  onToggle(): void;
}) {
  const t = useTranslation();
  const entry = props.entry;
  const label = entry.text || t('desktop.search.context.untitled');
  const PositionIcon = entry.action === 'position' ? MapPin : ArrowUpRight;
  const contents = <>
    <span aria-hidden="true" className="mt-0.5 shrink-0"><NodeTreeRowIcon baseOnly
      kind={entry.kind === 'item' ? 'review' : entry.kind === 'folder' ? props.expanded ? 'folder-open' : 'folder-closed' : 'reading'} state="pending" /></span>
    <span className="min-w-0 flex-1 break-words">{label}</span>
  </>;
  return <div className="flex items-center border-b border-companion-divider" style={{ paddingLeft: Math.min(props.depth, 6) * 12 }}>
    {entry.action === 'container' ? <span className={`${outlineButtonClassName} flex items-start gap-2`}>{contents}</span>
      : <button className={`${outlineButtonClassName} flex items-start gap-2`} disabled={props.disabled}
        title={t(entry.action === 'position' ? 'companion.reading.outline.goToPassage' : 'companion.reading.outline.openCard')}
        onClick={props.onSelect} type="button">
        {contents}<PositionIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-companion-text-secondary" />
      </button>}
    {entry.childIds.length ? <OutlineExpansionButton count={props.count} title={label} expanded={props.expanded}
      disabled={props.disabled} onToggle={props.onToggle} /> : null}
  </div>;
}
