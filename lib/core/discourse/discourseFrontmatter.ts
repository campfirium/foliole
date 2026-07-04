export interface DiscourseTopicBinding {
  categoryId: number | null;
  lastPublishedAt: string;
  postId: number;
  site: string;
  tags: string[];
  topicId: number;
  url: string;
}

export type DiscoursePublishMode = 'create' | 'update';

export class DiscourseFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscourseFrontmatterError';
  }
}

interface FrontmatterParts {
  body: string;
  frontmatter: string | null;
}

const MANAGED_BLOCK_START = '# foliole:discourse-publish';
const MANAGED_BLOCK_END = '# /foliole:discourse-publish';

function splitFrontmatter(content: string): FrontmatterParts {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { body: content, frontmatter: null };
  }
  const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const endMarker = `${newline}---${newline}`;
  const endIndex = content.indexOf(endMarker, 3);
  if (endIndex < 0) {
    throw new DiscourseFrontmatterError('Topic frontmatter is not closed.');
  }
  return {
    body: content.slice(endIndex + endMarker.length),
    frontmatter: content.slice(4, endIndex)
  };
}

function readManagedBlock(frontmatter: string) {
  const start = frontmatter.indexOf(MANAGED_BLOCK_START);
  const end = frontmatter.indexOf(MANAGED_BLOCK_END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start) {
    throw new DiscourseFrontmatterError('Discourse publish frontmatter markers are malformed.');
  }
  const blockEnd = end + MANAGED_BLOCK_END.length;
  return {
    block: frontmatter.slice(start, blockEnd),
    end: blockEnd,
    start
  };
}

function parseStringField(block: string, key: string) {
  const match = block.match(new RegExp(`^\\s{4}${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function parseNumberField(block: string, key: string) {
  const raw = parseStringField(block, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseTags(block: string) {
  const tagsStart = block.match(/^ {4}tags:\s*$/m);
  if (!tagsStart?.index) return [];
  const rest = block.slice(tagsStart.index + tagsStart[0].length);
  return rest.split(/\r?\n/)
    .map((line) => line.match(/^ {6}-\s+(.+)$/)?.[1]?.trim())
    .filter((tag): tag is string => Boolean(tag));
}

export function readDiscourseTopicBinding(content: string): DiscourseTopicBinding | null {
  const parts = splitFrontmatter(content);
  if (!parts.frontmatter) return null;
  if (/^publish:\s*$/m.test(parts.frontmatter) && !parts.frontmatter.includes(MANAGED_BLOCK_START)) {
    throw new DiscourseFrontmatterError('Existing publish frontmatter is not managed by Foliole.');
  }
  const managed = readManagedBlock(parts.frontmatter);
  if (!managed) return null;
  const site = parseStringField(managed.block, 'site');
  const topicId = parseNumberField(managed.block, 'topicId');
  const postId = parseNumberField(managed.block, 'postId');
  const url = parseStringField(managed.block, 'url');
  const lastPublishedAt = parseStringField(managed.block, 'lastPublishedAt');
  if (!site || !topicId || !postId || !url || !lastPublishedAt) {
    throw new DiscourseFrontmatterError('Discourse publish binding is incomplete.');
  }
  return {
    categoryId: parseNumberField(managed.block, 'categoryId'),
    lastPublishedAt,
    postId,
    site,
    tags: parseTags(managed.block),
    topicId,
    url
  };
}

export function readDiscoursePublishMarkdown(content: string) {
  return splitFrontmatter(content).body;
}

function serializeBinding(binding: DiscourseTopicBinding) {
  const tags = binding.tags.map((tag) => `      - ${tag}`).join('\n');
  return [
    MANAGED_BLOCK_START,
    'publish:',
    '  discourse:',
    `    site: ${binding.site}`,
    `    topicId: ${binding.topicId}`,
    `    postId: ${binding.postId}`,
    `    url: ${binding.url}`,
    `    categoryId: ${binding.categoryId ?? ''}`,
    '    tags:',
    tags,
    `    lastPublishedAt: ${binding.lastPublishedAt}`,
    MANAGED_BLOCK_END
  ].filter((line) => line !== '').join('\n');
}

function trimTrailingBlankLines(value: string) {
  return value.replace(/(?:\r?\n)+$/g, '');
}

export function writeDiscourseTopicBinding(content: string, binding: DiscourseTopicBinding) {
  const parts = splitFrontmatter(content);
  const block = serializeBinding(binding);
  if (!parts.frontmatter) {
    return `---\n${block}\n---\n${parts.body}`;
  }
  const managed = readManagedBlock(parts.frontmatter);
  const frontmatter = managed
    ? `${parts.frontmatter.slice(0, managed.start)}${block}${parts.frontmatter.slice(managed.end)}`
    : `${trimTrailingBlankLines(parts.frontmatter)}\n${block}`;
  return `---\n${trimTrailingBlankLines(frontmatter)}\n---\n${parts.body}`;
}

export function resolveDiscoursePublishMode(content: string): DiscoursePublishMode {
  return readDiscourseTopicBinding(content) ? 'update' : 'create';
}
