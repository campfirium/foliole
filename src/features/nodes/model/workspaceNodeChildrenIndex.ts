import { getWorkspaceRecordPatch, readWorkspaceRecordPatch } from '../../../shared/workspaceRecordPatch';

type StructureNode = { id: string; parentNodeId: string | null };
type Nodes = Record<string, StructureNode | undefined>;
interface Member { key: string; id: string; parent: string | null; position: number; }
export interface WorkspaceNodeChildrenIndex {
  readonly members: ReadonlyMap<string, Member>;
  readonly children: ReadonlyMap<string | null, readonly Member[]>;
  readonly nextPosition: number;
}

// Only the input map owns this derived view; no node objects or older maps are retained.
const indexes = new WeakMap<Nodes, WorkspaceNodeChildrenIndex>();

function integerKey(key: string) {
  const value = Number(key);
  return Number.isInteger(value) && value >= 0 && value < 4_294_967_295 && String(value) === key;
}

function compareMembers(a: Member, b: Member) {
  const aInteger = integerKey(a.key);
  const bInteger = integerKey(b.key);
  if (aInteger && bInteger) return Number(a.key) - Number(b.key);
  if (aInteger !== bInteger) return aInteger ? -1 : 1;
  return a.position - b.position;
}

function buildIndex(nodes: Nodes): WorkspaceNodeChildrenIndex {
  const members = new Map<string, Member>();
  const children = new Map<string | null, Member[]>();
  for (const [key, node] of Object.entries(nodes)) {
    if (!node) continue;
    const member = { key, id: node.id, parent: node.parentNodeId, position: members.size };
    members.set(key, member);
    const siblings = children.get(member.parent) ?? [];
    siblings.push(member);
    children.set(member.parent, siblings);
  }
  return { members, children, nextPosition: members.size };
}

function matches(member: Member | undefined, node: StructureNode | undefined) {
  return member && node ? member.id === node.id && member.parent === node.parentNodeId : !member && !node;
}

function scanChanges(nodes: Nodes, previous: WorkspaceNodeChildrenIndex) {
  const changed: string[] = [];
  const keys = Object.keys(nodes);
  let position = -1;
  let reordered = false;
  let newStringKey = false;
  for (const key of keys) {
    if (!nodes[key]) continue;
    const member = previous.members.get(key);
    if (!matches(member, nodes[key])) changed.push(key);
    if (!integerKey(key) && member) {
      reordered ||= newStringKey || member.position < position;
      position = member.position;
    } else if (!integerKey(key)) newStringKey = true;
  }
  for (const key of previous.members.keys()) {
    if (!nodes[key]) changed.push(key);
  }
  return { changed, reordered };
}

function updateIndex(nodes: Nodes, previous: WorkspaceNodeChildrenIndex, changed: readonly string[]) {
  const edits = [...new Set(changed)].filter(key => !matches(previous.members.get(key), nodes[key]));
  if (!edits.length) return previous;
  const members = new Map(previous.members);
  const children = new Map(previous.children);
  const affected = new Set<string | null>();
  let nextPosition = previous.nextPosition;
  const additions = new Map<string | null, Member[]>();
  const added = new Set(edits.filter(key => nodes[key] && !previous.members.has(key)));
  const positions = new Map(added.size ? Object.keys(nodes).filter(key => added.has(key))
    .map(key => [key, nextPosition++]) : []);
  for (const key of edits) {
    const old = members.get(key);
    if (old) affected.add(old.parent);
    const node = nodes[key];
    if (node) {
      const member = { key, id: node.id, parent: node.parentNodeId, position: old?.position ?? positions.get(key)! };
      members.set(key, member);
      affected.add(member.parent);
      const siblings = additions.get(member.parent) ?? [];
      siblings.push(member);
      additions.set(member.parent, siblings);
    } else members.delete(key);
  }
  const editedKeys = new Set(edits);
  for (const parent of affected) {
    const siblings = (previous.children.get(parent) ?? []).filter(member => !editedKeys.has(member.key));
    for (const member of additions.get(parent) ?? []) siblings.push(member);
    if (siblings.length) children.set(parent, siblings.sort(compareMembers));
    else children.delete(parent);
  }
  return { members, children, nextPosition };
}

export function prepareWorkspaceNodeChildrenIndex(nodes: Nodes, previousNodes?: Nodes) {
  const cached = indexes.get(nodes);
  if (cached) return cached;
  const source = previousNodes ?? getWorkspaceRecordPatch(nodes)?.previous;
  const previous = source && indexes.get(source);
  let index: WorkspaceNodeChildrenIndex;
  if (!previous) index = buildIndex(nodes);
  else {
    const hinted = readWorkspaceRecordPatch(nodes, source!);
    const revived = hinted?.some(key => nodes[key] && Object.hasOwn(source!, key) && !source![key]);
    const changes = hinted && !revived ? { changed: hinted, reordered: false } : scanChanges(nodes, previous);
    index = changes.reordered ? buildIndex(nodes) : updateIndex(nodes, previous, changes.changed);
  }
  indexes.set(nodes, index);
  return index;
}
