interface NodeListMenuHelpCopy {
  detail?: string;
  id: `menuHelp.nodeList.${string}`;
  title: string;
  body: string;
}

export const NODE_LIST_CONTEXT_MENU_HELP = {
  relearn: {
    body: 'Reset this topic’s review progress and send it back into the review queue.',
    detail: 'Use this when the topic should be studied again from the beginning.',
    id: 'menuHelp.nodeList.relearn',
    title: 'Relearn'
  }
} as const satisfies Record<string, NodeListMenuHelpCopy>;

export function resolveNodeListMenuHelp(copy: NodeListMenuHelpCopy) {
  return copy;
}
