import type { Node } from './nodeTypes';
import { compareWorkspaceListNodeDateDesc, getWorkspaceListNodeAuthor } from './workspaceListNode';

export type FolderListSortKey = 'date' | 'title' | 'author';

export const DEFAULT_FOLDER_LIST_SORT_KEY: FolderListSortKey = 'date';

function normalizeSortText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
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

export function sortFolderListNodes(nodes: Node[], sortKey: FolderListSortKey) {
  return nodes
    .map((node, index) => ({
      author: getWorkspaceListNodeAuthor(node),
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
        const dateResult = compareWorkspaceListNodeDateDesc(left.node, right.node);
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

      const dateResult = compareWorkspaceListNodeDateDesc(left.node, right.node);
      if (dateResult !== 0) {
        return dateResult;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.node);
}
