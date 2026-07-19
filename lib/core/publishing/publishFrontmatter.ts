import { isMap, isNode, isScalar, parseDocument, stringify, type Pair, type YAMLMap } from 'yaml';

export const PUBLISH_SCHEMA_VERSION = 1;

type ErrorFactory = (message: string) => Error;

export interface MarkdownFrontmatterParts {
  body: string;
  closingNewline: string;
  frontmatter: string | null;
  newline: string;
}

function findClosingDelimiter(content: string, newline: string, from: number) {
  const marker = `${newline}---`;
  let index = content.indexOf(marker, from);
  while (index >= 0) {
    const after = index + marker.length;
    if (after === content.length || content.startsWith(newline, after)) return index;
    index = content.indexOf(marker, index + marker.length);
  }
  return -1;
}

export function splitMarkdownFrontmatter(content: string, createError: ErrorFactory): MarkdownFrontmatterParts {
  const opening = /^---(\r?\n)/u.exec(content);
  if (!opening) return { body: content, closingNewline: '\n', frontmatter: null, newline: '\n' };
  const newline = opening[1]!;
  const endIndex = findClosingDelimiter(content, newline, opening[0].length);
  if (endIndex < 0) throw createError('Topic frontmatter is not closed.');
  const closingEnd = endIndex + newline.length + 3;
  const closingNewline = content.startsWith(newline, closingEnd) ? newline : '';
  return {
    body: content.slice(closingEnd + closingNewline.length),
    closingNewline,
    frontmatter: content.slice(opening[0].length, endIndex),
    newline
  };
}

export function joinMarkdownFrontmatter(parts: MarkdownFrontmatterParts, frontmatter: string) {
  return `---${parts.newline}${frontmatter}${parts.newline}---${parts.closingNewline}${parts.body}`;
}

function parseRoot(frontmatter: string, createError: ErrorFactory) {
  const document = parseDocument(frontmatter, {
    keepSourceTokens: true,
    logLevel: 'silent',
    strict: true,
    uniqueKeys: true
  });
  if (document.errors.length > 0) throw createError('Topic frontmatter is not valid YAML.');
  if (document.contents === null) return { document, root: null };
  if (!isMap(document.contents)) throw createError('Topic frontmatter must be a YAML mapping.');
  return { document, root: document.contents };
}

function getMapValue(map: YAMLMap, key: string, createError: ErrorFactory) {
  const value = map.get(key, true);
  if (value === undefined) return null;
  if (!isMap(value)) throw createError(`Foliole ${key} frontmatter must be a YAML mapping.`);
  return value;
}

function validatePublishVersion(publish: YAMLMap, createError: ErrorFactory) {
  const version = publish.get('schemaVersion', true);
  if (!isScalar(version) || version.value !== PUBLISH_SCHEMA_VERSION) {
    throw createError('Foliole publish frontmatter uses an unsupported schema version.');
  }
}

function findPair(map: YAMLMap, key: string) {
  return map.items.find((pair) => isScalar(pair.key) && pair.key.value === key) ?? null;
}

function pairRange(pair: Pair, createError: ErrorFactory) {
  if (!isScalar(pair.key) || !pair.key.range || !isNode(pair.value) || !pair.value.range) {
    throw createError('Foliole publish frontmatter cannot be safely updated.');
  }
  return [pair.key.range[0], pair.value.range[2]] as const;
}

function insertIntoBlockMap(
  frontmatter: string,
  map: YAMLMap,
  source: string,
  newline: string,
  createError: ErrorFactory
) {
  if (map.flow || map.srcToken?.type !== 'block-map' || !map.range) {
    throw createError('Foliole publish frontmatter must use block mapping style.');
  }
  const offset = map.range[2];
  const prefix = frontmatter.slice(0, offset);
  const separator = prefix.endsWith(newline) ? '' : newline;
  return `${prefix}${separator}${source}${newline}${frontmatter.slice(offset)}`;
}

export function readPublishProviderRecord(
  content: string,
  provider: string,
  createError: ErrorFactory
): Record<string, unknown> | null {
  const parts = splitMarkdownFrontmatter(content, createError);
  if (parts.frontmatter === null) return null;
  const { root } = parseRoot(parts.frontmatter, createError);
  if (!root) return null;
  const foliole = getMapValue(root, 'foliole', createError);
  if (!foliole) return null;
  const publish = getMapValue(foliole, 'publish', createError);
  if (!publish) return null;
  validatePublishVersion(publish, createError);
  const value = publish.get(provider, true);
  if (value === undefined) return null;
  if (!isMap(value)) throw createError(`Foliole ${provider} publish binding must be a YAML mapping.`);
  return value.toJSON() as Record<string, unknown>;
}

export function writePublishProviderRecord(
  content: string,
  provider: string,
  serializedPair: string,
  createError: ErrorFactory
) {
  const parts = splitMarkdownFrontmatter(content, createError);
  const pairSource = serializedPair.replace(/\r?\n/gu, parts.newline);
  if (parts.frontmatter === null) {
    const block = `foliole:${parts.newline}  publish:${parts.newline}    schemaVersion: ${PUBLISH_SCHEMA_VERSION}${parts.newline}${pairSource}`;
    return joinMarkdownFrontmatter({ ...parts, closingNewline: parts.newline }, block);
  }
  const parsed = parseRoot(parts.frontmatter, createError);
  const root = parsed.root;
  if (!root) {
    const block = `foliole:${parts.newline}  publish:${parts.newline}    schemaVersion: ${PUBLISH_SCHEMA_VERSION}${parts.newline}${pairSource}`;
    return joinMarkdownFrontmatter(parts, block);
  }
  const foliole = getMapValue(root, 'foliole', createError);
  if (!foliole) {
    const separator = parts.frontmatter.endsWith(parts.newline) ? '' : parts.newline;
    const block = `foliole:${parts.newline}  publish:${parts.newline}    schemaVersion: ${PUBLISH_SCHEMA_VERSION}${parts.newline}${pairSource}`;
    return joinMarkdownFrontmatter(parts, `${parts.frontmatter}${separator}${block}`);
  }
  const publish = getMapValue(foliole, 'publish', createError);
  if (!publish) {
    const source = `  publish:${parts.newline}    schemaVersion: ${PUBLISH_SCHEMA_VERSION}${parts.newline}${pairSource}`;
    return joinMarkdownFrontmatter(parts, insertIntoBlockMap(parts.frontmatter, foliole, source, parts.newline, createError));
  }
  validatePublishVersion(publish, createError);
  const existing = findPair(publish, provider);
  const updated = existing
    ? replacePair(parts.frontmatter, existing, pairSource, parts.newline, createError)
    : insertIntoBlockMap(parts.frontmatter, publish, pairSource, parts.newline, createError);
  return joinMarkdownFrontmatter(parts, updated);
}

function replacePair(
  frontmatter: string,
  pair: Pair,
  source: string,
  newline: string,
  createError: ErrorFactory
) {
  const [keyStart, end] = pairRange(pair, createError);
  const start = frontmatter.lastIndexOf('\n', keyStart - 1) + 1;
  if (!/^\s*$/u.test(frontmatter.slice(start, keyStart))) {
    throw createError('Foliole publish frontmatter cannot be safely updated.');
  }
  const replaced = frontmatter.slice(start, end);
  const suffix = replaced.endsWith(newline) ? newline : '';
  return `${frontmatter.slice(0, start)}${source}${suffix}${frontmatter.slice(end)}`;
}

export function serializeYamlString(value: string, quoted = false) {
  if (!quoted) return stringify(value).trimEnd();
  return JSON.stringify(value);
}
