import { collectMarkdownImageReferences } from '../../../lib/core/import/markdownImageReferences';

const MAX_CACHE_SIZE = 24;
const imageReferencePresenceCache = new Map<string, boolean>();

function updateCache(content: string, value: boolean) {
  imageReferencePresenceCache.delete(content);
  imageReferencePresenceCache.set(content, value);
  if (imageReferencePresenceCache.size <= MAX_CACHE_SIZE) {
    return value;
  }
  const oldestKey = imageReferencePresenceCache.keys().next().value;
  if (typeof oldestKey === 'string') {
    imageReferencePresenceCache.delete(oldestKey);
  }
  return value;
}

export function hasCachedMarkdownImageReference(content: string) {
  const cached = imageReferencePresenceCache.get(content);
  if (typeof cached === 'boolean') {
    return cached;
  }
  return updateCache(content, collectMarkdownImageReferences(content).length > 0);
}
