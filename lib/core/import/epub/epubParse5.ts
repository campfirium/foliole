import type { DefaultTreeAdapterTypes } from 'parse5';

export type HtmlElement = DefaultTreeAdapterTypes.Element;
export type HtmlNode = DefaultTreeAdapterTypes.Node;

export function isHtmlElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}
