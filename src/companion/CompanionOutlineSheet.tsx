import { useMemo, useState } from 'react';

import { CompanionContentTabs } from './CompanionContentTabs';
import { CompanionFullscreenSheet } from './CompanionFullscreenSheet';

import type { EditorTextAnchorDecoration } from '@/features/editor/adapters/EditorAdapter';
import { collectDocumentOutlineNavigation, DOCUMENT_OUTLINE_TABS, type DocumentOutlineTab } from '@/features/editor/model/documentOutlineNavigation';
import type { Node } from '@/features/nodes/model/nodeTypes';
import { useTranslation } from '@/shared/localization/LocalizationProvider';
import { AppEmptyState } from '@/shared/ui';

interface OutlineSheetProps {
  content: string;
  nodesById?: Readonly<Record<string, Pick<Node, 'kind'>>> | undefined;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  onOpenChange(open: boolean): void;
  onSelect(item: { from: number; to: number }): void;
  open: boolean;
}

function OutlineContents(props: OutlineSheetProps) {
  const t = useTranslation();
  const pages = useMemo(() => collectDocumentOutlineNavigation({
    content: props.content,
    nodesById: props.nodesById ?? {},
    textAnchorDecorations: props.textAnchorDecorations ?? []
  }), [props.content, props.nodesById, props.textAnchorDecorations]);
  const [tab, setTab] = useState<DocumentOutlineTab>(() => DOCUMENT_OUTLINE_TABS.find(value => pages[value].length) ?? 'outline');
  const options = [
    { value: 'outline' as const, label: t('companion.reading.outline') },
    { value: 'topic' as const, label: t('settings.icons.node.topic') },
    { value: 'item' as const, label: t('settings.icons.node.item') }
  ];
  const emptyTitle = tab === 'outline' ? 'companion.reading.noHeadings.title'
    : tab === 'topic' ? 'companion.reading.outline.noTopics' : 'companion.reading.outline.noItems';
  return <CompanionContentTabs<DocumentOutlineTab> label={t('companion.reading.outline')} onChange={setTab} options={options} value={tab}>
    {pages[tab].length ? pages[tab].map(item => <button
      className="block min-h-11 w-full border-b border-companion-divider py-3 text-left text-sm text-foreground active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      key={item.nodeId ?? `${item.from}-${item.text}`}
      onClick={() => props.onSelect({ from: item.from, to: item.to })}
      style={{ paddingLeft: `${Math.max(0, (item.level ?? 1) - 1) * 14}px` }} type="button"
    ><span className="line-clamp-2">{item.text}</span></button>) : <AppEmptyState
      className="min-h-0 items-start py-5 text-left text-companion-text-secondary"
      description={t(tab === 'outline' ? 'companion.reading.noHeadings.description' : 'companion.reading.outline.positionDescription')}
      title={t(emptyTitle)}
    />}
  </CompanionContentTabs>;
}

export function OutlineSheet(props: OutlineSheetProps) {
  const t = useTranslation();
  return <CompanionFullscreenSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.outline')}>
    {props.open ? <OutlineContents {...props} /> : null}
  </CompanionFullscreenSheet>;
}
