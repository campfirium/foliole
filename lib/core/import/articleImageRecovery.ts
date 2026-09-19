import { parseImageSources, type ImageSources } from '../database/imageSources.js';

export interface RecoverableImageArticle {
  content: string;
  imageSources: ImageSources;
}

export interface ArticleImageRecoveryPort {
  read(): Promise<RecoverableImageArticle | null>;
  exists(storageKey: string): Promise<boolean>;
  importImage(sourceUrl: string): Promise<string | null>;
  commit(before: RecoverableImageArticle, after: RecoverableImageArticle): Promise<boolean>;
}

export async function recoverArticleImage(input: {
  port: ArticleImageRecoveryPort;
  storageKey: string;
  replaceSource: (content: string, oldKey: string, newKey: string) => string;
}) {
  const { port, storageKey } = input;
  const before = await port.read();
  if (!before) return null;
  if (await port.exists(storageKey)) return { content: before.content, storageKey };
  const sourceUrl = parseImageSources(before.imageSources)[storageKey];
  if (!sourceUrl) return null;
  const importedKey = await port.importImage(sourceUrl);
  if (!importedKey) return null;
  if (importedKey === storageKey) return { content: before.content, storageKey };
  const content = input.replaceSource(before.content, storageKey, importedKey);
  if (content === before.content) return null;
  const imageSources = { ...before.imageSources, [importedKey]: sourceUrl };
  delete imageSources[storageKey];
  if (!await port.commit(before, { content, imageSources })) return null;
  return { content, storageKey: importedKey };
}
