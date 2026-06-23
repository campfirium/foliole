import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  DEMO_PACK_CONTRACT_VERSION,
  DEMO_TRANSLATABLE_FIELDS,
  type DemoPack,
  type DemoPackBlock,
  type DemoPackReviewItem
} from '../../src/demo/demoPack.ts';

import { coalesceParagraphBlocks } from './demo-guides-markdown-blocks.ts';
import { createDemoReadingSeed, createDemoReviewScheduleSeed } from './demo-pack-schedule-seeds.ts';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const SOURCE_GENERATED_AT = '1970-01-01T00:00:00.000Z';

type GuideType = 'topic' | 'item';

interface GuideEntry {
  children: GuideEntry[];
  indent: number;
  parentId: string | null;
  parentSlug?: string;
  slug: string;
  type: GuideType;
}

interface ParsedMarkdown {
  body: string;
  title: string;
}

export interface BuildDemoGuidesContentArgs {
  contentRoot: string;
  outputPath: string;
}

export async function buildDemoGuidesContent(args: BuildDemoGuidesContentArgs) {
  const entries = parseGuideOutline(await readFile(path.join(args.contentRoot, 'guide.yml'), 'utf8'));
  const locales = await discoverLocales(args.contentRoot);
  const packs = Object.fromEntries(await Promise.all(locales.map(async (locale) => [
    locale,
    await buildPackForLocale(args.contentRoot, entries, locale)
  ]))) as Record<string, DemoPack>;
  await writeGeneratedPacks(args.outputPath, packs);
  return packs;
}

export function parseGuideOutline(source: string) {
  const roots: GuideEntry[] = [];
  const stack: GuideEntry[] = [];
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (/^\t+/.test(rawLine)) throw new Error(`guide.yml uses tabs on line ${index + 1}`);
    const indent = rawLine.length - rawLine.trimStart().length;
    const entry = parseGuideLine(rawLine.trim(), index + 1, indent);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (!parent) roots.push(entry);
    else {
      entry.parentId = parent.type === 'topic' ? topicId(parent) : parent.parentId;
      entry.parentSlug = entry.parentId;
      parent.children.push(entry);
    }
    stack.push(entry);
  }
  assertGuideEntries(roots);
  return roots;
}

async function discoverLocales(contentRoot: string) {
  const entries = await readdir(contentRoot, { withFileTypes: true });
  const locales = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (!locales.includes('en')) throw new Error('docs/i18n/guides requires an en locale directory.');
  return locales;
}

function parseGuideLine(line: string, lineNumber: number, indent: number): GuideEntry {
  const [rawSlug, rawType] = line.split(',').map((part) => part.trim());
  const type = (rawType || 'topic') as GuideType;
  if (!SLUG_PATTERN.test(rawSlug)) throw new Error(`Invalid guide slug on line ${lineNumber}: ${rawSlug}`);
  if (type !== 'topic' && type !== 'item') throw new Error(`Invalid guide type on line ${lineNumber}: ${type}`);
  return { children: [], indent, parentId: null, slug: rawSlug, type };
}

function assertGuideEntries(roots: GuideEntry[]) {
  const seen = new Set<string>();
  const visit = (entry: GuideEntry, parent?: GuideEntry) => {
    if (seen.has(entry.slug)) throw new Error(`Duplicate guide slug: ${entry.slug}`);
    seen.add(entry.slug);
    if (!parent && entry.type !== 'topic') throw new Error(`Top-level guide entry must be a topic: ${entry.slug}`);
    if (parent?.type === 'item') throw new Error(`Guide item cannot have children: ${entry.slug}`);
    entry.children.forEach((child) => visit(child, entry));
  };
  roots.forEach((entry) => visit(entry));
}

async function buildPackForLocale(contentRoot: string, entries: GuideEntry[], locale: string): Promise<DemoPack> {
  const topicEntries = flattenEntries(entries).filter((entry) => entry.type === 'topic');
  const topics = await Promise.all(topicEntries.map(async (entry, index) => {
    const id = topicId(entry);
    const topic = await readGuideMarkdown(contentRoot, locale, id);
    const reviewItems = await Promise.all(entry.children.filter((child) => child.type === 'item').map((child) => buildReviewItem(contentRoot, locale, child)));
    return {
      id,
      slug: id,
      parentId: entry.parentId,
      childTopicIds: entry.children.filter((child) => child.type === 'topic').map(topicId),
      title: topic.title,
      description: summaryParagraph(topic.body) ?? topic.title,
      summary: summaryParagraph(topic.body) ?? topic.title,
      runtime: { state: 'topic' as const, topicId: id },
      readingSeed: createDemoReadingSeed(index),
      blocks: topicBlocks(id, topic),
      highlights: [],
      reviewItems,
      reviewScheduleSeeds: reviewItems.map((item, itemIndex) => createDemoReviewScheduleSeed(item.id, index + itemIndex))
    };
  }));
  return {
    contractVersion: DEMO_PACK_CONTRACT_VERSION,
    generatedAt: SOURCE_GENERATED_AT,
    sourceLocale: locale,
    translatableFields: DEMO_TRANSLATABLE_FIELDS,
    source: {
      rootNodeId: null,
      rootTitle: 'docs/i18n/guides',
      warnings: locale === 'en' ? [] : await missingLocaleWarnings(contentRoot, locale, entries)
    },
    topics
  };
}

