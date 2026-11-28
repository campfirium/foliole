import { ASSET_MARKDOWN_SCHEME, buildAssetMarkdownUrl, parseAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { folioleMarkdownParser } from '../markdown/folioleMarkdownParser.js';
import { collectMarkdownReferenceDefinitions, resolveMarkdownReference } from '../markdown/markdownReferences.js';

function replaceImageTarget(content: string, matches: (source: string) => boolean, newKey: string) {
  const replacements: { from: number; to: number; text: string }[] = [];
  const tree = folioleMarkdownParser.parse(content);
  const references = collectMarkdownReferenceDefinitions(tree, content);
  tree.iterate({
    enter(node) {
      if (node.name !== 'Image') return;
      const url = node.node.getChild('URL');
      const reference = url ? null : resolveMarkdownReference(node.node, content, references);
      if (!url && !reference) return;
      const raw = url ? content.slice(url.from, url.to) : reference!.raw;
      const wrapped = raw.startsWith('<') && raw.endsWith('>');
      if (!matches(wrapped ? raw.slice(1, -1) : raw)) return;
      const target = buildAssetMarkdownUrl(newKey);
      replacements.push(url
        ? { from: url.from, to: url.to, text: wrapped ? `<${target}>` : target }
        : { from: node.from, to: node.to, text: `![${reference!.text}](${target}${reference!.title ? ` ${reference!.title}` : ''})` });
    }
  });
  let next = content;
  for (const change of replacements.reverse()) {
    next = next.slice(0, change.from) + change.text + next.slice(change.to);
  }
  return next;
}

export function replaceArticleImageSource(content: string, oldKey: string, newKey: string) {
  return replaceImageTarget(content, (source) => parseAssetMarkdownUrl(source) === oldKey, newKey);
}

export function localizeArticleImageSource(content: string, sourceUrl: string, storageKey: string) {
  return replaceImageTarget(content, (source) => source === sourceUrl, storageKey);
}

export function collectArticleImageStorageKeys(content: string) {
  if (!content.includes(ASSET_MARKDOWN_SCHEME)) return [];
  const keys = new Set<string>();
  const tree = folioleMarkdownParser.parse(content);
  const references = collectMarkdownReferenceDefinitions(tree, content);
  tree.iterate({ enter(node) {
    if (node.name !== 'Image') return;
    const url = node.node.getChild('URL');
    const raw = url ? content.slice(url.from, url.to) : resolveMarkdownReference(node.node, content, references)?.raw;
    if (!raw) return;
    const key = parseAssetMarkdownUrl(raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw);
    if (key) keys.add(key);
  } });
  return [...keys];
}
