import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';

export function compareFlowFacts(a: DailyFlowSyncFact, b: DailyFlowSyncFact) {
  return a.occurredAt.localeCompare(b.occurredAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function connectedFlowFacts(input: DailyFlowSyncFact[]) {
  const connected = new Map(input.filter(fact => fact.kind === 'create').map(fact => [fact.id, fact]));
  for (const fact of input.sort(compareFlowFacts)) {
    const parent = fact.parentId ? connected.get(fact.parentId) : undefined;
    if (parent && parent.rootId === fact.rootId && compareFlowFacts(parent, fact) < 0) connected.set(fact.id, fact);
  }
  return [...connected.values()].sort(compareFlowFacts);
}

function pathTo(head: DailyFlowSyncFact, facts: Map<string, DailyFlowSyncFact>) {
  const path = [head];
  while (path[0]!.parentId) path.unshift(facts.get(path[0]!.parentId!)!);
  return path;
}

function applyRows(rows: Map<string, CycleRow>, fact: DailyFlowSyncFact) {
  for (const id of fact.removedNodeIds) rows.delete(id);
  for (const row of fact.rows) rows.set(row.node_id, { ...row });
}

function mergedRows(roots: DailyFlowSyncFact[], facts: DailyFlowSyncFact[], path: DailyFlowSyncFact[]) {
  const rows = new Map(path[0]!.rows.map(row => [row.node_id, { ...row }]));
  let tail = Math.max(0, ...[...rows.values()].map(row => row.order_key));
  for (const root of roots) for (const row of root.rows) if (!rows.has(row.node_id)) {
    rows.set(row.node_id, { ...row, initial_task: 0, order_key: ++tail });
  }
  // Replaying the union in event order also places earlier offline moves before later known moves.
  for (const fact of facts.filter(value => value.kind !== 'create')) {
    for (const id of fact.removedNodeIds) rows.delete(id);
    for (const row of fact.rows) {
      const previous = rows.get(row.node_id);
      rows.set(row.node_id, { ...row, handled: previous?.handled || row.handled ? 1 : 0,
        order_key: row.active || !previous ? ++tail : previous.order_key });
    }
  }
  return [...rows.values()].sort((a, b) => a.order_key - b.order_key);
}

export function flowProgressDelta(before: DailyFlowSession | undefined, after: DailyFlowSession) {
  return { readingElapsedMs: (after.readingElapsedMs ?? 0) - (before?.readingElapsedMs ?? 0),
    reviewElapsedMs: (after.reviewElapsedMs ?? 0) - (before?.reviewElapsedMs ?? 0),
    readTopicCount: (after.readTopicCount ?? 0) - (before?.readTopicCount ?? 0),
    reviewedItemCount: (after.reviewedItemCount ?? 0) - (before?.reviewedItemCount ?? 0) };
}

/** History disables or reinstates one contribution; peer operations remain independent. */
export function effectiveFlowActions(facts: DailyFlowSyncFact[]) {
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const history = new Map<string, DailyFlowSyncFact>();
  const relatedByTarget = new Map<string, DailyFlowSyncFact[]>();
  for (const fact of [...facts].sort(compareFlowFacts)) {
    if ((fact.kind === 'undo' || fact.kind === 'redo') && fact.targetOpId && byId.has(fact.targetOpId)) {
      history.set(fact.targetOpId, fact);
      const related = relatedByTarget.get(fact.targetOpId) ?? [];
      related.push(fact);
      relatedByTarget.set(fact.targetOpId, related);
    }
  }
  return facts.filter(fact => fact.kind !== 'create' && !((fact.kind === 'undo' || fact.kind === 'redo') &&
    fact.targetOpId && byId.has(fact.targetOpId))).flatMap(fact => {
    const replayed = (replay: DailyFlowSyncFact) => ({ ...fact, id: replay.id, targetOpId: fact.id,
      occurredAt: replay.occurredAt, parentId: replay.parentId,
      statsDelta: fact.statsDelta ?? flowProgressDelta(byId.get(fact.parentId ?? '')?.session, fact.session) });
    if (fact.action === 'grade') {
      const related = relatedByTarget.get(fact.id) ?? [];
      const voids = new Set(related.filter(value => value.kind === 'undo').map(value => value.reviewTargetOpId ?? fact.id));
      return [...(voids.has(fact.id) ? [] : [fact]), ...related.filter(value => value.kind === 'redo' &&
        value.reviewOpId && !voids.has(value.reviewOpId)).map(replayed)];
    }
    const replay = history.get(fact.id);
    return !replay ? [fact] : replay.kind === 'undo' ? [] : [replayed(replay)];
  }).sort(compareFlowFacts);
}

function mergedSession(head: DailyFlowSyncFact, roots: DailyFlowSyncFact[], facts: DailyFlowSyncFact[],
  rows: CycleRow[], kinds: ReadonlyMap<string, string>) {
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const types = new Map(kinds);
  const counted = new Set<string>();
  let readingElapsedMs = Math.max(0, ...roots.map(root => root.session.readingElapsedMs ?? 0));
  let reviewElapsedMs = Math.max(0, ...roots.map(root => root.session.reviewElapsedMs ?? 0));
  for (const fact of facts.filter(value => value.kind !== 'create')) {
    const delta = fact.statsDelta ?? flowProgressDelta(byId.get(fact.parentId ?? '')?.session, fact.session);
    readingElapsedMs += delta.readingElapsedMs;
    reviewElapsedMs += delta.reviewElapsedMs;
    if (fact.nodeId && !counted.has(fact.nodeId) && (delta.readTopicCount > 0 || delta.reviewedItemCount > 0)) {
      types.set(fact.nodeId, delta.reviewedItemCount > 0 ? 'item' : 'topic');
      counted.add(fact.nodeId);
    }
  }
  const handled = rows.filter(row => row.handled);
  const legacy = facts.filter(fact => fact.kind === 'undo' || fact.kind === 'redo');
  const legacyReading = legacy.reduce((count, fact) => count + (fact.statsDelta?.readTopicCount ?? 0), 0);
  const legacyReview = legacy.reduce((count, fact) => count + (fact.statsDelta?.reviewedItemCount ?? 0), 0);
  const baseline = new Set(roots.flatMap(root => root.rows.filter(row => row.handled).map(row => row.node_id)));
  const fresh = handled.filter(row => !baseline.has(row.node_id));
  const reviewedItemCount = Math.max(0, ...roots.map(root => root.session.reviewedItemCount ?? 0)) + legacyReview +
    fresh.filter(row => types.get(row.node_id) === 'item').length;
  const readTopicCount = Math.max(0, ...roots.map(root => root.session.readTopicCount ?? 0)) + legacyReading +
    fresh.filter(row => types.get(row.node_id) === 'topic').length;
  const pending = rows.filter(row => row.active && row.initial_task);
  const cycle = { ...head.session.cycle!, remaining: pending.length,
    scanAfter: rows.find(row => row.node_id === head.session.currentNodeId)?.order_key ?? head.session.cycle!.scanAfter,
    reviewRemaining: pending.filter(row => types.get(row.node_id) === 'item').length,
    tailKey: Math.max(head.session.cycle!.tailKey, 0, ...rows.map(row => row.order_key)),
    clearKey: Math.max(head.session.cycle!.clearKey, 0, ...pending.map(row => row.order_key)),
    clearedAt: pending.length ? null : head.session.cycle!.clearedAt ?? head.occurredAt };
  cycle.lapLimit = Math.max(cycle.lapLimit, cycle.tailKey);
  delete cycle.change;
  return { ...head.session, cycle, readingElapsedMs: Math.max(0, readingElapsedMs),
    reviewElapsedMs: Math.max(0, reviewElapsedMs), reviewedItemCount, readTopicCount,
    totalNodeCount: head.session.totalNodeCount };
}

export function mergeDailyFlowFacts(input: DailyFlowSyncFact[], kinds: ReadonlyMap<string, string>) {
  const facts = connectedFlowFacts(input);
  const actions = facts.filter(fact => fact.kind !== 'create');
  const head = actions.at(-1) ?? facts.at(-1);
  if (!head) return null;
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const path = pathTo(head, byId);
  const roots = facts.filter(fact => fact.kind === 'create');
  const merged = path.length !== facts.length || actions.some(fact =>
    (fact.kind === 'undo' || fact.kind === 'redo') && fact.targetOpId && byId.has(fact.targetOpId));
  const contributions = effectiveFlowActions(facts);
  const linear = new Map<string, CycleRow>();
  if (!merged) for (const fact of path) applyRows(linear, fact);
  const rows = merged ? mergedRows(roots, contributions, path) : [...linear.values()];
  return { head, rows, merged, session: merged ? mergedSession(head, roots, contributions, rows, kinds) : head.session };
}
