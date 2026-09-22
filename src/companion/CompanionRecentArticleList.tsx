import { BookOpen } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { useLocalization, useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { AppEmptyState } from '../shared/ui';

import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';
import { CompanionListViewport } from './CompanionListViewport';
import { CompanionTopicListMenu } from './CompanionTopicListMenu';

const RECENT_ARTICLE_TEXT_LINE_BUDGET = 4;

export function resolveRecentArticlePreviewLineClamp(titleLineCount: number, hasPreview: boolean) {
  if (!hasPreview) return 0;
  const titleLines = Math.min(2, Math.max(1, Math.ceil(titleLineCount)));
  return Math.max(0, RECENT_ARTICLE_TEXT_LINE_BUDGET - titleLines);
}

function getPreviewClampClass(lineClamp: number) {
  if (lineClamp === 1) return 'line-clamp-1';
  if (lineClamp === 2) return 'line-clamp-2';
  return 'line-clamp-3';
}

function measureElementLineCount(element: HTMLElement) {
  const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 1;
  return Math.max(1, Math.round(element.getBoundingClientRect().height / lineHeight));
}

function useMeasuredTitleLineCount(title: string) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [lineCount, setLineCount] = useState(1);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setLineCount((current) => {
      const next = measureElementLineCount(element);
      return current === next ? current : next;
    });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [title]);

  return { lineCount, ref };
}

function renderBodyStatus(status: CompanionRecentArticle['bodyStatus'], t: ReturnType<typeof useTranslation>) {
  if (status === 'failed') {
    return t('desktop.nodeBrowse.bodyUnavailable');
  }
  if (status === 'empty') {
    return t('desktop.nodeBrowse.emptyTopic');
  }
  return null;
}

function RecentArticlePreview(props: { lineClamp: number; preview: string | null }) {
  if (!props.preview || props.lineClamp <= 0) {
    return null;
  }
  return (
    <p className={`${getPreviewClampClass(props.lineClamp)} companion-topic-preview break-words [overflow-wrap:anywhere]`}>
      {props.preview}
    </p>
  );
}

export function formatCompanionTopicDate(value: string, locale: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

export function RecentArticleRow(props: {
  article: CompanionRecentArticle;
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  testId?: string;
}) {
  const { locale, t } = useLocalization();
  const { lineCount, ref: titleRef } = useMeasuredTitleLineCount(props.article.title);
  const previewLineClamp = resolveRecentArticlePreviewLineClamp(lineCount, Boolean(props.article.preview));
  const meta = [props.article.folderLabel, formatCompanionTopicDate(props.article.updatedAt, locale)].filter(Boolean).join(' · ');
  const open = () => props.onSelectArticle(props.article.nodeId);
  const status = renderBodyStatus(props.article.bodyStatus, t);
  return (
    <div className="companion-topic-row">
      <button aria-label={t('desktop.nodeBrowse.openTopic', { title: props.article.title })} className="companion-topic-open" data-testid={props.testId} onClick={open} type="button">
        <h2 ref={titleRef} className="companion-topic-title line-clamp-2 break-words [overflow-wrap:anywhere]">{props.article.title}</h2>
        <RecentArticlePreview lineClamp={previewLineClamp} preview={props.article.preview} />
        {status ? <p className="companion-topic-preview">{status}</p> : null}
        <p className="companion-topic-meta truncate">{meta}</p>
      </button>
      <CompanionTopicListMenu metadata={meta} onOpen={open} title={props.article.title} />
    </div>
  );
}

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  const t = useTranslation();
  if (props.recentArticles.length === 0) {
    return (
      <section className="border-t border-companion-divider py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.recent.empty.description')}
          icon={<CompanionEmptyStateIcon Icon={BookOpen} />}
          title={t('companion.recent.empty.title')}
        />
      </section>
    );
  }

  return (
    <section>
      <CompanionListViewport viewKey="recent" items={props.recentArticles}
        getItemKey={(article) => article.nodeId} estimateSize={() => 124}
        renderItem={(article) => <RecentArticleRow article={article}
          currentArticleId={props.currentArticleId} onSelectArticle={props.onSelectArticle} />} />
    </section>
  );
}
