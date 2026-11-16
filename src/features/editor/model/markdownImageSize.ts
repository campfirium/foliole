import { folioleMarkdownParser } from './folioleMarkdownParser';
import { formatMarkdownImageCropLabel, parseMarkdownImageCropLabel } from './markdownImageCrop';
import { formatMarkdownImageFocusLabel, parseMarkdownImageFocusLabel, type ImageFocusRect } from './markdownImageFocus';
import type { MarkdownSyntaxTree } from './markdownLinkReferences';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

const OBSIDIAN_IMAGE_SIZE_SUFFIX = /^(.*)\|([1-9]\d*)$/u;

export interface MarkdownImageLabelSize {
  alt: string;
  displayWidth?: number;
}

export function parseMarkdownImageLabelSize(label: string): MarkdownImageLabelSize {
  const match = OBSIDIAN_IMAGE_SIZE_SUFFIX.exec(label);
  if (!match) return { alt: label };
  const displayWidth = Number(match[2]);
  if (!Number.isSafeInteger(displayWidth)) return { alt: label };
  return { alt: match[1] ?? '', displayWidth };
}

export function parseMarkdownImageLabel(label: string) {
  const { label: focusLabel, rect: crop } = parseMarkdownImageCropLabel(label);
  const { label: widthLabel, focus } = parseMarkdownImageFocusLabel(focusLabel);
  return { ...parseMarkdownImageLabelSize(widthLabel), ...(focus ? { focus } : {}), ...(crop ? { crop } : {}) };
}

function collectChildren(node: MarkdownSyntaxNode, name: string) {
  const children: MarkdownSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) children.push(child);
  }
  return children;
}

function findImageLabelRange(
  node: MarkdownSyntaxNode,
  imageRange: { from: number; to: number }
): { from: number; to: number } | null {
  if (node.name === 'Image' && node.from >= imageRange.from && node.to <= imageRange.to) {
    const marks = collectChildren(node, 'LinkMark');
    const from = marks[0]?.to;
    const to = marks[1]?.from;
    return from === undefined || to === undefined ? null : { from, to };
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const range = findImageLabelRange(child, imageRange);
    if (range) return range;
  }
  return null;
}

export function createMarkdownImageDisplayWidthEdit(args: {
  imageRange: { from: number; to: number };
  markdown: string;
  width: number | null;
}) {
  const labelRange = findImageLabelRange(folioleMarkdownParser.parse(args.markdown).topNode, args.imageRange);
  if (!labelRange) return null;
  const currentLabel = args.markdown.slice(labelRange.from, labelRange.to);
  const { label: focusLabel, rect: crop } = parseMarkdownImageCropLabel(currentLabel);
  const { label: currentWidthLabel, focus } = parseMarkdownImageFocusLabel(focusLabel);
  const label = parseMarkdownImageLabelSize(currentWidthLabel).alt;
  const nextWidthLabel = args.width === null ? label : `${label}|${Math.max(1, Math.round(args.width))}`;
  const insert = formatMarkdownImageCropLabel(formatMarkdownImageFocusLabel(nextWidthLabel, focus), crop);
  return { from: labelRange.from, insert, to: labelRange.to };
}

export function setMarkdownImageDisplayWidth(args: Parameters<typeof createMarkdownImageDisplayWidthEdit>[0]) {
  const edit = createMarkdownImageDisplayWidthEdit(args);
  if (!edit) return null;
  return `${args.markdown.slice(0, edit.from)}${edit.insert}${args.markdown.slice(edit.to)}`;
}

export function createMarkdownImageFocusEdit(args: {
  imageRange: { from: number; to: number };
  markdown: string;
  focus: ImageFocusRect | null;
}) {
  const range = findImageLabelRange(folioleMarkdownParser.parse(args.markdown).topNode, args.imageRange);
  if (!range) return null;
  const label = args.markdown.slice(range.from, range.to);
  const { label: focusLabel, rect: crop } = parseMarkdownImageCropLabel(label);
  return { ...range, insert: formatMarkdownImageCropLabel(formatMarkdownImageFocusLabel(focusLabel, args.focus), crop) };
}

export function createMarkdownImageCropEdit(args: {
  imageRange: { from: number; to: number };
  markdown: string;
  crop: ImageFocusRect | null;
}) {
  const range = findImageLabelRange(folioleMarkdownParser.parse(args.markdown).topNode, args.imageRange);
  if (!range) return null;
  const label = args.markdown.slice(range.from, range.to);
  return { ...range, insert: formatMarkdownImageCropLabel(label, args.crop) };
}
