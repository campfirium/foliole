import { defaultTreeAdapter, parse, parseFragment, serialize } from 'parse5';

import { isHtmlElement, type HtmlElement, type HtmlNode } from './epubParse5.js';

function collectImageSources(node: HtmlNode, sources: string[] = []) {
  if (isHtmlElement(node) && node.tagName === 'image') {
    const href = node.attrs.find((attribute) => attribute.name === 'href')?.value;
    if (href) sources.push(href);
  }
  if ('childNodes' in node) node.childNodes.forEach((child) => collectImageSources(child, sources));
  return sources;
}

function buildImageElement(source: string) {
  const fragment = parseFragment('<img>');
  const image = fragment.childNodes[0] as HtmlElement;
  image.attrs = [{ name: 'src', value: source }];
  return image;
}

function replaceSvgElements(node: HtmlNode) {
  if (!('childNodes' in node)) return;
  for (const child of [...node.childNodes]) {
    const sources = isHtmlElement(child) && child.tagName === 'svg' ? collectImageSources(child) : [];
    if (sources.length === 0) {
      replaceSvgElements(child);
      continue;
    }
    for (const source of sources) {
      defaultTreeAdapter.insertBefore(node, buildImageElement(source), child);
    }
    defaultTreeAdapter.detachNode(child);
  }
}

/** EPUB covers and plates often wrap a bitmap in SVG, which the Markdown conversion cannot read. */
export function inlineEpubSvgImages(html: string) {
  if (!/<svg[\s>]/i.test(html) || !/<image[\s/>]/i.test(html)) return html;
  const document = parse(html);
  replaceSvgElements(document);
  return serialize(document);
}
