import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { DocumentLoadRequests, DocumentPreparationQueue } from '../../../lib/documents/documentPreparation';
import { DocumentRetentionCache } from '../../../lib/documents/documentRetentionCache';
import type { CompanionReadableArticle } from '../../companionReadableArticle';
import { loadCompanionReadableArticle } from '../../companionWorkspaceSync';

import { companionReadingDemandKey } from './companionReadingDemand';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from './companionReadingScope';

type PreparedArticle = { key: string; article: CompanionReadableArticle };
type Selection = { key: string; nodeId: string; snapshot: WorkspaceSnapshot; scope: object };
const MAX_PREPARED_BYTES = 2 * 1024 * 1024;
const cache = new DocumentRetentionCache<PreparedArticle>(1, MAX_PREPARED_BYTES, MAX_PREPARED_BYTES,
  value => new TextEncoder().encode(JSON.stringify(value)).byteLength);
const requests = new DocumentLoadRequests<CompanionReadableArticle>();
const demanded = new Map<string, number>();
let selection: Selection | null = null;
let preparedKey: string | null = null;

const preparation = new DocumentPreparationQueue(
  key => demanded.size > 0 || selection?.key !== key || requests.has(key) || cache.get(key) !== undefined,
  async key => {
    const selected = selection;
    if (!selected || selected.key !== key) return;
    const article = await requests.load(key, () => loadCompanionReadableArticle(selected.snapshot,
      selected.nodeId, () => selected.scope === getCompanionReadingScope()
        && (selection === selected || demanded.has(key))));
    if (article && selection === selected && selected.scope === getCompanionReadingScope()
      && article.bodyStatus !== 'missing' && article.bodyStatus !== 'fetching' && article.bodyStatus !== 'failed') {
      cache.set(key, { key, article });
      preparedKey = key;
    }
  }, 1
);

subscribeCompanionReadingScope(() => {
  selection = null;
  preparation.clear();
  requests.clear();
  cache.clear();
  preparedKey = null;
});

// Replacing the window retires queued work and prevents a late result being retained.
export function prepareCompanionFlowArticle(snapshot: WorkspaceSnapshot | null, nextNodeId: string | null, currentNodeId: string | null = null) {
  const key = companionReadingDemandKey(snapshot, nextNodeId);
  if (selection && selection.key === key && selection.scope === getCompanionReadingScope()) return;
  preparation.clear();
  if (preparedKey !== key && preparedKey !== companionReadingDemandKey(snapshot, currentNodeId)) {
    cache.clear();
    preparedKey = null;
  }
  selection = snapshot && nextNodeId && key
    ? { key, nodeId: nextNodeId, snapshot, scope: getCompanionReadingScope() } : null;
  if (key && selection) preparation.request([key]);
}

export async function loadPreparedCompanionArticle(snapshot: WorkspaceSnapshot, nodeId: string,
  isCurrent: () => boolean) {
  const key = companionReadingDemandKey(snapshot, nodeId);
  if (!key || !isCurrent()) return null;
  const scope = getCompanionReadingScope();
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    return { ...cached.article, persistedNodeViewState: snapshot.persistedNodeViewById?.[nodeId] ?? null };
  }
  const joiningPreparation = requests.has(key);
  demanded.set(key, (demanded.get(key) ?? 0) + 1);
  try {
    // A failed speculative read must not turn a successful score into a failed navigation.
    let article: CompanionReadableArticle | null;
    try {
      article = await requests.load(key, () => loadCompanionReadableArticle(snapshot, nodeId, isCurrent));
    } catch (error) {
      if (!joiningPreparation || !isCurrent() || scope !== getCompanionReadingScope()) throw error;
      article = await requests.load(key, () => loadCompanionReadableArticle(snapshot, nodeId, isCurrent));
    }
    if (!article && joiningPreparation && isCurrent() && scope === getCompanionReadingScope()) {
      article = await requests.load(key, () => loadCompanionReadableArticle(snapshot, nodeId, isCurrent));
    }
    return isCurrent() && scope === getCompanionReadingScope() ? article : null;
  } finally {
    const remaining = (demanded.get(key) ?? 1) - 1;
    if (remaining) demanded.set(key, remaining);
    else demanded.delete(key);
    if (!demanded.size && selection) preparation.request([selection.key]);
  }
}
