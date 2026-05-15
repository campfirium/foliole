import { collectMarkdownEscapedRanges, normalizeMarkdownLinkDestination, projectMarkdownEscapedText } from './markdownLinkSafety';

export interface MarkdownForumTitleLinkRange {
  from: number;
  hiddenRanges: Array<{ from: number; to: number }>;
  href: string;
  labelFrom: number;
  labelText: string;
  labelTo: number;
  safe: boolean;
  title: string;
  to: number;
  urlLineFrom: number;
  urlLineTo: number;
}

function collectLineRanges(text: string) {
  const lines: Array<{ from: number; text: string; to: number }> = [];
  let lineFrom = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== '\n') continue;
    lines.push({ from: lineFrom, text: text.slice(lineFrom, index), to: index });
    lineFrom = index + 1;
  }

  return lines;
}

function createForumTitleLinkRange(
  titleLine: { from: number; text: string; to: number },
  urlLine: { from: number; text: string; to: number }
): MarkdownForumTitleLinkRange | null {
  if (!titleLine.text.startsWith('[') || !titleLine.text.endsWith(']')) return null;
  if (!urlLine.text.startsWith('(') || !urlLine.text.endsWith(')')) return null;

  const rawTitle = titleLine.text.slice(1, -1);
  const titleText = projectMarkdownEscapedText(rawTitle);
  if (!titleText) return null;

  const rawHref = normalizeMarkdownLinkDestination(urlLine.text.slice(1, -1));
  const normalizedHref = rawHref.toLowerCase();
  if (!rawHref || !(normalizedHref.startsWith('http://') || normalizedHref.startsWith('https://'))) return null;

  const labelFrom = titleLine.from + 1;
  const labelTo = titleLine.to - 1;
  const titleHiddenRanges = collectMarkdownEscapedRanges(rawTitle, 1);
  const hiddenRanges = [
    { from: titleLine.from, to: titleLine.from + 1 },
    { from: titleLine.to - 1, to: titleLine.to },
    ...titleHiddenRanges,
    { from: urlLine.from, to: urlLine.to }
  ];

  return {
    from: titleLine.from,
    hiddenRanges,
    href: rawHref,
    labelFrom,
    labelText: titleText,
    labelTo,
    safe: true,
    title: titleText,
    to: urlLine.to,
    urlLineFrom: urlLine.from,
    urlLineTo: urlLine.to
  };
}

export function collectMarkdownForumTitleLinkRanges(text: string, offset = 0): MarkdownForumTitleLinkRange[] {
  const ranges: MarkdownForumTitleLinkRange[] = [];
  const lines = collectLineRanges(text);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const range = createForumTitleLinkRange(lines[index]!, lines[index + 1]!);
    if (!range) continue;
    ranges.push({
      ...range,
      from: offset + range.from,
      hiddenRanges: range.hiddenRanges.map((hiddenRange) => ({
        from: offset + hiddenRange.from,
        to: offset + hiddenRange.to
      })),
      labelFrom: offset + range.labelFrom,
      labelTo: offset + range.labelTo,
      to: offset + range.to,
      urlLineFrom: offset + range.urlLineFrom,
      urlLineTo: offset + range.urlLineTo
    });
    index += 1;
  }

  return ranges;
}
