import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { launchDesktopSession } from './playwright-desktop-harness.mjs';

export function resolveTitle(argv) {
  const title = argv.slice(2).map((value) => value.trim()).find(Boolean);
  if (!title) {
    throw new Error('node title is required');
  }
  return title;
}

export async function main() {
  const title = resolveTitle(process.argv);
  const session = await launchDesktopSession();
  const consoleRef = globalThis.console;

  try {
    const snapshot = await session.firstWindow.evaluate(async (targetTitle) => {
      const api = globalThis.window?.__folioleWorkspaceDebug;
      const targetNode = api?.listNodes?.().find((node) => String(node.title ?? '').trim() === targetTitle) ?? null;
      const opened = targetNode ? await (api?.openNode?.(targetNode.id) ?? Promise.resolve(false)) : false;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1200));
      const activeNodeId = api?.getActiveNodeId?.() ?? null;

      return {
        activeNodeId,
        activeNodeView: activeNodeId ? api?.getNodeViewState?.(activeNodeId) ?? null : null,
        opened,
        targetNodeId: targetNode?.id ?? null,
        targetNodeView: targetNode ? api?.getNodeViewState?.(targetNode.id) ?? null : null,
        title: targetTitle
      };
    }, title);

    consoleRef.log(JSON.stringify(snapshot, null, 2));
  } finally {
    await session.close();
  }
}

const directExecutionArg = process.argv[1];
if (directExecutionArg && import.meta.url === pathToFileURL(directExecutionArg).href) {
  await main();
}
