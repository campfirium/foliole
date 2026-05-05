type ArticleBodyStatus = 'empty' | 'failed' | 'fetching' | 'missing';

export function CompanionArticleBodyStatusFallback(props: {
  bodyStatus: ArticleBodyStatus;
  title?: string;
}) {
  if (props.bodyStatus === 'missing') {
    return <ArticleBodyMessage detail="Keep this device connected to desktop and try again shortly." heading={props.title} title="Topic content is still syncing." />;
  }
  if (props.bodyStatus === 'fetching') {
    return <ArticleBodyMessage detail="Keep this device connected to desktop." heading={props.title} title="Topic content is downloading." />;
  }
  if (props.bodyStatus === 'failed') {
    return <ArticleBodyMessage detail="Reconnect this device to desktop to retry." heading={props.title} title="Topic content could not be synced." />;
  }
  return <ArticleBodyMessage heading={props.title} title="This topic is empty." />;
}

function ArticleBodyMessage(props: { detail?: string; heading?: string; title: string }) {
  return (
    <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
      {props.heading ? <h1 className="mb-4 text-xl font-semibold leading-7 text-foreground">{props.heading}</h1> : null}
      <p>{props.title}</p>
      {props.detail ? <p className="mt-3">{props.detail}</p> : null}
    </section>
  );
}
