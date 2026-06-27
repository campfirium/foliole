import { BookOpen } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { AppEmptyState } from '../shared/ui';

import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';

function formatRecentDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value));
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

function RecentArticlePreview(props: { preview: string | null }) {
  if (!props.preview) {
    return null;
  }
  return <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-companion-text-secondary">{props.preview}</p>;
}

function RecentArticleRow(props: {
  article: CompanionRecentArticle;
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
}) {
  const t = useTranslation();
  const bodyStatusLabel = renderBodyStatus(props.article.bodyStatus, t);
  const isCurrent = props.article.nodeId === props.currentArticleId;
  return (
    <button
      aria-label={t('desktop.nodeBrowse.openTopic', { title: props.article.title })}
      className={`block w-full border-b border-companion-divider px-1 py-3.5 text-left transition-colors ${
        isCurrent ? 'bg-companion-subtle' : 'bg-transparent hover:bg-companion-subtle/60 active:bg-companion-subtle/80'
      }`}
      onClick={() => props.onSelectArticle(props.article.nodeId)}
      type="button"
    >
      <div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold leading-4 text-companion-text-secondary">
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-companion-accent" />
        <time dateTime={props.article.updatedAt}>{formatRecentDate(props.article.updatedAt)}</time>
      </div>
      <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-foreground">{props.article.title}</h2>
      {bodyStatusLabel ? (
        <p className="mt-1 text-xs font-medium leading-5 text-companion-text-secondary">{bodyStatusLabel}</p>
      ) : null}
      <RecentArticlePreview preview={props.article.preview} />
    </button>
  );
}

function ContinueReadingEntry(props: { article: CompanionRecentArticle; onSelectArticle(nodeId: string): void }) {
  const t = useTranslation();
  const bodyStatusLabel = renderBodyStatus(props.article.bodyStatus, t);
  return (
    <button
      aria-label={t('desktop.nodeBrowse.openTopic', { title: props.article.title })}
      className="mb-3 block w-full border-l-[3px] border-companion-accent bg-companion-accent-soft px-3.5 py-3 text-left transition-colors active:bg-companion-accent-soft"
      onClick={() => props.onSelectArticle(props.article.nodeId)}
      type="button"
    >
      <div className="flex items-center justify-between gap-3 text-[11.5px] font-semibold uppercase leading-4 text-companion-accent">
        <span>{t('desktop.reviewActions.continueReading')}</span>
        <time className="font-semibold text-companion-text-secondary" dateTime={props.article.updatedAt}>
          {formatRecentDate(props.article.updatedAt)}
        </time>
      </div>
      <h2 className="mt-1.5 line-clamp-2 text-[15.5px] font-semibold leading-5 text-foreground">{props.article.title}</h2>
      {bodyStatusLabel ? (
        <p className="mt-1 text-xs font-medium leading-5 text-companion-text-secondary">{bodyStatusLabel}</p>
      ) : null}
      <RecentArticlePreview preview={props.article.preview} />
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
      <section className="border-t border-companion-divider px-1 py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.recent.empty.description')}
          icon={<CompanionEmptyStateIcon Icon={BookOpen} />}
          title={t('companion.recent.empty.title')}
        />
      </section>
    );
  }

  const firstArticle = props.recentArticles[0];
  const remainingArticles = props.recentArticles.slice(1);
  if (!firstArticle) {
    return null;
  }

  return (
    <section className="border-t border-companion-divider pt-3">
      <ContinueReadingEntry article={firstArticle} onSelectArticle={props.onSelectArticle} />
      {remainingArticles.map((article) => (
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
