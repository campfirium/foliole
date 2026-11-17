import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5';

import { convertHtmlToMarkdownCompatible } from './htmlToMarkdownCompatible.js';
import { BLOCK_TAGS, CONTENT_STRIP_TAGS, EMBEDDED_TAGS } from './htmlToMarkdownCompatibleUtils.js';

type HtmlParent = DefaultTreeAdapterTypes.ParentNode;
type ImageDestinations = ReadonlyMap<string, string>;
interface MediaCounts { localImages: number; remoteImages: number; audio: number; localSources: Map<string, number> }

const STRUCTURAL_TAGS = new Set([...BLOCK_TAGS, 'li', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th']);
const OPAQUE_TAGS = new Set([...CONTENT_STRIP_TAGS, ...EMBEDDED_TAGS, 'svg', 'math', 'template']);

function unwrapStructuralContainers(parent: HtmlParent) {
  parent.childNodes = parent.childNodes.flatMap(node => {
    if (!('tagName' in node) || OPAQUE_TAGS.has(node.tagName)) return [node];
    unwrapStructuralContainers(node);
    // Exported web components can hide block content from the Markdown converter.
    if (!node.tagName.includes('-') || !node.childNodes.some(child => 'tagName' in child && STRUCTURAL_TAGS.has(child.tagName))) {
      return [node];
    }
    for (const child of node.childNodes) child.parentNode = parent;
    return node.childNodes;
  });
}

function prepareFragment(parent: HtmlParent, media: MediaCounts, imageDestinations?: ImageDestinations, inReference = false) {
  parent.childNodes = parent.childNodes.filter(node => {
    if (inReference && node.nodeName === '#text' && 'value' in node) {
      node.value = node.value.replace(/^(\s*)#/u, '$1\\#');
    }
    if (!('tagName' in node)) return true;
    if (node.tagName === 'audio' || (node.tagName === 'embed' && node.attrs.some(attr =>
      attr.name === 'src' && /\.(?:mp3|wav|ogg|m4a)(?:[?#]|$)/i.test(attr.value)))) {
      media.audio++;
      return false;
    }
    if (node.tagName === 'img') inspectImage(node, media, imageDestinations);
    prepareFragment(node, media, imageDestinations, inReference || node.tagName === 'supermemoreference');
    return true;
  });
}

function inspectImage(node: DefaultTreeAdapterTypes.Element, media: MediaCounts, imageDestinations?: ImageDestinations) {
  const source = node.attrs.find(attr => attr.name === 'src');
  const original = source?.value.trim();
  if (!source || !original) return;
  const url = original.startsWith('//') ? `https:${original}` : original;
  if (/^https?:\/\//i.test(url) && URL.canParse(url)) {
    media.remoteImages++;
    source.value = new URL(url).href.replaceAll('(', '%28').replaceAll(')', '%29');
    return;
  }
  if (/^data:image\//i.test(original)) return;
  media.localImages++;
  media.localSources.set(original, (media.localSources.get(original) ?? 0) + 1);
  const destination = imageDestinations?.get(original);
  if (destination) {
    source.value = destination;
    return;
  }
  // Keep unresolved paths in the body without asking the renderer to load local files.
  const alt = node.attrs.find(attr => attr.name === 'alt');
  const label = [alt?.value, original].filter(Boolean).join(' · ');
  source.value = '';
  if (alt) alt.value = label;
  else node.attrs.push({ name: 'alt', value: label });
}

export function convertSuperMemoContent(parts: string[], imageDestinations?: ImageDestinations) {
  const media = { localImages: 0, remoteImages: 0, audio: 0, localSources: new Map<string, number>() };
  const content = parts.map(part => {
    const fragment = parseFragment(part);
    prepareFragment(fragment, media, imageDestinations);
    unwrapStructuralContainers(fragment);
    return convertHtmlToMarkdownCompatible(serialize(fragment)).content;
  }).filter(Boolean).join('\n');
  return { content, ...media };
}
