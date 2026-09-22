import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshotContract';
import { parseMobileNodeLink, type MobileNodeLocator } from '../../../../../lib/platform/mobileNodeLinkContract';
import { resolveCompanionFolderViewByNodeId } from '../../companionBrowseLists';
import { resolveReadableCompanionArticleByNodeId } from '../../companionReadableArticle';

export type MobileNodeLinkResult = 'opened' | 'invalid_link' | 'wrong_library' | 'unavailable' | 'missing';
export interface MobileNodeLinkContext { ready: boolean; snapshot: WorkspaceSnapshot | null }
interface NavigationOptions {
  getContext(): MobileNodeLinkContext;
  loadGroup(): Promise<{ group_id: string } | null>;
  open(nodeId: string): void;
  report(result: MobileNodeLinkResult): void;
}

export function canOpenMobileNodeLink(snapshot: WorkspaceSnapshot | null, nodeId: string): boolean {
  if (!snapshot) return false;
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  if (!normalized.nodeOrder.includes(nodeId)) return false;
  return Boolean(normalized.nodesById[nodeId]?.hasContent ||
    resolveCompanionFolderViewByNodeId(normalized, nodeId) ||
    resolveReadableCompanionArticleByNodeId(normalized, nodeId));
}

export function createMobileNodeLinkNavigation(options: NavigationOptions) {
  let pending: MobileNodeLocator | null = null;
  let revision = 0;
  let active = true;
  let resolving = false;
  async function flush(): Promise<void> {
    if (!active || resolving || !pending || !options.getContext().ready) return;
    resolving = true;
    const request = pending;
    const version = revision;
    pending = null;
    try {
      const group = await options.loadGroup();
      if (!active || version !== revision) return;
      const context = options.getContext();
      if (!context.ready) { pending = request; return; }
      if (!group || group.group_id !== request.groupId) options.report('wrong_library');
      else if (!canOpenMobileNodeLink(context.snapshot, request.nodeId)) options.report('missing');
      else { options.open(request.nodeId); options.report('opened'); }
    } catch {
      if (active && version === revision) options.report('unavailable');
    } finally {
      resolving = false;
      if (active && pending && options.getContext().ready) void flush();
    }
  }
  return {
    receive(raw: unknown) {
      if (!active) return;
      const locator = parseMobileNodeLink(raw);
      if (!locator) { options.report('invalid_link'); return; }
      revision += 1;
      pending = locator;
      void flush();
    },
    flush,
    stop() { active = false; pending = null; revision += 1; }
  };
}
