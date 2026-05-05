import type { Node } from './nodeTypes';
import { compareWorkspaceListNodeDateDesc } from './workspaceListNode';
import { compareWorkspaceListNodeAuthor } from './workspaceListNodeMetadata';

export type FolderListSortKey = 'date' | 'title' | 'author';

export const DEFAULT_FOLDER_LIST_SORT_KEY: FolderListSortKey = 'date';

function normalizeSortText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortFolderListNodes(nodes: Node[], sortKey: FolderListSortKey) {
  return nodes
    .map((node, index) => ({
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
        const authorResult = compareWorkspaceListNodeAuthor(left.node, right.node);
        if (authorResult !== 0) {
          return authorResult;
        }
      }

      if (sortKey === 'author') {
        const authorResult = compareWorkspaceListNodeAuthor(left.node, right.node);
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
        const authorResult = compareWorkspaceListNodeAuthor(left.node, right.node);
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
