import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5';

import { convertHtmlToMarkdownCompatible } from './htmlToMarkdownCompatible.js';

type HtmlParent = DefaultTreeAdapterTypes.ParentNode;
type ImageDestinations = ReadonlyMap<string, string>;
interface MediaCounts { localImages: number; remoteImages: number; audio: number; localSources: Map<string, number> }

function inspectMedia(parent: HtmlParent, media: MediaCounts, imageDestinations?: ImageDestinations) {
  parent.childNodes = parent.childNodes.filter(node => {
    if (!('tagName' in node)) return true;
    if (node.tagName === 'audio' || (node.tagName === 'embed' && node.attrs.some(attr =>
      attr.name === 'src' && /\.(?:mp3|wav|ogg|m4a)(?:[?#]|$)/i.test(attr.value)))) {
      media.audio++;
      return false;
    }
    if (node.tagName === 'img') inspectImage(node, media, imageDestinations);
    inspectMedia(node, media, imageDestinations);
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
    inspectMedia(fragment, media, imageDestinations);
    return convertHtmlToMarkdownCompatible(serialize(fragment)).content;
  }).filter(Boolean).join('\n');
  return { content, ...media };
}
