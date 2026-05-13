import path from 'node:path';

import { parse } from 'parse5';

import { isHtmlElement, type HtmlElement, type HtmlNode } from './epubParse5.js';

export interface EpubManifestItem {
  href: string;
  mediaType: string | null;
  properties: string[];
}

export interface EpubTocEntry {
  children: EpubTocEntry[];
  href: string | null;
  title: string;
}

function normalizeRelativePath(baseFilePath: string, href: string | null) {
  if (!href) {
    return null;
  }
  const [sourcePath] = href.split('#');
  if (!sourcePath?.trim()) {
    return null;
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(baseFilePath), sourcePath.replace(/\\/g, '/')));
}

function collectText(node: HtmlNode): string {
  if (node.nodeName === '#text') {
    return ('value' in node ? node.value : '').replace(/\s+/g, ' ').trim();
  }
  if (!('childNodes' in node)) {
    return '';
  }
  return node.childNodes.map((child) => collectText(child)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function hasTocType(element: HtmlElement) {
  const typeValue = element.attrs.find((attribute) => attribute.name === 'epub:type')?.value ?? '';
  const roleValue = element.attrs.find((attribute) => attribute.name === 'role')?.value ?? '';
  return /\btoc\b/i.test(typeValue) || /\bdoc-toc\b/i.test(roleValue);
}

function findTocNav(node: HtmlNode): HtmlElement | null {
  if (isHtmlElement(node) && node.tagName === 'nav' && hasTocType(node)) {
    return node;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findTocNav(child);
    if (match) {
      return match;
    }
  }
  return null;
}

function findFirstList(node: HtmlNode): HtmlElement | null {
  if (isHtmlElement(node) && ['ol', 'ul'].includes(node.tagName)) {
    return node;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findFirstList(child);
    if (match) {
      return match;
    }
  }
  return null;
}

function findAnchor(node: HtmlNode): HtmlElement | null {
  if (isHtmlElement(node) && node.tagName === 'a') {
    return node;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findAnchor(child);
    if (match) {
      return match;
    }
  }
  return null;
}

function parseNavList(list: HtmlElement, navPath: string): EpubTocEntry[] {
  return list.childNodes.flatMap((child) => {
    if (!isHtmlElement(child) || child.tagName !== 'li') {
      return [];
    }
    const link = findAnchor(child);
    const nestedList = child.childNodes.find(
      (node): node is HtmlElement => isHtmlElement(node) && ['ol', 'ul'].includes(node.tagName)
    );
    const title = (link ? collectText(link) : collectText(child)).trim();
    if (!title) {
      return nestedList ? parseNavList(nestedList, navPath) : [];
    }
    const hrefValue = link?.attrs.find((attribute) => attribute.name === 'href')?.value ?? null;
    return [{
      children: nestedList ? parseNavList(nestedList, navPath) : [],
      href: normalizeRelativePath(navPath, hrefValue),
      title
    } satisfies EpubTocEntry];
  });
}

function parseNavDocumentToc(navHtml: string, navPath: string) {
  const document = parse(navHtml);
  const tocNav = findTocNav(document);
  if (!tocNav) {
    return [];
  }
  const rootList = findFirstList(tocNav);
  return rootList ? parseNavList(rootList, navPath) : [];
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseNcxToc(ncxXml: string, ncxPath: string) {
  const roots: EpubTocEntry[] = [];
  const stack: EpubTocEntry[] = [];
  const tokenPattern = /<navPoint\b[^>]*>|<\/navPoint>|<content\b[^>]*src\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*\/?>|<navLabel\b[^>]*>[\s\S]*?<\/navLabel>/gi;

  for (const match of ncxXml.matchAll(tokenPattern)) {
    const token = match[0];
    if (/^<navPoint\b/i.test(token)) {
      const entry: EpubTocEntry = { children: [], href: null, title: '' };
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(entry);
      } else {
        roots.push(entry);
      }
      stack.push(entry);
      continue;
    }
    if (/^<\/navPoint>/i.test(token)) {
      stack.pop();
      continue;
    }
    const current = stack[stack.length - 1];
    if (!current) {
      continue;
    }
    if (/^<content\b/i.test(token)) {
      current.href = normalizeRelativePath(ncxPath, match[1] ?? match[2] ?? null);
      continue;
    }
    const labelMatch = token.match(/<text\b[^>]*>([\s\S]*?)<\/text>/i);
    if (labelMatch?.[1]) {
      current.title = decodeXmlEntities(labelMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
  }

  return roots.filter((entry) => entry.title);
}

export function readEpubToc(input: {
  entries: ReadonlyMap<string, Uint8Array>;
  manifest: ReadonlyMap<string, EpubManifestItem>;
  opfDirectory: string;
  opfXml: string;
}) {
  const navDocument = Array.from(input.manifest.values()).find((item) => item.properties.includes('nav'));
  if (navDocument) {
    const navBytes = input.entries.get(navDocument.href);
    if (navBytes) {
      const toc = parseNavDocumentToc(new TextDecoder('utf-8').decode(navBytes), navDocument.href);
      if (toc.length > 0) {
        return toc;
      }
    }
  }

  const spineTocId = input.opfXml.match(/<spine\b([^>]*)>/i)?.[1]?.match(/\btoc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const ncxId = spineTocId?.[1] ?? spineTocId?.[2] ?? null;
  const ncxItem =
    (ncxId ? input.manifest.get(ncxId) : null) ??
    Array.from(input.manifest.values()).find((item) => item.mediaType === 'application/x-dtbncx+xml') ??
    null;
  if (!ncxItem) {
    return [];
  }

  const ncxBytes = input.entries.get(ncxItem.href);
  if (!ncxBytes) {
    return [];
  }
  return parseNcxToc(new TextDecoder('utf-8').decode(ncxBytes), ncxItem.href);
}
