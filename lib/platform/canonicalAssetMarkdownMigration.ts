import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../core/import/markdownImageReferences.js';

export function rewriteCanonicalAssetMarkdownTargets(
  markdown: string,
  canonicalStorageKeyByLegacyTarget: ReadonlyMap<string, string>
) {
  const replacements = collectMarkdownImageReferences(maskMarkdownCode(markdown)).flatMap((reference) => {
    const originalTarget = markdown.slice(
      reference.start + reference.fullMatch.indexOf(reference.rawTarget),
      reference.start + reference.fullMatch.indexOf(reference.rawTarget) + reference.rawTarget.length
    );
    const parsed = parseMarkdownImageTarget(originalTarget);
    if (!parsed?.destination.startsWith('asset://')) return [];
    const legacyTarget = parsed.destination.slice('asset://'.length);
    const storageKey = canonicalStorageKeyByLegacyTarget.get(legacyTarget);
    if (!storageKey || storageKey === legacyTarget) return [];
    const targetStart = reference.start + reference.fullMatch.indexOf(reference.rawTarget);
    return [{ end: targetStart + originalTarget.length, start: targetStart,
      value: originalTarget.replace(parsed.destination, `asset://${storageKey}`) }];
  });
  let result = markdown;
  for (const replacement of replacements.reverse()) {
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
  }
  return result;
}

function maskMarkdownCode(markdown: string) {
  const chars = [...markdown];
  let fenced = false;
  let inline = false;
  for (let index = 0; index < chars.length; index += 1) {
    if (markdown.startsWith('```', index)) {
      fenced = !fenced;
      chars[index] = chars[index + 1] = chars[index + 2] = ' ';
      index += 2;
      continue;
    }
    if (!fenced && chars[index] === '`') {
      inline = !inline;
      chars[index] = ' ';
      continue;
    }
    if ((fenced || inline) && chars[index] !== '\n') chars[index] = ' ';
  }
  return chars.join('');
}
