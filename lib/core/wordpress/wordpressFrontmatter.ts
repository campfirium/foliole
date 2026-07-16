export type WordPressPublishAdapter = 'core_rest' | 'wordpress_com_xmlrpc';

export interface WordPressPostBinding {
  adapter: WordPressPublishAdapter;
  lastPublishedAt: string;
  postId: string;
  site: string;
  url: string;
}

export class WordPressFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordPressFrontmatterError';
  }
}

const MANAGED_BLOCK_START = '# foliole:wordpress-publish';
const MANAGED_BLOCK_END = '# /foliole:wordpress-publish';

function splitFrontmatter(content: string) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { body: content, frontmatter: null as string | null };
  }
  const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const endMarker = `${newline}---${newline}`;
  const endIndex = content.indexOf(endMarker, 3);
  if (endIndex < 0) throw new WordPressFrontmatterError('Topic frontmatter is not closed.');
  return { body: content.slice(endIndex + endMarker.length), frontmatter: content.slice(4, endIndex) };
}

function readManagedBlock(frontmatter: string) {
  const start = frontmatter.indexOf(MANAGED_BLOCK_START);
  const end = frontmatter.indexOf(MANAGED_BLOCK_END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start) throw new WordPressFrontmatterError('WordPress publish frontmatter markers are malformed.');
  const blockEnd = end + MANAGED_BLOCK_END.length;
  return { block: frontmatter.slice(start, blockEnd), end: blockEnd, start };
}

function parseField(block: string, key: string) {
  return block.match(new RegExp(`^\\s{2}${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

export function readWordPressPostBinding(content: string): WordPressPostBinding | null {
  const frontmatter = splitFrontmatter(content).frontmatter;
  if (!frontmatter) return null;
  const managed = readManagedBlock(frontmatter);
  if (!managed) return null;
  if (!/^wordpressPublish:\s*$/m.test(managed.block)) {
    throw new WordPressFrontmatterError('WordPress publish frontmatter has an invalid top-level key.');
  }
  const adapter = parseField(managed.block, 'adapter');
  const site = parseField(managed.block, 'site');
  const postId = parseField(managed.block, 'postId');
  const url = parseField(managed.block, 'url');
  const lastPublishedAt = parseField(managed.block, 'lastPublishedAt');
  if ((adapter !== 'core_rest' && adapter !== 'wordpress_com_xmlrpc') || !site || !postId || !url || !lastPublishedAt) {
    throw new WordPressFrontmatterError('WordPress publish binding is incomplete.');
  }
  return { adapter, lastPublishedAt, postId, site, url };
}

function serializeBinding(binding: WordPressPostBinding) {
  return [
    MANAGED_BLOCK_START,
    'wordpressPublish:',
    `  site: ${binding.site}`,
    `  adapter: ${binding.adapter}`,
    `  postId: ${binding.postId}`,
    `  url: ${binding.url}`,
    `  lastPublishedAt: ${binding.lastPublishedAt}`,
    MANAGED_BLOCK_END
  ].join('\n');
}

function trimTrailingBlankLines(value: string) {
  return value.replace(/(?:\r?\n)+$/gu, '');
}

export function writeWordPressPostBinding(content: string, binding: WordPressPostBinding) {
  const parts = splitFrontmatter(content);
  const block = serializeBinding(binding);
  if (!parts.frontmatter) return `---\n${block}\n---\n${parts.body}`;
  const managed = readManagedBlock(parts.frontmatter);
  const frontmatter = managed
    ? `${parts.frontmatter.slice(0, managed.start)}${block}${parts.frontmatter.slice(managed.end)}`
    : `${trimTrailingBlankLines(parts.frontmatter)}\n${block}`;
  return `---\n${trimTrailingBlankLines(frontmatter)}\n---\n${parts.body}`;
}

export function readWordPressPublishMarkdown(content: string) {
  const body = splitFrontmatter(content).body;
  const openingTitle = /^(?:[ \t]*\r?\n)*[ \t]{0,3}#(?!#)[ \t]+[^\r\n]*(?:\r?\n)?(?:[ \t]*\r?\n)?/u.exec(body);
  return openingTitle ? body.slice(openingTitle[0].length) : body;
}

export function extractWordPressPublishTitle(content: string, fallback: string) {
  const body = splitFrontmatter(content).body;
  const title = /^(?:[ \t]*\r?\n)*[ \t]{0,3}#(?!#)[ \t]+([^\r\n]+)/u.exec(body)?.[1]?.trim();
  return title || fallback.trim() || 'Untitled';
}
