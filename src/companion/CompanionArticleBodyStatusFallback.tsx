type ArticleBodyStatus = 'empty' | 'failed' | 'fetching' | 'missing';

export function CompanionArticleBodyStatusFallback(props: {
  bodyStatus: ArticleBodyStatus;
}) {
  if (props.bodyStatus === 'missing') {
    return <ArticleBodyMessage detail="Keep this device connected to desktop and try again shortly." title="Topic content is still syncing." />;
  }
  if (props.bodyStatus === 'fetching') {
    return <ArticleBodyMessage detail="Keep this device connected to desktop." title="Topic content is downloading." />;
  }
  if (props.bodyStatus === 'failed') {
    return <ArticleBodyMessage detail="Reconnect this device to desktop to retry." title="Topic content could not be synced." />;
  }
  return <ArticleBodyMessage title="This topic is empty." />;
}

function ArticleBodyMessage(props: { detail?: string; title: string }) {
  return (
    <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
      <p>{props.title}</p>
      {props.detail ? <p className="mt-3">{props.detail}</p> : null}
    </section>
  );
}
