import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';

// Titles that collide by case, Unicode normalization, reserved root names, the `.md` suffix, and final sigma.
const TITLES = ['Note', 'note', 'NOTE', 'Café', 'Café', 'CAFÉ', 'Inbox', 'trash', 'Trash', 'x.md', 'X.MD',
  'Untitled', '', ' Note. ', 'Σ', 'σσ', 'Odd--node', 'Odd', 'q', 'Q'];

type Kind = 'folder' | 'item' | 'topic';

interface LibraryNode {
  anchored: boolean;
  id: string;
  kind: Kind;
  parentId: string | null;
  title: string;
  trashed: boolean;
}

export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  return { chance: (probability: number) => next() < probability, next, pick };
}

type Random = ReturnType<typeof createRandom>;

function createLibraryState(random: Random) {
  const nodes = new Map<string, LibraryNode>();
  const created = new Map<string, string>();
  let sequence = 0;
  let stamp = Date.UTC(2026, 9, 6);
  const nextStamp = () => {
    if (!random.chance(0.3)) stamp += 1000;
    return new Date(stamp).toISOString();
  };
  const write = (node: LibraryNode, content = `Body of ${node.id} ${sequence}`) => {
    nodes.set(node.id, node);
    if (!created.has(node.id)) created.set(node.id, nextStamp());
    upsertNodeSnapshot({ nodeId: node.id, parentNodeId: node.parentId, kind: node.kind, title: node.title,
      isTitleManual: true, hideTitleHeading: false, content, reveal: null, position: Math.floor(random.next() * 8),
      anchorLink: node.anchored ? { id: `${node.id}-anchor`, kind: 'highlight', locator: { from: 0, to: 4, originalText: 'Body' } } : null,
      createdAt: created.get(node.id)!, updatedAt: nextStamp() });
  };
  const live = (filter: (node: LibraryNode) => boolean) => [...nodes.values()].filter((node) => !node.trashed && filter(node));
  const isInside = (nodeId: string | null, ancestorId: string) => {
    for (let current = nodeId; current; current = nodes.get(current)?.parentId ?? null) {
      if (current === ancestorId) return true;
    }
    return false;
  };
  return {
    live, nextStamp, nodes, write,
    newId() {
      sequence += 1;
      if (random.chance(0.06)) return `node-${sequence}.md`;
      return random.pick([`n${sequence}`, `${100 + sequence}`, `node-epub-${sequence}`, `node-${sequence}`]);
    },
    /** Folders mostly go under folders; rarely under anything, which turns scoped planning off for the library. */
    parentFor(kind: Kind, moving?: string) {
      const candidates = kind === 'folder' && !random.chance(0.03)
        ? live((node) => node.kind === 'folder') : live(() => true);
      const allowed = candidates.map((node) => node.id).filter((id) => !moving || !isInside(id, moving));
      return random.chance(0.25) ? null : random.pick([...allowed, null]);
    }
  };
}

function createOperations(random: Random, state: ReturnType<typeof createLibraryState>): Array<() => string[]> {
  const pickLive = (filter: (node: LibraryNode) => boolean) => random.pick([...state.live(filter), undefined]);
  const notInbox = (node: LibraryNode) => node.id !== 'special-inbox';
  return [
    () => {
      const kind = random.pick<Kind>(['folder', 'topic', 'topic', 'item']);
      const node = { anchored: false, id: state.newId(), kind, parentId: state.parentFor(kind), title: random.pick(TITLES), trashed: false };
      state.write(node);
      return [node.id];
    },
    () => {
      const parent = pickLive((node) => node.kind !== 'folder');
      if (!parent) return [];
      state.write({ anchored: true, id: state.newId(), kind: 'topic', parentId: parent.id, title: 'Extract', trashed: false });
      return [parent.id];
    },
    () => {
      const node = pickLive(notInbox);
      if (node) state.write({ ...node, title: random.pick(TITLES) });
      return node ? [node.id] : [];
    },
    () => {
      const node = pickLive(notInbox);
      if (node) state.write({ ...node, parentId: state.parentFor(node.kind, node.id) });
      return node ? [node.id] : [];
    },
    () => {
      const node = pickLive((candidate) => candidate.kind !== 'folder');
      if (node) state.write(node, `Edited ${state.nextStamp()}`);
      return node ? [node.id] : [];
    },
    () => {
      const node = pickLive(notInbox);
      if (!node || !random.chance(0.5)) return [];
      state.nodes.set(node.id, { ...node, trashed: true });
      softDeleteNodes({ nodeIds: [node.id], deletedAt: state.nextStamp() });
      return [node.id];
    }
  ];
}

/** Builds and mutates a random library through the ordinary node mutations, keeping its shape for later choices. */
export function createRandomLibrary(random: Random) {
  const state = createLibraryState(random);
  state.write({ anchored: false, id: 'special-inbox', kind: 'folder', parentId: null, title: 'Inbox', trashed: false });
  const operations = createOperations(random, state);
  return {
    nodes: state.nodes,
    /** Applies one random change and returns the node ids it touched. */
    step: () => random.pick(operations)(),
    /** Seeds `count` creations so later steps have something to rename, move and delete. */
    seed(count: number) {
      for (let index = 0; index < count; index += 1) operations[random.chance(0.8) ? 0 : 1]!();
    }
  };
}
