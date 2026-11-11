import leafSvg from '../../../../assets/brand/foliole-leaf-tight.svg?raw';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function sendTopicToEdge(article: {
  title: string;
  markdown: string;
  contentsLabel: string;
}) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return false;
  const sample = article.markdown.slice(0, 8000);
  const hanCount = (sample.match(/\p{Script=Han}/gu) ?? []).length;
  const latinCount = (sample.match(/\p{Script=Latin}/gu) ?? []).length;
  const language = hanCount > latinCount / 3 ? 'zh-CN' : (navigator.language.startsWith('zh') ? 'en' : navigator.language);
  await invoke(NATIVE_COMMANDS.sendArticleToEdge, { ...article, leafSvg, language });
  return true;
}
