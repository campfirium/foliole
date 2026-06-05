import { Highlighter, Info, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionBottomSheet } from './CompanionBottomSheet';

import { extractDocumentOutline } from '@/features/editor/model/documentOutline';
import { AppEmptyState } from '@/shared/ui';

export function ReadingBottomSheet(props: {
  children: ReactNode;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  return (
    <CompanionBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={props.title}>
      {props.children}
    </CompanionBottomSheet>
  );
}

function ReadingActionRow(props: {
  icon: ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 border-b border-companion-divider py-4 text-left text-sm font-medium text-foreground transition-colors active:bg-companion-subtle/80"
      onClick={props.onClick}
      type="button"
    >
      <span className="text-companion-text-secondary">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}

export function ReadingActionsSheet(props: {
  onFindInDocument(): void;
  onOpenChange(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info'): void;
  onRestoreFromTrash?: () => void;
  open: boolean;
}) {
  const t = useTranslation();
  const openReadingSheet = (sheet: 'font' | 'highlight' | 'info') => {
    props.onOpenChange(false);
    props.onOpenReadingSheet(sheet);
  };
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.actions')}>
      <div className="border-t border-companion-divider">
        <ReadingActionRow
          icon={<Search aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.find')}
          onClick={props.onFindInDocument}
        />
        <ReadingActionRow
          icon={<SlidersHorizontal aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.font')}
          onClick={() => openReadingSheet('font')}
        />
        <ReadingActionRow
          icon={<Highlighter aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.highlight')}
          onClick={() => openReadingSheet('highlight')}
        />
        <ReadingActionRow
          icon={<Info aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.info')}
          onClick={() => openReadingSheet('info')}
        />
        {props.onRestoreFromTrash ? (
          <ReadingActionRow
            icon={<RotateCcw aria-hidden="true" className="h-5 w-5" />}
            label={t('companion.reading.restoreFromTrash')}
            onClick={props.onRestoreFromTrash}
          />
        ) : null}
      </div>
    </ReadingBottomSheet>
  );
}

export function OutlineSheet(props: {
  content: string;
  onOpenChange(open: boolean): void;
  onSelect(item: { from: number; to: number }): void;
  open: boolean;
}) {
  const t = useTranslation();
  const outlineItems = extractDocumentOutline(props.content);
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.outline')}>
      <div className="border-t border-companion-divider">
        {outlineItems.length > 0 ? outlineItems.map((item) => (
          <button
            className="block w-full border-b border-companion-divider py-3 text-left text-sm text-foreground"
            key={`${item.from}-${item.text}`}
            onClick={() => props.onSelect(item)}
            style={{ paddingLeft: `${Math.max(0, item.level - 1) * 14}px` }}
            type="button"
          >
            {item.text}
          </button>
        )) : (
          <AppEmptyState
            className="min-h-0 items-start py-5 text-left text-companion-text-secondary"
            description={t('companion.reading.noHeadings.description')}
            title={t('companion.reading.noHeadings.title')}
          />
        )}
      </div>
    </ReadingBottomSheet>
  );
}

export function ReadingFontSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  const t = useTranslation();
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.font')}>
      <div className="border-t border-companion-divider py-5">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.reading.fontComing.description')}
          title={t('companion.reading.fontComing.title')}
        />
      </div>
    </ReadingBottomSheet>
  );
}

export function ReadingHighlightSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  const t = useTranslation();
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.highlight')}>
      <div className="border-t border-companion-divider py-5">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.reading.highlightComing.description')}
          title={t('companion.reading.highlightComing.title')}
        />
      </div>
    </ReadingBottomSheet>
  );
}

export function ReadingInfoSheet(props: {
  hasPdf: boolean;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  const t = useTranslation();
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.info')}>
      <dl className="border-t border-companion-divider text-sm">
        <div className="flex items-center justify-between border-b border-companion-divider py-3">
          <dt className="text-companion-text-secondary">{t('companion.reading.info.topic')}</dt>
          <dd className="min-w-0 max-w-[70%] truncate text-right text-foreground">{props.title}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-companion-divider py-3">
          <dt className="text-companion-text-secondary">{t('companion.reading.info.source')}</dt>
          <dd className="text-foreground">{props.hasPdf ? t('companion.reading.info.pdfAndText') : t('companion.reading.info.text')}</dd>
        </div>
      </dl>
    </ReadingBottomSheet>
  );
}
