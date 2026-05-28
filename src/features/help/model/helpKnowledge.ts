import { REVIEW_ACTION_HELP, type ReviewActionHelpCopy } from '../../../shared/ui/reviewActionHelp';
import { NODE_LIST_CONTEXT_ACTION_HELP, type NodeListActionHelpCopy } from '../../nodes/components/nodeListContextActionHelp';

export type HelpKnowledgeKind = 'action';
type HelpKnowledgeCopy = NodeListActionHelpCopy | ReviewActionHelpCopy;

export interface HelpKnowledgeItem {
  body: string;
  detail?: string;
  id: HelpKnowledgeCopy['id'];
  keywords: string[];
  kind: HelpKnowledgeKind;
  sourceLabel: string;
  title: string;
}

function toHelpKnowledgeItem(item: HelpKnowledgeCopy): HelpKnowledgeItem {
  return {
    body: item.body,
    ...(item.detail ? { detail: item.detail } : {}),
    id: item.id,
    keywords: item.keywords ?? [],
    kind: 'action',
    sourceLabel: item.sourceLabel,
    title: item.title
  };
}

export const HELP_KNOWLEDGE_ITEMS = [
  ...Object.values(REVIEW_ACTION_HELP),
  ...Object.values(NODE_LIST_CONTEXT_ACTION_HELP)
].map(toHelpKnowledgeItem);

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
