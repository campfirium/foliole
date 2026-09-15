const LOCALIZED_COVER_LINE = /^!\[[^\]\r\n]* cover\]\(asset:\/\/[^)\r\n]+\)$/gmu;

export function placeReadwiseApiEpubCover(input: {
  body: string;
  cover: string;
  title: string;
}) {
  const bodyWithoutCover = input.body
    .replace(LOCALIZED_COVER_LINE, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  const blocks = bodyWithoutCover ? bodyWithoutCover.split(/\n{2,}/u) : [];
  const insertionIndex = headingText(blocks[0]) === input.title ? 1 : 0;
  blocks.splice(insertionIndex, 0, input.cover.trim());
  return blocks.filter(Boolean).join('\n\n');
}

export function isReadwiseApiEpubCoverLine(value: string) {
  LOCALIZED_COVER_LINE.lastIndex = 0;
  return LOCALIZED_COVER_LINE.test(value.trim());
}

function headingText(value: string | undefined) {
  return value?.match(/^#{1,6}\s+(.+)$/u)?.[1]?.trim() ?? null;
}
