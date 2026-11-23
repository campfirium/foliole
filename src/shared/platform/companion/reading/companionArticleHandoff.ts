import { Capacitor, registerPlugin } from '@capacitor/core';

import { articleMarkdownFileName, renderArticleMarkdownExport } from '../../../../../lib/core/articleHandoff/articleMarkdownExport';
import { renderMobileArticleHtml } from '../../../../../lib/core/articleHandoff/mobileArticleHtml';
import { prepareArticleHandoff, resolveArticleHandoffLanguage } from '../../../../../lib/core/articleHandoff/prepareArticleHandoff';
import { loadCompanionNodeDocument } from '../../../../../lib/core/database/companionNodeDocumentRead';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { getCompanionReadingScope } from './companionReadingScope';

type HandoffResult = { status: 'presented' | 'cancelled' | 'unavailable' };
const pluginName = 'FolioleArticleHandoff';
const nativeHandoff = registerPlugin<{
  open(options: { html: string }): Promise<HandoffResult>;
  shareMarkdown(options: { text: string; fileName: string }): Promise<HandoffResult>;
}>(pluginName);

export type CompanionArticleHandoffMode = 'open' | 'markdown';

export function canHandoffCompanionArticle() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(pluginName);
}

export async function handoffCompanionArticle(args: {
  nodeId: string;
  mode?: CompanionArticleHandoffMode;
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
  if (args.mode === 'markdown') {
    return nativeHandoff.shareMarkdown({
      text: renderArticleMarkdownExport(article), fileName: articleMarkdownFileName(article.title)
    });
  }
  return nativeHandoff.open({
    html: renderMobileArticleHtml(article, resolveArticleHandoffLanguage(article.markdown, navigator.language))
  });
}
