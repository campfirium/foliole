import type { TextAnchorLocator } from './textAnchorLocator.js';
import { TextOccurrences } from './textOccurrences.js';

/** The length is UTF-16 code units, matching stored locators and String.slice. */
export async function inspectTextAnchorInChunks(input: {
  chunks: AsyncIterable<string>;
  length: number;
  locator: TextAnchorLocator;
}) {
  const { locator } = input;
  if (!Number.isSafeInteger(input.length) || input.length < 0 ||
      !Number.isInteger(locator.from) || locator.from < 0 ||
      !Number.isInteger(locator.to) || locator.to < locator.from) throw new Error('anchor_range_invalid');
  const from = Math.min(locator.from, input.length);
  const to = Math.min(locator.to, input.length);
  const occurrences = new TextOccurrences(locator.originalText);
  let originalMatches = to - from === locator.originalText.length;
  let position = 0;
  for await (const text of input.chunks) {
    occurrences.push(text);
    if (originalMatches) {
      const start = Math.max(from, position);
      const end = Math.min(to, position + text.length);
      for (let index = start; index < end; index += 1) {
        if (text[index - position] !== locator.originalText[index - from]) {
          originalMatches = false;
          break;
        }
      }
    }
    position += text.length;
  }
  if (position !== input.length) throw new Error('anchor_body_length_mismatch');
  const repaired = occurrences.count === 1 && occurrences.first !== null
    ? { from: occurrences.first, originalText: locator.originalText,
      to: occurrences.first + locator.originalText.length }
    : null;
  return { locator: originalMatches ? locator : repaired, occurrences: occurrences.count };
}
