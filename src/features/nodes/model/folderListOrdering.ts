import type { Node } from './nodeTypes';

export type FolderListSortKey = 'date' | 'title' | 'author';

export const DEFAULT_FOLDER_LIST_SORT_KEY: FolderListSortKey = 'date';

const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const FRONTMATTER_KEY_VALUE_PATTERN = /^([^:#\s][^:]*?)(\s*:\s*)(.*)$/;
const FRONTMATTER_LIST_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;

function normalizeFrontmatterValue(value: string) {
  return value.replace(WIKILINK_WRAPPER_PATTERN, '$1').trim();
}

function getFrontmatterLines(content: string) {
  const lines = content.split('\n');
  if (lines.length < 3 || !FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return [];
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return lines.slice(1, index);
    }
  }

  return [];
}

function getFrontmatterEntryValues(content: string, targetKey: string) {
  const lines = getFrontmatterLines(content);
  const values: string[] = [];
  let currentKey = '';

  for (const line of lines) {
    const keyMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);
    if (keyMatch) {
      currentKey = keyMatch[1]?.trim().toLocaleLowerCase() ?? '';
      if (currentKey !== targetKey) {
        continue;
      }

      const value = normalizeFrontmatterValue(keyMatch[3] ?? '');
      if (value) {
        values.push(value);
      }
      continue;
    }

    const listMatch = line.match(FRONTMATTER_LIST_ITEM_PATTERN);
    if (!listMatch || currentKey !== targetKey) {
      continue;
    }

    const value = normalizeFrontmatterValue(listMatch[2] ?? '');
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function normalizeSortText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareDateDesc(left: string, right: string) {
  return right.localeCompare(left);
}

function compareOptionalText(left: string | null, right: string | null) {
  const hasLeft = Boolean(left);
  const hasRight = Boolean(right);
  if (!hasLeft && !hasRight) {
    return 0;
  }
  if (!hasLeft) {
    return 1;
  }
  if (!hasRight) {
    return -1;
  }
  return compareText(left!, right!);
}

export function getFolderListNodeAuthor(node: Pick<Node, 'content'>) {
  const authorValues = getFrontmatterEntryValues(node.content, 'author').map(normalizeSortText).filter(Boolean);
  if (authorValues.length === 0) {
    return null;
  }
  return authorValues.join(', ');
}

export function sortFolderListNodes(nodes: Node[], sortKey: FolderListSortKey) {
  return nodes
    .map((node, index) => ({
      author: getFolderListNodeAuthor(node),
      index,
      node,
      title: normalizeSortText(node.title)
    }))
    .sort((left, right) => {
      if (sortKey === 'title') {
        const titleResult = compareText(left.title, right.title);
        if (titleResult !== 0) {
          return titleResult;
        }
        const authorResult = compareOptionalText(left.author, right.author);
        if (authorResult !== 0) {
          return authorResult;
        }
      }

      if (sortKey === 'author') {
        const authorResult = compareOptionalText(left.author, right.author);
        if (authorResult !== 0) {
          return authorResult;
        }
        const titleResult = compareText(left.title, right.title);
        if (titleResult !== 0) {
          return titleResult;
        }
      }

      if (sortKey === 'date') {
        const dateResult = compareDateDesc(left.node.updatedAt, right.node.updatedAt);
        if (dateResult !== 0) {
          return dateResult;
        }
        const titleResult = compareText(left.title, right.title);
        if (titleResult !== 0) {
          return titleResult;
        }
        const authorResult = compareOptionalText(left.author, right.author);
        if (authorResult !== 0) {
          return authorResult;
        }
      }

      const dateResult = compareDateDesc(left.node.updatedAt, right.node.updatedAt);
      if (dateResult !== 0) {
        return dateResult;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.node);
}
