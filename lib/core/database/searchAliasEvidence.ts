export interface SearchAliasSpan {
  from: number;
  query: string;
  spelling: string;
  to: number;
}

interface FoldedText {
  end: number[];
  start: number[];
  value: string;
}

function foldText(source: string): FoldedText {
  const start: number[] = [];
  const end: number[] = [];
  let value = '';
  for (let offset = 0; offset < source.length;) {
    const character = String.fromCodePoint(source.codePointAt(offset)!);
    const nextOffset = offset + character.length;
    const folded = /\s/u.test(character)
      ? ' '
      : character.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    if (folded === ' ' && value.endsWith(' ')) {
      end[end.length - 1] = nextOffset;
    } else if (!folded) {
      if (end.length) end[end.length - 1] = nextOffset;
    } else {
      value += folded;
      for (let index = 0; index < folded.length; index += 1) {
        start.push(offset);
        end.push(nextOffset);
      }
    }
    offset = nextOffset;
  }
  return { end, start, value };
}

function isWordCharacter(value: string | undefined) {
  return Boolean(value && /[a-z0-9]/u.test(value));
}

function allSpans(source: string, folded: FoldedText, spelling: string): SearchAliasSpan[] {
  const needle = foldText(spelling).value.trim();
  if (!needle) return [];
  const spans: SearchAliasSpan[] = [];
  for (let cursor = 0; cursor < folded.value.length;) {
    const at = folded.value.indexOf(needle, cursor);
    if (at < 0) break;
    cursor = at + 1;
    if (isWordCharacter(needle[0]) && isWordCharacter(folded.value[at - 1])) continue;
    if (isWordCharacter(needle.at(-1)) && isWordCharacter(folded.value[at + needle.length])) continue;
    const from = folded.start[at]!;
    const to = folded.end[at + needle.length - 1]!;
    spans.push({ from, query: source.slice(from, to), spelling, to });
  }
  return spans;
}

export function findSearchAliasSpan(text: string, spelling: string): SearchAliasSpan | null {
  return allSpans(text, foldText(text), spelling)[0] ?? null;
}

export function findSearchAliasSpans(text: string, spellings: string[]) {
  const folded = foldText(text);
  const occurrences = spellings.flatMap((spelling) => allSpans(text, folded, spelling));
  return spellings.flatMap((spelling) => {
    const span = occurrences.find((candidate) => candidate.spelling === spelling && !occurrences.some((other) =>
      other.spelling !== spelling && other.query.length > candidate.query.length
        && other.from <= candidate.from && other.to >= candidate.to
    ));
    return span ? [span] : [];
  });
}
