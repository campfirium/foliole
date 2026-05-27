import { NODE_LIST_CONTEXT_MENU_HELP, type NodeListMenuHelpCopy } from '../../nodes/components/nodeListContextMenuHelp';

export type HelpKnowledgeKind = 'menu';

export interface HelpKnowledgeItem {
  body: string;
  detail?: string;
  id: NodeListMenuHelpCopy['id'];
  keywords: string[];
  kind: HelpKnowledgeKind;
  sourceLabel: string;
  title: string;
}

function toHelpKnowledgeItem(item: NodeListMenuHelpCopy): HelpKnowledgeItem {
  return {
    body: item.body,
    ...(item.detail ? { detail: item.detail } : {}),
    id: item.id,
    keywords: item.keywords ?? [],
    kind: 'menu',
    sourceLabel: item.sourceLabel,
    title: item.title
  };
}

export const HELP_KNOWLEDGE_ITEMS = Object.values(NODE_LIST_CONTEXT_MENU_HELP).map(toHelpKnowledgeItem);

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function searchableText(item: HelpKnowledgeItem) {
  return [
    item.title,
    item.body,
    item.sourceLabel,
    item.detail ?? '',
    ...item.keywords
  ].join(' ').toLowerCase();
}

export function queryHelpKnowledge(query: string, items: readonly HelpKnowledgeItem[] = HELP_KNOWLEDGE_ITEMS) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return [...items];
  }
  return items.filter((item) => searchableText(item).includes(normalizedQuery));
}

export function getHelpKnowledgeItem(id: HelpKnowledgeItem['id']): HelpKnowledgeItem | undefined {
  return HELP_KNOWLEDGE_ITEMS.find((item) => item.id === id);
}
