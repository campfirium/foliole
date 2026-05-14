import { definedProps } from '../shared/lib/definedProps';
import { AppEmptyState, AppErrorState, AppLoadingState } from '../shared/ui';

type ArticleBodyStatus = 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';

export function CompanionArticleBodyStatusFallback(props: {
  bodyStatus: ArticleBodyStatus;
  title?: string;
}) {
  if (props.bodyStatus === 'missing') {
    return <ArticleBodyMessage detail="This device has the topic list, but this body has not reached the device yet." state="empty" title="Waiting for topic body." {...definedProps({ heading: props.title })} />;
  }
  if (props.bodyStatus === 'fetching') {
    return <ArticleBodyMessage detail="Keep this device connected to desktop." state="loading" title="Loading topic body." {...definedProps({ heading: props.title })} />;
  }
  if (props.bodyStatus === 'failed') {
    return <ArticleBodyMessage detail="Reconnect this device to desktop to retry." state="error" title="Topic body could not be loaded." {...definedProps({ heading: props.title })} />;
  }
  if (props.bodyStatus === 'ready') {
    return null;
  }
  return <ArticleBodyMessage state="empty" title="This topic is empty." {...definedProps({ heading: props.title })} />;
}

function ArticleBodyMessage(props: { detail?: string; heading?: string; state: 'empty' | 'error' | 'loading'; title: string }) {
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
        description={props.detail ?? 'There is no body text to show.'}
        title={props.title}
      />
    </section>
  );
}
