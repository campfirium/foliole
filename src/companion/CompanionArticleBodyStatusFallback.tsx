import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState, AppErrorState, AppLoadingState } from '../shared/ui';

type ArticleBodyStatus = 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';

export function CompanionArticleBodyStatusFallback(props: {
  bodyStatus: ArticleBodyStatus;
  title?: string;
}) {
  const t = useTranslation();
  if (props.bodyStatus === 'missing') {
    return <ArticleBodyMessage detail={t('companion.topicBody.waiting.detail')} state="empty" title={t('companion.topicBody.waiting.title')} {...definedProps({ heading: props.title })} />;
  }
  if (props.bodyStatus === 'fetching') {
    return <ArticleBodyMessage detail={t('companion.topicBody.loading.detail')} state="loading" title={t('companion.topicBody.loading.title')} {...definedProps({ heading: props.title })} />;
  }
  if (props.bodyStatus === 'failed') {
    return <ArticleBodyMessage detail={t('companion.topicBody.error.detail')} state="error" title={t('companion.topicBody.error.title')} {...definedProps({ heading: props.title })} />;
  }
  if (props.bodyStatus === 'ready') {
    return null;
  }
  return <ArticleBodyMessage state="empty" title={t('companion.topicBody.empty.title')} {...definedProps({ heading: props.title })} />;
}

function ArticleBodyMessage(props: { detail?: string; heading?: string; state: 'empty' | 'error' | 'loading'; title: string }) {
  const t = useTranslation();
  const StateComponent = props.state === 'loading'
    ? AppLoadingState
    : props.state === 'error'
      ? AppErrorState
      : AppEmptyState;
  return (
    <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
      {props.heading ? <h1 className="mb-4 text-xl font-semibold leading-7 text-foreground">{props.heading}</h1> : null}
      <StateComponent
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description={props.detail ?? t('companion.topicBody.empty.detail')}
        title={props.title}
      />
    </section>
  );
}
