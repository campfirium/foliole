import { resolveRuntimeAttachmentResource } from '../../../shared/platform/attachmentResources';
import { collectImageMatches } from '../model/markdownImageMatches';

import type { LocalizedImageChange } from './localizeRemoteMarkdownImages';

const DECODE_TIMEOUT_MS = 2000;

interface PreparedLocalImage {
  image: HTMLImageElement;
  resourceUrl: string;
}

// Handed to the widget that replaces a visible remote image, so the swap never shows an unloaded element.
const preparedImages = new Map<string, PreparedLocalImage>();

async function loadLocalImage(source: string): Promise<PreparedLocalImage | null> {
  const resolution = await resolveRuntimeAttachmentResource(source, { refresh: true, imageDisplay: true });
  if (resolution?.status !== 'ready' || !resolution.resource_url) return null;
  const image = document.createElement('img');
  if (typeof image.decode !== 'function') return null;
  if (resolution.resource_url.startsWith('foliole-asset://')) image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.src = resolution.resource_url;
  await image.decode();
  return { image, resourceUrl: resolution.resource_url };
}

/** Resolves once the local copies are decoded; a slow or failed one falls back to the normal loading flow. */
export async function prepareLocalImages(changes: LocalizedImageChange[]) {
  const sources = changes.flatMap(change => collectImageMatches(0, change.insert).map(match => match.source));
  await Promise.all(sources.map(async (source) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(resolve, DECODE_TIMEOUT_MS, null); });
    const prepared = await Promise.race([loadLocalImage(source).catch(() => null), timeout]);
    clearTimeout(timer);
    if (prepared) preparedImages.set(source, prepared);
  }));
  return () => sources.forEach(source => preparedImages.delete(source));
}

export function takePreparedLocalImage(source: string) {
  const prepared = preparedImages.get(source) ?? null;
  preparedImages.delete(source);
  return prepared;
}
