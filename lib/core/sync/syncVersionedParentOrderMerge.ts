import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ParentOrderUserFact {
  order: readonly string[];
  /** Original user versions whose choices this later user edit replaced. */
  supersedes?: readonly string[];
  versionId: string;
}

interface Addition {
  id: string;
  before: string | null;
  after: string | null;
  sourceId: string;
}

function unique(order: readonly string[]) {
  if (order.some((id) => !id) || new Set(order).size !== order.length) {
    throw new Error('sync_parent_order_duplicate_child');
  }
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function additions(order: readonly string[], base: ReadonlySet<string>, sourceId: string) {
  const result: Addition[] = [];
  let before: string | null = null;
  for (let index = 0; index < order.length; index += 1) {
    const id = order[index]!;
    if (base.has(id)) { before = id; continue; }
    const after = order.slice(index + 1).find((next) => base.has(next)) ?? null;
    result.push({ id, before, after, sourceId });
  }
  return result;
}

function slotFor(addition: Addition, common: readonly string[]) {
  const before = addition.before === null ? -1 : common.indexOf(addition.before);
  const after = addition.after === null ? -1 : common.indexOf(addition.after);
  if (before >= 0 && after >= 0) {
    return before < after ? after : before + 1;
  }
  if (before >= 0) return before + 1;
  if (after >= 0) return after;
  return common.length;
}

function sortSlot(slot: readonly string[], sources: readonly ParentOrderUserFact[],
  compareAdded: (left: string, right: string) => number) {
  const remaining = new Set(slot);
  const outgoing = new Map(slot.map((id) => [id, new Set<string>()]));
  const reaches = (start: string, target: string, seen = new Set<string>()): boolean => {
    if (start === target) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    return [...(outgoing.get(start) ?? [])].some((next) => reaches(next, target, seen));
  };
  for (const source of [...sources].sort((a, b) => compareIds(a.versionId, b.versionId))) {
    const sequence = source.order.filter((id) => remaining.has(id));
    for (let index = 1; index < sequence.length; index += 1) {
      const before = sequence[index - 1]!;
      const after = sequence[index]!;
      if (!reaches(after, before)) outgoing.get(before)!.add(after);
    }
  }
  const result: string[] = [];
  while (remaining.size) {
    const blocked = new Set([...remaining].flatMap((source) =>
      [...(outgoing.get(source) ?? [])].filter((target) => remaining.has(target))));
    const available = [...remaining].filter((id) => !blocked.has(id)).sort((a, b) =>
      compareAdded(a, b) || compareIds(a, b));
    if (!available.length) throw new Error('sync_parent_order_slot_cycle');
    const next = available[0]!;
    remaining.delete(next);
    result.push(next);
  }
  return result;
}

function insertAdditions(common: readonly string[], sources: readonly ParentOrderUserFact[],
  base: ReadonlySet<string>, members: ReadonlySet<string>,
  compareAdded: (left: string, right: string) => number) {
  const selected = new Map<string, Addition>();
  for (const source of [...sources].sort((a, b) => compareIds(a.versionId, b.versionId))) {
    for (const addition of additions(source.order, base, source.versionId)) {
      if (members.has(addition.id) && !selected.has(addition.id)) {
        selected.set(addition.id, addition);
      }
    }
  }
  const slots = Array.from({ length: common.length + 1 }, () => [] as string[]);
  for (const addition of selected.values()) slots[slotFor(addition, common)]!.push(addition.id);
  const result: string[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    result.push(...sortSlot(slots[index]!, sources, compareAdded));
    if (index < common.length) result.push(common[index]!);
  }
  return result;
}

/** Resolve original user facts together so an automatic merge never gains priority. */
export function mergeVersionedParentOrders(args: {
  base: readonly string[];
  facts: readonly ParentOrderUserFact[];
  sources?: readonly ParentOrderUserFact[];
  members: ReadonlySet<string>;
  compareAdded: (left: string, right: string) => number;
}) {
  unique(args.base);
  if ((!args.facts.length && !args.sources?.length) || args.facts.some((fact) => !fact.versionId)) {
    throw new Error('sync_parent_order_facts_missing');
  }
  const byId = new Map<string, ParentOrderUserFact>();
  for (const fact of args.facts) {
    unique(fact.order);
    const previous = byId.get(fact.versionId);
    if (previous && JSON.stringify(previous.order) !== JSON.stringify(fact.order)) {
      throw new Error('sync_parent_order_fact_collision');
    }
    if (previous && JSON.stringify([...(previous.supersedes ?? [])].sort(compareIds)) !==
      JSON.stringify([...(fact.supersedes ?? [])].sort(compareIds))) {
      throw new Error('sync_parent_order_fact_collision');
    }
    byId.set(fact.versionId, fact);
  }
  const superseded = new Set([...byId.values()].flatMap((fact) => [...(fact.supersedes ?? [])]));
  const active = [...byId.values()].filter((fact) => !superseded.has(fact.versionId));
  const sources = args.sources ?? active;
  if (!sources.length) throw new Error('sync_parent_order_facts_missing');
  for (const source of sources) unique(source.order);
  const presentOnEveryFact = new Set(args.base.filter((id) => args.members.has(id) &&
    (active.length ? active : sources).every((fact) => fact.order.includes(id))));
  const baseCommon = args.base.filter((id) => presentOnEveryFact.has(id));
  const changed = active.map((fact) => ({ versionId: fact.versionId,
    common: fact.order.filter((id) => presentOnEveryFact.has(id)) }))
    .filter((fact) => JSON.stringify(fact.common) !== JSON.stringify(baseCommon));
  const commonOrders = new Set(changed.map((fact) => JSON.stringify(fact.common)));
  const winner = commonOrders.size > 1
    ? [...changed].sort((a, b) => compareIds(a.versionId, b.versionId))[0]!
    : changed[0];
  const common = winner?.common ?? baseCommon;
  const order = insertAdditions(common, sources, presentOnEveryFact,
    args.members, args.compareAdded);
  const undecided = [...args.members].filter((id) => !order.includes(id)).sort((a, b) =>
    args.compareAdded(a, b) || compareIds(a, b));
  order.push(...undecided);
  const sourceFacts = [...byId.values()].sort((a, b) => compareIds(a.versionId, b.versionId))
    .map((fact) => [fact.versionId, fact.order, [...(fact.supersedes ?? [])].sort(compareIds)]);
  const mergeId = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([
    args.base, sourceFacts, [...sources].sort((a, b) => compareIds(a.versionId, b.versionId))
      .map((source) => [source.versionId, source.order]), [...args.members].sort(compareIds), order
  ]))));
  return { order, mergeId, winningVersionId: winner?.versionId ?? null,
    losingVersionIds: commonOrders.size > 1 ? changed.filter((fact) =>
      fact.versionId !== winner?.versionId)
      .map((fact) => fact.versionId).sort(compareIds) : [] };
}

/** Reapply a saved user arrangement to the present members while keeping later additions. */
export function restoreParentOrderSnapshot(saved: readonly string[], current: readonly string[],
  members: ReadonlySet<string>, compareAdded: (left: string, right: string) => number) {
  unique(saved);
  unique(current);
  const common = saved.filter((id) => members.has(id) && current.includes(id));
  return insertAdditions(common, [{ versionId: 'current', order: current }],
    new Set(common), members, compareAdded);
}
