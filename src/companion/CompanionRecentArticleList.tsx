import { BookOpen } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { AppEmptyState } from '../shared/ui';

import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';

const RECENT_ARTICLE_TEXT_LINE_BUDGET = 4;

export function resolveRecentArticlePreviewLineClamp(titleLineCount: number, hasPreview: boolean) {
  if (!hasPreview) return 0;
  const titleLines = Math.min(RECENT_ARTICLE_TEXT_LINE_BUDGET, Math.max(1, Math.ceil(titleLineCount)));
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
  return Math.max(1, Math.round(element.scrollHeight / lineHeight));
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
    <p className={`mt-1 ${getPreviewClampClass(props.lineClamp)} break-words text-ui-base leading-5 text-companion-text-secondary [overflow-wrap:anywhere]`}>
      {props.preview}
    </p>
  );
}

function buildRecentArticleMeta(article: CompanionRecentArticle, t: ReturnType<typeof useTranslation>) {
  const bodyStatusLabel = renderBodyStatus(article.bodyStatus, t);
  return [
    article.folderLabel,
    article.authorLabel,
    bodyStatusLabel
  ].filter((item): item is string => Boolean(item));
}

function RecentArticleMetaFooter(props: { items: string[] }) {
  return (
    <p className="mt-2 line-clamp-1 min-h-4 break-words text-xs font-medium leading-4 text-companion-text-secondary [overflow-wrap:anywhere]">
      {props.items.join(' · ')}
    </p>
  );
}

function RecentArticleRow(props: {
  article: CompanionRecentArticle;
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
}) {
  const t = useTranslation();
  const metaItems = buildRecentArticleMeta(props.article, t);
  const isCurrent = props.article.nodeId === props.currentArticleId;
  const { lineCount: titleLineCount, ref: titleRef } = useMeasuredTitleLineCount(props.article.title);
  const previewLineClamp = resolveRecentArticlePreviewLineClamp(titleLineCount, Boolean(props.article.preview));
  return (
    <button
      aria-label={t('desktop.nodeBrowse.openTopic', { title: props.article.title })}
      className={`block w-full border-b border-companion-divider py-3.5 text-left transition-colors ${
        isCurrent ? 'bg-companion-subtle' : 'bg-transparent hover:bg-companion-subtle/60 active:bg-companion-subtle/80'
      }`}
      onClick={() => props.onSelectArticle(props.article.nodeId)}
      type="button"
    >
      <h2 ref={titleRef} className="line-clamp-4 break-words text-ui-lg font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">
        {props.article.title}
      </h2>
      <RecentArticlePreview lineClamp={previewLineClamp} preview={props.article.preview} />
      <RecentArticleMetaFooter items={metaItems} />
    </button>
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
    <section className="border-t border-companion-divider pt-3">
      {props.recentArticles.map((article) => (
        <RecentArticleRow
          article={article}
          currentArticleId={props.currentArticleId}
          key={article.nodeId}
          onSelectArticle={props.onSelectArticle}
        />
      ))}
    </section>
  );
}
