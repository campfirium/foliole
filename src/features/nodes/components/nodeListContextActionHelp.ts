export interface NodeListActionHelpCopy {
  detail?: string;
  id: `actionHelp.nodeList.${string}`;
  title: string;
  body: string;
  keywords?: string[];
  sourceLabel: string;
}

export const NODE_LIST_CONTEXT_ACTION_HELP = {
  dismiss: {
    body: 'No longer appears automatically.',
    detail: 'The topic is kept in Foliole and can still be opened manually.',
    id: 'actionHelp.nodeList.dismiss',
    keywords: ['automatic', 'hide', 'stop'],
    sourceLabel: 'Topic list menu',
    title: 'Dismiss'
  },
  dismissTopic: {
    body: 'No longer appears automatically.',
    detail: 'The topic is kept in Foliole and can still be opened manually.',
    id: 'actionHelp.nodeList.dismissTopic',
    keywords: ['automatic', 'entire', 'stop'],
    sourceLabel: 'Topic list menu',
    title: 'Dismiss topic'
  },
  mergeHighlights: {
    body: 'Merge highlights from a highlight file into this topic.',
    detail: 'New highlights are added as derived topics; existing highlights are kept.',
    id: 'actionHelp.nodeList.mergeHighlights',
    keywords: ['highlight', 'readwise', 'file'],
    sourceLabel: 'Topic list menu',
    title: 'Merge highlights'
  },
  pasteClipboardTopic: {
    body: 'Create a new topic from clipboard content.',
    detail: 'The new topic is created in the same place as Create Topic.',
    id: 'actionHelp.nodeList.pasteClipboardTopic',
    keywords: ['clipboard', 'create', 'paste'],
    sourceLabel: 'Topic list menu',
    title: 'Paste as Topic'
  },
  postponeTopic: {
    body: 'Show this topic on a later due date.',
    detail: 'Choose how many weeks to wait before it is due again.',
    id: 'actionHelp.nodeList.postponeTopic',
    keywords: ['delay', 'due', 'later'],
    sourceLabel: 'Topic list menu',
    title: 'Postpone topic'
  },
  relearn: {
    body: "Clear this topic's learning progress.",
    detail: 'It can be studied again from the beginning.',
    id: 'actionHelp.nodeList.relearn',
    keywords: ['again', 'reset', 'review', 'study'],
    sourceLabel: 'Topic list menu',
    title: 'Relearn'
  },
  sequentialReadingDisable: {
    body: 'Stop showing related topics in order.',
    detail: 'Locked topics become directly readable again.',
    id: 'actionHelp.nodeList.sequentialReadingDisable',
    keywords: ['book', 'order', 'sequence'],
    sourceLabel: 'Topic list menu',
    title: 'Disable sequential reading'
  },
  sequentialReadingEnable: {
    body: 'Show contained topics one at a time, in order.',
    detail: 'The next topic appears after the previous one is dismissed or shelved.',
    id: 'actionHelp.nodeList.sequentialReadingEnable',
    keywords: ['book', 'order', 'sequence'],
    sourceLabel: 'Topic list menu',
    title: 'Enable sequential reading'
  },
  shelveTopic: {
    body: 'Set this topic and its derived topics aside.',
    detail: 'Their current reading states are kept.',
    id: 'actionHelp.nodeList.shelveTopic',
    keywords: ['aside', 'shelve', 'state'],
    sourceLabel: 'Topic list menu',
    title: 'Shelve entire topic'
  },
  unshelveTopic: {
    body: 'Stop shelving this topic.',
    detail: 'Its derived topics keep their current reading states.',
    id: 'actionHelp.nodeList.unshelveTopic',
    keywords: ['shelve', 'state'],
    sourceLabel: 'Topic list menu',
    title: 'Unshelve'
  }
} as const satisfies Record<string, NodeListActionHelpCopy>;

export function resolveNodeListActionHelp(copy: NodeListActionHelpCopy) {
  return copy;
}
