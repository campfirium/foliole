import type { TextAnchorLocator } from '../features/nodes/model/nodeTypes';

const PLACEHOLDER = '[...]';

type TextSelectionAnchor = { locator?: unknown };

function isTextRange(value: unknown): value is TextAnchorLocator {
  return typeof value === 'object' && value !== null && 'from' in value && typeof value.from === 'number' &&
    'to' in value && typeof value.to === 'number' && 'originalText' in value && typeof value.originalText === 'string';
}

export function textSelectionRanges(anchorLink?: TextSelectionAnchor | null): TextAnchorLocator[] {
  const locator = anchorLink?.locator;
  if (typeof locator !== 'object' || locator === null) return [];
  if ('ranges' in locator && Array.isArray(locator.ranges)) return locator.ranges.filter(isTextRange);
  return isTextRange(locator) ? [locator] : [];
}

function clozeAnswers(count: number, reveal: string, anchorLink?: TextSelectionAnchor | null) {
  if (count === 1) return [reveal];
  const originals = textSelectionRanges(anchorLink).map(range => range.originalText);
  if (originals.length === count && originals.join('\n') === reveal) return originals;
  const lines = reveal.split('\n');
  if (lines.length === count) return lines;
  throw new Error('The existing cloze answers cannot be matched to their blanks. Edit the Item before creating another annotation.');
}

export function restoreItemClozeText(source: { content: string; reveal?: string | null; anchorLink?: TextSelectionAnchor | null }) {
  const blanks = [...source.content.matchAll(/\[\.\.\.\]/g)];
  if (!blanks.length || source.reveal == null) return { content: source.content, mapPosition: (position: number) => position };
  const answers = clozeAnswers(blanks.length, source.reveal, source.anchorLink);
  const edits = blanks.map((match, index) => ({ from: match.index, to: match.index + PLACEHOLDER.length, text: answers[index]! }));
  const content = edits.reduceRight((text, edit) => text.slice(0, edit.from) + edit.text + text.slice(edit.to), source.content);
  const mapPosition = (position: number, side: 'start' | 'end' = 'start') => {
    let delta = 0;
    for (const edit of edits) {
      if (position <= edit.from) break;
      if (position < edit.to) return edit.from + delta + (side === 'end' ? edit.text.length : 0);
      delta += edit.text.length - (edit.to - edit.from);
    }
    return position + delta;
  };
  return { content, mapPosition };
}
