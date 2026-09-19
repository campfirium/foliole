import { expect, it, vi } from 'vitest';

import { recoverArticleImage, type RecoverableImageArticle } from './articleImageRecovery.js';
import { replaceArticleImageSource } from './replaceArticleImageSource.js';

const oldKey = `${'a'.repeat(64)}.png`;
const newKey = `${'b'.repeat(64)}.png`;
const url = 'https://example.com/image.png';

function fixture(options: { exists?: boolean; imported?: string | null; source?: boolean } = {}) {
  let article: RecoverableImageArticle = {
    content: `Before ![caption](asset://${oldKey} "title") after`,
    imageSources: options.source === false ? {} : { [oldKey]: url }
  };
  const sibling = { ...article, imageSources: { ...article.imageSources } };
  const port = {
    read: vi.fn(async () => structuredClone(article)),
    exists: vi.fn(async () => options.exists ?? false),
    importImage: vi.fn(async () => options.imported === undefined ? oldKey : options.imported),
    commit: vi.fn(async (_before: RecoverableImageArticle, after: RecoverableImageArticle) => {
      article = after;
      return true;
    })
  };
  return { port, sibling, article: () => article,
    run: () => recoverArticleImage({ port, storageKey: oldKey, replaceSource: replaceArticleImageSource }) };
}

it('uses a present file without requesting its original URL', async () => {
  const test = fixture({ exists: true });
  expect(await test.run()).toMatchObject({ storageKey: oldKey });
  expect(test.port.importImage).not.toHaveBeenCalled();
  expect(test.port.commit).not.toHaveBeenCalled();
});

it('restores unchanged remote bytes without rewriting the article', async () => {
  const test = fixture();
  expect(await test.run()).toMatchObject({ storageKey: oldKey });
  expect(test.port.importImage).toHaveBeenCalledWith(url);
  expect(test.port.commit).not.toHaveBeenCalled();
});

it('accepts the importer filename when the remote image changes and updates only its article', async () => {
  const test = fixture({ imported: newKey });
  expect(await test.run()).toEqual({ storageKey: newKey, content: `Before ![caption](asset://${newKey} "title") after` });
  expect(test.article().imageSources).toEqual({ [newKey]: url });
  expect(test.sibling.content).toContain(oldKey);
  expect(test.sibling.imageSources).toEqual({ [oldKey]: url });
});

it('preserves body and sources when download fails', async () => {
  const test = fixture({ imported: null });
  const before = structuredClone(test.article());
  expect(await test.run()).toBeNull();
  expect(test.article()).toEqual(before);
  expect(test.port.commit).not.toHaveBeenCalled();
});

it('does not fabricate a URL for a local or clipboard image', async () => {
  const test = fixture({ source: false });
  expect(await test.run()).toBeNull();
  expect(test.port.importImage).not.toHaveBeenCalled();
});

it('does not report success when the article changed during download', async () => {
  const test = fixture({ imported: newKey });
  test.port.commit.mockResolvedValue(false);
  expect(await test.run()).toBeNull();
  expect(test.article().content).toContain(oldKey);
});

it('preserves unrelated image URLs, text, and repeated occurrence titles', () => {
  const content = `![a](<asset://${oldKey}> 'one')\n![b](asset://${oldKey})\n[link](asset://${oldKey})`;
  expect(replaceArticleImageSource(content, oldKey, newKey)).toBe(
    `![a](<asset://${newKey}> 'one')\n![b](asset://${newKey})\n[link](asset://${oldKey})`
  );
});

it('leaves escaped images and code examples unchanged', () => {
  const literal = `\`![inline](asset://${oldKey})\`\n\n\`\`\`md\n![fenced](asset://${oldKey})\n\`\`\`\n\n\\![escaped](asset://${oldKey})`;
  const content = `${literal}\n\n![visible](asset://${oldKey})`;
  expect(replaceArticleImageSource(content, oldKey, newKey)).toBe(`${literal}\n\n![visible](asset://${newKey})`);
});

it('rewrites reference images without changing an ordinary link sharing the definition', () => {
  const definition = `[shared]: asset://${oldKey} "title"`;
  const content = `![caption][shared]\n[ordinary][shared]\n\n${definition}`;
  expect(replaceArticleImageSource(content, oldKey, newKey)).toBe(
    `![caption](asset://${newKey} "title")\n[ordinary][shared]\n\n${definition}`
  );
});
