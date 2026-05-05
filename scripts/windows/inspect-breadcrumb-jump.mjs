import process from 'node:process';

import { launchDesktopSession } from './playwright-desktop-harness.mjs';

function resolveArgs(argv) {
  const [childTitle, parentTitle] = argv.slice(2).map((value) => value.trim());
  if (!childTitle || !parentTitle) {
    throw new Error('usage: node scripts/windows/inspect-breadcrumb-jump.mjs <childTitle> <parentTitle>');
  }
  return { childTitle, parentTitle };
}

async function collectWindowSnapshot(page, titles) {
  return page.evaluate(async ({ childTitle, parentTitle }) => {
    const ws = globalThis.window?.__folioleWorkspaceDebug;
    const dbg = globalThis.window?.__folioleDebug;
    const child = ws?.listNodes?.().find((node) => String(node.title ?? '').trim() === childTitle) ?? null;
    const parent = ws?.listNodes?.().find((node) => String(node.title ?? '').trim() === parentTitle) ?? null;

    return {
      activeNodeId: ws?.getActiveNodeId?.() ?? null,
      activeTitle:
        (document.querySelector('[aria-label="Node breadcrumbs"]')?.lastElementChild?.textContent ?? '').trim() || null,
      child,
      childFound: Boolean(child),
      childView: child ? ws?.getNodeViewState?.(child.id) ?? null : null,
      listTitles: Array.from(document.querySelectorAll('[role="treeitem"]'))
        .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 120),
      parent,
      parentFound: Boolean(parent),
      parentView: parent ? ws?.getNodeViewState?.(parent.id) ?? null : null,
      selectedText:
        (() => {
          const selection = dbg?.getEditorSelection?.('prompt-editor') ?? null;
          const content = dbg?.getEditorContent?.('prompt-editor') ?? '';
          return selection && typeof selection.from === 'number' && typeof selection.to === 'number'
            ? content.slice(selection.from, selection.to)
            : null;
        })(),
      selection: dbg?.getEditorSelection?.('prompt-editor') ?? null,
      visibleBreadcrumbs: Array.from(document.querySelectorAll('[aria-label="Node breadcrumbs"] button'))
        .map((button) => (button.textContent ?? '').trim())
        .filter(Boolean),
      visibleTitles: ws?.listNodes?.().slice(0, 120) ?? []
    };
  }, titles);
}

async function collectJumpSnapshot(page, titles) {
  const initial = await collectWindowSnapshot(page, titles);
  const childTreeItem = page.getByRole('treeitem', { name: titles.childTitle, exact: true }).first();
  await childTreeItem.scrollIntoViewIfNeeded();
  await childTreeItem.click();
  await page.waitForTimeout(1200);

  const before = await collectWindowSnapshot(page, titles);
  const breadcrumb = page.getByRole('navigation', { name: 'Node breadcrumbs' }).getByRole('button', { name: titles.parentTitle, exact: true });
  await breadcrumb.click();
  await page.waitForTimeout(1800);

  const after = await collectWindowSnapshot(page, titles);
  return {
    after,
    before,
    initial,
    titles
  };
}

const titles = resolveArgs(process.argv);
const session = await launchDesktopSession();

try {
  const snapshot = await collectJumpSnapshot(session.firstWindow, titles);
  console.log(JSON.stringify(snapshot, null, 2));
} finally {
  await session.close();
}
