import { z } from 'zod';

import { compareParentOrderNames } from './parentOrderNameOrder.js';
import { compareUtf8Text } from './syncIdentityKeyOrder.js';
import { hashText } from './syncNodeResolution.js';

const ids = z.array(z.string().min(1)).refine((value) => new Set(value).size === value.length);
const sourceSchema = z.object({ authorId: z.string().min(1),
  counter: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), childIds: ids }).strict();
const sourcesSchema = z.array(sourceSchema).refine((value) =>
  new Set(value.map((source) => source.authorId)).size === value.length);
export type ParentOrderSource = z.infer<typeof sourceSchema>;
export interface CurrentOrderMember { id: string; title: string; createdAt: string; }

export function parseParentOrderSources(value: unknown): ParentOrderSource[] {
  return sourcesSchema.parse(value);
}

export function canonicalParentOrderSources(sources: readonly ParentOrderSource[]) {
  return [...sources].sort((a, b) => compareUtf8Text(a.authorId, b.authorId))
    .map(({ authorId, counter, childIds }) => ({ authorId, counter, childIds: [...childIds] }));
}

export function currentParentOrderHash(parentId: string, sources: readonly ParentOrderSource[]) {
  return hashText(JSON.stringify(currentParentOrderPayload(parentId, sources)));
}

export function currentParentOrderPayload(parentId: string, sources: readonly ParentOrderSource[]) {
  return { parent_id: parentId, sources_json: JSON.stringify(canonicalParentOrderSources(sources)) };
}

/** Joins original current facts, including facts whose children have not arrived yet. */
export function joinParentOrderSources(left: readonly ParentOrderSource[], right: readonly ParentOrderSource[]) {
  const sources = new Map(left.map((source) => [source.authorId, source]));
  for (const source of right) {
    const previous = sources.get(source.authorId);
    if (previous?.counter === source.counter &&
        JSON.stringify(previous.childIds) !== JSON.stringify(source.childIds)) {
      throw new Error('sync_parent_order_source_collision');
    }
    if (!previous || previous.counter < source.counter) sources.set(source.authorId, source);
  }
  return canonicalParentOrderSources([...sources.values()]);
}

function reaches(edges: ReadonlyMap<string, ReadonlySet<string>>, from: string, to: string) {
  const pending = [from];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === to) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of edges.get(id) ?? []) pending.push(next);
  }
  return false;
}

function originalConstraints(sources: readonly ParentOrderSource[], membership: ReadonlySet<string>) {
  const edges = new Map<string, Set<string>>();
  const listed = new Set<string>();
  const priority = [...sources].sort((a, b) => b.counter - a.counter ||
    compareUtf8Text(b.authorId, a.authorId));
  for (const source of priority) {
    const order = source.childIds.filter((id) => membership.has(id));
    for (const id of order) listed.add(id);
    for (let index = 1; index < order.length; index += 1) {
      const before = order[index - 1]!;
      const after = order[index]!;
      const successors = edges.get(before) ?? new Set<string>();
      if (successors.has(after) || reaches(edges, after, before)) continue;
      successors.add(after);
      edges.set(before, successors);
    }
  }
  return { edges, listed };
}

function topologicalOrder(members: ReadonlyMap<string, CurrentOrderMember>,
  edges: ReadonlyMap<string, ReadonlySet<string>>, listed: ReadonlySet<string>) {
  const incoming = new Map([...listed].map((id) => [id, 0]));
  for (const successors of edges.values()) {
    for (const id of successors) incoming.set(id, (incoming.get(id) ?? 0) + 1);
  }
  const available = [...listed].filter((id) => incoming.get(id) === 0);
  const order: string[] = [];
  while (available.length) {
    available.sort((a, b) => compareParentOrderNames(members.get(a)!, members.get(b)!));
    const id = available.shift()!;
    order.push(id);
    for (const next of edges.get(id) ?? []) {
      const count = incoming.get(next)! - 1;
      incoming.set(next, count);
      if (count === 0) available.push(next);
    }
  }
  return order;
}

/** Only node membership determines existence; projection never creates a source fact. */
export function projectCurrentParentOrder(sources: readonly ParentOrderSource[], members: readonly CurrentOrderMember[]) {
  const byId = new Map(members.map((member) => [member.id, member]));
  const { edges, listed } = originalConstraints(sources, new Set(byId.keys()));
  const omitted = members.filter((member) => !listed.has(member.id)).sort((a, b) =>
    compareUtf8Text(a.createdAt, b.createdAt) || compareUtf8Text(a.id, b.id));
  return [...topologicalOrder(byId, edges, listed), ...omitted.map((member) => member.id)];
}
