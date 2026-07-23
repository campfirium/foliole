import { createHash } from 'node:crypto';

import type { FolioleWebField } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';
import { convertWordPressMarkdownToBlocks, type WordPressMarkdownBlock } from '../../lib/core/wordpress/wordpressMarkdownHtml.js';

import type { FoliolePublishTopic } from './foliolePublishModel.js';
import type {
  FoliolePublishTemplateField,
  FoliolePublishTemplateGroup,
  FoliolePublishTemplateTaxonomyTerm,
  FoliolePublishTemplateTerm,
  FoliolePublishTemplateTopic
} from './foliolePublishTemplate.js';

export interface FoliolePublishTopicSource {
  fields: FolioleWebField[];
  markdown: string;
  topic: FoliolePublishTopic;
}

export interface FoliolePublishProjectedTopic extends FoliolePublishTemplateTopic { search_text: string }

function normalizedValue(value: string) {
  return value.trim().normalize('NFKC');
}

function foldedValue(value: string) {
  return normalizedValue(value).toLowerCase();
}

export function publicTermSlug(value: string) {
  const normalized = foldedValue(value);
  const readable = normalized.normalize('NFKD').replace(/\p{Mark}/gu, '')
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 42) || 'term';
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 8);
  return `${readable}-${hash}`;
}

function templateFields(fields: FolioleWebField[]): FoliolePublishTemplateField[] {
  return fields.map(({ key, value }) => ({
    key,
    values: (Array.isArray(value) ? value : [value]).map(normalizedValue).filter(Boolean)
  }));
}

function taxonomyValues(fields: FolioleWebField[], key: 'category' | 'tags') {
  const values = fields.filter((field) => field.key.toLowerCase() === key)
    .flatMap((field) => Array.isArray(field.value) ? field.value : [field.value]);
  const seen = new Set<string>();
  return values.map(normalizedValue).filter((value) => {
    const folded = foldedValue(value);
    if (!folded || seen.has(folded)) return false;
    seen.add(folded);
    return true;
  });
}

function terms(fields: FolioleWebField[], key: 'category' | 'tags'): FoliolePublishTemplateTerm[] {
  return taxonomyValues(fields, key).map((name) => ({ name, slug: publicTermSlug(name) }));
}

function previewBlock(blocks: WordPressMarkdownBlock[]) {
  const index = blocks.findIndex((block) => (
    !/^ATXHeading[1-6]$/u.test(block.kind) && block.kind !== 'HorizontalRule' && block.text.length > 0
  ));
  if (index < 0) return { hasMore: false, html: '', text: blocks.map((block) => block.text).filter(Boolean).join(' ') };
  return {
    hasMore: blocks.slice(index + 1).some((block) => block.text.length > 0),
    html: blocks[index]?.html ?? '',
    text: blocks.map((block) => block.text).filter(Boolean).join(' ')
  };
}

function projectTopic(source: FoliolePublishTopicSource): FoliolePublishProjectedTopic {
  const rendered = convertWordPressMarkdownToBlocks(source.markdown, 1, { preserveSoftBreaks: true });
  const firstIsTitle = /^ATXHeading[1-6]$/u.test(rendered[0]?.kind ?? '')
    && foldedValue(rendered[0]?.text ?? '') === foldedValue(source.topic.title);
  const blocks = firstIsTitle ? rendered.slice(1) : rendered;
  const preview = previewBlock(blocks);
  const fields = templateFields(source.fields);
  const searchFields = fields.flatMap((field) => [field.key, ...field.values]).join(' ');
  return {
    categories: terms(source.fields, 'category'),
    content: blocks.map((block) => block.html).join('\n'),
    fields,
    has_more: preview.hasMore,
    id: String(source.topic.number),
    path: `topics/${source.topic.number}/`,
    preview: preview.html,
    published_at: source.topic.published_at,
    search_text: `${source.topic.title} ${preview.text} ${searchFields}`.trim(),
    tags: terms(source.fields, 'tags'),
    title: source.topic.title,
    updated_at: source.topic.updated_at
  };
}

export function projectPublishedTopics(sources: FoliolePublishTopicSource[]) {
  return sources.map((source, index) => ({ index, projected: projectTopic(source) }))
    .sort((left, right) => right.projected.updated_at.localeCompare(left.projected.updated_at) || left.index - right.index)
    .map(({ projected }) => projected);
}

export function groupTopicsByUpdatedYear(topics: FoliolePublishTemplateTopic[]): FoliolePublishTemplateGroup[] {
  const years = [...new Set(topics.map((topic) => topic.updated_at.slice(0, 4)))];
  return years.map((label) => ({ label, topics: topics.filter((topic) => topic.updated_at.startsWith(label)) }));
}

export function taxonomyIndex(topics: FoliolePublishTemplateTopic[], key: 'categories' | 'tags') {
  const counts = new Map<string, FoliolePublishTemplateTaxonomyTerm>();
  topics.flatMap((topic) => topic[key]).forEach((term) => {
    const current = counts.get(term.slug);
    counts.set(term.slug, { ...term, count: (current?.count ?? 0) + 1 });
  });
  return [...counts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function topicsForTerm<T extends FoliolePublishTemplateTopic>(topics: T[], key: 'categories' | 'tags', slug: string): T[] {
  return topics.filter((topic) => topic[key].some((term) => term.slug === slug));
}

export function searchIndexScript(topics: FoliolePublishProjectedTopic[]) {
  const items = topics.map((topic) => ({ fields: topic.fields, text: topic.search_text, title: topic.title, url: topic.path }));
  const json = JSON.stringify(items).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return `window.__FOLIOLE_SEARCH_INDEX__=${json};\n`;
}
