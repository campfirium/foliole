import leafSvg from '../../../../assets/brand/foliole-leaf-tight.svg?raw';
import { resolveArticleHandoffLanguage } from '../../../../lib/core/articleHandoff/prepareArticleHandoff';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function sendTopicToEdge(article: {
  title: string;
  markdown: string;
  contentsLabel: string;
}) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return false;
  const language = resolveArticleHandoffLanguage(article.markdown, navigator.language);
  await invoke(NATIVE_COMMANDS.sendArticleToEdge, { ...article, leafSvg, language });
  return true;
}