async function buildReviewItem(contentRoot: string, locale: string, entry: GuideEntry): Promise<DemoPackReviewItem> {
  const fullSlug = itemFullSlug(entry);
  const item = await readGuideMarkdown(contentRoot, locale, fullSlug);
  const [prompt, answer] = splitItemPromptAnswer(item.body, entry.slug);
  return {
    id: fullSlug,
    title: item.title,
    kind: 'item',
    prompt,
    answer
  };
}

async function readGuideMarkdown(contentRoot: string, locale: string, slug: string) {
  const localePath = path.join(contentRoot, locale, `${slug}.md`);
  const fallbackPath = path.join(contentRoot, 'en', `${slug}.md`);
  const filePath = locale === 'en' ? localePath : await fileExists(localePath) ? localePath : fallbackPath;
  return parseMarkdown(await readFile(filePath, 'utf8'), slug);
}

function parseMarkdown(source: string, slug: string): ParsedMarkdown {
  if (/^---\s*$/m.test(source.split(/\r?\n/).slice(0, 3).join('\n'))) {
    throw new Error(`Guide Markdown must not use frontmatter: ${slug}`);
  }
  const lines = source.trim().split(/\r?\n/);
  const titleLineIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (titleLineIndex < 0) throw new Error(`Guide Markdown is missing an H1 title: ${slug}`);
  return {
    title: lines[titleLineIndex].replace(/^#\s+/, '').trim(),
    body: lines.slice(titleLineIndex + 1).join('\n').trim()
  };
}

function topicBlocks(slug: string, markdown: ParsedMarkdown): DemoPackBlock[] {
  const blocks = coalesceParagraphBlocks(markdown.body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map(markdownBlock));
  const source = blocks.length ? blocks : [{ kind: 'paragraph' as const, text: markdown.body || markdown.title }];
  return source.map((block, index) => ({ ...block, id: `${slug}-block-${index + 1}` }));
}

function markdownBlock(part: string) {
  if (/^##\s+/.test(part)) return { kind: 'heading' as const, text: part.replace(/^##\s+/, '').trim() };
  return { kind: 'paragraph' as const, text: part };
}

function summaryParagraph(content: string) {
  return content.split(/\n{2,}/).map((part) => part.trim()).find((part) => (
    part &&
    !part.startsWith('## ') &&
    !/^!\[[^\]]*]\([^)]+\)$/.test(part)
  ))?.replace(/\s*\n\s*/g, ' ') ?? null;
}

function splitItemPromptAnswer(body: string, slug: string) {
  const parts = body.split(/^---\s*$/m).map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Guide item must contain one prompt/answer divider: ${slug}`);
  return parts as [string, string];
}

async function missingLocaleWarnings(contentRoot: string, locale: string, entries: GuideEntry[]) {
  const warnings: string[] = [];
  const visit = async (entry: GuideEntry) => {
    const fileSlug = entry.type === 'item' ? itemFullSlug(entry) : topicId(entry);
    if (!(await fileExists(path.join(contentRoot, locale, `${fileSlug}.md`)))) warnings.push(`fallback-en: ${fileSlug}`);
    await Promise.all(entry.children.map(visit));
  };
  await Promise.all(entries.map(visit));
  return warnings.sort();
}

function itemFullSlug(entry: GuideEntry) {
  return entry.parentId ? `${entry.parentId}.${entry.slug}` : entry.slug;
}

function topicId(entry: GuideEntry) {
  return entry.parentId ? `${entry.parentId}.${entry.slug}` : entry.slug;
}

function flattenEntries(entries: GuideEntry[]): GuideEntry[] {
  return entries.flatMap((entry) => [entry, ...flattenEntries(entry.children)]);
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeGeneratedPacks(outputPath: string, packs: Record<string, DemoPack>) {
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  const source = `import type { DemoPack } from '../demoPack';\n\nexport const GENERATED_DEMO_PACKS: Record<string, DemoPack> = ${JSON.stringify(packs, null, 2)};\nexport const GENERATED_DEMO_PACK: DemoPack = GENERATED_DEMO_PACKS.en!;\n`;
  await writeIfChanged(resolved, source);
  await writeIfChanged(path.join(path.dirname(resolved), 'demoPack.ts'), source.replace('GENERATED_DEMO_PACKS: Record<string, DemoPack>', 'GENERATED_DEMO_PACKS: Record<string, DemoPack>'));
}

async function writeIfChanged(filePath: string, content: string) {
  if (await fileExists(filePath)) {
    const existing = await readFile(filePath, 'utf8');
    if (existing === content) return;
  }
  await writeFile(filePath, content, 'utf8');
}
