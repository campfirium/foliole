function timestampAfter(value, now = () => new Date()) {
  return new Date(Math.max(now().getTime(), Date.parse(value ?? '') + 1)).toISOString();
}

export async function createClientPairTopic({ label, now = () => new Date(), session }) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const updatedAt = now().toISOString();
  const nodeId = `client-pair-${label}-${updatedAt.replace(/\D/gu, '')}`;
  const node = {
    activeNodeId: nodeId,
    anchorLink: null,
    content: `Client pair ${label} body ${updatedAt}`,
    createdAt: updatedAt,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    nodeOrder: [...snapshot.nodeOrder, nodeId],
    parentNodeId: 'special-inbox',
    position: snapshot.nodeOrder.length,
    reveal: null,
    title: `Client pair ${label} topic`,
    updatedAt
  };
  const result = await session.invoke('create_topic', node);
  if (!result?.createdNodeIds?.includes(nodeId)) {
    throw new Error('Client pair topic was not persisted.');
  }
  return exactNode(node);
}

export async function updateClientPairTopic({ expected, now = () => new Date(), session }) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const current = snapshot?.nodesById?.[expected.nodeId];
  if (!current) throw new Error(`Client pair topic is missing: ${expected.nodeId}`);
  const updatedAt = timestampAfter(current.updatedAt, now);
  const content = `${expected.content}\nClient pair update ${updatedAt}`;
  const result = await session.invoke('update_node_content', {
    ...current, content, nodeId: expected.nodeId, updatedAt
  });
  if (!result?.updatedNodeIds?.includes(expected.nodeId)) {
    throw new Error('Client pair topic update was not persisted.');
  }
  return exactNode({ ...current, content, updatedAt });
}

export function exactNode(node) {
  return {
    content: node.content,
    nodeId: node.nodeId,
    title: node.title,
    updatedAt: node.updatedAt
  };
}
