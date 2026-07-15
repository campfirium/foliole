export class TopicCollectionsFrontmatterError extends Error {
  constructor() {
    super('invalid_collections_frontmatter');
  }
}

interface FrontmatterRange {
  close: number;
  lines: string[];
  newline: '\n' | '\r\n';
  open: number;
}

export function readTopicCollections(content: string): string[] {
  const range = readFrontmatterRange(content);
  if (!range) return [];
  const block = findCollectionsBlock(range);
  if (!block) return [];
  return unique(block.items.map(parseScalar));
}

export function addTopicCollection(content: string, name: string): string {
  const normalized = normalizeName(name);
  const current = readTopicCollections(content);
  return current.includes(normalized) ? content : writeCollections(content, [...current, normalized]);
}

export function removeTopicCollection(content: string, name: string): string {
  const normalized = normalizeName(name);
  const current = readTopicCollections(content);
  if (!current.includes(normalized)) return content;
  return writeCollections(content, current.filter((value) => value !== normalized));
}

export function replaceTopicCollection(content: string, oldName: string, newName: string): string {
  const oldValue = normalizeName(oldName);
  const newValue = normalizeName(newName);
  const current = readTopicCollections(content);
  if (!current.includes(oldValue)) return content;
  return writeCollections(content, unique(current.map((value) => value === oldValue ? newValue : value)));
}

function writeCollections(content: string, values: string[]) {
  const range = readFrontmatterRange(content);
  if (!range) return createFrontmatter(content, values);
  const block = findCollectionsBlock(range);
  const replacement = values.length > 0 ? ['collections:', ...values.map((value) => `  - ${JSON.stringify(value)}`)] : [];
  const lines = [...range.lines];
  if (block) lines.splice(block.start, block.end - block.start, ...replacement);
  else if (replacement.length > 0) lines.splice(range.close, 0, ...replacement);
  return lines.join(range.newline);
}

function createFrontmatter(content: string, values: string[]) {
  if (values.length === 0) return content;
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  return ['---', 'collections:', ...values.map((value) => `  - ${JSON.stringify(value)}`), '---', content].join(newline);
}

function readFrontmatterRange(content: string): FrontmatterRange | null {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const close = lines.slice(1).findIndex((line) => line === '---') + 1;
  if (close === 0) throw new TopicCollectionsFrontmatterError();
  return { close, lines, newline, open: 0 };
}

function findCollectionsBlock(range: FrontmatterRange) {
  let found: { end: number; items: string[]; start: number } | null = null;
  for (let index = range.open + 1; index < range.close; index += 1) {
    const line = range.lines[index]!;
    if (!/^collections\s*:/.test(line)) continue;
    if (found || !/^collections\s*:\s*$/.test(line)) throw new TopicCollectionsFrontmatterError();
    const items: string[] = [];
    let end = index + 1;
    while (end < range.close && /^\s/.test(range.lines[end]!)) {
      const item = range.lines[end]!.match(/^\s{2,}-\s+(.+)$/);
      if (!item) throw new TopicCollectionsFrontmatterError();
      items.push(item[1]!);
      end += 1;
    }
    found = { end, items, start: index };
  }
  return found;
}

function parseScalar(value: string) {
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'string') return normalizeName(parsed);
    } catch {
      throw new TopicCollectionsFrontmatterError();
    }
    throw new TopicCollectionsFrontmatterError();
  }
  if (value.startsWith("'") && value.endsWith("'")) return normalizeName(value.slice(1, -1).replace(/''/g, "'"));
  if (/[:#[\]{},&*!|>@`]/.test(value) || /^[-?]/.test(value) || /^(?:null|true|false|[-+]?\d+(?:\.\d+)?)$/i.test(value)) {
    throw new TopicCollectionsFrontmatterError();
  }
  return normalizeName(value);
}

function normalizeName(value: string) {
  const normalized = value.trim();
  if (!normalized || /[\r\n]/.test(normalized)) throw new TopicCollectionsFrontmatterError();
  return normalized;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
