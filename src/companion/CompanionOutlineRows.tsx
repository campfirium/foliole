import { ArrowUpRight, ChevronDown, ChevronRight, MapPin } from 'lucide-react';

import type { DocumentOutlineSection, DocumentPositionEntry } from '../features/editor/model/documentOutlineNavigation';
import { NodeTreeRowIcon } from '../features/nodes/components/NodeTreeRowIcon';
import { useTranslation } from '../shared/localization/LocalizationProvider';

const outlineButtonClassName = 'min-h-11 min-w-0 flex-1 py-3 text-left text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50';

export function OutlineSectionHeading(props: {
  section: DocumentOutlineSection;
  expanded: boolean;
  disabled: boolean;
  onSelect(): void;
  onToggle(): void;
}) {
  const t = useTranslation();
  const section = props.section;
  if (section.kind === 'body' || section.kind === 'unplaced') return null;
  const description = section.kind === 'preface' ? t('companion.reading.outline.beforeHeading') : section.text;
  const Chevron = props.expanded ? ChevronDown : ChevronRight;
  return <div className="flex items-center border-b border-companion-divider" style={{ paddingLeft: Math.max(0, section.level - 1) * 12 }}>
    {section.selection ? <button className={outlineButtonClassName} disabled={props.disabled} onClick={props.onSelect} type="button">
      {section.text}
    </button> : <span aria-label={description} className="min-w-0 flex-1 py-3 text-sm text-companion-text-secondary">{section.text}</span>}
    {section.entryIds.length ? <button aria-expanded={props.expanded}
      aria-label={t('companion.reading.outline.toggle', { title: description, count: section.entryIds.length })}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 px-2 text-sm text-companion-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={props.onToggle} type="button">
      <span>{section.entryIds.length}</span><Chevron aria-hidden="true" className="h-4 w-4" />
    </button> : null}
  </div>;
}

export function OutlineEntryRow(props: {
  entry: DocumentPositionEntry;
  depth: number;
  disabled: boolean;
  onSelect(): void;
}) {
  const t = useTranslation();
  const entry = props.entry;
  const PositionIcon = entry.action === 'position' ? MapPin : ArrowUpRight;
  return <div className="flex items-center border-b border-companion-divider" style={{ paddingLeft: Math.min(props.depth, 6) * 12 }}>
    <button className={`${outlineButtonClassName} flex items-start gap-2`} disabled={props.disabled || entry.action === 'container'}
      title={t(entry.action === 'position' ? 'companion.reading.outline.goToPassage' : 'companion.reading.outline.openCard')}
      onClick={props.onSelect} type="button">
      <span aria-hidden="true" className="mt-0.5 shrink-0"><NodeTreeRowIcon baseOnly kind={entry.kind === 'item' ? 'review' : entry.kind === 'folder' ? 'folder-closed' : 'reading'} state="pending" /></span>
      <span className="min-w-0 flex-1 break-words">{entry.text || t('desktop.search.context.untitled')}</span>
      <PositionIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-companion-text-secondary" />
    </button>
  </div>;
}
