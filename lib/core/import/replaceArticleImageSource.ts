import { buildAssetMarkdownUrl, parseAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { folioleMarkdownParser } from '../markdown/folioleMarkdownParser.js';

type SyntaxNode = ReturnType<typeof folioleMarkdownParser.parse>['topNode'];

function normalizeLabel(value: string) {
  return value.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function referenceTargets(tree: ReturnType<typeof folioleMarkdownParser.parse>, content: string) {
  const references = new Map<string, { raw: string; title: string }>();
  tree.iterate({ enter(node) {
    if (node.name !== 'LinkReference') return;
    const label = node.node.getChild('LinkLabel');
    const url = node.node.getChild('URL');
    const title = node.node.getChild('LinkTitle');
    if (!label || !url) return;
    const key = normalizeLabel(content.slice(label.from, label.to));
    if (!references.has(key)) references.set(key, {
      raw: content.slice(url.from, url.to), title: title ? content.slice(title.from, title.to) : ''
    });
  } });
  return references;
}

function referenceImage(node: SyntaxNode, content: string, references: ReturnType<typeof referenceTargets>) {
  const marks = node.getChildren('LinkMark');
  if (!marks[0] || !marks[1]) return null;
  const alt = content.slice(marks[0].to, marks[1].from);
  const label = node.getChild('LinkLabel');
  const key = normalizeLabel(label ? content.slice(label.from, label.to) : alt) || normalizeLabel(alt);
  const reference = references.get(key);
  return reference ? { ...reference, alt } : null;
}

export function replaceArticleImageSource(content: string, oldKey: string, newKey: string) {
  const replacements: { from: number; to: number; text: string }[] = [];
  const tree = folioleMarkdownParser.parse(content);
  const references = referenceTargets(tree, content);
  tree.iterate({
    enter(node) {
      if (node.name !== 'Image') return;
      const url = node.node.getChild('URL');
      const reference = url ? null : referenceImage(node.node, content, references);
      if (!url && !reference) return;
      const raw = url ? content.slice(url.from, url.to) : reference!.raw;
      const wrapped = raw.startsWith('<') && raw.endsWith('>');
      if (parseAssetMarkdownUrl(wrapped ? raw.slice(1, -1) : raw) !== oldKey) return;
      const target = buildAssetMarkdownUrl(newKey);
      replacements.push(url
        ? { from: url.from, to: url.to, text: wrapped ? `<${target}>` : target }
        : { from: node.from, to: node.to, text: `![${reference!.alt}](${target}${reference!.title ? ` ${reference!.title}` : ''})` });
    }
  });
  let next = content;
  for (const change of replacements.reverse()) {
    next = next.slice(0, change.from) + change.text + next.slice(change.to);
  }
  return next;
}
