import { Capacitor, registerPlugin } from '@capacitor/core';

import { renderMobileArticleHtml } from '../../../../../lib/core/articleHandoff/mobileArticleHtml';
import { prepareArticleHandoff, resolveArticleHandoffLanguage } from '../../../../../lib/core/articleHandoff/prepareArticleHandoff';
import { loadCompanionNodeDocument } from '../../../../../lib/core/database/companionNodeDocumentRead';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { getCompanionReadingScope } from './companionReadingScope';

type HandoffResult = { status: 'presented' | 'cancelled' | 'unavailable' };
const pluginName = 'FolioleArticleHandoff';
const nativeHandoff = registerPlugin<{
  open(options: { html: string }): Promise<HandoffResult>;
}>(pluginName);

export function canHandoffCompanionArticle() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(pluginName);
}

export async function handoffCompanionArticle(args: {
  nodeId: string;
  flush: () => Promise<void>;
  isCurrent: () => boolean;
}) {
  const scope = getCompanionReadingScope();
  const isCurrent = () => args.isCurrent() && scope === getCompanionReadingScope();
  const article = await prepareArticleHandoff(async () => {
    await args.flush();
    return isCurrent();
  }, async () => {
    const document = await getIosCompanionDatabaseOwner().readInteractiveSnapshot(
      db => isCurrent() ? loadCompanionNodeDocument(db, args.nodeId) : Promise.resolve(null)
    );
    if (!document || document.deleted_at || document.content_status !== 'ready' || !document.content.trim()) return null;
    return { content: document.content, title: document.title };
  });
  if (!isCurrent()) return { status: 'cancelled' } as const;
  if (!article) return { status: 'unavailable' } as const;
  return nativeHandoff.open({
    html: renderMobileArticleHtml(article, resolveArticleHandoffLanguage(article.markdown, navigator.language))
  });
}
