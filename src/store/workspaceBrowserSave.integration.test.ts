// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

type Tab = {
  store: (typeof import('./workspaceStore'))['useWorkspaceStore'];
  browser: typeof import('./installBrowserWorkspace');
  commit: typeof import('./workspaceBrowserCommit');
  flow: typeof import('../shared/platform/runtime/dailyFlowBrowserRuntime');
  key: string;
};
const tabs: Tab[] = [];

async function openTab(initial = false): Promise<Tab> {
  vi.resetModules();
  const workspace = await import('./workspaceStore');
  const browser = await import('./installBrowserWorkspace');
  const commit = await import('./workspaceBrowserCommit');
  const flow = await import('../shared/platform/runtime/dailyFlowBrowserRuntime');
  const tab = { store: workspace.useWorkspaceStore, browser, commit, flow,
    key: workspace.WORKSPACE_STORAGE_KEY };
  tabs.push(tab);
  if (initial) {
    commit.installWorkspaceBrowserCommit({ save() {} });
    tab.store.setState(workspace.createInitialWorkspaceState(new Date('2026-10-28T08:00:00Z')));
    localStorage.clear();
    commit.installWorkspaceBrowserCommit(null);
    browser.installBrowserWorkspace(tab.store, localStorage, tab.store.getState());
    browser.installBrowserWorkspace(tab.store, localStorage);
  } else {
    browser.installBrowserWorkspace(tab.store, localStorage);
  }
  return tab;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const tab of tabs.splice(0)) {
    tab.commit.installWorkspaceBrowserCommit(null);
    tab.flow.installBrowserDailyFlowRuntime(null);
  }
  localStorage.clear();
  vi.resetModules();
});

it('checks the stored envelope once without hashing an identical save candidate again', async () => {
  const { store, key } = await openTab(true);
  const raw = localStorage.getItem(key)!;
  const bytes = new TextEncoder().encode(raw).byteLength;
  const encode = vi.spyOn(TextEncoder.prototype, 'encode');
  const write = vi.spyOn(Storage.prototype, 'setItem');
  store.getState().setActiveNode(store.getState().activeNodeId);
  expect(localStorage.getItem(key)).toBe(raw);
  expect(write).not.toHaveBeenCalled();
  expect(encode.mock.results.reduce((sum, result) => sum + result.value.byteLength, 0)).toBe(bytes);
});

it('rejects a stale tab even for an unchanged candidate, then reloads and saves independently', async () => {
  const first = await openTab(true);
  const second = await openTab();
  const stale = second.store.getState();
  first.store.getState().setListWidth(333);
  const firstRaw = localStorage.getItem(first.key)!;
  expect(() => second.store.getState().setActiveNode(stale.activeNodeId)).toThrow('browser_workspace_changed');
  expect(second.store.getState()).toBe(stale);
  expect(localStorage.getItem(first.key)).toBe(firstRaw);
  second.browser.installBrowserWorkspace(second.store, localStorage);
  expect(second.store.getState().layout.listWidth).toBe(333);
  second.store.getState().setListWidth(444);
  expect(JSON.parse(localStorage.getItem(second.key)!).state.layout.listWidth).toBe(444);
  expect(first.store.getState().layout.listWidth).toBe(333);
  expect(() => first.store.getState().setActiveNode(first.store.getState().activeNodeId)).toThrow('browser_workspace_changed');
  first.browser.installBrowserWorkspace(first.store, localStorage);
  expect(first.store.getState().layout.listWidth).toBe(444);
});

it('keeps its saved baseline on write failure so a retry can persist and reload', async () => {
  const { store, browser, key } = await openTab(true);
  const before = store.getState();
  const raw = localStorage.getItem(key);
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
  expect(() => store.setState({ layout: { ...before.layout, listWidth: 333 } })).toThrow('disk full');
  expect(store.getState()).toBe(before);
  expect(localStorage.getItem(key)).toBe(raw);
  write.mockRestore();
  store.setState({ layout: { ...before.layout, listWidth: 333 } });
  browser.installBrowserWorkspace(store, localStorage);
  expect(store.getState().layout.listWidth).toBe(333);
});
